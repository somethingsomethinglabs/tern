import assert from "node:assert/strict";
import { test } from "node:test";
import { WorkspaceModel } from "../dist/workspace-model.js";
import { emptyWorkspace, parseWorkspace } from "../dist/workspace.js";
import { PageSelection } from "../dist/page-selection.js";
import { addressURL, searchURL } from "../dist/navigation.js";
import { contextInput, contextText } from "../dist/task-context.js";
import { parseTaskSummary } from "../dist/task-summary.js";

function fixture() {
  let sequence = 0;
  const workspace = emptyWorkspace();
  const model = new WorkspaceModel(workspace, {
    id: () => `id-${++sequence}`,
    now: () => 1234,
  });
  model.command({ type: "createTask", title: " Compare laptops " });
  return { workspace, model, task: workspace.tasks[0] };
}

test("pause, resume and settle retain task context and release pages only on settlement", () => {
  const { workspace, model, task } = fixture();
  const page = model.newPage(task.id, "https://example.com/review");
  assert.equal(task.title, "Compare laptops");
  model.command({ type: "saveGoal", id: task.id, goal: "Check Linux support" });
  model.command({ type: "addFinding", id: task.id, text: " Battery lasts eight hours " });
  assert.deepEqual(model.command({ type: "pause", note: "Check suspend next" }), {});
  assert.equal(task.lifecycle, "Later");
  assert.deepEqual(model.command({ type: "resume" }), {});
  assert.equal(task.lifecycle, "Active");
  assert.deepEqual(model.command({ type: "settle" }), { releaseTaskPages: task.id });
  assert.equal(task.lifecycle, "Settled");
  assert.equal(task.note, "Check suspend next");
  assert.equal(task.goal, "Check Linux support");
  assert.equal(task.selectedPageId, page.id);
  assert.equal(task.findings[0].text, "Battery lasts eight hours");
  assert.equal(task.findings[0].createdAt, 1234);
  assert.deepEqual(parseWorkspace(JSON.stringify(workspace)), workspace);
});

test("an explicitly targeted task changes without changing the active task", () => {
  const { workspace, model, task } = fixture();
  model.command({ type: "createTask", title: "Book travel" });
  const selected = workspace.selectedTaskId;
  model.command({ type: "pause", id: task.id, note: "Return tomorrow" });
  assert.equal(workspace.selectedTaskId, selected);
  assert.equal(workspace.tasks[1].lifecycle, "Active");
  assert.deepEqual(model.command({ type: "moveTask", id: task.id, lifecycle: "Settled" }), {
    releaseTaskPages: task.id,
  });
});

test("invalid task edits fail before changing saved work", () => {
  const { workspace, model, task } = fixture();
  const before = JSON.stringify(workspace);
  for (const command of [
    { type: "pause", note: "x".repeat(501) },
    { type: "saveGoal", id: task.id, goal: 42 },
    { type: "renameTask", id: task.id, title: " " },
    { type: "moveTask", id: task.id, lifecycle: "Done" },
    { type: "addFinding", id: task.id, text: " " },
    { type: "editFinding", id: task.id, findingId: "missing", text: "replacement" },
    { type: "saveNote", id: "missing", note: "wrong task" },
  ]) {
    assert.throws(() => model.command(command));
    assert.equal(JSON.stringify(workspace), before);
  }
  assert.equal(model.command({ type: "back" }), null);
  assert.equal(JSON.stringify(workspace), before);
});

test("finding limits, edits and removals share the same validation", () => {
  const { model, task } = fixture();
  for (let i = 0; i < 50; i++) model.command({ type: "addFinding", id: task.id, text: `Finding ${i}` });
  assert.throws(() => model.command({ type: "addFinding", id: task.id, text: "Overflow" }), /50/);
  const findingId = task.findings[0].id;
  assert.deepEqual(model.command({ type: "editFinding", id: task.id, findingId, text: " Updated " }), { contextChanged: true });
  assert.equal(task.findings[0].text, "Updated");
  model.command({ type: "removeFinding", id: task.id, findingId });
  model.command({ type: "addFinding", id: task.id, text: "Replacement" });
  assert.equal(task.findings.length, 50);
});

test("restoration repairs stale selections and rejects unsafe or corrupt records", () => {
  const { workspace, model, task } = fixture();
  model.newPage(task.id, "https://example.com");
  const saved = structuredClone(workspace);
  saved.selectedTaskId = "missing";
  saved.tasks[0].selectedPageId = "missing";
  saved.tasks[0].lastOpenedAt = -1;
  const restored = parseWorkspace(JSON.stringify(saved));
  assert.equal(restored.selectedTaskId, task.id);
  assert.equal(restored.tasks[0].selectedPageId, null);
  assert.equal(restored.tasks[0].lastOpenedAt, undefined);
  for (const url of ["file:///etc/passwd", "javascript:alert(1)", "https://user:password@example.com"]) {
    saved.pages[0].url = url;
    assert.throws(() => parseWorkspace(JSON.stringify(saved)));
  }
  for (const source of ["null", "{}", "not json", JSON.stringify({ ...workspace, tasks: [task, task] })])
    assert.throws(() => parseWorkspace(source));
});

test("tab selection stays within a task and is transient across restoration", () => {
  const { workspace, model, task } = fixture();
  const first = model.newPage(task.id);
  const second = model.newPage(task.id);
  const selection = new PageSelection();
  selection.select(workspace, first);
  selection.select(workspace, second, "range");
  assert.deepEqual(selection.selected(workspace), [first.id, second.id]);
  const restored = parseWorkspace(JSON.stringify(workspace));
  assert.deepEqual(new PageSelection().selected(restored), [second.id]);
  model.command({ type: "createTask", title: "Another task" });
  assert.deepEqual(selection.selected(workspace), []);
});

test("address and search rules reject unsafe schemes and respect the chosen engine", () => {
  assert.equal(addressURL("example.com", "google"), "https://example.com/");
  assert.equal(addressURL("localhost:4173/path", "google"), "http://localhost:4173/path");
  assert.equal(addressURL("bike lights", "brave"), "https://search.brave.com/search?q=bike%20lights");
  for (const address of ["javascript:alert(1)", "file:///etc/passwd", "https://user:pass@example.com", " "])
    assert.throws(() => addressURL(address, "google"));
  assert.equal(searchURL("javascript:alert(1)", "google"), "https://www.google.com/search?q=javascript%3Aalert(1)");
});

test("shared AI context excludes URL secrets and validates description output", () => {
  const { workspace, model, task } = fixture();
  const page = model.newPage(task.id, "https://example.com/private?secret=token");
  page.title = "Laptop review";
  model.keepFinding(task, "Battery is replaceable", { title: "Review", url: "https://example.com/?source-secret" });
  const input = contextInput(task, workspace);
  assert.doesNotMatch(JSON.stringify(input), /private|token|source-secret/);
  assert.match(contextText(input), /Battery is replaceable/);
  assert.equal(parseTaskSummary({ summary: " Laptop reviews " }), "Laptop reviews");
  for (const value of [null, {}, { summary: " " }, { summary: "x".repeat(601) }])
    assert.throws(() => parseTaskSummary(value));
});
