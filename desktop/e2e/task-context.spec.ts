import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskContexts } from "../host/task-context";
import { parseTaskContext, contextInput, groundTaskContext } from "@tern/core/task-context";
import { WorkspaceFile } from "../host/workspace-file";
import type { Workspace } from "@tern/core/contracts";

let directory: string;
let workspace: Workspace;
const result = { goal: "Choose a laptop for Linux", searches: ["Framework 13 Linux suspend", "Framework 13 Linux battery life"] };
test.beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "tern-context-"));
  workspace = {
    version: 1, selectedTaskId: "laptop",
    tasks: [{ id: "laptop", title: "Choose a laptop", note: "Check Linux support", lifecycle: "Active", selectedPageId: "review" }],
    pages: [{ id: "review", taskId: "laptop", title: "Framework 13 review", url: "https://example.com/private?token=secret" }],
  };
});
test.afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

test("suggestions use bounded metadata, cache across restart and respect the saved goal", async () => {
  let requests = 0;
  let closed = 0;
  const provider = async (_directory: string, _model: string, _prompt: string, _signal: AbortSignal, _status: (message: string) => void, kind?: string) => {
    expect(kind).toBe("task-context");
    return {
      generate: async (input: string) => {
        requests++;
        expect(input).not.toContain("token=secret");
        expect(input).not.toContain("private");
        expect(input).not.toContain("source-token");
        expect(input).toContain("SAVED FINDINGS: 16 GB is enough");
        return JSON.stringify(result);
      },
      close: () => { closed++; },
    };
  };
  workspace.tasks[0].findings = [{ id: "f", text: "16 GB is enough", createdAt: 1, source: { title: "Review", url: "https://example.com/?source-token" } }];
  const contexts = new TaskContexts(directory, provider);
  await contexts.refresh(workspace, "laptop", "test-model", () => {});
  expect(contexts.snapshot(workspace, "test-model")).toEqual(result);
  expect(closed).toBe(1);
  const reopened = new TaskContexts(directory, provider);
  await reopened.refresh(workspace, "laptop", "test-model", () => {});
  expect(requests).toBe(1);
  workspace.tasks[0].goal = "My exact goal";
  expect(reopened.snapshot(workspace, "test-model")).toBeNull();
  await reopened.refresh(workspace, "laptop", "test-model", () => {});
  expect(reopened.snapshot(workspace, "test-model")?.goal).toBe("");
  expect(workspace.tasks[0].goal).toBe("My exact goal");
  expect(reopened.snapshot(workspace, "other-model")).toBeNull();
  reopened.stop(true);
  expect(reopened.snapshot(workspace, "test-model")).toBeNull();
  await reopened.refresh(workspace, "laptop", "", () => {});
  expect(requests).toBe(2);
  expect(new TaskContexts(directory, provider).snapshot(workspace, "test-model")).toBeNull();
});

test("late results are discarded after a source changes, cancellation or switching tasks", async () => {
  for (const change of ["source", "cancel", "switch"] as const) {
    let release!: (text: string) => void;
    let started!: () => void;
    let closed = false;
    let signal!: AbortSignal;
    const generating = new Promise<void>((resolve) => { started = resolve; });
    const contexts = new TaskContexts(directory, async (_directory, _model, _prompt, requestSignal) => {
      signal = requestSignal;
      return { generate: () => new Promise<string>((resolve) => { release = resolve; started(); }), close: () => { closed = true; } };
    });
    workspace.selectedTaskId = "laptop";
    const pending = contexts.refresh(workspace, "laptop", "model", () => {});
    await generating;
    if (change === "source") workspace.tasks[0].note = "A different question";
    if (change === "cancel") { contexts.stop(); expect(signal.aborted).toBe(true); }
    if (change === "switch") workspace.selectedTaskId = null;
    release(JSON.stringify(result));
    await pending;
    expect(contexts.snapshot(workspace, "model")).toBeNull();
    expect(contexts.pendingTaskId).toBeNull();
    expect(closed).toBe(true);
  }
});

test("canceling setup releases a late provider without generation", async () => {
  let release!: () => void;
  let closed = false;
  const contexts = new TaskContexts(directory, async () => {
    await new Promise<void>((resolve) => { release = resolve; });
    return { generate: async () => { throw new Error("Must not generate"); }, close: () => { closed = true; } };
  });
  const pending = contexts.refresh(workspace, "laptop", "model", () => {});
  contexts.stop();
  release();
  await pending;
  expect(closed).toBe(true);
  expect(contexts.status).toBe("");
});

test("invalid or unavailable responses leave saved work intact and allow retry", async () => {
  for (const value of [null, { goal: "x", searches: ["a", "b", "c"] }, { goal: "x", searches: ["\ncommand"] }, { searches: [] }])
    expect(() => parseTaskContext(value)).toThrow();
  let attempt = 0;
  const contexts = new TaskContexts(directory, async () => ({
    generate: async () => ++attempt === 1 ? "invalid json" : JSON.stringify(result), close: () => {},
  }));
  const before = JSON.stringify(workspace);
  await contexts.refresh(workspace, "laptop", "model", () => {});
  expect(contexts.status).toContain("unavailable");
  expect(contexts.snapshot(workspace, "model")).toBeNull();
  expect(JSON.stringify(workspace)).toBe(before);
  await contexts.refresh(workspace, "laptop", "model", () => {});
  expect(contexts.snapshot(workspace, "model")).toEqual(result);
});

test("workspace keeps goals and source findings across restart and still accepts older tasks", async () => {
  const storage = new WorkspaceFile(directory);
  expect(storage.save(workspace)).toBe(true);
  expect(storage.read()).toEqual(workspace);
  workspace.tasks[0].goal = "Reliable Linux suspend";
  workspace.tasks[0].findings = [{ id: "f", text: "16 GB is enough", createdAt: 1, source: { title: "Reference", url: "https://example.com/page" } }];
  expect(storage.save(workspace)).toBe(true);
  expect(new WorkspaceFile(directory).read()).toEqual(workspace);
  workspace.tasks[0].findings[0].source!.url = "javascript:alert(1)";
  await writeFile(join(directory, "workspace.json"), JSON.stringify(workspace));
  const invalid = new WorkspaceFile(directory);
  expect(invalid.read().tasks).toEqual([]);
  expect(invalid.error).toContain("preserved");
});

test("corrupt derived cache is ignored", async () => {
  await writeFile(join(directory, "task-context.json"), '[["laptop", {"key":"bad", "result":null}]]');
  const contexts = new TaskContexts(directory, async () => ({ generate: async () => JSON.stringify(result), close: () => {} }));
  await contexts.refresh(workspace, "laptop", "model", () => {});
  expect(contexts.snapshot(workspace, "model")).toEqual(result);
  expect(JSON.parse(await readFile(join(directory, "task-context.json"), "utf8"))).toHaveLength(1);
});

test("generic tasks need no inference and field-label echoes are filtered", async () => {
  expect(groundTaskContext({ goal: "Investigate the topic", searches: ["savedGoal nextStep", "Framework Linux suspend"] }, contextInput(workspace.tasks[0], workspace)))
    .toEqual({ goal: "", searches: ["Framework Linux suspend"] });
  workspace.tasks[0].title = "Research";
  workspace.tasks[0].note = "";
  workspace.pages[0].title = "Google";
  const contexts = new TaskContexts(directory, async () => { throw new Error("Must not load the model"); });
  await contexts.refresh(workspace, "laptop", "model", () => {});
  expect(contexts.status).toBe("");
  expect(contexts.snapshot(workspace, "model")).toEqual({ goal: "", searches: [] });
});
