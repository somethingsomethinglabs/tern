import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtemp, writeFile, readFile, mkdir, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BUILTIN_MODEL } from "@tern/core/local-ai-config";
import { CONTEXT_PROMPT, contextText, groundTaskContext, parseTaskContext } from "@tern/core/task-context";

// Opt-in native checks use a previously verified local GGUF, never a network
// download. TERN_AI_MODULE_ROOT can point at a packaged app's dist/host.
const modelPath = process.env.TERN_AI_TEST_MODEL;
test.skip(!modelPath, "Set TERN_AI_TEST_MODEL to run native inference checks.");
let app: ElectronApplication;
let profile: string;
const moduleUrl = pathToFileURL(resolve(process.env.TERN_AI_MODULE_ROOT ?? "dist/host", "local-ai-process.js")).href;

test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "tern-native-ai-"));
  const main = join(profile, "main.cjs");
  await writeFile(main, `const {app, BrowserWindow} = require('electron');
    app.setPath('userData', ${JSON.stringify(join(profile, "profile"))});
    globalThis.ternAI = import(${JSON.stringify(moduleUrl)});
    globalThis.ternProvider = import(${JSON.stringify(new URL("./summary-provider.js", moduleUrl).href)});
    app.whenReady().then(() => new BrowserWindow({show:false}));`);
  app = await electron.launch({
    args: [main],
    ...(process.env.TERN_EXECUTABLE ? { executablePath: process.env.TERN_EXECUTABLE } : {}),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
  });
});

test("built-in provider prepares the model and copies its bundled license", async () => {
  test.skip(!process.env.TERN_AI_BUILTIN_MODEL, "Set TERN_AI_BUILTIN_MODEL to the pinned default GGUF.");
  test.setTimeout(90_000);
  await mkdir(join(profile, "models"));
  await symlink(process.env.TERN_AI_BUILTIN_MODEL!, join(profile, "models", BUILTIN_MODEL.filename));
  await app.evaluate(async (_electron, { profile, model }) => {
    const { openSummaryProvider } = await (globalThis as any).ternProvider;
    const provider = await openSummaryProvider(profile, model.id,
      'Return JSON with a "summary" string describing the tabs.',
      new AbortController().signal, () => {});
    provider.close();
  }, { profile, model: BUILTIN_MODEL });
  expect(await readFile(join(profile, "models", "LFM-LICENSE.txt"), "utf8"))
    .toContain("LFM Open License");
});
test.afterEach(async () => {
  await app?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
});

test("native utility process generates JSON and releases its process on close", async () => {
  test.setTimeout(90_000);
  const result = await app.evaluate(async ({ app }, { moduleUrl, modelPath }) => {
    const { startLocalAI } = await (globalThis as any).ternAI;
    const controller = new AbortController();
    const provider = await startLocalAI(modelPath, controller.signal);
    try {
      const output = await provider.generate(
        'Describe the open tabs in one short sentence. Return JSON with one key, "summary".',
        JSON.stringify({ task: "Database research", recentPages: [{ title: "SQLite Write-Ahead Logging", site: "sqlite.org" }] }),
      );
      return { output, running: app.getAppMetrics().some((entry) => entry.name === "Tern local AI") };
    } finally { provider.close(); }
  }, { moduleUrl, modelPath: modelPath! });
  expect(JSON.parse(result.output).summary).toMatch(/SQLite|logging|database/i);
  expect(result.running).toBe(true);
  await expect.poll(() => app.evaluate(({ app }) =>
    app.getAppMetrics().some((entry) => entry.name === "Tern local AI"),
  )).toBe(false);
});

test("canceling model startup rejects promptly and leaves no utility process", async () => {
  const rejected = await app.evaluate(async (_electron, { moduleUrl, modelPath }) => {
    const { startLocalAI } = await (globalThis as any).ternAI;
    const controller = new AbortController();
    const opening = startLocalAI(modelPath, controller.signal);
    controller.abort();
    try { await opening; return false; } catch { return true; }
  }, { moduleUrl, modelPath: modelPath! });
  expect(rejected).toBe(true);
  await expect.poll(() => app.evaluate(({ app }) =>
    app.getAppMetrics().some((entry) => entry.name === "Tern local AI"),
  )).toBe(false);
});

test("native task suggestions use the task context schema", async () => {
  test.setTimeout(90_000);
  const inputs = [
    { task: "Choose a Linux laptop", savedGoal: "", nextStep: "Check Framework 13 suspend support before deciding.", savedFindings: [], recentPages: [{ title: "Framework 13 AMD Linux support", site: "frame.work" }] },
    { task: "Walking trip", savedGoal: "Find a short walk near Halls Gap", nextStep: "Check which tracks are open", savedFindings: [{ text: "Only have half a day." }], recentPages: [{ title: "Grampians walking tracks", site: "parks.vic.gov.au" }] },
    { task: "Research", savedGoal: "", nextStep: "", savedFindings: [], recentPages: [{ title: "Google", site: "google.com" }] },
  ].map((input) => ({ ...input, totalPages: input.recentPages.length, lastSelectedPage: null,
    recentPages: input.recentPages.map((page, i) => ({ ...page, id: String(i) })) }));
  const results = await app.evaluate(async (_electron, { modelPath, prompt, inputs }) => {
    const { startLocalAI } = await (globalThis as any).ternAI;
    const provider = await startLocalAI(modelPath, new AbortController().signal);
    try {
      const results = [];
      for (const input of inputs) {
        const start = Date.now();
        const text = await provider.generate(prompt, input, "task-context");
        results.push({ input, text, milliseconds: Date.now() - start });
      }
      return results;
    } finally { provider.close(); }
  }, { modelPath: modelPath!, prompt: CONTEXT_PROMPT, inputs: inputs.map(contextText) });
  for (const { text } of results) expect(parseTaskContext(JSON.parse(text)).searches.length).toBeLessThanOrEqual(2);
  console.log("Native task suggestions:", JSON.stringify(results));
  expect(JSON.parse(results[0].text).searches.join(" ")).toMatch(/Framework/i);
  expect(groundTaskContext(JSON.parse(results[2].text), inputs[2])).toEqual({ goal: "", searches: [] });
  await expect.poll(() => app.evaluate(({ app }) => app.getAppMetrics().some((entry) => entry.name === "Tern local AI"))).toBe(false);
});
