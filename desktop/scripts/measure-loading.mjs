import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Opt-in live-site check. Uses isolated profiles and never submits the search.
const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.env.TERN_PERF_OUTPUT || "/tmp/tern-loading.json");
const restoreTask = process.env.TERN_PERF_RESTORE === "1";
const sites = process.argv.slice(2).length ? process.argv.slice(2) : [
  "https://www.4wdsupacentre.com.au/",
  "https://www.supercheapauto.com.au/",
  "https://makerworld.com/",
];
const results = [];
let engine;
for (const url of sites) {
  const profile = await mkdtemp(resolve(tmpdir(), "tern-perf-"));
  let app;
  try {
    if (restoreTask) await writeFile(resolve(profile, "workspace.json"), JSON.stringify({
      version: 1,
      tasks: [{ id: "benchmark", title: "Loading measurement", lifecycle: "Active", note: "", selectedPageId: "selected" }],
      pages: [...sites.filter(site => site !== url), url].map(site => ({ id: site === url ? "selected" : site, taskId: "benchmark", title: new URL(site).hostname, url: site })),
      selectedTaskId: "benchmark",
    }));
    app = await electron.launch({ args: ["."], cwd: directory, env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
    engine = await app.evaluate(() => ({ electron: process.versions.electron, chromium: process.versions.chrome }));
    const shell = await app.firstWindow();
    await shell.waitForLoadState();
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].setFullScreen(true);
      dialog.showMessageBoxSync = () => 1;
    });
    await app.context().addInitScript(() => {
      const metrics = { lcp: null, longTasks: 0, blockingMs: 0 };
      Object.defineProperty(window, "__ternLoadingMetrics", { value: metrics });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) metrics.lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          metrics.longTasks++;
          metrics.blockingMs += Math.max(0, entry.duration - 50);
        }
      }).observe({ type: "longtask", buffered: true });
    });
    if (!restoreTask) {
      await shell.getByRole("textbox", { name: "New task", exact: true }).fill("Loading measurement");
      await shell.getByRole("textbox", { name: "New task", exact: true }).press("Enter");
    }
    for (const cache of ["cold", "warm"]) {
      let sitePage;
      const started = performance.now();
      const result = { url, cache, mode: restoreTask ? "restore-task" : "single-page", outcome: "unavailable" };
      try {
        const existing = app.context().pages().find(p => p !== shell && new URL(p.url()).hostname === new URL(url).hostname);
        const pagePromise = cache === "cold" ? app.context().waitForEvent("page", {
          timeout: 30000,
          predicate: async page => {
            try {
              await page.waitForURL(candidate => candidate.hostname === new URL(url).hostname, { waitUntil: "commit", timeout: 25000 });
              return true;
            } catch { return false; }
          },
        }) : Promise.resolve(existing);
        const navigated = cache === "warm" ? existing.waitForEvent("framenavigated", { predicate: frame => frame === existing.mainFrame(), timeout: 25000 }) : undefined;
        if (cache === "cold" && restoreTask) {
          await shell.getByRole("button", { name: "Resume Loading measurement", exact: true }).click();
        } else if (cache === "cold") {
          await shell.getByRole("textbox", { name: "Address or search" }).fill(url);
          await shell.getByRole("textbox", { name: "Address or search" }).press("Enter");
        } else {
          // A fresh navigation keeps the normal HTTP cache policy on repeat visits.
          await shell.evaluate(address => window.tern.command({ type: "navigate", address }), url);
        }
        sitePage = await pagePromise;
        await navigated;
        await sitePage.waitForURL(/^https?:/, { waitUntil: "commit", timeout: 25000 });
        const search = sitePage.locator(new URL(url).hostname === "makerworld.com"
          ? 'input[type="text"]:visible'
          : 'input[type="search"]:visible, input[name="search_query"]:visible, input[placeholder*="search" i]:visible, input[aria-label*="search" i]:visible').first();
        await search.waitFor({ state: "visible", timeout: 15000 });
        await search.click({ timeout: 15000 });
        const original = await search.inputValue();
        await search.fill("camping", { timeout: 10000 });
        if (await search.inputValue() !== "camping") throw new Error("Search did not retain input");
        await sitePage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => resolve())));
        result.searchUsableMs = Math.round(performance.now() - started);
        result.outcome = "search-input-works";
        await search.fill(original, { timeout: 5000 });
      } catch (error) {
        result.error = String(error).split("\n")[0];
        if (sitePage) {
          result.inputs = await sitePage.locator("input").evaluateAll(inputs => inputs.filter(input => input.getClientRects().length).map(input => ({ type: input.type, name: input.name, placeholder: input.placeholder, label: input.getAttribute("aria-label") }))).catch(() => []);
          await sitePage.screenshot({ path: `/tmp/tern-perf-${new URL(url).hostname}-${cache}.png`, timeout: 5000 }).catch(() => {});
        }
      }
      if (sitePage && !sitePage.isClosed()) {
        Object.assign(result, await sitePage.evaluate(() => {
          const nav = performance.getEntriesByType("navigation")[0];
          const body = document.body?.innerText || "";
          return {
            title: document.title,
            finalURL: location.origin + location.pathname,
            challenge: /verify you are human|access denied|just a moment|checking your browser|captcha|pardon our interruption/i.test(document.title + " " + body.slice(0, 3000)),
            ttfbMs: nav?.responseStart,
            domContentLoadedMs: nav?.domContentLoadedEventEnd || null,
            loadMs: nav?.loadEventEnd || null,
            fcpMs: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
            ...window.__ternLoadingMetrics,
          };
        }).catch(() => ({})));
        if (result.challenge) result.outcome = "challenge";
        if (result.outcome === "search-input-works") {
          try {
            await sitePage.keyboard.press("Escape");
            const viewport = await sitePage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
            await sitePage.mouse.move(viewport.width / 2, viewport.height / 2);
            await sitePage.mouse.wheel(0, 600);
            await sitePage.waitForFunction(() => scrollY > 0, undefined, { timeout: 5000 });
            result.scrollWorked = true;
          } catch { result.scrollWorked = false; }
        }
      }
      results.push(result);
      console.log(JSON.stringify(result));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), engine, results }, null, 2) + "\n");
    }
  } finally {
    if (app) {
      await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
      await app.close().catch(() => {});
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
console.log(`Results: ${output}`);
