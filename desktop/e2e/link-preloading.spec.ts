import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let app: ElectronApplication;
let shell: Page;
let page: Page;
let profile: string;
let origin: string;
let external: string;
let requests: { path: string; purpose: string }[];
let connections = 0;
let externalRequests = 0;
const other = createServer((_req, res) => { externalRequests++; res.end("External"); });
other.on("connection", () => connections++);
const server = createServer((req, res) => {
  requests.push({ path: req.url!, purpose: String(req.headers["sec-purpose"] || "") });
  res.setHeader("Content-Type", "text/html");
  res.setHeader("Cache-Control", "private, max-age=120");
  if (req.url === "/blocked") res.setHeader("Content-Security-Policy", "script-src 'none'");
  if (req.url!.startsWith("/article")) {
    setTimeout(() => res.end('<title>Article</title><h1>Article</h1><script>fetch("/script-ran")</script>'), 600);
    return;
  }
  res.end(`<title>Hover fixture</title><style>a{display:block;margin:18px}body{min-height:1600px}</style>
    <a href="/article">Article</a><a href="/article-next">Next article</a>
    <a href="/logout">Log out</a><a href="/cart/add/item">Add item</a>
    <a href="/article?query=1">Query</a><a href="/article#section">Fragment</a>
    <a href="/article-download" download>Download</a><a href="/article-optout" data-no-prefetch>Opt out</a>
    <a href="${external}/guide">External guide</a><input aria-label="Draft">`);
});
test.beforeAll(async () => {
  await new Promise<void>(resolve => other.listen(0, "127.0.0.1", resolve));
  external = `http://127.0.0.1:${(other.address() as { port: number }).port}`;
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  server.closeAllConnections(); other.closeAllConnections();
  await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => other.close(() => resolve()))]);
});
test.beforeEach(async () => {
  requests = []; connections = 0; externalRequests = 0;
  profile = await mkdtemp(join(tmpdir(), "tern-hover-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "" }));
  app = await electron.launch({ args: ["."], cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
  shell = await app.firstWindow();
  await shell.waitForLoadState();
  await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].setFullScreen(true); BrowserWindow.getAllWindows()[0].focus(); });
  await shell.evaluate(async address => {
    await window.tern.command({ type: "createTask", title: "Hover" });
    await window.tern.command({ type: "navigate", address });
  }, origin);
  await expect.poll(() => app.context().pages().some(p => p.url() === origin + "/")).toBe(true);
  page = app.context().pages().find(p => p.url() === origin + "/")!;
  await page.waitForLoadState("domcontentloaded");
});
test.afterEach(async () => {
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
  await app.close().catch(() => {});
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
});

test("native hover prefetch is reused on click without running the destination first", async () => {
  const cdp = await app.context().newCDPSession(page);
  const statuses: string[] = [];
  cdp.on("Preload.prefetchStatusUpdated", event => statuses.push(event.prefetchStatus));
  await cdp.send("Preload.enable");
  const link = page.getByRole("link", { name: "Article", exact: true });
  await link.hover();
  await expect.poll(() => requests.some(r => r.path === "/article" && r.purpose.includes("prefetch"))).toBe(true);
  await expect.poll(() => statuses.includes("PrefetchSuccessfulButNotUsed")).toBe(true);
  expect(page.url()).toBe(origin + "/");
  expect(app.context().pages().some(p => p.url() === origin + "/article")).toBe(false);
  expect(requests.some(r => r.path === "/script-ran")).toBe(false);
  const started = Date.now();
  await link.click();
  await expect(page.getByRole("heading", { name: "Article" })).toBeVisible();
  await expect.poll(() => statuses.includes("PrefetchResponseUsed")).toBe(true);
  expect(requests.filter(r => r.path === "/article")).toHaveLength(1);
  const prefetchedMs = Date.now() - started;
  await expect.poll(() => requests.some(r => r.path === "/script-ran")).toBe(true);
  await shell.evaluate(() => window.tern.command({ type: "setPreferences", patch: { preloadLinks: false } }));
  await page.goto(origin);
  const coldStart = Date.now();
  await page.getByRole("link", { name: "Next article", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Article" })).toBeVisible();
  console.log(`Navigation with prefetch: ${prefetchedMs} ms; without: ${Date.now() - coldStart} ms; server delay: 600 ms`);
});

test("action links and brief hover do not prefetch; external hover only connects", async () => {
  await page.getByRole("link", { name: "Article", exact: true }).hover();
  await page.mouse.move(600, 600);
  for (const name of ["Log out", "Add item", "Query", "Fragment", "Download", "Opt out"]) {
    await page.getByRole("link", { name, exact: true }).hover();
    await page.waitForTimeout(300);
  }
  expect(requests.filter(r => r.purpose.includes("prefetch"))).toEqual([]);
  await page.getByRole("link", { name: "External guide" }).hover();
  await expect.poll(() => connections).toBeGreaterThan(0);
  expect(externalRequests).toBe(0);
});

test("settings stop preloading immediately and persist across restart", async () => {
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  const setting = shell.getByRole("checkbox", { name: "Preload likely pages when hovering over links" });
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await shell.getByRole("button", { name: "Back to browsing" }).click();
  await page.getByRole("link", { name: "Article", exact: true }).hover();
  await page.waitForTimeout(500);
  expect(requests.filter(r => r.purpose.includes("prefetch"))).toEqual([]);
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await app.close();
  app = await electron.launch({ args: ["."], cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
  shell = await app.firstWindow();
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(shell.getByRole("checkbox", { name: "Preload likely pages when hovering over links" })).not.toBeChecked();
});

test("site CSP is respected and changed link destinations are rechecked", async () => {
  const link = page.getByRole("link", { name: "Article", exact: true });
  await link.hover();
  await link.evaluate(anchor => anchor.setAttribute("href", "/logout"));
  await page.waitForTimeout(400);
  expect(requests.some(r => r.path === "/logout")).toBe(false);
  await page.goto(origin + "/blocked");
  await page.getByRole("link", { name: "Next article", exact: true }).hover();
  await page.waitForTimeout(600);
  expect(requests.some(r => r.path === "/article-next")).toBe(false);
});

test("hidden pages and offline connections remove Tern's speculation rules", async () => {
  const rules = page.locator('script[type="speculationrules"]');
  await expect(rules).toHaveCount(1);
  await shell.getByRole("button", { name: "Task overview", exact: true }).click();
  await expect(rules).toHaveCount(0);
  await shell.getByRole("button", { name: "Resume Hover", exact: true }).click();
  await expect(rules).toHaveCount(1);
  const cdp = await app.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
  await expect(rules).toHaveCount(0);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await expect(rules).toHaveCount(1);
});
