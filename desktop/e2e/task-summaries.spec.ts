import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserPreferences } from "../host/preferences";
import { TaskSummaries } from "../host/task-summaries";
import { summaryInput } from "@tern/core/task-recap";
import { BUILTIN_MODEL } from "@tern/core/local-ai-config";
import type { Workspace } from "@tern/core/contracts";

let directory: string;
const originalFetch = globalThis.fetch;
const model = "lfm2.5-thinking";
const description = "Open references cover extension APIs and popup behavior.";
const workspace: Workspace = {
  version: 1,
  selectedTaskId: "extensions",
  tasks: [{
    id: "extensions", title: "Build extension support", lifecycle: "Active",
    note: "Check popups before packaging.", selectedPageId: "popup",
  }],
  pages: [{
    id: "popup", taskId: "extensions", title: "Popup behavior",
    url: "https://example.com/private/path?token=secret#draft",
  }],
};

test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tern-summary-test-"));
});
test.afterEach(async () => {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
});

function localModel(content = JSON.stringify({ summary: description })) {
  const requests: { route: string; body: Record<string, any> }[] = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ route: String(url), body: JSON.parse(String(options?.body)) });
    return new Response(JSON.stringify(String(url).endsWith("/show")
      ? { model_info: { "general.architecture": "lfm2" } }
      : { message: { thinking: "Internal reasoning must not reach the card.", content } }));
  };
  return requests;
}

test("preferences default to built-in AI and migrate the old default, preserving custom choices and opt-outs", async () => {
  const preferences = () => new BrowserPreferences(directory, tmpdir());
  expect(preferences().value.summaryModel).toBe(BUILTIN_MODEL.id);
  for (const [stored, expected] of [
    [{ searchEngine: "google" }, BUILTIN_MODEL.id],
    [{ summaryModel: "lfm2.5-thinking" }, BUILTIN_MODEL.id],
    [{ summaryModel: "lfm2.5-thinking:latest" }, BUILTIN_MODEL.id],
    [{ summaryModel: "builtin:retired-model-v1", searchEngine: "google" }, BUILTIN_MODEL.id],
    [{ summaryModel: BUILTIN_MODEL.id }, BUILTIN_MODEL.id],
    [{ summaryModel: "custom-local:latest" }, "custom-local:latest"],
    [{ summaryModel: "" }, ""],
  ] as const) {
    await writeFile(join(directory, "preferences.json"), JSON.stringify(stored));
    const prefs = preferences();
    prefs.read();
    expect(prefs.value.summaryModel).toBe(expected);
    expect(prefs.error).toBe("");
    if ("searchEngine" in stored) expect(prefs.value.searchEngine).toBe(stored.searchEngine);
  }
});

test("built-in model preparation keeps factual recaps visible and closes inference after caching", async () => {
  const requests: string[] = [];
  let closed = false;
  const summaries = new TaskSummaries(directory, async (_directory, selected, _prompt, signal, status) => {
    expect(selected).toBe(BUILTIN_MODEL.id);
    expect(signal.aborted).toBe(false);
    status("Downloading AI model: 50%");
    expect(summaries.pendingTaskIds).toEqual([]);
    return {
      generate: async (input) => {
        requests.push(input);
        expect(summaries.pendingTaskIds).toEqual(["extensions"]);
        return JSON.stringify({ summary: description });
      },
      close: () => { closed = true; },
    };
  });
  globalThis.fetch = async () => { throw new Error("Unexpected network request"); };
  await summaries.refresh(workspace, BUILTIN_MODEL.id, () => {});
  expect(closed).toBe(true);
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toContain("token=secret");
  expect(summaries.snapshot(workspace, BUILTIN_MODEL.id).extensions.text).toBe(description);
  await summaries.refresh(workspace, BUILTIN_MODEL.id, () => {});
  expect(requests).toHaveLength(1);
});

