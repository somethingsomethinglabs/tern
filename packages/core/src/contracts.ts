export type Lifecycle = "Active" | "Later" | "Settled";
export type Preferences = {
  searchEngine: "duckduckgo" | "google" | "bing" | "brave";
  searchView?: "reading-list" | "external";
  searxngURL?: string;
  searchProviders?: ("duckduckgo" | "bing")[];
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
  keptLinks?: { title: string; url: string }[];
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
  search?: SearchDefinition;
  sourceSearchId?: string;
};
export type SearchFilter = "All" | "Docs" | "Articles" | "Applications" | "Videos";
export type SearchDefinition = {
  query: string;
  endpoint: string;
  filter: SearchFilter;
  hiddenDomains: string[];
  page: number;
};
export type SearchResult = {
  url: string;
  title: string;
  excerpt: string;
  domain: string;
  kind: SearchFilter;
  engines: string[];
};
export type SearchResponse = { results: SearchResult[]; warnings: string[]; hasNext: boolean };
export type SearchState = SearchResponse & { loading: boolean; error: string; opened: string[] };
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
  siteInfo?: { origin: string; secure: boolean; files: number;
    permissions: { name: string; label: string; state: "ask" | "blocked" | "allowed" }[] };
  updates?: { configured: boolean; busy: boolean; status: string; version: string };
  security?: { cookieStorage: "encrypted" | "session" | "development"; detail: string };
  blockedPopups?: { id: string; url: string }[];
  searches?: Record<string, SearchState>;
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
  downloads: { id: string; name: string; status: string; canCancel?: boolean; canResume?: boolean; receivedBytes?: number; totalBytes?: number; saved?: boolean }[];
};
export type Command =
  | { type: "setSitePermission"; origin: string; permission: string; policy: "ask" | "block" }
  | { type: "resetSitePermissions"; origin: string }
  | { type: "openBlockedPopup"; id: string }
  | { type: "checkForUpdates" | "installUpdate" }
  | { type: "printPage" | "savePDF" | "savePage" }
  | { type: "downloadAction"; id: string; action: "cancel" | "resume" | "showFolder" }
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
  | { type: "searchPage"; id: string; query: string; first?: boolean }
  | { type: "refineSearch"; id: string; filter?: SearchFilter; hiddenDomains?: string[]; page?: number }
  | { type: "openSearchResult"; id: string; url?: string; first?: boolean; background?: boolean }
  | { type: "keepSearchResult"; id: string; url: string }
  | { type: "openKeptLink" | "removeKeptLink"; taskId: string; url: string }
  | { type: "returnToSearch"; id: string }
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
  | { type: "stopFind" | "takeSnapshot" | "clearSiteCookies" };
export type PageBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};
export type Bridge = {
  cookies?: (request: CookieRequest) => Promise<BrowserCookie[]>;
  snapshot(): Promise<Snapshot>;
  command(command: Command): Promise<void | { createdTaskId: string }>;
  layout(bounds: PageBounds): void;
  subscribe(listener: (state: Snapshot) => void): () => void;
  shortcuts(listener: (shortcut: string) => void): () => void;
};

export type CookieDraft = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: "unspecified" | "None" | "Lax" | "Strict";
  expires: number | null;
};
export type BrowserCookie = CookieDraft & {
  id: string;
  size: number;
  partitionSite?: string;
  readOnly: boolean;
};
export type CookieRequest =
  | { type: "list" }
  | { type: "save"; cookie: CookieDraft; id?: string }
  | { type: "delete"; id: string }
  | { type: "deleteDomain"; domain: string }
  | { type: "deleteAll" };
