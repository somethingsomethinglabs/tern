import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_MODEL } from "@tern/core/local-ai-config";

let app: ElectronApplication;
let shell: Page;
let profile: string;
let server: Server;
let origin: string;
const request = "Find a Linux laptop under $1,500 with reliable suspend and good battery life.";
const plan = { title: "Choose a Linux laptop", goal: "Compare Linux laptops under $1,500 for suspend reliability and battery life.",
  searches: ["Linux laptop under $1500", "Linux laptop suspend reliability", "Linux laptop battery benchmarks"] };

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const query = new URL(req.url!, "http://localhost").searchParams.get("q");
    res.setHeader("Content-Type", "text/html");
    res.end(query
      ? '<title>Search results</title><h1>Search results</h1><p>Controlled search page for this test.</p>'
      : '<title>Existing work</title><label>Draft <input aria-label="Draft"></label>');
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
  await app.evaluate(({ session, net }, origin) => {
    (globalThis as any).openedSearches = [];
    (globalThis as any).searchMode = "results";
    session.fromPartition("persist:trailrest-web").protocol.handle("https", (req) => {
      const url = new URL(req.url);
      if (!["search.brave.com", "duckduckgo.com", "www.google.com", "www.bing.com"].includes(url.hostname))
        return net.fetch(req, { bypassCustomProtocolHandlers: true });
      (globalThis as any).openedSearches.push(req.url);
      const target = origin + "/result?q=" + encodeURIComponent(url.searchParams.get("q")!);
      const link = (href: string, title: string) => {
        if (url.hostname === "www.google.com") return `<div id="search"><a href="${href}"><h3>${title}</h3></a></div>`;
        if (url.hostname === "www.bing.com") return `<div id="b_results"><div class="b_algo"><h2><a href="${href}">${title}</a></h2></div></div>`;
        if (url.hostname === "duckduckgo.com") return `<div data-testid="result"><a data-testid="result-title-a" href="${href}">${title}</a></div>`;
        return `<div data-type="web"><a href="${href}"><div class="search-snippet-title">${title}</div></a></div>`;
      };
      let first = target;
      if (url.hostname === "www.google.com") first = "/url?q=" + encodeURIComponent(target);
      if (url.hostname === "www.bing.com") first = "/ck/a?u=a1" + Buffer.from(target).toString("base64url");
      if (url.hostname === "duckduckgo.com") first = "/l/?uddg=" + encodeURIComponent(target);
      const results = `<div data-ad>${link(origin + "/advert", "Sponsored")}</div>` +
        link("javascript:alert(1)", "Invalid result") + link(first, "First result") + link(origin + "/second", "Second result");
      const mode = (globalThis as any).searchMode;
      return new Response('<title>Search results</title><h1>Search results</h1><main id="results">' +
        (mode === "results" ? results : '<p>Verify to continue</p>') + '</main>' +
        (mode === "delayed" ? `<script>setTimeout(() => document.getElementById('results').innerHTML = ${JSON.stringify(results)}, 1500)</script>` : ''),
        { headers: { "Content-Type": "text/html" } });
    });
  }, origin);
}
async function close() {
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await app.close();
}
async function model(mode: "success" | "delay" | "invalid" = "success") {
  await app.evaluate((_electron, { plan, mode }) => {
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      if (!body.messages) return new Response(JSON.stringify({ model_info: { architecture: "test" } }));
      (globalThis as any).startRequest = body;
      if (mode === "delay") await new Promise<void>((resolve) => { (globalThis as any).releasePlan = resolve; });
      return new Response(JSON.stringify({ message: { content: mode === "invalid" ? "invalid json" : JSON.stringify(plan) } }));
    };
  }, { plan, mode });
  await shell.evaluate(() => window.tern.command({ type: "setPreferences", patch: { summaryModel: "task-start-test" } }));
}
async function fillRequest() {
  await shell.getByRole("button", { name: "Start from a goal", exact: true }).click();
  await shell.getByLabel("Your request", { exact: true }).fill(request);
}
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "tern-task-start-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "", searchEngine: "brave" }));
  await writeFile(join(profile, "workspace.json"), JSON.stringify({ version: 1, selectedTaskId: "existing",
    tasks: [{ id: "existing", title: "Existing work", note: "", lifecycle: "Active", selectedPageId: "draft" }],
    pages: [{ id: "draft", taskId: "existing", title: "Existing work", url: origin }] }));
  await launch();
  await shell.getByRole("button", { name: "Select task Existing work", exact: true }).click();
});
test.afterEach(async () => { await close().catch(() => {}); await rm(profile, { recursive: true, force: true }); });

