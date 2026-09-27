import type { PageRecord, PageSelectionMode, Workspace } from "./contracts.js";

/** Transient tab selection. The task's selectedPageId remains the visible page. */
export class PageSelection {
  private taskId: string | null = null;
  private activeId: string | null = null;
  private anchorId: string | null = null;
  private ids = new Set<string>();

  selected(workspace: Workspace): string[] {
    const task = workspace.tasks.find(task => task.id === workspace.selectedTaskId);
    const activeId = task?.selectedPageId ?? null;
    if (this.taskId !== (task?.id ?? null) || this.activeId !== activeId) {
      this.taskId = task?.id ?? null;
      this.activeId = activeId;
      this.anchorId = activeId;
      this.ids = new Set(activeId ? [activeId] : []);
    }
    const pages = workspace.pages.filter(page => page.taskId === this.taskId);
    const selected = pages.filter(page => this.ids.has(page.id)).map(page => page.id);
    this.ids = new Set(selected);
    if (!pages.some(page => page.id === this.anchorId)) this.anchorId = activeId;
    return selected;
  }

  select(workspace: Workspace, page: PageRecord, mode?: PageSelectionMode) {
    this.selected(workspace);
    const task = workspace.tasks.find(task => task.id === page.taskId)!;
    const pages = workspace.pages.filter(item => item.taskId === task.id);
    if (this.taskId !== task.id || !mode) {
      this.ids = new Set([page.id]);
      this.anchorId = page.id;
    } else if (mode === "toggle") {
      if (this.ids.has(page.id) && this.ids.size > 1) {
        this.ids.delete(page.id);
      } else {
        this.ids.add(page.id);
      }
      this.anchorId = page.id;
    } else {
      const anchor = pages.findIndex(item => item.id === this.anchorId);
      const end = pages.indexOf(page);
      const start = anchor < 0 ? end : anchor;
      const range = pages.slice(Math.min(start, end), Math.max(start, end) + 1);
      this.ids = new Set([
        ...(mode === "addRange" ? this.ids : []),
        ...range.map(item => item.id),
      ]);
    }
    workspace.selectedTaskId = task.id;
    // Removing the visible tab from a group reveals another selected tab.
    task.selectedPageId = this.ids.has(page.id)
      ? page.id
      : this.ids.has(task.selectedPageId ?? "")
        ? task.selectedPageId
        : pages.find(item => this.ids.has(item.id))?.id ?? page.id;
    this.taskId = task.id;
    this.activeId = task.selectedPageId;
  }

  replace(workspace: Workspace, pages: PageRecord[]) {
    this.selected(workspace);
    this.ids = new Set(pages.map(page => page.id));
    this.anchorId = this.activeId;
  }
}
