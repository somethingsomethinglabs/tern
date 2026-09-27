export type Lifecycle = "Active" | "Later" | "Settled";
export type Preferences = {
  searchEngine: "duckduckgo" | "google" | "bing" | "brave";
  autoHideToolbar: boolean;
  sidebarCollapsed: boolean;
  showSnapshotTool: boolean;
  preloadLinks: boolean;
  summaryModel: string;
  defaultZoom: number;
  askDownloadLocation: boolean;
  downloadDirectory: string;
};
export type Task = {
  id: string;
  title: string;
  lifecycle: Lifecycle;
  note: string;
  selectedPageId: string | null;
  lastOpenedAt?: number;
  goal?: string;
  request?: string;
  findings?: Finding[];
};
export type Finding = {
  id: string;
  text: string;
  createdAt: number;
  source?: { title: string; url: string };
};
export type TaskContext = { goal: string; searches: string[] };
export type TaskPlan = { title: string; goal: string; searches: string[] };
export type PageRecord = {
  id: string;
  taskId: string;
  title: string;
  url: string;
  lastViewedAt?: number;
};
export type PageState = PageRecord & {
  live: boolean;
  loading: boolean;
  error: string;
  canGoBack: boolean;
  canGoForward: boolean;
};
export type PageSelectionMode = "toggle" | "range" | "addRange";
export type Workspace = {
  version: 1;
  tasks: Task[];
  pages: PageRecord[];
  selectedTaskId: string | null;
};
export type Snapshot = Omit<Workspace, "pages"> & {
  capabilities?: {
    mobile?: boolean;
    extensions?: boolean;
    localAI?: boolean;
    snapshots?: boolean;
    preloadLinks?: boolean;
    downloadDirectory?: boolean;
    firstSearchResult?: boolean;
  };
  selectedPageIds: string[];
  overviewOpen: boolean;
  summaries: Record<
    string,
    { text: string; source: "local-model"; model: string }
  >;
  summaryStatus: string;
  pendingSummaryTaskIds: string[];
  taskContext: TaskContext | null;
  contextStatus: string;
  contextPending: boolean;
  taskStartStatus: string;
  taskStartPending: boolean;
  preferences: Preferences;
  theme: {
    name: string;
    background: string;
    foreground: string;
    accent: string;
  };
  extensions: {
    id: string;
    name: string;
    version: string;
    path: string;
    error: string;
    canOpen?: boolean;
  }[];
  pages: PageState[];
  notice: string;
  storageError: string;
  downloads: { id: string; name: string; status: string }[];
};
export type Command =
  | { type: "showOverview" }
  | { type: "openTask"; id: string }
  | { type: "createTask"; title: string }
  | { type: "startTask"; request: string; useAI: boolean; title?: string }
  | { type: "cancelTaskStart" }
  | { type: "selectTask"; id: string }
  | { type: "renameTask"; id: string; title: string }
  | { type: "moveTask"; id: string; lifecycle: Lifecycle }
  | { type: "saveNote"; id: string; note: string }
  | { type: "saveGoal"; id: string; goal: string }
  | { type: "addFinding"; id: string; text: string }
  | { type: "editFinding"; id: string; findingId: string; text: string }
  | { type: "removeFinding"; id: string; findingId: string }
  | { type: "openFindingSource"; id: string; findingId: string }
  | { type: "suggestTaskContext"; id: string }
  | { type: "cancelTaskContext" }
  | { type: "searchTask"; id: string; query: string }
  | {
      type: "setPreferences";
      patch: Partial<Omit<Preferences, "downloadDirectory">>;
    }
  | { type: "chooseDownloadDirectory" | "clearCache" | "importExtension" }
  | { type: "downloadExtension"; source: string }
  | { type: "loadExtension" }
  | { type: "removeExtension"; path: string }
  | { type: "openExtension"; id: string }
  | { type: "selectPage"; id: string; selection?: PageSelectionMode }
  | { type: "pageSelectionAction"; action: "close" | "reload" | "duplicate" | "copyAddresses"; ids: string[] }
  | { type: "navigate"; address: string }
  | { type: "newPage"; taskId?: string }
  | { type: "closePage" | "reload" | "reopen"; id?: string }
  | { type: "duplicatePage" | "copyPageAddress"; id: string }
  | {
      type: "back" | "forward" | "stop" | "dismissNotice";
    }
  | { type: "pause"; note: string; id?: string }
  | { type: "resume" | "settle"; id?: string }
  | { type: "find"; text: string; backward?: boolean }
  | { type: "stopFind" | "takeSnapshot" };
export type PageBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};
export type Bridge = {
  snapshot(): Promise<Snapshot>;
  command(command: Command): Promise<void | { createdTaskId: string }>;
  layout(bounds: PageBounds): void;
  subscribe(listener: (state: Snapshot) => void): () => void;
  shortcuts(listener: (shortcut: string) => void): () => void;
};