test("one request opens first results, retains search history and persists destinations without losing existing work", async () => {
  await shell.getByRole("button", { name: "Reopen page", exact: true }).click();
  await expect.poll(() => app.context().pages().some((page) => page.url() === origin + "/")).toBe(true);
  const existing = app.context().pages().find((page) => page.url() === origin + "/")!;
  await existing.getByLabel("Draft").fill("Unfinished original work");
  await model();
  await fillRequest();
  await shell.screenshot({ path: "/tmp/tern-start-from-goal.png" });
  await shell.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(shell.getByRole("dialog")).not.toBeVisible();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue(plan.goal);
  await expect.poll(() => app.evaluate(() => (globalThis as any).openedSearches.length)).toBe(3);
  expect(await app.evaluate(() => (globalThis as any).openedSearches)).toEqual(plan.searches.map((query) => "https://search.brave.com/search?q=" + encodeURIComponent(query)));
  await expect(existing.getByLabel("Draft")).toHaveValue("Unfinished original work");
  await expect.poll(async () => {
    const state = await shell.evaluate(() => window.tern.snapshot());
    return state.pages.filter((page) => page.taskId === state.selectedTaskId).map((page) => page.url);
  }).toEqual(plan.searches.map((query) => origin + "/result?q=" + encodeURIComponent(query)));
  const state = await shell.evaluate(() => window.tern.snapshot());
  const task = state.tasks.find((task) => task.id === state.selectedTaskId)!;
  expect(task.title).toBe(plan.title);
  expect(task.request).toBe(request);
  expect(task.lifecycle).toBe("Active");
  const pages = state.pages.filter((page) => page.taskId === task.id);
  expect(pages).toHaveLength(3);
  expect(task.selectedPageId).toBe(pages[0].id);
  const call = await app.evaluate(() => (globalThis as any).startRequest);
  expect(call.messages[1].content).toBe("REQUEST: " + request);
  expect(call.format.properties.searches.maxItems).toBe(3);
  await shell.getByText("Original request", { exact: true }).click();
  await expect(shell.locator(".original-request")).toContainText(request);
  await shell.screenshot({ path: "/tmp/tern-started-task.png" });
  const resultPage = app.context().pages().find((page) => page.url() === pages[0].url)!;
  await shell.evaluate(() => window.tern.command({ type: "back" }));
  await expect(resultPage).toHaveURL("https://search.brave.com/search?q=" + encodeURIComponent(plan.searches[0]));
  // Going back must not trigger the automatic follow a second time.
  await resultPage.waitForTimeout(1100);
  await expect(resultPage).toHaveURL("https://search.brave.com/search?q=" + encodeURIComponent(plan.searches[0]));
  await shell.evaluate(() => window.tern.command({ type: "forward" }));
  await expect(resultPage).toHaveURL(pages[0].url);
  await close();
  // Avoid generating overview descriptions during the persistence check.
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "", searchEngine: "brave" }));
  await launch();
  const reopened = await shell.evaluate(() => window.tern.snapshot());
  expect(reopened.tasks.find((item) => item.id === task.id)?.request).toBe(request);
  expect(reopened.tasks.find((item) => item.id === task.id)?.goal).toBe(plan.goal);
  expect(reopened.pages.filter((page) => page.taskId === task.id).map((page) => page.url)).toEqual(pages.map((page) => page.url));
});

test("cancel keeps the request and ignores a late plan", async () => {
  await model("delay");
  await fillRequest();
  await shell.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(shell.getByRole("status")).toContainText("Naming your task");
  await shell.getByRole("button", { name: "Cancel setup", exact: true }).click();
  await app.evaluate(() => (globalThis as any).releasePlan());
  await shell.getByRole("button", { name: "Start from a goal", exact: true }).click();
  await expect(shell.getByLabel("Your request")).toHaveValue(request);
  expect((await shell.evaluate(() => window.tern.snapshot())).tasks).toHaveLength(1);
  expect(await app.evaluate(() => (globalThis as any).openedSearches)).toEqual([]);
});

test("the request form fits a narrow window and Escape keeps the draft", async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setFullScreen(false);
    window.setSize(760, 850);
  });
  await fillRequest();
  await expect(shell.getByRole("button", { name: "Start task", exact: true })).toBeVisible();
  const dialog = shell.getByRole("dialog");
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await shell.screenshot({ path: "/tmp/tern-start-from-goal-narrow.png" });
  await shell.getByLabel("Your request").press("Escape");
  await expect(dialog).not.toBeVisible();
  await shell.getByRole("button", { name: "Start from a goal", exact: true }).click();
  await expect(shell.getByLabel("Your request")).toHaveValue(request);
});

