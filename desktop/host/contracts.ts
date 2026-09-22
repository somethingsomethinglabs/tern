export type Lifecycle = "Active" | "Later" | "Settled";
export type Preferences = {
  searchEngine: "duckduckgo" | "google" | "bing" | "brave";
  autoHideToolbar: boolean;
  sidebarCollapsed: boolean;
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
};
export type PageRecord = {
  id: string;
  taskId: string;
  title: string;
  url: string;
};
export type PageState = PageRecord & {
  live: boolean;
  loading: boolean;
  error: string;
  canGoBack: boolean;
  canGoForward: boolean;
};
export type Workspace = {
  version: 1;
  tasks: Task[];
  pages: PageRecord[];
  selectedTaskId: string | null;
};
export type Snapshot = Omit<Workspace, "pages"> & {
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
  | { type: "createTask"; title: string }
  | { type: "selectTask"; id: string }
  | { type: "renameTask"; id: string; title: string }
  | { type: "moveTask"; id: string; lifecycle: Lifecycle }
  | { type: "saveNote"; id: string; note: string }
  | {
      type: "setPreferences";
      patch: Partial<Omit<Preferences, "downloadDirectory">>;
    }
  | { type: "chooseDownloadDirectory" | "clearCache" | "importExtension" }
  | { type: "downloadExtension"; source: string }
  | { type: "loadExtension" }
  | { type: "removeExtension"; path: string }
  | { type: "openExtension"; id: string }
  | { type: "selectPage"; id: string }
  | { type: "navigate"; address: string }
  | { type: "newPage" }
  | {
      type:
        | "back"
        | "forward"
        | "reload"
        | "stop"
        | "closePage"
        | "reopen"
        | "dismissNotice";
    }
  | { type: "pause"; note: string }
  | { type: "resume" | "settle" }
  | { type: "find"; text: string; backward?: boolean }
  | { type: "stopFind" };
export type PageBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};
export type Bridge = {
  snapshot(): Promise<Snapshot>;
  command(command: Command): Promise<void>;
  layout(bounds: PageBounds): void;
  subscribe(listener: (state: Snapshot) => void): () => void;
  shortcuts(listener: (shortcut: string) => void): () => void;
};
