import { mountApp } from "@tern/app";
import type {
  Bridge,
  Command,
  Snapshot,
  PageBounds,
} from "@tern/core/contracts";

const initial: Snapshot = {
  version: 1,
  selectedTaskId: "a",
  selectedPageIds: ["page-a"],
  overviewOpen: false,
  tasks: [
    {
      id: "a",
      title: "Alpha",
      lifecycle: "Active",
      note: "Saved A",
      goal: "Goal A",
      selectedPageId: "page-a",
    },
    {
      id: "b",
      title: "Beta",
      lifecycle: "Active",
      note: "Saved B",
      goal: "Goal B",
      selectedPageId: null,
    },
  ],
  pages: [
    {
      id: "page-a",
      taskId: "a",
      title: "Example",
      url: "https://example.test/",
      live: false,
      loading: false,
      error: "",
      canGoBack: false,
      canGoForward: false,
    },
  ],
  summaries: {},
  pendingSummaryTaskIds: [],
  summaryStatus: "",
  taskContext: null,
  contextStatus: "",
  contextPending: false,
  taskStartPending: false,
  taskStartStatus: "",
  preferences: {
    searchEngine: "duckduckgo",
    autoHideToolbar: true,
    sidebarCollapsed: false,
    showSnapshotTool: true,
    preloadLinks: true,
    summaryModel: "",
    defaultZoom: 1,
    askDownloadLocation: false,
    downloadDirectory: "/tmp",
  },
  theme: {
    name: "Test",
    background: "#171c19",
    foreground: "#ecebe4",
    accent: "#9bc399",
  },
  extensions: [],
  downloads: [],
  notice: "",
  storageError: "",
};
let state = structuredClone(initial);
const listeners = new Set<(state: Snapshot) => void>();
const shortcuts = new Set<(key: string) => void>();
const reads: Array<(state: Snapshot) => void> = [];
const requests: Array<{ resolve: () => void; reject: (error: Error) => void }> =
  [];
const commands: Command[] = [];
const layouts: PageBounds[] = [];
let deferred = false;
let stop: ReturnType<typeof mountApp> | undefined;
const bridge: Bridge = {
  snapshot: () => new Promise((resolve) => reads.push(resolve)),
  subscribe: (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  shortcuts: (listener) => {
    shortcuts.add(listener);
    return () => {
      shortcuts.delete(listener);
    };
  },
  command: (command) => {
    commands.push(structuredClone(command));
    if (deferred)
      return new Promise<void>((resolve, reject) =>
        requests.push({ resolve, reject }),
      );
    return Promise.resolve();
  },
  layout: (bounds) => layouts.push(structuredClone(bounds)),
};
const api = {
  publish(patch: Partial<Snapshot> = {}) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(structuredClone(state));
  },
  initial(index = 0) {
    reads[index](structuredClone(initial));
  },
  mount() {
    stop = mountApp(document.getElementById("root")!, bridge);
  },
  async unmount() {
    await stop?.();
  },
  defer() {
    deferred = true;
  },
  settle(index: number, success = true) {
    if (success) requests[index].resolve();
    else requests[index].reject(new Error("Save failed"));
  },
  shortcut(key: string) {
    for (const listener of shortcuts) listener(key);
  },
  get state() {
    return structuredClone(state);
  },
  get commands() {
    return commands;
  },
  get layouts() {
    return layouts;
  },
  counts() {
    return { snapshots: listeners.size, shortcuts: shortcuts.size };
  },
};
Object.assign(window, { testUI: api });
api.mount();
