import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_MODEL } from "@tern/core/local-ai-config";

let app: ElectronApplication;
let shell: Page;
let profile: string;
let origin: string;
let server: Server;
test.beforeAll(async () => {
  server = createServer((_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end('<title>Framework Linux support</title><p>16 GB is enough for my workload.</p><label>Draft <input aria-label="Draft"></label>');
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
async function launch() {
  app = await electron.launch({ args: ["."], cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
  shell = await app.firstWindow();
  await shell.waitForLoadState();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setFullScreen(true));
  await shell.getByRole("button", { name: "Select task Choose a laptop", exact: true }).click();
  await shell.getByRole("button", { name: "Toggle task notes" }).click();
}
async function close() {
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await app.close();
}
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "tern-context-ui-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "", searchEngine: "brave", searchView: "external" }));
  await writeFile(join(profile, "workspace.json"), JSON.stringify({ version: 1, selectedTaskId: "laptop", tasks: [
    { id: "laptop", title: "Choose a laptop", note: "Check Linux suspend", lifecycle: "Active", selectedPageId: "review" },
    { id: "other", title: "Other work", note: "", lifecycle: "Active", selectedPageId: null },
  ], pages: [{ id: "review", taskId: "laptop", title: "Framework Linux support", url: origin + "/review?private=secret" }] }));
  await launch();
});
test.afterEach(async () => {
  await close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
});

async function model(goal = "Compare Linux laptops", searches = ["Framework Linux suspend", "https://example.com/Linux?a=1&b=2"]) {
  await app.evaluate(async (_electron, output) => {
    (globalThis as any).contextRequests = [];
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (body.messages) (globalThis as any).contextRequests.push(body);
      return new Response(JSON.stringify(body.messages ? { message: { content: JSON.stringify(output) } } : { model_info: { architecture: "test" } }));
    };
  }, { goal, searches });
  await shell.evaluate(() => window.tern.command({ type: "setPreferences", patch: { summaryModel: "context-test" } }));
}

test("goals and findings persist, draft text stays with its task and editing works with AI off", async () => {
  await expect(shell.getByRole("region", { name: "Task suggestions" })).toContainText("Enable local AI");
  await shell.getByLabel("Goal", { exact: true }).fill("Reliable suspend and long battery life");
  await shell.getByRole("button", { name: "Select task Other work", exact: true }).click();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue("");
  await shell.getByRole("button", { name: "Select task Choose a laptop", exact: true }).click();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue("Reliable suspend and long battery life");
  await shell.getByRole("button", { name: "Save goal", exact: true }).click();
  await shell.getByLabel("New finding", { exact: true }).fill("16 GB is enough");
  await shell.getByRole("button", { name: "Keep finding", exact: true }).click();
  await expect(shell.locator(".finding-count")).toHaveText("1");
  await shell.getByRole("button", { name: "Edit finding: 16 GB is enough", exact: true }).click();
  await shell.getByLabel("Edit finding", { exact: true }).fill("32 GB for virtual machines");
  await shell.getByRole("button", { name: "Save finding", exact: true }).click();
  await close();
  await launch();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue("Reliable suspend and long battery life");
  await expect(shell.getByRole("region", { name: "Saved findings" })).toContainText("32 GB for virtual machines");
  await shell.getByRole("button", { name: "Remove finding: 32 GB for virtual machines", exact: true }).click();
  await expect(shell.locator(".finding-count")).toHaveText("0");
});

test("suggestions are drafts, exclude URL secrets and become invalid after goal changes", async () => {
  await shell.getByLabel("New finding", { exact: true }).fill("16 GB is enough for my workload.");
  await shell.getByRole("button", { name: "Keep finding", exact: true }).click();
  await model();
  await shell.getByRole("button", { name: "Generate suggestions" }).click();
  await expect(shell.getByRole("button", { name: "Framework Linux suspend", exact: true })).toBeVisible();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue("");
  const requests = await app.evaluate(() => (globalThis as any).contextRequests);
  expect(requests).toHaveLength(1);
  expect(requests[0].messages[1].content).not.toContain("private=secret");
  expect(requests[0].format.properties.searches.maxItems).toBe(2);
  await shell.getByRole("button", { name: "Edit suggested goal" }).click();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue("Compare Linux laptops");
  await expect(shell.getByRole("button", { name: "Framework Linux suspend", exact: true })).toBeDisabled();
  await shell.getByRole("button", { name: "Save goal", exact: true }).click();
  await expect(shell.getByRole("button", { name: "Framework Linux suspend", exact: true })).not.toBeVisible();
  await shell.getByRole("button", { name: "Generate suggestions" }).click();
  await expect(shell.getByRole("button", { name: "Framework Linux suspend", exact: true })).toBeVisible();
  await expect(shell.getByRole("button", { name: "Edit suggested goal" })).not.toBeVisible();
  await shell.locator(".task-notes").evaluate((element) => { element.scrollTop = 0; });
  await shell.screenshot({ path: "/tmp/tern-task-context-wide.png" });
  await shell.getByRole("region", { name: "Saved findings" }).scrollIntoViewIfNeeded();
  await shell.screenshot({ path: "/tmp/tern-task-findings-wide.png" });
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setFullScreen(false);
    window.setSize(760, 850);
  });
  await shell.getByLabel("Goal", { exact: true }).scrollIntoViewIfNeeded();
  await shell.screenshot({ path: "/tmp/tern-task-context-narrow.png" });
  await shell.evaluate(() => window.tern.command({ type: "setPreferences", patch: { summaryModel: "" } }));
  await expect(shell.getByRole("button", { name: "Framework Linux suspend", exact: true })).not.toBeVisible();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue("Compare Linux laptops");
});

