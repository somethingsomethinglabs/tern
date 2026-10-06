import type { Bridge, Command, PageBounds, PageRecord, PageState, Preferences, Snapshot, Workspace } from "./contracts.js";
import { WorkspaceModel, checkedText } from "./workspace-model.js";
import { emptyWorkspace, parseWorkspace } from "./workspace.js";
import { PageSelection } from "./page-selection.js";
import { addressURL, isWebURL, searchURL } from "./navigation.js";
import { basicTaskPlan, plannedWorkspace } from "./task-plan.js";
import { SearchController, createSearxngTransport, DEFAULT_SEARXNG_URL, externalShortcut, type SearchTransport } from "./search.js";
import { validatePreferences } from "./preferences.js";

export type BrowserEvent =
  | { type: "page"; id: string; url: string; title: string; live: boolean; loading: boolean; error: string; canGoBack: boolean; canGoForward: boolean }
  | { type: "popup"; openerId: string; url: string }
  | { type: "shortcut"; key: string }
  | { type: "notice"; message: string }
  | { type: "download"; id: string; name: string; status: string };
export interface Platform {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  open(page: PageRecord): Promise<void>;
  activate(id: string | null): Promise<void>;
  navigate(id: string, url: string): Promise<void>;
  close(id: string): Promise<void>;
  action(id: string, action: string, options?: { text?: string; backward?: boolean }): Promise<void>;
  layout(bounds: PageBounds): void;
  clearCache(): Promise<void>;
  clipboard(text: string): Promise<void>;
  confirm(message: string): Promise<boolean>;
  exit(): Promise<void>;
  setZoom(zoom: number): Promise<void>;
  listen(callback: (event: BrowserEvent) => void): Promise<() => void>;
  id(): string;
  now(): number;
}

export type ApplicationOptions = {
  capabilities?: Snapshot["capabilities"];
  maxLivePages?: number;
  searchTransport?: SearchTransport;
};

// One state owner; adapters expose native operations, never task mutations.
export class BrowserApplication implements Bridge {
  private workspace: Workspace = emptyWorkspace();
  private model: WorkspaceModel;
  private selection = new PageSelection();
  private searches: SearchController;
  private pages = new Map<string, Partial<PageState>>();
  private listeners = new Set<(state: Snapshot) => void>();
  private shortcutListeners = new Set<(key: string) => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private overview = true;
  private storageError = "";
  private writable = true;
  private notice = "";
  private downloads: Snapshot["downloads"] = [];
  private preferences: Preferences = {
    searchEngine: "duckduckgo", searchView: "reading-list", searxngURL: DEFAULT_SEARXNG_URL, autoHideToolbar: false, sidebarCollapsed: false,
    showSnapshotTool: false, preloadLinks: false, summaryModel: "", defaultZoom: 1,
    askDownloadLocation: false, downloadDirectory: "/Download",
  };
  private constructor(private platform: Platform, private options: ApplicationOptions) { this.model = new WorkspaceModel(this.workspace, platform);
    this.searches = new SearchController(this.model, options.searchTransport ?? createSearxngTransport(), () => {
      void this.enqueue(async () => { await this.save().catch(() => {}); await this.activate(); this.publish(); });
    }, page => this.openPage(page), () => !this.overview);
  }

