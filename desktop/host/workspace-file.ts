import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Workspace } from "./contracts.js";

// Persist references only. Live page instances and website form values stay in Chromium.
export class WorkspaceFile {
  error = "";
  private readonly path: string;
  private writable = true;
  constructor(private directory: string) {
    this.path = join(directory, "workspace.json");
  }
  read(): Workspace {
    const empty: Workspace = {
      version: 1,
      tasks: [],
      pages: [],
      selectedTaskId: null,
    };
    if (!existsSync(this.path)) return empty;
    try {
      const value = JSON.parse(readFileSync(this.path, "utf8"));
      const string = (text: unknown, max: number) =>
        typeof text === "string" && text.length <= max;
      if (
        value.version !== 1 ||
        !Array.isArray(value.tasks) ||
        !Array.isArray(value.pages) ||
        value.tasks.length > 10000 ||
        value.pages.length > 100000
      )
        throw new Error("Unsupported workspace format.");
      if (
        !value.tasks.every(
          (task: Workspace["tasks"][number]) =>
            task &&
            string(task.id, 100) &&
            string(task.title, 120) &&
            string(task.note, 500) &&
            ["Active", "Later", "Settled"].includes(task.lifecycle),
        )
      )
        throw new Error("Invalid task data.");
      if (
        !value.pages.every((page: Workspace["pages"][number]) => {
          if (
            !page ||
            !string(page.id, 100) ||
            !string(page.title, 1000) ||
            !string(page.url, 8192) ||
            !value.tasks.some(
              (task: Workspace["tasks"][number]) => task.id === page.taskId,
            )
          )
            return false;
          if (!page.url) return true;
          const url = new URL(page.url);
          return (
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          );
        })
      )
        throw new Error("Invalid page data.");
      if (
        new Set(value.tasks.map((task: Workspace["tasks"][number]) => task.id))
          .size !== value.tasks.length ||
        new Set(value.pages.map((page: Workspace["pages"][number]) => page.id))
          .size !== value.pages.length
      )
        throw new Error("Duplicate identifiers.");
      for (const task of value.tasks)
        if (
          !value.pages.some(
            (page: Workspace["pages"][number]) =>
              page.id === task.selectedPageId && page.taskId === task.id,
          )
        )
          task.selectedPageId = null;
      if (
        !value.tasks.some(
          (task: Workspace["tasks"][number]) =>
            task.id === value.selectedTaskId,
        )
      )
        value.selectedTaskId = value.tasks[0]?.id ?? null;
      return value;
    } catch (error) {
      // Preserve the unreadable original before allowing any fresh workspace writes.
      try {
        const backup = `${this.path}.recovery-${Date.now()}`;
        renameSync(this.path, backup);
        this.error = `Previous workspace could not be read. It was preserved at ${backup}.`;
      } catch {
        this.writable = false;
        this.error =
          "Workspace could not be read or backed up. Changes cannot be saved in this session.";
      }
      return empty;
    }
  }
  save(workspace: Workspace) {
    if (!this.writable) return false;
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(this.path + ".tmp", JSON.stringify(workspace, null, 2), {
        mode: 0o600,
      });
      renameSync(this.path + ".tmp", this.path);
      if (this.error.startsWith("Could not save")) this.error = "";
      return true;
    } catch {
      this.error =
        "Could not save task changes. Check disk space and profile permissions before quitting.";
      return false;
    }
  }
}
