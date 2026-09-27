import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Task, TaskContext, Workspace } from "@tern/core/contracts";
import { openSummaryProvider, type OpenSummaryProvider, type SummaryProvider } from "./summary-provider.js";

import { CONTEXT_PROMPT, contextInput, contextText, groundTaskContext, parseTaskContext, hasContextTopic } from "@tern/core/task-context";

type Entry = { key: string; result: TaskContext };

export class TaskContexts {
  private entries = new Map<string, Entry>();
  private controller?: AbortController;
  private path: string;
  status = "";
  pendingTaskId: string | null = null;

  constructor(private directory: string, private openProvider: OpenSummaryProvider = openSummaryProvider) {
    this.path = join(directory, "task-context.json");
    try {
      if (existsSync(this.path) && statSync(this.path).size < 1_000_000) {
        const data = JSON.parse(readFileSync(this.path, "utf8"));
        if (Array.isArray(data)) for (const [id, entry] of data.slice(-200)) {
          if (typeof id === "string" && typeof entry?.key === "string")
            this.entries.set(id, { key: entry.key, result: parseTaskContext(entry.result) });
        }
      }
    } catch { this.entries.clear(); }
  }

  private key(task: Task, workspace: Workspace, model: string) {
    return createHash("sha256").update(JSON.stringify([1, CONTEXT_PROMPT, model, contextInput(task, workspace)])).digest("hex");
  }

  snapshot(workspace: Workspace, model: string): TaskContext | null {
    const task = workspace.tasks.find((task) => task.id === workspace.selectedTaskId);
    if (!model || !task) return null;
    const entry = this.entries.get(task.id);
    return entry?.key === this.key(task, workspace, model) ? entry.result : null;
  }

  stop(clear = false) {
    this.controller?.abort();
    this.controller = undefined;
    this.pendingTaskId = null;
    this.status = "";
    if (clear) {
      this.entries.clear();
      try { rmSync(this.path, { force: true }); } catch { /* No cached results are used. */ }
    }
  }

  async refresh(workspace: Workspace, id: string, model: string, publish: () => void) {
    this.stop();
    const task = workspace.tasks.find((task) => task.id === id);
    if (!task || !model || workspace.selectedTaskId !== id) return;
    const key = this.key(task, workspace, model);
    if (this.entries.get(id)?.key === key) return;
    const input = contextInput(task, workspace);
    if (!hasContextTopic(input)) {
      this.entries.set(id, { key, result: { goal: "", searches: [] } });
      if (this.entries.size > 200) this.entries.delete(this.entries.keys().next().value!);
      publish();
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    this.pendingTaskId = id;
    this.status = "Preparing suggestions on this device...";
    publish();
    const current = () => this.controller === controller && !controller.signal.aborted;
    let provider: SummaryProvider | undefined;
    try {
      provider = await this.openProvider(this.directory, model, CONTEXT_PROMPT, controller.signal,
        (status) => { if (current()) { this.status = status; publish(); } }, "task-context");
      if (!current()) return;
      this.status = "Writing suggestions on this device...";
      publish();
      const result = groundTaskContext(parseTaskContext(JSON.parse(await provider.generate(contextText(input)))), input);
      if (!current()) return;
      if (workspace.selectedTaskId !== id || !workspace.tasks.includes(task) || key !== this.key(task, workspace, model)) {
        this.status = "Task context changed. Generate suggestions again.";
        return;
      }
      this.entries.delete(id);
      this.entries.set(id, { key, result });
      if (this.entries.size > 200) this.entries.delete(this.entries.keys().next().value!);
      try {
        writeFileSync(this.path + ".tmp", JSON.stringify([...this.entries]), { mode: 0o600 });
        renameSync(this.path + ".tmp", this.path);
      } catch { /* Suggestions remain usable without a disk cache. */ }
      this.status = "";
    } catch {
      if (current()) this.status = "AI suggestions unavailable. Try again. Your goal and findings are kept.";
    } finally {
      provider?.close();
      if (current()) {
        this.controller = undefined;
        this.pendingTaskId = null;
        publish();
      }
    }
  }
}