test("a suggested URL is searched in a new tab and preserves the original page's form", async () => {
  await shell.getByRole("button", { name: "Reopen page", exact: true }).click();
  await expect.poll(() => app.context().pages().some((page) => page.url().startsWith(origin))).toBe(true);
  const website = app.context().pages().find((page) => page.url().startsWith(origin))!;
  await website.getByLabel("Draft").fill("Keep this unsaved form");
  await model();
  await shell.getByRole("button", { name: "Generate suggestions" }).click();
  await app.evaluate(({ session }) => {
    session.fromPartition("persist:trailrest-web").webRequest.onBeforeRequest({ urls: ["https://search.brave.com/*"] }, (details, callback) => {
      (globalThis as any).searchedURL = details.url;
      callback({ cancel: true });
    });
  });
  const query = "https://example.com/Linux?a=1&b=2";
  await shell.getByRole("button", { name: query, exact: true }).click();
  await expect.poll(() => app.evaluate(() => (globalThis as any).searchedURL)).toBe("https://search.brave.com/search?q=" + encodeURIComponent(query));
  await expect(website.getByLabel("Draft")).toHaveValue("Keep this unsaved form");
  const saved = JSON.parse(await readFile(join(profile, "workspace.json"), "utf8"));
  expect(saved.pages).toHaveLength(2);
  expect(saved.pages.every((page: { taskId: string }) => page.taskId === "laptop")).toBe(true);
});

test("selected page text is saved with its source and editable fields are excluded", async () => {
  await shell.getByRole("button", { name: "Reopen page", exact: true }).click();
  await expect.poll(() => app.context().pages().some((page) => page.url().startsWith(origin))).toBe(true);
  const website = app.context().pages().find((page) => page.url().startsWith(origin))!;
  await app.evaluate(({ Menu }) => {
    const build = Menu.buildFromTemplate.bind(Menu);
    Menu.buildFromTemplate = (template) => {
      const menu = build(template);
      menu.popup = () => { (globalThis as any).findingMenu = menu; };
      return menu;
    };
  });
  await website.locator("p").evaluate((element) => {
    const range = document.createRange(); range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await website.locator("p").click({ button: "right" });
  await expect.poll(() => app.evaluate(() => !!(globalThis as any).findingMenu)).toBe(true);
  await app.evaluate(() => {
    const menu = (globalThis as any).findingMenu;
    menu.items.find((item: { label: string }) => item.label === "Keep selection as a finding").click();
    (globalThis as any).findingMenu = undefined;
  });
  await expect(shell.getByRole("region", { name: "Saved findings" })).toContainText("16 GB is enough for my workload.");
  await expect(shell.getByRole("button", { name: "Source: Framework Linux support" })).toBeVisible();
  await website.getByLabel("Draft").fill("Private form contents");
  await website.getByLabel("Draft").selectText();
  await website.getByLabel("Draft").click({ button: "right" });
  expect(await app.evaluate(() => !!(globalThis as any).findingMenu)).toBe(false);
  const saved = JSON.parse(await readFile(join(profile, "workspace.json"), "utf8"));
  expect(saved.tasks[0].findings[0].source.url).toBe(origin + "/review?private=secret");
  expect(JSON.stringify(saved)).not.toContain("Private form contents");
});

test("built-in AI generates task suggestions offline through the UI", async () => {
  test.skip(!process.env.TERN_AI_BUILTIN_MODEL, "Set TERN_AI_BUILTIN_MODEL to the pinned local model.");
  test.setTimeout(90_000);
  await mkdir(join(profile, "models"));
  await symlink(process.env.TERN_AI_BUILTIN_MODEL!, join(profile, "models", BUILTIN_MODEL.filename));
  await app.evaluate(() => { globalThis.fetch = async () => { throw new Error("This check must remain offline"); }; });
  await shell.evaluate((model) => window.tern.command({ type: "setPreferences", patch: { summaryModel: model } }), BUILTIN_MODEL.id);
  await shell.getByRole("button", { name: "Generate suggestions" }).click();
  await expect(shell.locator(".search-suggestions button").first()).toBeVisible({ timeout: 75_000 });
  const state = await shell.evaluate(() => window.tern.snapshot());
  expect(state.taskContext?.searches.join(" ")).toMatch(/Framework|Linux/i);
  expect(state.tasks[0].goal).toBeUndefined();
  console.log("Built-in UI task context:", JSON.stringify(state.taskContext));
  await expect.poll(() => app.evaluate(({ app }) => app.getAppMetrics().some((entry) => entry.name === "Tern local AI"))).toBe(false);
});