test("failed AI retains the request and offers an explicit manual fallback", async () => {
  await model("invalid");
  await fillRequest();
  await shell.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(shell.getByRole("dialog").getByRole("alert")).toContainText("Could not prepare");
  await expect(shell.getByLabel("Your request")).toHaveValue(request);
  expect((await shell.evaluate(() => window.tern.snapshot())).tasks).toHaveLength(1);
  await shell.getByRole("button", { name: "Create without AI", exact: true }).click();
  await expect(shell.getByRole("dialog")).not.toBeVisible();
  const state = await shell.evaluate(() => window.tern.snapshot());
  expect(state.tasks.find((task) => task.id === state.selectedTaskId)?.goal).toBe(request);
  expect(state.pages.filter((page) => page.taskId === state.selectedTaskId)).toHaveLength(1);
});

test("a failed workspace save creates no partial task and opens no searches", async () => {
  await model();
  await mkdir(join(profile, "workspace.json.tmp"));
  await fillRequest();
  await shell.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(shell.getByRole("dialog").getByRole("alert")).toContainText("Could not save");
  expect((await shell.evaluate(() => window.tern.snapshot())).tasks).toHaveLength(1);
  expect(await app.evaluate(() => (globalThis as any).openedSearches)).toEqual([]);
  await expect(shell.getByLabel("Your request")).toHaveValue(request);
});

test("built-in AI starts a task with focused searches without a model network request", async () => {
  test.skip(!process.env.TERN_AI_BUILTIN_MODEL, "Set TERN_AI_BUILTIN_MODEL to the existing pinned model.");
  test.setTimeout(90_000);
  await mkdir(join(profile, "models"));
  await symlink(process.env.TERN_AI_BUILTIN_MODEL!, join(profile, "models", BUILTIN_MODEL.filename));
  await app.evaluate(() => { globalThis.fetch = async () => { throw new Error("No model network access"); }; });
  await shell.evaluate((model) => window.tern.command({ type: "setPreferences", patch: { summaryModel: model } }), BUILTIN_MODEL.id);
  await fillRequest();
  await shell.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(shell.getByRole("dialog")).not.toBeVisible({ timeout: 75_000 });
  const state = await shell.evaluate(() => window.tern.snapshot());
  const task = state.tasks.find((task) => task.id === state.selectedTaskId)!;
  expect(task.title).toMatch(/Linux|laptop/i);
  expect(task.goal).toMatch(/Linux/i);
  expect(task.request).toBe(request);
  const pages = state.pages.filter((page) => page.taskId === task.id);
  expect(pages.length).toBeGreaterThanOrEqual(2);
  expect(pages.length).toBeLessThanOrEqual(3);
  await expect.poll(() => app.evaluate(() => (globalThis as any).openedSearches.length)).toBe(pages.length);
  console.log("Native task start:", JSON.stringify({ title: task.title, goal: task.goal, searches: await app.evaluate(() => (globalThis as any).openedSearches) }));
  await expect.poll(() => app.evaluate(({ app }) => app.getAppMetrics().some((entry) => entry.name === "Tern local AI"))).toBe(false);
  expect(JSON.parse(await readFile(join(profile, "workspace.json"), "utf8")).tasks).toHaveLength(2);
});

for (const engine of ["duckduckgo", "google", "bing"] as const) {
  test(`${engine} follows the first organic result and decodes its redirect`, async () => {
    await shell.evaluate((searchEngine) => window.tern.command({ type: "setPreferences", patch: { searchEngine } }), engine);
    await shell.evaluate(() => window.tern.command({ type: "startTask", request: "Linux laptops", useAI: false }));
    await expect.poll(async () => {
      const state = await shell.evaluate(() => window.tern.snapshot());
      return state.pages.find((page) => page.taskId === state.selectedTaskId)?.url;
    }).toBe(origin + "/result?q=Linux%20laptops");
  });
}

test("waits for asynchronously rendered results", async () => {
  await app.evaluate(() => { (globalThis as any).searchMode = "delayed"; });
  await shell.evaluate(() => window.tern.command({ type: "startTask", request: "Linux laptops", useAI: false }));
  await expect.poll(async () => {
    const state = await shell.evaluate(() => window.tern.snapshot());
    return state.pages.find((page) => page.taskId === state.selectedTaskId)?.url;
  }).toBe(origin + "/result?q=Linux%20laptops");
});

test("leaves verification pages open and stops looking after the deadline", async () => {
  await app.evaluate(() => { (globalThis as any).searchMode = "empty"; });
  await shell.evaluate(() => window.tern.command({ type: "startTask", request: "Linux laptops", useAI: false }));
  const searchURL = "https://search.brave.com/search?q=Linux%20laptops";
  await expect.poll(() => app.context().pages().some((page) => page.url() === searchURL)).toBe(true);
  const page = app.context().pages().find((page) => page.url() === searchURL)!;
  await expect(page.getByText("Verify to continue")).toBeVisible();
  await page.waitForTimeout(12_500);
  await page.evaluate((origin) => {
    document.querySelector("main")!.innerHTML = `<div data-type="web"><a href="${origin}/late"><div class="search-snippet-title">Late result</div></a></div>`;
  }, origin);
  await page.waitForTimeout(1100);
  await expect(page).toHaveURL(searchURL);
});