test("canceling built-in preparation never publishes stale results and still closes a late provider", async () => {
  let closed = false;
  let signal: AbortSignal | undefined;
  let release!: () => void;
  const summaries = new TaskSummaries(directory, async (_directory, _model, _prompt, requestSignal) => {
    signal = requestSignal;
    await new Promise<void>((resolve) => { release = resolve; });
    return {
      generate: async () => { throw new Error("Canceled work must not run"); },
      close: () => { closed = true; },
    };
  });
  const refresh = summaries.refresh(workspace, BUILTIN_MODEL.id, () => {});
  summaries.stop();
  expect(signal?.aborted).toBe(true);
  release();
  await refresh;
  expect(closed).toBe(true);
  expect(summaries.snapshot(workspace, BUILTIN_MODEL.id)).toEqual({});
  expect(summaries.status).toBe("");
});

test("canceling generation discards a late answer and releases its provider", async () => {
  let release!: (text: string) => void;
  let started!: () => void;
  let closed = false;
  const generating = new Promise<void>((resolve) => { started = resolve; });
  const summaries = new TaskSummaries(directory, async () => ({
    generate: () => new Promise<string>((resolve) => { release = resolve; started(); }),
    close: () => { closed = true; },
  }));
  const refresh = summaries.refresh(workspace, BUILTIN_MODEL.id, () => {});
  await generating;
  summaries.stop(true);
  release(JSON.stringify({ summary: description }));
  await refresh;
  expect(closed).toBe(true);
  expect(summaries.snapshot(workspace, BUILTIN_MODEL.id)).toEqual({});
  expect(summaries.pendingTaskIds).toEqual([]);
});

test("failed built-in startup leaves the overview usable with a retry message", async () => {
  const summaries = new TaskSummaries(directory, async () => { throw new Error("Missing native runtime"); });
  await summaries.refresh(workspace, BUILTIN_MODEL.id, () => {});
  expect(summaries.snapshot(workspace, BUILTIN_MODEL.id)).toEqual({});
  expect(summaries.pendingTaskIds).toEqual([]);
  expect(summaries.status).toContain("Retry in Settings");
});

test("thinking model requests display and cache only the final JSON description", async () => {
  const requests = localModel();
  const summaries = new TaskSummaries(directory);
  await summaries.refresh(workspace, model, () => {});
  expect(requests).toHaveLength(2);
  const request = requests[1].body;
  expect(request.model).toBe(model);
  expect(request.think).toBe(false);
  expect(request.options.num_predict).toBe(256);
  const input = JSON.parse(request.messages[1].content);
  expect(input.lastSelectedPage).toBe("popup");
  expect(input.recentPages).toEqual([
    { id: "popup", title: "Popup behavior", site: "example.com" },
  ]);
  expect(summaries.snapshot(workspace, model).extensions.text).toBe(description);
  expect(await readFile(join(directory, "task-summaries.json"), "utf8"))
    .not.toContain("Internal reasoning");

  const reopened = new TaskSummaries(directory);
  await reopened.refresh(workspace, model, () => {});
  expect(requests).toHaveLength(2);
  reopened.stop(true);
  expect(reopened.snapshot(workspace, model)).toEqual({});
  await reopened.refresh(workspace, "", () => {});
  expect(requests).toHaveLength(2);
});

test("descriptions generated with the old prompt are replaced even when model and tabs match", async () => {
  const oldKey = createHash("sha256")
    .update(JSON.stringify([1, model, summaryInput(workspace.tasks[0], workspace.pages)]))
    .digest("hex");
  await writeFile(join(directory, "task-summaries.json"), JSON.stringify({
    extensions: { key: oldKey, model, text: "Old description" },
  }));
  const requests = localModel();
  const summaries = new TaskSummaries(directory);
  expect(summaries.snapshot(workspace, model)).toEqual({});
  await summaries.refresh(workspace, model, () => {});
  expect(requests).toHaveLength(2);
  expect(summaries.snapshot(workspace, model).extensions.text).toBe(description);
});

test("incomplete reasoning output falls back to saved browsing details", async () => {
  localModel("");
  const summaries = new TaskSummaries(directory);
  await summaries.refresh(workspace, model, () => {});
  expect(summaries.snapshot(workspace, model)).toEqual({});
  expect(summaries.pendingTaskIds).toEqual([]);
  expect(summaries.status).toContain("Local AI unavailable");
});
