import { test, expect } from "@playwright/test";
import { TaskStarter } from "../host/task-start";
import { basicTaskPlan, parseTaskPlan } from "@tern/core/task-plan";

const request = "Find a Linux laptop under $1,500 with reliable suspend and good battery life.";
const plan = {
  title: "Choose a Linux laptop",
  goal: request,
  searches: ["Linux laptops under $1500", "Linux laptop suspend compatibility", "Linux laptop battery life tests"],
};

test("task planning uses only the request, reports progress and releases its provider", async () => {
  let closed = false;
  const statuses: string[] = [];
  const starter = new TaskStarter("/tmp", async (_directory, model, _prompt, signal, status, kind) => {
    expect(model).toBe("local-model");
    expect(kind).toBe("task-start");
    expect(signal.aborted).toBe(false);
    status("Loading model");
    return {
      generate: async (input) => {
        expect(input).toBe(`REQUEST: ${request}`);
        return JSON.stringify(plan);
      },
      close: () => { closed = true; },
    };
  });
  expect(await starter.prepare(request, "local-model", () => statuses.push(starter.status))).toEqual(plan);
  expect(statuses).toContain("Loading model");
  expect(closed).toBe(true);
  expect(starter.pending).toBe(false);
});

test("canceling startup closes a late provider without generating", async () => {
  let release!: () => void;
  let closed = false;
  let signal!: AbortSignal;
  const starter = new TaskStarter("/tmp", async (_directory, _model, _prompt, requestSignal) => {
    signal = requestSignal;
    await new Promise<void>((resolve) => { release = resolve; });
    return { generate: async () => { throw new Error("Must not generate"); }, close: () => { closed = true; } };
  });
  const pending = starter.prepare(request, "local-model", () => {});
  starter.stop();
  expect(signal.aborted).toBe(true);
  release();
  expect(await pending).toBeNull();
  expect(closed).toBe(true);
});

test("a duplicate request is rejected and a canceled answer cannot create a task", async () => {
  let release!: (text: string) => void;
  let started!: () => void;
  const generating = new Promise<void>((resolve) => { started = resolve; });
  const starter = new TaskStarter("/tmp", async () => ({
    generate: () => new Promise<string>((resolve) => { release = resolve; started(); }), close: () => {},
  }));
  const pending = starter.prepare(request, "local-model", () => {});
  await generating;
  await expect(starter.prepare(request, "local-model", () => {})).rejects.toThrow("already");
  starter.stop();
  release(JSON.stringify(plan));
  expect(await pending).toBeNull();
  expect(starter.pending).toBe(false);
});

test("invalid, oversized and duplicate searches fail without hiding the error", async () => {
  for (const value of [null, {}, { ...plan, title: "" }, { ...plan, goal: "x".repeat(501) },
    { ...plan, searches: ["one"] }, { ...plan, searches: ["one", "two", "three", "four"] },
    { ...plan, searches: ["Linux suspend", " linux  suspend "] },
    { ...plan, searches: ["Linux\nsuspend", "Linux battery"] }])
    expect(() => parseTaskPlan(value)).toThrow();
  const starter = new TaskStarter("/tmp", async () => ({ generate: async () => "bad json", close: () => {} }));
  await expect(starter.prepare(request, "model", () => {})).rejects.toThrow("Retry or choose Create without AI");
  expect(starter.pending).toBe(false);
  await expect(starter.prepare(request, "", () => {})).rejects.toThrow("Enable local AI");
});

test("manual fallback uses bounded user text without inventing additional searches", () => {
  const basic = basicTaskPlan(request);
  expect(basic.goal).toBe(request);
  expect(basic.searches).toEqual([request]);
  const long = basicTaskPlan("word ".repeat(200));
  expect(long.title.length).toBeLessThanOrEqual(80);
  expect(long.goal.length).toBeLessThanOrEqual(500);
  expect(long.searches[0].length).toBeLessThanOrEqual(160);
});