test("user navigation takes priority over pending search results", async () => {
  await app.evaluate(() => { (globalThis as any).searchMode = "delayed"; });
  await shell.evaluate(() => window.tern.command({ type: "startTask", request: "Linux laptops", useAI: false }));
  await expect.poll(() => app.context().pages().some((page) => page.url().includes("search.brave.com/search"))).toBe(true);
  await shell.evaluate((origin) => window.tern.command({ type: "navigate", address: origin + "/chosen" }), origin);
  await expect.poll(async () => {
    const state = await shell.evaluate(() => window.tern.snapshot());
    return state.pages.find((page) => page.taskId === state.selectedTaskId)?.url;
  }).toBe(origin + "/chosen");
  await shell.waitForTimeout(2000);
  const state = await shell.evaluate(() => window.tern.snapshot());
  expect(state.pages.find((page) => page.taskId === state.selectedTaskId)?.url).toBe(origin + "/chosen");
});

for (const action of ["stop", "click"] as const) {
  test(`${action} cancels following while results are still arriving`, async () => {
    await app.evaluate(() => { (globalThis as any).searchMode = "delayed"; });
    await shell.evaluate(() => window.tern.command({ type: "startTask", request: "Linux laptops", useAI: false }));
    const searchURL = "https://search.brave.com/search?q=Linux%20laptops";
    await expect.poll(() => app.context().pages().some((page) => page.url() === searchURL)).toBe(true);
    const page = app.context().pages().find((page) => page.url() === searchURL)!;
    await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
    if (action === "stop") await shell.evaluate(() => window.tern.command({ type: "stop" }));
    else await page.getByRole("heading", { name: "Search results" }).click();
    await expect(page.getByText("First result", { exact: true })).toBeVisible();
    await page.waitForTimeout(1100);
    await expect(page).toHaveURL(searchURL);
  });
}


test("task setup keeps its draft through AI settings and shows the first result at narrow widths", async () => {
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window.setFullScreen(false);
    window.setSize(760, 850);
  });
  await expect.poll(() => shell.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(800);
  await fillRequest();
  await shell.getByLabel("Task name", { exact: true }).fill("Linux laptop shortlist");
  await shell.getByRole("button", { name: "Set up local AI", exact: true }).click();
  await expect(shell.getByLabel("Local AI", { exact: true })).toBeFocused();
  await shell.getByRole("button", { name: "Back to task setup", exact: true }).last().click();
  await expect(shell.getByLabel("Your request")).toHaveValue(request);
  await expect(shell.getByLabel("Task name", { exact: true })).toHaveValue("Linux laptop shortlist");
  await expect(shell.getByRole("dialog")).toHaveCSS("opacity", "1");
  await shell.screenshot({ path: "../design/qa/ux-improvements-task-setup.png" });
  await shell.getByRole("button", { name: "Start task", exact: true }).click();
  await expect(shell.getByRole("dialog")).not.toBeVisible();
  await expect(shell.getByRole("heading", { name: "Task notes", exact: true })).not.toBeVisible();
  await expect.poll(async () => {
    const state = await shell.evaluate(() => window.tern.snapshot());
    return state.tasks.find(task => task.id === state.selectedTaskId)?.title;
  }).toBe("Linux laptop shortlist");
  await expect.poll(() => app.context().pages().some(page => page.url().startsWith(origin + "/result"))).toBe(true);
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.map(view => view.getBounds()));
  expect(bounds.some(bounds => bounds.width > 200 && bounds.height > 200)).toBe(true);
  await shell.screenshot({ path: "../design/qa/ux-improvements-first-result.png" });
  const result = app.context().pages().find(page => page.url().startsWith(origin + "/result"))!;
  await expect(result.getByRole("heading", { name: "Search results", exact: true })).toBeVisible();
  await result.screenshot({ path: "../design/qa/ux-improvements-first-result-website.png" });
  await shell.getByRole("button", { name: "Toggle task notes", exact: true }).click();
  await expect(shell.getByLabel("Goal", { exact: true })).toHaveValue(request);
  await shell.getByText("Original request", { exact: true }).click();
  await expect(shell.locator(".original-request")).toContainText(request);
});

test("the persistent shortcut hint opens the keyboard map", async () => {
  await shell.getByRole("button", { name: "Hold Alt to show shortcuts", exact: true }).click();
  await expect(shell.getByRole("heading", { name: "Keyboard shortcuts", exact: true })).toBeFocused();
  await expect(shell.getByText("Switch tasks in creation order", { exact: true })).toBeVisible();
});
