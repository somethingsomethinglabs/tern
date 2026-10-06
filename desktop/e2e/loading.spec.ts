import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let app: ElectronApplication;
let shell: Page;
let profile: string;
let origin: string;
let hits: string[];
let documentResponse: ServerResponse | undefined;
let imageResponse: ServerResponse | undefined;
const server = createServer((req, res) => {
  hits.push(req.url!);
  if (req.url === "/selected") {
    documentResponse = res;
    return;
  }
  if (req.url === "/slow.svg") {
    imageResponse = res;
    return;
  }
  res.setHeader("Content-Type", "text/html");
  res.end('<title>Background</title><input aria-label="Draft">');
});

function releaseDocument() {
  documentResponse?.setHeader("Content-Type", "text/html");
  documentResponse?.end('<title>Selected</title><button onclick="this.textContent=\'Clicked\'">Use page</button><img src="/slow.svg" width="50" height="50">');
  documentResponse = undefined;
}

test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
test.beforeEach(async () => {
  hits = [];
  profile = await mkdtemp(join(tmpdir(), "tern-loading-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "" }));
  await writeFile(join(profile, "workspace.json"), JSON.stringify({
    version: 1,
    tasks: [{ id: "task", title: "Loading", lifecycle: "Active", note: "", selectedPageId: "selected" }],
    pages: ["background-1", "background-2", "selected"].map(id => ({ id, taskId: "task", title: id, url: `${origin}/${id}` })),
    selectedTaskId: "task",
  }));
  app = await electron.launch({ args: ["."], cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
  shell = await app.firstWindow();
  await shell.waitForLoadState();
});
test.afterEach(async () => {
  releaseDocument();
  imageResponse?.end();
  imageResponse = undefined;
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
  await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
});

test("task resume gives the selected document a head start and remains usable while assets load", async () => {
  await shell.getByRole("button", { name: "Resume Loading", exact: true }).click();
  await expect.poll(() => hits.includes("/selected")).toBe(true);
  expect(hits.filter(path => path.startsWith("/background"))).toEqual([]);
  releaseDocument();
  await expect.poll(() => hits.includes("/slow.svg")).toBe(true);
  const page = app.context().pages().find(page => page.url() === origin + "/selected")!;
  await page.getByRole("button", { name: "Use page" }).click();
  await expect(page.getByRole("button", { name: "Clicked" })).toBeVisible();
  expect(await page.evaluate(() => document.readyState)).not.toBe("complete");
  await expect.poll(() => hits.includes("/background-1") && hits.includes("/background-2")).toBe(true);
});

test("selecting a queued reference opens it immediately", async () => {
  await shell.getByRole("button", { name: "Resume Loading", exact: true }).click();
  await expect.poll(() => hits.includes("/selected")).toBe(true);
  await shell.getByRole("button", { name: "Select page background-2", exact: true }).click();
  await expect.poll(() => hits.includes("/background-2")).toBe(true);
  await expect.poll(() => app.context().pages().some(page => page.url() === origin + "/background-2")).toBe(true);
  const page = app.context().pages().find(page => page.url() === origin + "/background-2")!;
  await page.getByLabel("Draft").fill("Keep this draft");
  releaseDocument();
  await expect.poll(() => hits.includes("/background-1")).toBe(true);
  expect(hits.filter(path => path === "/background-2")).toHaveLength(1);
  await expect(page.getByLabel("Draft")).toHaveValue("Keep this draft");
});

test("settling during restoration unloads the page and cancels queued tabs", async () => {
  await shell.getByRole("button", { name: "Resume Loading", exact: true }).click();
  await expect.poll(() => hits.includes("/selected")).toBe(true);
  await shell.getByRole("button", { name: "Settle", exact: true }).click();
  await shell.getByRole("button", { name: "Settle anyway", exact: true }).click();
  await expect(shell.getByRole("heading", { name: "Reopen this reference" })).toBeVisible();
  releaseDocument();
  // Reopen one reference after settlement. Its load would release any stale queue.
  await expect(shell.getByRole("button", { name: "Settled tasks", exact: true })).toHaveAttribute("aria-expanded", "true");
  await shell.getByRole("button", { name: "Select page background-2", exact: true }).click();
  await shell.getByRole("button", { name: "Reopen page", exact: true }).click();
  await expect.poll(() => app.context().pages().some(page => page.url() === origin + "/background-2")).toBe(true);
  const page = app.context().pages().find(page => page.url() === origin + "/background-2")!;
  await expect(page.getByLabel("Draft")).toBeVisible();
  expect(hits).not.toContain("/background-1");
  await expect.poll(() => app.context().pages().filter(page => page.url().startsWith(origin)).map(page => page.url())).toEqual([origin + "/background-2"]);
});

test("a stalled document releases the restore queue and a closed reference stays closed", async () => {
  await shell.getByRole("button", { name: "Resume Loading", exact: true }).click();
  await expect.poll(() => hits.includes("/selected")).toBe(true);
  await shell.evaluate(() => window.tern.command({ type: "closePage", id: "background-1" }));
  await expect.poll(() => hits.includes("/background-2"), { timeout: 7000 }).toBe(true);
  expect(hits).not.toContain("/background-1");
});

test("DevTools shortcuts target the website from both the shell and the page", async () => {
  await shell.getByRole("button", { name: "Resume Loading", exact: true }).click();
  await expect.poll(() => hits.includes("/selected")).toBe(true);
  releaseDocument();
  await expect.poll(() => hits.includes("/slow.svg")).toBe(true);
  const shortcut = (source: "shell" | "page", keyCode: string, modifiers: string[]) => app.evaluate(({ webContents }, { origin, source, keyCode, modifiers }) => {
    const target = webContents.getAllWebContents().find(contents => contents.getURL() === (source === "shell" ? "tern://app/index.html" : origin + "/selected"))!;
    target.focus();
    target.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    target.sendInputEvent({ type: "keyUp", keyCode, modifiers });
  }, { origin, source, keyCode, modifiers });
  const opened = () => app.evaluate(({ webContents }, url) => {
    const all = webContents.getAllWebContents();
    return {
      website: all.find(contents => contents.getURL() === url)?.isDevToolsOpened(),
      shell: all.find(contents => contents.getURL() === "tern://app/index.html")?.isDevToolsOpened(),
    };
  }, origin + "/selected");
  await shortcut("shell", "F12", []);
  await expect.poll(opened).toEqual({ website: true, shell: false });
  await shortcut("page", "I", ["control", "shift"]);
  await expect.poll(opened).toEqual({ website: false, shell: false });
});
