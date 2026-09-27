import type { TaskPlan } from "@tern/core/contracts";
import { openSummaryProvider, type OpenSummaryProvider, type SummaryProvider } from "./summary-provider.js";

import { TASK_START_PROMPT, parseTaskPlan } from "@tern/core/task-plan";

export class TaskStarter {
  private controller?: AbortController;
  status = "";
  get pending() { return !!this.controller; }

  constructor(private directory: string, private openProvider: OpenSummaryProvider = openSummaryProvider) {}

  stop() {
    this.controller?.abort();
    this.controller = undefined;
    this.status = "";
  }

  async prepare(request: string, model: string, publish: () => void): Promise<TaskPlan | null> {
    if (this.pending) throw new Error("A task is already being prepared.");
    if (!model) throw new Error("Enable local AI or choose Create without AI.");
    const controller = new AbortController();
    this.controller = controller;
    this.status = "Preparing your task on this device...";
    publish();
    const current = () => this.controller === controller && !controller.signal.aborted;
    let provider: SummaryProvider | undefined;
    try {
      provider = await this.openProvider(this.directory, model, TASK_START_PROMPT, controller.signal,
        (status) => { if (current()) { this.status = status; publish(); } }, "task-start");
      if (!current()) return null;
      this.status = "Naming your task and choosing searches...";
      publish();
      const plan = parseTaskPlan(JSON.parse(await provider.generate(`REQUEST: ${request}`)));
      return current() ? plan : null;
    } catch {
      if (!current()) return null;
      throw new Error("Could not prepare this task with local AI. Retry or choose Create without AI.");
    } finally {
      provider?.close();
      if (current()) {
        this.controller = undefined;
        this.status = "";
        publish();
      }
    }
  }
}
