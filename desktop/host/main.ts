import {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  protocol,
  net,
  ipcMain,
  dialog,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
  type Session,
} from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  Command,
  PageBounds,
  PageRecord,
  Snapshot,
  Workspace,
} from "./contracts.js";
import { WorkspaceFile } from "./workspace-file.js";

app.setName("Trailrest");
if (process.env.TRAILREST_PROFILE)
  app.setPath("userData", resolve(process.env.TRAILREST_PROFILE));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "trailrest",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.enableSandbox();
const directory = dirname(fileURLToPath(import.meta.url));
const storage = new WorkspaceFile(app.getPath("userData"));
const workspace: Workspace = {
  version: 1,
  tasks: [],
  pages: [],
  selectedTaskId: null,
};
const views = new Map<string, WebContentsView>();
const errors = new Map<string, string>();
let window: BrowserWindow;
let guests: Session;
let notice = "";
let quitting = false;
const downloads: Snapshot["downloads"] = [];
let pageBounds: PageBounds = {
  x: 280,
  y: 140,
  width: 800,
  height: 600,
  visible: false,
};

function selectedTask() {
  return workspace.tasks.find((task) => task.id === workspace.selectedTaskId);
}
function selectedPage() {
  return workspace.pages.find(
    (page) => page.id === selectedTask()?.selectedPageId,
  );
}
function currentContents() {
  const id = selectedPage()?.id;
  return id ? views.get(id)?.webContents : undefined;
}
function snapshot(): Snapshot {
  return {
    ...workspace,
    notice,
    storageError: storage.error,
    downloads,
    pages: workspace.pages.map((page) => {
      const contents = views.get(page.id)?.webContents;
      return {
        ...page,
        live: !!contents,
        loading: contents?.isLoading() ?? false,
        error: errors.get(page.id) ?? "",
        canGoBack: contents?.navigationHistory.canGoBack() ?? false,
        canGoForward: contents?.navigationHistory.canGoForward() ?? false,
      };
    }),
  };
}
function publish() {
  if (window && !window.isDestroyed())
    window.webContents.send("workspace:changed", snapshot());
}
function layout() {
  if (!window || window.isDestroyed()) return;
  const [width, height] = window.getContentSize();
  for (const [id, view] of views) {
    const visible =
      id === selectedPage()?.id && pageBounds.visible && !errors.has(id);
    view.setVisible(visible);
    if (visible)
      view.setBounds({
        x: Math.min(width, Math.max(0, pageBounds.x)),
        y: Math.min(height, Math.max(0, pageBounds.y)),
        width: Math.max(0, Math.min(pageBounds.width, width - pageBounds.x)),
        height: Math.max(0, Math.min(pageBounds.height, height - pageBounds.y)),
      });
  }
}
function isWebURL(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
function addressURL(address: string) {
  const value = address.trim();
  if (!value || value.length > 8192)
    throw new Error("Enter an address or search query.");
  if (isWebURL(value)) return new URL(value).href;
  if (
    /^[a-z][a-z\d+.-]*:/i.test(value) &&
    !/^(localhost|[\w.-]+\.\w+):\d+(\/|$)/i.test(value)
  )
    throw new Error("Only HTTP and HTTPS addresses can be opened.");
  if (!/\s/.test(value) && /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(value))
    return new URL("http://" + value).href;
  if (!/\s/.test(value) && value.includes(".")) {
    const url = "https://" + value;
    if (isWebURL(url)) return new URL(url).href;
  }
  return "https://duckduckgo.com/?q=" + encodeURIComponent(value);
}
function newPage(taskId: string, url = "") {
  const page: PageRecord = {
    id: randomUUID(),
    taskId,
    title: url ? "Loading…" : "New page",
    url,
  };
  workspace.pages.push(page);
  const task = workspace.tasks.find((task) => task.id === taskId)!;
  task.selectedPageId = page.id;
  return page;
}
function showPage(
  page: PageRecord,
  load = true,
  adopt?: WebContents,
): WebContents {
  if (views.has(page.id)) {
    layout();
    return views.get(page.id)!.webContents;
  }
  const view = new WebContentsView({
    ...(adopt ? { webContents: adopt } : {}),
    webPreferences: {
      session: guests,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  views.set(page.id, view);
  window.contentView.addChildView(view);
  const contents = view.webContents;
  const update = () => {
    if (contents.isDestroyed()) return;
    const url = contents.getURL();
    if (isWebURL(url)) page.url = url;
    const title = contents.getTitle();
    if (title) page.title = title.slice(0, 1000);
    storage.save(workspace);
    publish();
    layout();
  };
  contents.on("did-navigate", update);
  contents.on("did-navigate-in-page", update);
  contents.on("page-title-updated", update);
  contents.on("did-start-loading", () => {
    errors.delete(page.id);
    update();
  });
  contents.on("did-stop-loading", update);
  contents.on("did-fail-load", (_event, code, description, _url, main) => {
    if (main && code !== -3) {
      errors.set(page.id, description);
      publish();
      layout();
    }
  });
  contents.on("render-process-gone", () => {
    errors.set(
      page.id,
      "This page stopped unexpectedly. Reopen it to continue.",
    );
    publish();
    layout();
  });
  const navigation = (event: Electron.Event, url: string) => {
    if (!isWebURL(url)) {
      event.preventDefault();
      notice =
        "Blocked an unsupported address. Trailrest opens HTTP and HTTPS pages.";
      publish();
    }
  };
  contents.on("will-navigate", navigation);
  contents.on("will-redirect", navigation);
  contents.on("will-prevent-unload", (event) => {
    if (
      confirm(
        "Leave this page?",
        "The website reports unfinished changes. Leaving may discard them.",
        "Leave page",
      )
    )
      event.preventDefault();
  });
  contents.on("destroyed", () => {
    if (views.get(page.id) !== view) return;
    views.delete(page.id);
    window.contentView.removeChildView(view);
    workspace.pages = workspace.pages.filter((item) => item.id !== page.id);
    const task = workspace.tasks.find((task) => task.id === page.taskId);
    if (task?.selectedPageId === page.id)
      task.selectedPageId =
        workspace.pages.find((item) => item.taskId === task.id)?.id ?? null;
    storage.save(workspace);
    publish();
    layout();
  });
  contents.setWindowOpenHandler((details) => {
    if (!isWebURL(details.url) || views.size >= 100) {
      notice =
        "New window blocked. Only HTTP and HTTPS pages are supported, with up to 100 live pages.";
      publish();
      return { action: "deny" };
    }
    return {
      action: "allow",
      outlivesOpener: true,
      overrideBrowserWindowOptions: {
        webPreferences: {
          session: guests,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      },
      createWindow: (options) => {
        const popup = newPage(page.taskId, details.url);
        const adopted = (
          options as Electron.BrowserWindowConstructorOptions & {
            webContents?: WebContents;
          }
        ).webContents;
        const child = showPage(popup, false, adopted);
        // window.open supplies an existing Chromium child; ordinary target links do not.
        if (!adopted)
          void child
            .loadURL(details.url, {
              httpReferrer: details.referrer,
              postData: details.postBody?.data,
              extraHeaders: details.postBody
                ? `Content-Type: ${details.postBody.contentType}${details.postBody.boundary ? "; boundary=" + details.postBody.boundary : ""}`
                : undefined,
            })
            .catch(() => {});
        return child;
      },
    };
  });
  contents.on("before-input-event", keyboard);
  if (load && page.url) void contents.loadURL(page.url).catch(() => {});
  layout();
  publish();
  return contents;
}
function confirm(message: string, detail: string, action: string) {
  return (
    dialog.showMessageBoxSync(window, {
      type: "question",
      message,
      detail,
      buttons: ["Stay", action],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    }) === 1
  );
}
function keyboard(event: Electron.Event, input: Electron.Input) {
  if (input.type !== "keyDown") return;
  const key = input.key.toLowerCase();
  if (
    (input.control || input.meta) &&
    ["l", "t", "f", "w", "r"].includes(key)
  ) {
    event.preventDefault();
    if (key === "w" || key === "r")
      void command({ type: key === "w" ? "closePage" : "reload" }).catch(
        () => {},
      );
    else {
      window.webContents.focus();
      window.webContents.send("shell:shortcut", key);
    }
  } else if (input.alt && ["arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
    void command({ type: key === "arrowleft" ? "back" : "forward" }).catch(
      () => {},
    );
  } else if (key === "f5") {
    event.preventDefault();
    void command({ type: "reload" }).catch(() => {});
  }
}
async function command(raw: unknown) {
  if (
    !raw ||
    typeof raw !== "object" ||
    !("type" in raw) ||
    typeof raw.type !== "string"
  )
    throw new Error("Invalid command.");
  const value = raw as Command;
  const text = (input: unknown, max: number) => {
    if (typeof input !== "string" || input.length > max)
      throw new Error("Invalid text.");
    return input;
  };
  switch (value.type) {
    case "createTask": {
      const title = text(value.title, 120).trim();
      if (!title) throw new Error("Enter a task name.");
      const task = {
        id: randomUUID(),
        title,
        lifecycle: "Active" as const,
        note: "",
        selectedPageId: null,
      };
      workspace.tasks.push(task);
      workspace.selectedTaskId = task.id;
      break;
    }
    case "selectTask": {
      const task = workspace.tasks.find(
        (task) => task.id === text(value.id, 100),
      );
      if (!task) throw new Error("Task not found.");
      workspace.selectedTaskId = task.id;
      break;
    }
    case "selectPage": {
      const page = workspace.pages.find(
        (page) => page.id === text(value.id, 100),
      );
      if (!page) throw new Error("Page not found.");
      workspace.selectedTaskId = page.taskId;
      selectedTask()!.selectedPageId = page.id;
      break;
    }
    case "newPage":
      if (selectedTask()) newPage(selectedTask()!.id);
      break;
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
      const task = selectedTask();
      if (task) {
        task.note = text(value.note, 500);
        task.lifecycle = "Later";
      }
      break;
    }
    case "resume":
      if (selectedTask()) selectedTask()!.lifecycle = "Active";
      break;
    case "settle":
      if (selectedTask()) selectedTask()!.lifecycle = "Settled";
      break;
    case "reopen": {
      const page = selectedPage();
      if (page?.url) {
        if (errors.has(page.id)) {
          const view = views.get(page.id);
          views.delete(page.id);
          if (view) {
            window.contentView.removeChildView(view);
            view.webContents.close();
          }
          errors.delete(page.id);
        }
        showPage(page);
      }
      break;
    }
    case "navigate": {
      const url = addressURL(text(value.address, 8192));
      if (!selectedTask()) throw new Error("Create a task first.");
      const page = selectedPage() ?? newPage(selectedTask()!.id);
      page.url = url;
      errors.delete(page.id);
      if (views.has(page.id))
        void views
          .get(page.id)!
          .webContents.loadURL(url)
          .catch(() => {});
      else showPage(page);
      break;
    }
    case "back":
      currentContents()?.navigationHistory.goBack();
      break;
    case "forward":
      currentContents()?.navigationHistory.goForward();
      break;
    case "reload":
      if (
        currentContents() &&
        confirm(
          "Reload this page?",
          "Unsaved website changes may be lost. Reloading does not save or submit the page.",
          "Reload",
        )
      )
        currentContents()!.reload();
      break;
    case "closePage": {
      const page = selectedPage();
      if (!page) break;
      const contents = views.get(page.id)?.webContents;
      if (contents) {
        if (
          confirm(
            "Close this page?",
            "Unsaved website changes may be lost. Other pages in this task stay open.",
            "Close page",
          )
        )
          contents.close({ waitForBeforeUnload: true });
      } else {
        workspace.pages = workspace.pages.filter((item) => item.id !== page.id);
        selectedTask()!.selectedPageId =
          workspace.pages.find((item) => item.taskId === page.taskId)?.id ??
          null;
      }
      break;
    }
    case "find": {
      const query = text(value.text, 500);
      if (query)
        currentContents()?.findInPage(query, { forward: !value.backward });
      else currentContents()?.stopFindInPage("clearSelection");
      break;
    }
    case "stopFind":
      currentContents()?.stopFindInPage("clearSelection");
      break;
    case "stop":
      currentContents()?.stop();
      break;
    case "dismissNotice":
      notice = "";
      break;
    default:
      throw new Error("This command is not available yet.");
  }
  storage.save(workspace);
  layout();
  publish();
}
function trusted(event: IpcMainEvent | IpcMainInvokeEvent) {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame?.url !== "trailrest://app/index.html"
  )
    throw new Error("Untrusted request.");
}
async function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  Object.assign(workspace, storage.read());
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  await app.whenReady();
  guests = session.fromPartition("persist:trailrest-web");
  guests.setPermissionRequestHandler((contents, permission, callback) => {
    callback(false);
    let origin = "This website";
    try {
      origin = new URL(contents.getURL()).origin;
    } catch {}
    notice = `${origin} requested ${permission}. Website permissions are disabled in this build.`;
    publish();
  });
  guests.setPermissionCheckHandler(() => false);
  guests.on("will-download", (_event, item) => {
    const download = {
      id: randomUUID(),
      name: item.getFilename(),
      status: "Choose a destination",
    };
    downloads.unshift(download);
    downloads.splice(20);
    publish();
    item.on("updated", (_event, state) => {
      download.status =
        state === "interrupted"
          ? "Interrupted"
          : `Downloading ${Math.round(item.getReceivedBytes() / 1024)} KB`;
      publish();
    });
    item.on("done", (_event, state) => {
      download.status =
        state === "completed"
          ? "Completed"
          : state === "cancelled"
            ? "Canceled"
            : "Interrupted";
      publish();
    });
    const destination = dialog.showSaveDialogSync(window, {
      title: "Save download",
      buttonLabel: "Save file",
      defaultPath: item.getFilename(),
    });
    if (destination) item.setSavePath(destination);
    else item.cancel();
  });
  const shellSession = session.fromPartition("trailrest-shell");
  const uiRoot = resolve(directory, "../ui");
  shellSession.protocol.handle("trailrest", (request) => {
    const url = new URL(request.url);
    const path = resolve(uiRoot, "." + decodeURIComponent(url.pathname));
    if (url.host !== "app" || !path.startsWith(uiRoot + sep))
      return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(path).href);
  });
  window = new BrowserWindow({
    width: 1488,
    height: 960,
    minWidth: 480,
    minHeight: 480,
    title: "Trailrest",
    backgroundColor: "#242829",
    webPreferences: {
      session: shellSession,
      preload: resolve(directory, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.setMenuBarVisibility(false);
  window.maximize();
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("before-input-event", keyboard);
  ipcMain.handle("workspace:read", (event) => {
    trusted(event);
    return snapshot();
  });
  ipcMain.handle("workspace:command", (event, value) => {
    trusted(event);
    return command(value);
  });
  ipcMain.on("page:layout", (event, bounds: PageBounds) => {
    trusted(event);
    if (
      !bounds ||
      typeof bounds.visible !== "boolean" ||
      !["x", "y", "width", "height"].every(
        (key) =>
          Number.isFinite(bounds[key as keyof PageBounds]) &&
          Number(bounds[key as keyof PageBounds]) >= 0,
      )
    )
      return;
    pageBounds = {
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      visible: bounds.visible,
    };
    layout();
  });
  window.on("resize", layout);
  window.on("close", (event) => {
    if (quitting) return;
    const saved = storage.save(workspace);
    if (
      (views.size || !saved) &&
      !confirm(
        "Quit Trailrest?",
        saved
          ? "Task names, notes and page addresses are saved. Live pages will close, and unsaved website changes will not be restored."
          : "Task changes could not be saved. Quitting will lose those changes as well as live website state.",
        "Quit",
      )
    ) {
      event.preventDefault();
      publish();
      return;
    }
    quitting = true;
    const owned = [...views.values()];
    views.clear();
    for (const view of owned)
      if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  app.on("window-all-closed", () => app.quit());
  await window.loadURL("trailrest://app/index.html");
}
void start().catch((error) => {
  console.error(error);
  app.exit(1);
});
