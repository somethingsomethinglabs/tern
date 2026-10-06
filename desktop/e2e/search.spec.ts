import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let server: Server;
let origin: string;
let app: ElectronApplication;
let shell: Page;
let profile: string;

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url!, origin);
    if (url.pathname !== "/search") { response.end('<title>Opened document</title><input aria-label="Website draft">'); return; }
    response.setHeader("Content-Type", "application/json");
    if (url.searchParams.get("q") === "blocked") { response.writeHead(403); response.end('{}'); return; }
    if (url.searchParams.get("q") === "empty") { response.end('{"results":[]}'); return; }
    const send = () => response.end(JSON.stringify({ results: [
      ...Array.from({ length: 12 }, (_, i) => ({ title: `Document ${i + 1}: complete result title with API configuration, navigation details and server setup for a custom search interface`, url: `${origin}/docs/${i}`, content: 'Excerpt explaining the document. '.repeat(12), engines: ["fixture"] })),
      { title: 'ChatGPT', url: 'https://chatgpt.com/', content: 'Application' },
      { title: 'Video', url: 'https://youtube.com/watch?v=123', content: 'Playable video' },
      { title: 'Article', url: `${origin}/articles/one`, content: 'Thread' },
      { title: 'Unsafe result', url: 'javascript:alert(1)' },
    ], unresponsive_engines: [["slow engine", "timeout"]] }));
    if (url.searchParams.get("q") === "slow") setTimeout(send, 300); else send();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
async function launch() {
  app = await electron.launch({ args: [resolve("dist/host/main.js")], env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile } });
  shell = await app.firstWindow();
  await shell.waitForFunction(() => !!(window as any).tern);
}
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "tern-search-test-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "", preloadLinks: false, autoHideToolbar: false, searxngURL: origin }));
  await launch();
  await shell.evaluate(() => (window as any).tern.command({ type: "createTask", title: "Search integration" }));
  const address = shell.getByRole("textbox", { name: "Address or search" });
  await address.fill("fixture query"); await address.press("Enter");
  await expect(shell.locator(".search-result")).toHaveCount(15);
});
async function closeApp() { await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }); await app.close(); }
test.afterEach(async () => { await closeApp(); await rm(profile, { recursive: true, force: true, maxRetries: 3 }); });

test("reading list filters, kept links, opening and returning retain task context and position", async () => {
  for (const text of ["A little more room to find it.", "Your query. Your pace.", "Read before you open", "SEARCH STUDY"]) await expect(shell.getByText(text, { exact: true })).toHaveCount(0);
  await shell.getByRole("button", { name: "Docs", exact: true }).click();
  await expect(shell.locator(".search-result")).toHaveCount(12);
  await shell.locator(".keep-result").first().click();
  await shell.getByRole("button", { name: "Kept links · 1", exact: true }).click();
  await expect(shell.locator(".search-result")).toHaveCount(1);
  await shell.getByRole("button", { name: "Kept links · 1", exact: true }).click();
  const list = shell.locator(".search-page");
  await list.evaluate(element => element.scrollTop = 350);
  const title = shell.locator(".result-title").nth(2);
  await title.focus();
  const scroll = await list.evaluate(element => element.scrollTop);
  await title.press("Enter");
  await expect(shell.getByRole("button", { name: "Return to results", exact: true })).toBeVisible();
  await shell.getByRole("button", { name: "Return to results", exact: true }).click();
  await expect(shell.locator(".search-result")).toHaveCount(12);
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeCloseTo(scroll, 0);
  await expect(title).toBeFocused();
  const input = shell.getByRole("textbox", { name: "Search the web" });
  await input.fill("unfinished draft");
  await shell.locator(".keep-result").nth(1).click();
  await expect(input).toHaveValue("unfinished draft");
  const saved = JSON.parse(await readFile(join(profile, "workspace.json"), "utf8"));
  expect(saved.tasks[0].keptLinks).toHaveLength(2);
  expect(saved.pages.filter((page: any) => page.search)).toHaveLength(1);
  expect(JSON.stringify(saved)).not.toContain("Excerpt explaining");
  const taskId = saved.tasks[0].id;
  await closeApp(); await launch();
  await shell.evaluate(id => (window as any).tern.command({ type: "openTask", id }), taskId);
  await expect(shell.locator(".search-result")).toHaveCount(12);
  await expect(shell.getByRole("button", { name: "Kept links · 2", exact: true })).toBeVisible();
  await shell.getByRole("button", { name: "Toggle task notes", exact: true }).click();
  await expect(shell.locator(".kept-task-title")).toHaveCount(2);
  await shell.getByRole("button", { name: "Close current page", exact: true }).click();
  await expect(shell.locator(".kept-task-title")).toHaveCount(2);
});

