import type { Command, Finding, PageRecord, Task, Workspace } from "./contracts.js";

export function checkedText(input: unknown, max: number): string {
  if (typeof input !== "string" || input.length > max)
    throw new Error("Invalid text.");
  return input;
}

export type WorkspaceEffects = {
  contextChanged?: boolean;
  releaseTaskPages?: string;
};

type Environment = { id(): string; now(): number };

// Owns task edits and their validation. Hosts perform the returned native effects.
export class WorkspaceModel {
  constructor(readonly workspace: Workspace, private environment: Environment) {}

  command(value: Command): WorkspaceEffects | null {
    const workspace = this.workspace;
    const text = checkedText;
    const targetTask = (id?: string) => {
      if (id === undefined)
        return workspace.tasks.find(task => task.id === workspace.selectedTaskId);
      const task = workspace.tasks.find(task => task.id === text(id, 100));
      if (!task) throw new Error("Task not found.");
      return task;
    };
    const effects: WorkspaceEffects = {};
    switch (value.type) {
      case "saveNote": {
        const task = workspace.tasks.find(
          (task) => task.id === text(value.id, 100),
        );
        if (!task) throw new Error("Task not found.");
        task.note = text(value.note, 500);
        effects.contextChanged = true;
        break;
      }
      case "saveGoal": {
        const task = targetTask(value.id)!;
        task.goal = text(value.goal, 500).trim();
        effects.contextChanged = true;
        break;
      }
      case "addFinding": {
        this.keepFinding(targetTask(value.id)!, text(value.text, 1000));
        effects.contextChanged = true;
        break;
      }
      case "removeFinding": {
        const task = targetTask(value.id)!;
        const id = text(value.findingId, 100);
        task.findings = (task.findings ?? []).filter((finding) => finding.id !== id);
        effects.contextChanged = true;
        break;
      }
      case "editFinding": {
        const task = targetTask(value.id)!;
        const finding = task.findings?.find((finding) => finding.id === text(value.findingId, 100));
        const content = text(value.text, 1000).trim();
        if (!finding || !content) throw new Error("Enter a finding to save.");
        finding.text = content;
        effects.contextChanged = true;
        break;
      }
      case "moveTask": {
        const task = workspace.tasks.find(
          (task) => task.id === text(value.id, 100),
        );
        if (!task || !["Active", "Later", "Settled"].includes(value.lifecycle))
          throw new Error("Invalid task destination.");
        task.lifecycle = value.lifecycle;
        if (task.lifecycle === "Settled") effects.releaseTaskPages = task.id;
        break;
      }
      case "createTask": {
        const title = text(value.title, 120).trim();
        if (!title) throw new Error("Enter a task name.");
        const task = {
          id: this.environment.id(),
          title,
          lifecycle: "Active" as const,
          note: "",
          selectedPageId: null,
        };
        workspace.tasks.push(task);
        workspace.selectedTaskId = task.id;
        break;
      }
      case "renameTask": {
        const task = workspace.tasks.find(
          (task) => task.id === text(value.id, 100),
        );
        const title = text(value.title, 120).trim();
        if (!task || !title) throw new Error("Enter a task name.");
        task.title = title;
        break;
      }
      case "pause": {
        const task = targetTask(value.id);
        if (task) {
          task.note = text(value.note, 500);
          task.lifecycle = "Later";
        }
        break;
      }
      case "resume":
      case "settle": {
        const task = targetTask(value.id);
        if (task) {
          task.lifecycle = value.type === "resume" ? "Active" : "Settled";
          if (task.lifecycle === "Settled") effects.releaseTaskPages = task.id;
        }
        break;
      }
      default:
        return null;
    }
    return effects;
  }

  keepFinding(task: Task, text: string, source?: Finding["source"]) {
    if (!text.trim() || text.length > 1000)
      throw new Error("Keep a finding between 1 and 1,000 characters.");
    if ((task.findings?.length ?? 0) >= 50)
      throw new Error("Remove a finding before adding another. Each task can keep 50.");
    (task.findings ??= []).push({
      id: this.environment.id(), text: text.trim(), createdAt: this.environment.now(),
      ...(source ? { source } : {}),
    });
  }

  newPage(taskId: string, url = ""): PageRecord {
    const task = this.workspace.tasks.find(task => task.id === taskId);
    if (!task) throw new Error("Task not found.");
    const page = {
      id: this.environment.id(), taskId,
      title: url ? "Loading…" : "New page", url,
    };
    this.workspace.pages.push(page);
    task.selectedPageId = page.id;
    return page;
  }

  task(id = this.workspace.selectedTaskId): Task | undefined {
    return this.workspace.tasks.find(task => task.id === id);
  }

  page(id = this.task()?.selectedPageId): PageRecord | undefined {
    return this.workspace.pages.find(page => page.id === id);
  }

  selectTask(id: string, restoreSelection = false): Task {
    const task = this.task(checkedText(id, 100));
    if (!task) throw new Error("Task not found.");
    if (restoreSelection && !task.selectedPageId)
      task.selectedPageId = this.workspace.pages.find(page => page.taskId === id)?.id ?? null;
    this.workspace.selectedTaskId = id;
    return task;
  }

  removePage(id: string) {
    const page = this.page(id);
    if (!page) return;
    this.workspace.pages = this.workspace.pages.filter(item => item.id !== id);
    const task = this.task(page.taskId);
    if (task?.selectedPageId === id)
      task.selectedPageId = this.workspace.pages.find(item => item.taskId === task.id)?.id ?? null;
  }

  recordActivity() {
    const task = this.task();
    const page = this.page();
    if (task) task.lastOpenedAt = this.environment.now();
    if (page) page.lastViewedAt = this.environment.now();
  }
}