  static async open(platform: Platform, options: ApplicationOptions = {}) {
    const app = new BrowserApplication(platform, options);
    try {
      const raw = await platform.read();
      if (raw) {
        const value = JSON.parse(raw);
        if (value.version !== 1) throw new Error("Unsupported saved format");
        Object.assign(app.workspace, parseWorkspace(JSON.stringify(value.workspace)));
        app.preferences = validatePreferences(app.preferences, value.preferences);
        // These capabilities are unavailable in the first Android host.
        Object.assign(app.preferences, { summaryModel: "", preloadLinks: false, showSnapshotTool: false, autoHideToolbar: false });
      }
    } catch {
      app.writable = false;
      app.storageError = "Saved data could not be read. It has been preserved; changes cannot be saved. Restart Tern to retry.";
    }
    if (options.capabilities?.mobile) {
      app.preferences.searchView = "external";
      // Convert lists saved by the earlier Android prototype into normal pages.
      for (const page of app.workspace.pages) {
        if (page.search) { page.url = searchURL(page.search.query, app.preferences.searchEngine); delete page.search; }
        delete page.sourceSearchId;
      }
    }
    await platform.setZoom(app.preferences.defaultZoom);
    await platform.listen(event => {
      if (event.type === "shortcut") { for (const listener of app.shortcutListeners) listener(event.key); return; }
      void app.enqueue(() => app.event(event)).catch(() => app.publish());
    });
    return app;
  }
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work);
    this.queue = next.catch(() => {});
    return next;
  }
  private state(): Snapshot {
    return structuredClone({ ...this.workspace,
      capabilities: this.options.capabilities, searches: this.searches.snapshot(),
      selectedPageIds: this.selection.selected(this.workspace), overviewOpen: this.overview,
      pages: this.workspace.pages.map(page => ({ ...page, live: false, loading: false, error: "", canGoForward: false, ...this.pages.get(page.id), ...(page.search ? { loading: !!this.searches.state(page.id)?.loading } : {}), canGoBack: !!this.pages.get(page.id)?.canGoBack || !!page.sourceSearchId && !!this.model.page(page.sourceSearchId)?.search })),
      preferences: this.preferences, theme: { name: "Tern", background: "#181b1e", foreground: "#e0e4e7", accent: "#a4c4b5" },
      summaries: {}, summaryStatus: "", pendingSummaryTaskIds: [], taskContext: null, contextStatus: "", contextPending: false,
      taskStartStatus: "", taskStartPending: false, extensions: [], downloads: this.downloads, notice: this.notice, storageError: this.storageError,
    });
  }
  snapshot = async () => this.state();
  subscribe = (listener: (state: Snapshot) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  shortcuts = (listener: (key: string) => void) => { this.shortcutListeners.add(listener); return () => { this.shortcutListeners.delete(listener); }; };
  layout = (bounds: PageBounds) => this.platform.layout(bounds);
  private publish() { const state = this.state(); for (const listener of this.listeners) listener(state); }
  private async save(workspace = this.workspace) {
    if (!this.writable) throw new Error(this.storageError);
    try {
      await this.platform.write(JSON.stringify({ version: 1, workspace, preferences: this.preferences }));
      this.storageError = "";
    } catch (error) {
      this.storageError = "Could not save changes. Check available device storage and retry before closing Tern.";
      throw error;
    }
  }
  private async activate() {
    const id = this.model.page()?.id;
    await this.platform.activate(!this.overview && id && this.pages.get(id)?.live ? id : null);
  }
  private async openPage(page: PageRecord) {
    if (page.search) { this.searches.ensure(page); return; }
    if (!page.url) return;
    if (this.pages.get(page.id)?.live) {
      if (this.pages.get(page.id)?.error) {
        await this.platform.navigate(page.id, page.url);
        this.pages.set(page.id, { live: true, loading: true, error: "" });
      }
      return;
    }
    if (!isWebURL(page.url)) throw new Error("Only HTTP and HTTPS addresses can be opened.");
    if ([...this.pages.values()].filter(page => page.live).length >= (this.options.maxLivePages ?? 16))
      throw new Error(`Close a tab before opening another. This build keeps up to ${this.options.maxLivePages ?? 16} live tabs.`);
    await this.platform.open(page);
    this.pages.set(page.id, { live: true, loading: true, error: "" });
  }
  private async release(id: string) { await this.platform.close(id); this.pages.delete(id); }
  private requirePage(id?: string) { const page = this.model.page(id); if (!page) throw new Error("Page not found."); return page; }
  private requireTask(id?: string) { const task = this.model.task(id); if (!task) throw new Error("Create a task first."); return task; }

  command = (command: Command) => this.enqueue(async () => {
    try { return await this.dispatch(command); }
    finally { this.publish(); }
  });
  private async dispatch(value: Command): Promise<void | { createdTaskId: string }> {
    let createdTaskId: string | undefined;
    const searchHandled = await this.searches.command(value, this.preferences);
    if (searchHandled) this.overview = false;
    const effects = searchHandled ? null : this.model.command(value);
    if (searchHandled) { /* Shared search commands have already changed the workspace. */ }
    else if (effects) {
      if (effects.releaseTaskPages)
        for (const page of this.workspace.pages.filter(page => page.taskId === effects.releaseTaskPages)) await this.release(page.id);
      if (value.type === "createTask") this.overview = false;
    } else switch (value.type) {
      case "showOverview": this.overview = true; break;
      case "openTask":
      case "selectTask": {
        const task = this.model.selectTask(value.id, value.type === "openTask");
        this.overview = false;
        if (value.type === "openTask") {
          const pages = this.workspace.pages.filter(page => page.taskId === task.id);
          pages.sort((a, b) => Number(b.id === task.selectedPageId) - Number(a.id === task.selectedPageId));
          // Reopen on demand on phones; background references stay available.
          const selected = pages.find(page => page.id === task.selectedPageId);
          if (selected) await this.openPage(selected);
          this.model.command({ type: "resume", id: task.id });
        }
        break;
      }
      case "selectPage": {
        const page = this.requirePage(value.id);
        this.selection.select(this.workspace, page, value.selection);
        this.overview = false;
        await this.openPage(this.requirePage());
        break;
      }
      case "startTask": {
        if (value.useAI) throw new Error("Local AI is not available in this build.");
        const request = checkedText(value.request, 1000).trim();
        if (!request) throw new Error("Describe what you need to do.");
        const next = plannedWorkspace(this.workspace, basicTaskPlan(request), request, this.preferences.searchEngine, this.platform.id, value.title, this.preferences.searchView !== "external" ? this.preferences.searxngURL ?? DEFAULT_SEARXNG_URL : undefined);
        await this.save(next);
        Object.assign(this.workspace, next);
        createdTaskId = next.selectedTaskId!;
        this.overview = false;
        await this.openPage(this.requirePage());
        break;
      }
      case "newPage": {
        const task = this.requireTask(value.taskId);
        this.model.selectTask(task.id);
        this.model.newPage(task.id);
        this.overview = false;
        break;
      }
      case "navigate": {
        if (this.searches.fromAddress(value.address, this.preferences)) { this.overview = false; break; }
        const url = externalShortcut(value.address) ?? addressURL(checkedText(value.address, 8192), this.preferences.searchEngine);
        const task = this.requireTask();
        const page = !this.model.page() || this.model.page()?.search ? this.model.newPage(task.id) : this.model.page()!;
        page.url = url;
        this.overview = false;
        if (this.pages.get(page.id)?.live) await this.platform.navigate(page.id, url);
        else await this.openPage(page);
        break;
      }
      case "reopen": if (this.requirePage(value.id).search) this.searches.refresh(this.requirePage(value.id), this.preferences); else await this.openPage(this.requirePage(value.id)); this.overview = false; break;
      case "closePage": await this.closePages([this.requirePage(value.id)]); break;
      case "reload": {
        const page = this.requirePage(value.id);
        if (page.search) { this.searches.refresh(page, this.preferences); break; }
        if (await this.platform.confirm("Reload this page? Unsaved website changes may be lost.")) {
          if (this.pages.get(page.id)?.live) await this.platform.action(page.id, "reload");
          else await this.openPage(page);
        }
        break;
      }
      case "duplicatePage": {
        const page = this.requirePage(value.id);
        this.model.selectTask(page.taskId);
        const copy = this.model.newPage(page.taskId, page.url);
        if (page.search) { copy.search = structuredClone(page.search); copy.title = page.title; }
        await this.openPage(copy);
        this.overview = false;
        break;
      }
      case "copyPageAddress": await this.platform.clipboard(this.requirePage(value.id).url); break;
      case "pageSelectionAction": {
        const pages = value.ids.map(id => this.requirePage(id));
        if (!pages.length || pages.some(page => page.taskId !== this.workspace.selectedTaskId)) throw new Error("Select tabs from the current task.");
        if (value.action === "close") await this.closePages(pages);
        else if (value.action === "copyAddresses") await this.platform.clipboard(pages.map(page => page.url).join("\n"));
        else if (value.action === "duplicate") {
          const copies = pages.map(page => {
            const copy = this.model.newPage(page.taskId, page.url);
            if (page.search) { copy.search = structuredClone(page.search); copy.title = page.title; }
            return copy;
          });
          this.selection.replace(this.workspace, copies);
          for (const page of copies) await this.openPage(page);
        } else if (value.action === "reload" && await this.platform.confirm("Reload selected tabs? Unsaved changes may be lost."))
          for (const page of pages) { if (page.search) this.searches.refresh(page, this.preferences); else if (this.pages.get(page.id)?.live) await this.platform.action(page.id, "reload"); else await this.openPage(page); }
        break;
      }
      case "searchTask":
      case "openFindingSource": {
        const task = this.requireTask(value.id);
        if (value.type === "searchTask" && this.preferences.searchView !== "external") {
          this.searches.create(task.id, checkedText(value.query, 160), this.preferences);
          this.overview = false; break;
        }
        const url = value.type === "searchTask" ? searchURL(checkedText(value.query, 160), this.preferences.searchEngine)
          : task.findings?.find(finding => finding.id === value.findingId)?.source?.url;
        if (!url || !isWebURL(url)) throw new Error("Source unavailable.");
        this.model.selectTask(task.id);
        await this.openPage(this.model.newPage(task.id, url));
        this.overview = false;
        break;
      }
      case "back": {
        if (this.overview) { await this.platform.exit(); return; }
        const page = this.model.page();
        if (page && this.pages.get(page.id)?.canGoBack) await this.platform.action(page.id, "back");
        else if (page?.sourceSearchId) await this.searches.command({ type: "returnToSearch", id: page.sourceSearchId }, this.preferences);
        else this.overview = true;
        break;
      }
      case "forward": case "stop": case "find": case "stopFind": {
        const page = this.model.page();
        if (page?.search) { if (value.type === "stop") this.searches.stop(page.id); break; }
        if (page) await this.platform.action(page.id, value.type, value.type === "find" ? { text: value.text, backward: value.backward } : {});
        break;
      }
      case "setPreferences": {
        const next = validatePreferences(this.preferences, value.patch);
        if (this.options.capabilities?.mobile) next.searchView = "external";
        if (next.summaryModel || next.preloadLinks || next.showSnapshotTool) throw new Error("This feature is not available in this build.");
        this.preferences = next;
        await this.platform.setZoom(next.defaultZoom);
        break;
      }
      case "clearCache": await this.platform.clearCache(); this.notice = "Website cache cleared. Cookies and tasks were kept."; break;
      case "dismissNotice": this.notice = ""; break;
      case "cancelTaskStart": case "cancelTaskContext": break;
      default: throw new Error("This feature is not available in this build.");
    }
    this.searches.prune();
    const selected = this.model.page(); if (selected?.search && !this.overview) this.searches.ensure(selected);
    if (!this.overview) this.model.recordActivity();
    await this.save();
    await this.activate();
    if (createdTaskId) return { createdTaskId };
  }
  private async closePages(pages: PageRecord[]) {
    if (pages.some(page => this.pages.get(page.id)?.live) &&
      !await this.platform.confirm("Close these tabs? Unsaved website changes may be lost.")) return;
    for (const page of pages) { await this.release(page.id); this.model.removePage(page.id); }
  }
  private async event(event: BrowserEvent) {
    if (event.type === "page") {
      const page = this.model.page(event.id);
      if (!page) return;
      if (isWebURL(event.url)) page.url = event.url;
      if (event.title) page.title = event.title.slice(0, 1000);
      this.pages.set(page.id, { live: event.live, loading: event.loading, error: event.error,
        canGoBack: event.canGoBack, canGoForward: event.canGoForward });
      await this.save().catch(() => {});
    } else if (event.type === "popup") {
      const owner = this.model.page(event.openerId);
      if (owner && isWebURL(event.url)) {
        const page = this.model.newPage(owner.taskId, event.url);
        this.model.selectTask(owner.taskId);
        this.overview = false;
        await this.openPage(page);
        await this.save();
        await this.activate();
      }
    } else if (event.type === "notice") this.notice = event.message;
    else if (event.type === "download") {
      const download = this.downloads.find(item => item.id === event.id);
      if (download) Object.assign(download, event);
      else this.downloads.push({ id: event.id, name: event.name, status: event.status });
    }
    this.publish();
  }
}
