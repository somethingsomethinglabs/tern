import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import type { BrowserCookie, CookieRequest } from "@tern/core/contracts";

let app: ElectronApplication;
let shell: Page;
let profile: string;
let server: Server;
let origin: string;
const partition = "persist:trailrest-web";

test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Set-Cookie", ["login=server-token; Path=/; HttpOnly; SameSite=Lax", "login=path-token; Path=/account; SameSite=Strict"]);
    res.end('<title>Cookie fixture</title><h1>Cookie fixture</h1><label>Draft <input aria-label="Draft"></label>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
async function launch() {
  app = await electron.launch({ args: ["."], cwd: process.cwd(),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
  shell = await app.firstWindow();
  await shell.waitForLoadState();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await expect(shell.getByRole("button", { name: "Settings", exact: true })).toBeVisible();
}
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "tern-cookies-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "" }));
  await launch();
});
test.afterEach(async () => {
  await app?.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
async function cookies(request: CookieRequest = { type: "list" }): Promise<BrowserCookie[]> {
  return shell.evaluate((request) => window.tern.cookies!(request), request);
}
async function openManager() {
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.getByRole("button", { name: "Manage cookies", exact: true }).click();
  await expect(shell.getByText("Working on cookies…")).not.toBeVisible();
}

test("manage real HttpOnly cookies, edit, cancel deletion, and delete one exact path", async () => {
  await shell.evaluate(async (origin) => {
    await window.tern.command({ type: "createTask", title: "Cookie test" });
    await window.tern.command({ type: "navigate", address: origin + "/account" });
  }, origin);
  await expect.poll(async () => (await cookies()).length).toBe(2);
  await openManager();
  await shell.getByLabel("Search cookies").fill("127.0.0.1");
  await shell.locator("summary").filter({ hasText: "127.0.0.1" }).click();
  const root = shell.getByRole("article", { name: "Cookie login at /", exact: true });
  const account = shell.getByRole("article", { name: "Cookie login at /account", exact: true });
  await expect(root).toContainText("HttpOnly");
  await root.getByRole("button", { name: "Edit cookie", exact: true }).click();
  await expect(shell.getByLabel("Cookie value", { exact: true })).toBeFocused();
  await expect(shell.getByLabel("Cookie value", { exact: true })).toHaveAttribute("type", "password");
  await shell.getByLabel("Cookie value", { exact: true }).fill("updated-token");
  await shell.getByRole("button", { name: "Save cookie", exact: true }).click();
  await expect(shell.getByText("Cookie saved.", { exact: true })).toBeVisible();
  const updated = (await cookies()).find((cookie) => cookie.path === "/")!;
  expect(updated.value).toBe("updated-token");
  expect(updated.httpOnly).toBe(true);
  expect(updated.domain).toBe("127.0.0.1");
  expect(updated.expires).toBeNull();
  await root.getByRole("button", { name: "Delete cookie", exact: true }).click();
  await expect(shell.getByRole("group", { name: "Confirm cookie deletion" })).toBeFocused();
  await shell.getByRole("button", { name: "Cancel deletion" }).click();
  expect(await cookies()).toHaveLength(2);
  await root.getByRole("button", { name: "Delete cookie", exact: true }).click();
  await shell.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(root).not.toBeVisible();
  await expect(account).toBeVisible();
  expect((await cookies()).map((cookie) => cookie.path)).toEqual(["/account"]);
  await shell.getByLabel("Search cookies").fill("nothing-matches");
  await expect(shell.getByText("No cookies match your search.")).toBeVisible();
  await mkdir(resolve("../design/qa/cookies"), { recursive: true });
  await shell.getByLabel("Search cookies").fill("");
  await shell.locator("summary").filter({ hasText: "127.0.0.1" }).click();
  await shell.screenshot({ path: resolve("../design/qa/cookies/manager.png") });
  await account.getByRole("button", { name: "Edit cookie", exact: true }).click();
  await shell.screenshot({ path: resolve("../design/qa/cookies/editor.png") });
});

test("create and persist cookies, validate fields, delete a site, and keep shell cookies isolated", async () => {
  await openManager();
  await expect(shell.getByText("No cookies stored in this profile.")).toBeVisible();
  await shell.getByRole("button", { name: "Add cookie", exact: true }).click();
  await shell.getByLabel("Cookie name", { exact: true }).fill("theme");
  await shell.getByLabel("Cookie domain", { exact: true }).fill("example.test");
  await shell.getByLabel("Cookie value", { exact: true }).fill("dark");
  await shell.getByLabel("Session cookie, no fixed expiry").uncheck();
  const expires = Math.floor(Date.now() / 1000) + 86400;
  const date = new Date(expires * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  await shell.getByLabel("Cookie expiry", { exact: true }).fill(local);
  await shell.getByRole("button", { name: "Save cookie", exact: true }).click();
  await expect(shell.getByText("Cookie saved.", { exact: true })).toBeVisible();
  let saved = (await cookies())[0];
  expect(saved.domain).toBe("example.test");
  expect(saved.expires).toBe(expires);
  await expect(cookies({ type: "save", id: saved.id, cookie: { ...saved, sameSite: "None", secure: false } })).rejects.toThrow("requires Secure");
  await expect(cookies({ type: "save", cookie: { ...saved, domain: "example.test/attack" } })).rejects.toThrow("hostname");
  await expect(cookies({ type: "save", cookie: saved })).rejects.toThrow("already exists");
  await shell.locator("summary").filter({ hasText: "example.test" }).click();
  await shell.getByRole("button", { name: "Edit cookie", exact: true }).click();
  await shell.getByLabel("SameSite", { exact: true }).selectOption("None");
  await shell.getByLabel("Secure, send only over HTTPS", { exact: true }).uncheck();
  await shell.getByRole("button", { name: "Save cookie", exact: true }).click();
  await expect(shell.getByRole("alert")).toHaveText("SameSite=None requires Secure.");
  await expect(shell.getByLabel("Cookie value", { exact: true })).toHaveValue("dark");
  await shell.getByRole("button", { name: "Cancel editing" }).click();
  await app.close();
  await launch();
  saved = (await cookies())[0];
  expect(saved.value).toBe("dark");
  await cookies({ type: "save", cookie: { ...saved, name: "hidden-cookie", domain: ".example.test" } });
  await cookies({ type: "save", cookie: { ...saved, domain: "other.test" } });
  await openManager();
  await shell.getByLabel("Search cookies").fill("theme");
  await shell.locator("summary").filter({ hasText: "example.test" }).click();
  await shell.getByRole("button", { name: "Delete cookies for example.test", exact: true }).click();
  await shell.getByRole("button", { name: "Confirm deletion" }).click();
  await expect.poll(async () => (await cookies()).map((cookie) => cookie.domain)).toEqual(["other.test"]);
  await app.evaluate(async ({ session }) => {
    await session.fromPartition("tern-shell").cookies.set({ url: "https://shell.test", name: "shell", value: "keep" });
  });
  await shell.getByRole("button", { name: "Refresh cookies" }).click();
  await shell.getByRole("button", { name: "Delete all cookies", exact: true }).click();
  await shell.getByRole("button", { name: "Confirm deletion" }).click();
  await expect(shell.getByText("No cookies stored in this profile.")).toBeVisible();
  expect(await app.evaluate(async ({ session }) => (await session.fromPartition("tern-shell").cookies.get({})).length)).toBe(1);
  expect((await shell.evaluate(() => window.tern.snapshot())).storageError).toBe("");
});

test("partitioned cookies keep their identity through edits and deletion", async () => {
  await app.evaluate(async ({ WebContentsView, session }, partition) => {
    const view = new WebContentsView({ webPreferences: { session: session.fromPartition(partition), sandbox: true } });
    await view.webContents.loadURL("about:blank");
    view.webContents.debugger.attach("1.3");
    for (const topLevelSite of ["https://first.test", "https://second.test"]) {
      await view.webContents.debugger.sendCommand("Network.setCookie", {
        url: "https://embedded.test/", name: "id", value: topLevelSite, path: "/", secure: true, sameSite: "None",
        partitionKey: { topLevelSite, hasCrossSiteAncestor: true },
      });
    }
    await view.webContents.debugger.sendCommand("Network.setCookie", { url: "https://embedded.test/", name: "id", value: "unpartitioned", path: "/", secure: true });
    view.webContents.close();
  }, partition);
  const initial = await cookies();
  expect(initial).toHaveLength(3);
  const first = initial.find((cookie) => cookie.partitionSite === "https://first.test")!;
  const edited = await cookies({ type: "save", id: first.id, cookie: { ...first, value: "changed" } });
  expect(edited.find((cookie) => cookie.id === first.id)?.value).toBe("changed");
  const unpartitioned = edited.find((cookie) => !cookie.partitionSite)!;
  const remaining = await cookies({ type: "delete", id: unpartitioned.id });
  expect(remaining).toHaveLength(2);
  expect(remaining.every((cookie) => cookie.partitionSite)).toBe(true);
  const last = await cookies({ type: "delete", id: first.id });
  expect(last.map((cookie) => cookie.partitionSite)).toEqual(["https://second.test"]);
  expect(await cookies({ type: "deleteDomain", domain: "embedded.test" })).toHaveLength(0);
});

test("toolbar asks about the loaded site, respects cancel and preserves the page and other sites", async () => {
  const button = shell.getByRole("button", { name: "Delete cookies for this site", exact: true });
  await expect(button).toBeDisabled();
  await shell.evaluate(async (origin) => {
    await window.tern.command({ type: "createTask", title: "Troubleshoot cookies" });
    await window.tern.command({ type: "navigate", address: origin + "/account" });
  }, origin);
  await expect(button).toBeEnabled();
  await expect.poll(async () => (await cookies()).length).toBe(2);
  const website = app.context().pages().find((page) => page.url() === origin + "/account")!;
  await website.getByLabel("Draft").fill("Keep this unfinished form");
  await website.evaluate(() => localStorage.setItem("keep", "website state"));
  const template = (await cookies())[0];
  await cookies({ type: "save", cookie: { ...template, domain: "other.test", name: "other-site" } });
  await app.evaluate(({ dialog }) => {
    (globalThis as any).cookieDialogs = [];
    dialog.showMessageBoxSync = (_window, options) => {
      (globalThis as any).cookieDialogs.push(options);
      return 0;
    };
  });
  // An unsubmitted address must never decide which site's cookies are deleted.
  await shell.getByLabel("Address or search").fill("https://other.test");
  await button.click();
  await expect(button).toHaveAttribute("aria-busy", "false");
  expect(await cookies()).toHaveLength(3);
  const prompt = await app.evaluate(() => (globalThis as any).cookieDialogs[0]);
  expect(prompt.message).toBe("Delete cookies for 127.0.0.1?");
  expect(prompt.buttons).toEqual(["Cancel", "Delete cookies"]);
  expect(prompt.defaultId).toBe(0);
  expect(prompt.cancelId).toBe(0);
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await button.focus();
  await button.press("Enter");
  await expect(shell.getByText("Cookies deleted for 127.0.0.1. Reload the page to use the cleared cookies.", { exact: true })).toBeVisible();
  expect((await cookies()).map((cookie) => cookie.name)).toEqual(["other-site"]);
  await expect(website.getByLabel("Draft")).toHaveValue("Keep this unfinished form");
  expect(await website.evaluate(() => localStorage.getItem("keep"))).toBe("website state");
  await expect(shell.getByLabel("Address or search")).toHaveValue("https://other.test");
  expect((await shell.evaluate(() => window.tern.snapshot())).tasks[0].title).toBe("Troubleshoot cookies");
  await mkdir(resolve("../design/qa/cookies"), { recursive: true });
  await shell.locator(".toolbar").screenshot({ path: resolve("../design/qa/cookies/toolbar.png") });
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(button).toBeDisabled();
  await expect(shell.evaluate(() => window.tern.command({ type: "clearSiteCookies" }))).rejects.toThrow("Open a website");
});

test("toolbar clears the registrable site and its embedded partitions without clearing unrelated cookies", async () => {
  const url = "https://account.example.co.uk/";
  await app.context().route(url, (route) => route.fulfill({
    contentType: "text/html", body: "<title>Cookie toolbar fixture</title><h1>Cookie toolbar fixture</h1>",
  }));
  await shell.evaluate(async (url) => {
    await window.tern.command({ type: "createTask", title: "Reset website login" });
    await window.tern.command({ type: "navigate", address: url });
  }, url);
  await expect(shell.getByRole("button", { name: "Select page Cookie toolbar fixture", exact: true })).toBeVisible();
  await app.evaluate(async ({ WebContentsView, session }, partition) => {
    const websiteSession = session.fromPartition(partition);
    for (const domain of [".example.co.uk", "account.example.co.uk", "billing.example.co.uk", "unrelated.co.uk", "example.co.uk.evil.test"]) {
      await websiteSession.cookies.set({ url: `https://${domain.replace(/^\./, "")}/`, domain, name: domain, value: "fixture", secure: true });
    }
    const view = new WebContentsView({ webPreferences: { session: websiteSession, sandbox: true } });
    await view.webContents.loadURL("about:blank");
    view.webContents.debugger.attach("1.3");
    for (const topLevelSite of ["https://example.co.uk", "https://other.test"]) {
      await view.webContents.debugger.sendCommand("Network.setCookie", {
        url: "https://embedded.test/", name: "embedded", value: "fixture", path: "/", secure: true, sameSite: "None",
        partitionKey: { topLevelSite, hasCrossSiteAncestor: true },
      });
    }
    view.webContents.close();
  }, partition);
  expect(await cookies()).toHaveLength(7);
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await shell.getByRole("button", { name: "Delete cookies for this site", exact: true }).click();
  await expect(shell.getByText("Cookies deleted for account.example.co.uk. Reload the page to use the cleared cookies.", { exact: true })).toBeVisible();
  const remaining = await cookies();
  expect(remaining.map((cookie) => cookie.domain.replace(/^\./, "")).sort()).toEqual(["embedded.test", "example.co.uk.evil.test", "unrelated.co.uk"]);
  expect(remaining.find((cookie) => cookie.name === "embedded")?.partitionSite).toBe("https://other.test");
});