test("first result follows filters; hidden domains, partial failures, retry and empty results are explicit", async () => {
  await expect(shell.getByText("1 search engine unavailable")).toBeVisible();
  await shell.getByRole("button", { name: "Articles", exact: true }).click();
  await shell.getByRole("button", { name: "Open first result", exact: true }).click();
  const state = await shell.evaluate(() => (window as any).tern.snapshot());
  const selected = state.pages.find((page: any) => page.id === state.tasks[0].selectedPageId);
  expect(selected.url).toBe(`${origin}/articles/one`);
  await shell.getByRole("button", { name: "Return to results", exact: true }).click();
  await shell.getByRole("button", { name: "All results", exact: true }).click();
  await shell.getByRole("button", { name: "Hide 127.0.0.1", exact: true }).first().click();
  await expect(shell.locator(".search-result")).toHaveCount(2);
  await shell.getByRole("button", { name: "Refine · 1", exact: true }).click();
  await shell.getByRole("button", { name: "Restore 127.0.0.1", exact: true }).click();
  await expect(shell.locator(".search-result")).toHaveCount(15);
  const input = shell.getByRole("textbox", { name: "Search the web" });
  await input.fill("blocked"); await input.press("Enter");
  await expect(shell.getByRole("alert")).toContainText("JSON");
  await shell.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(shell.getByRole("alert")).toContainText("JSON");
  await input.fill("empty"); await input.press("Enter");
  await expect(shell.getByText("No results found.", { exact: true })).toBeVisible();
});

test("responsive list wraps titles and keeps the native website view hidden", async () => {
  await shell.evaluate(() => (window as any).tern.command({ type: "setPreferences", patch: { sidebarCollapsed: true } }));
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.setMinimumSize(320, 320); window.setContentSize(390, 844); });
  await expect(shell.getByRole("textbox", { name: "Search the web" })).toBeVisible();
  expect(await shell.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth }))).toEqual({ page: 390, viewport: 390 });
  expect(await shell.locator(".search-page").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await shell.locator(".result-title").first().evaluate(element => getComputedStyle(element).whiteSpace)).toBe("normal");
  await mkdir(resolve("../design/qa/search"), { recursive: true });
  await shell.screenshot({ path: resolve("../design/qa/search/narrow-reading-list.png") });
  await shell.evaluate(() => (window as any).tern.command({ type: "setPreferences", patch: { sidebarCollapsed: false } }));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900));
  await shell.screenshot({ path: resolve("../design/qa/search/desktop-reading-list.png") });
  const hidden = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.every(view => !view.getVisible()));
  expect(hidden).toBe(true);
});

test('reading list exposes and filters documentation, articles, applications and videos', async () => {
  for (const [name, count] of [['Docs', 12], ['Articles', 1], ['Applications', 1], ['Videos', 1], ['All results', 15]] as const) {
    await shell.getByRole('button', { name, exact: true }).click();
    await expect(shell.locator('.search-result')).toHaveCount(count);
  }
  await expect(shell.getByRole('button', { name: 'Projects', exact: true })).toHaveCount(0);
  await expect(shell.getByRole('button', { name: 'Discussions', exact: true })).toHaveCount(0);
});
