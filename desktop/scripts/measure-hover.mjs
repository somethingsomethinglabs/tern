import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { linkPrefetchCandidate } from "../host/link-preloading.cjs";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.env.TERN_PERF_OUTPUT || "/tmp/tern-hover.json");
const sites = process.argv.slice(2).length ? process.argv.slice(2) : [
  "https://www.4wdsupacentre.com.au/",
  "https://www.supercheapauto.com.au/",
  "https://makerworld.com/",
];
const results = [];
for (const url of sites) {
  const profile = await mkdtemp("/tmp/tern-hover-measure-");
  let app;
  const result = { site: url, outcome: "unavailable", statuses: [] };
  try {
    app = await electron.launch({ args: ["."], cwd: directory,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
    const shell = await app.firstWindow();
    await shell.waitForLoadState();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window.setFullScreen(true); window.focus();
    });
    const opened = app.context().waitForEvent("page", { timeout: 20000 });
    await shell.evaluate(async address => {
      await window.tern.command({ type: "createTask", title: "Hover measurement" });
      await window.tern.command({ type: "navigate", address });
    }, url);
    const page = await opened;
    await page.waitForURL(/^https:/, { waitUntil: "domcontentloaded", timeout: 30000 });
    const cdp = await app.context().newCDPSession(page);
    cdp.on("Preload.prefetchStatusUpdated", event => {
      if (event.prefetchUrl === result.target) result.statuses.push(event.prefetchStatus);
    });
    await cdp.send("Preload.enable");
    let target;
    for (let i = 0; i < 30 && !target; i++) {
      const links = await page.locator("a[href]:visible").evaluateAll(anchors => anchors.map(a => ({
        href: a.href, raw: a.getAttribute("href"), text: a.textContent.trim().slice(0, 80),
        skip: !!a.closest('[download], [ping], [onclick], [role="button"], [data-no-prefetch], [data-no-prerender], .no-prefetch, .no-prerender') ||
          a.relList.contains("nofollow") || a.relList.contains("external") || (a.target && a.target !== "_self"),
      })));
      const eligible = links.filter(link => !link.skip && linkPrefetchCandidate(link.href, page.url())?.sameOrigin);
      const catalogue = eligible.filter(link => !/privacy|terms|legal|customer-service/i.test(link.href));
      target = catalogue.find(link => /\/(?:p|products|models)\//.test(link.href)) ??
        catalogue.find(link => new URL(url).hostname === "makerworld.com"
          ? /\/(?:3d-)?models(?:\/|$)/.test(link.href) : /\.html$/.test(link.href));
      if (i === 29 && !target) {
        result.title = await page.title();
        result.visibleCandidates = eligible.slice(0, 8).map(link => ({ href: link.href, text: link.text }));
      }
      if (!target) await page.waitForTimeout(200);
    }
    if (!target) throw new Error("No eligible visible catalogue link found");
    result.target = target.href;
    result.linkText = target.text;
    const link = page.locator(`a[href=${JSON.stringify(target.raw)}]:visible`).first();
    await link.hover({ timeout: 10000 });
    await page.waitForTimeout(1800);
    result.marked = !!(await link.getAttribute("data-tern-prefetch"));
    result.beforeClick = [...result.statuses];
    result.rulePresent = await page.locator('script[type="speculationrules"]').evaluateAll(scripts =>
      scripts.some(script => script.textContent.includes('"tag":"tern-hover"')));
    const started = Date.now();
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await link.click({ timeout: 15000 });
    await page.waitForURL(target.href, { waitUntil: "domcontentloaded", timeout: 25000 });
    result.clickToDocumentMs = Date.now() - started;
    result.sameDocument = timeOrigin === await page.evaluate(() => performance.timeOrigin);
    result.title = await page.title();
    result.outcome = result.statuses.includes("PrefetchResponseUsed") ? "native-prefetch-used" : "navigation-without-prefetch-reuse";
    if (result.sameDocument) result.outcome = "same-document-navigation";
    if (/just a moment|access denied|verify/i.test(result.title)) result.outcome = "challenge";
  } catch (error) {
    result.error = String(error).split("\n")[0];
  } finally {
    results.push(result);
    console.log(JSON.stringify(result));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify({ measuredAt: new Date().toISOString(), results }, null, 2) + "\n");
    if (app) {
      await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
      await app.close().catch(() => {});
    }
    await rm(profile, { recursive: true, force: true, maxRetries: 3 });
  }
}
