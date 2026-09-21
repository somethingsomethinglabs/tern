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
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { BrowserPreferences } from "./preferences.js";
import {
  chromeStorePackage,
  prepareExtensionPackage,
  PACKAGE_LIMIT,
} from "./extension-packages.js";
import type {
  Command,
  PageBounds,
  PageRecord,
  Snapshot,
  Workspace,
} from "./contracts.js";
import { WorkspaceFile } from "./workspace-file.js";
import { readTheme } from "./theme.js";
import { ExtensionLibrary } from "./extensions.js";

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
const preferences = new BrowserPreferences(
  app.getPath("userData"),
  app.getPath("downloads"),
);
const workspace: Workspace = {
  version: 1,
  tasks: [],
  pages: [],
  selectedTaskId: null,
};
const views = new Map<string, WebContentsView>();
const lostRenderers = new Set<string>();
const errors = new Map<string, string>();
let window: BrowserWindow;
let guests: Session;
let extensions: ExtensionLibrary;
let theme = readTheme();
let notice = "";
let quitting = false;
const downloads: Snapshot["downloads"] = [];
const downloadDestinations = new Set<string>();
let pageBounds: PageBounds = {
  x: 280,
  y: 56,
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
    preferences: preferences.value,
    theme,
    extensions: extensions?.list() ?? [],
    notice,
    storageError: storage.error || preferences.error,
    downloads,
    pages: workspace.pages.map((page) => {
      const contents = views.get(page.id)?.webContents;
      return {
        ...page,
        live: !!contents && !lostRenderers.has(page.id),
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
  const engines = {
    duckduckgo: "https://duckduckgo.com/?q=",
    google: "https://www.google.com/search?q=",
    bing: "https://www.bing.com/search?q=",
    brave: "https://search.brave.com/search?q=",
  };
  return engines[preferences.value.searchEngine] + encodeURIComponent(value);
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
function guestPreferences(): Electron.WebPreferences {
  return {
    session: guests,
    preload: resolve(directory, "page-preload.cjs"),
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    webSecurity: true,
  };
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
    webPreferences: guestPreferences(),
  });
  lostRenderers.delete(page.id);
  views.set(page.id, view);
  window.contentView.addChildView(view);
  const contents = view.webContents;
  contents.setZoomFactor(preferences.value.defaultZoom);
  contents.on("did-finish-load", () =>
    contents.setZoomFactor(preferences.value.defaultZoom),
  );
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
    lostRenderers.add(page.id);
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
        webPreferences: guestPreferences(),
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
  const key = input.key.toLowerCase();
  const alt = input.alt && !input.control && !input.meta && !input.shift;
  window.webContents.send(
    "shell:shortcut",
    alt && !(key === "alt" && input.type === "keyUp")
      ? "hints:on"
      : "hints:off",
  );
  if (input.type !== "keyDown") return;
  if (alt && /^[a-z0-9]$/.test(key)) {
    event.preventDefault();
    window.webContents.focus();
    window.webContents.send("shell:shortcut", "switch:" + key);
    return;
  }
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
    case "saveNote": {
      const task = workspace.tasks.find(
        (task) => task.id === text(value.id, 100),
      );
      if (!task) throw new Error("Task not found.");
      task.note = text(value.note, 500);
      break;
    }
    case "setPreferences": {
      if (
        !value.patch ||
        typeof value.patch !== "object" ||
        "downloadDirectory" in value.patch
      )
        throw new Error("Invalid browser settings.");
      preferences.update(value.patch);
      for (const view of views.values())
        if (!view.webContents.isDestroyed())
          view.webContents.setZoomFactor(preferences.value.defaultZoom);
      break;
    }
    case "chooseDownloadDirectory": {
      const result = await dialog.showOpenDialog(window, {
        title: "Download folder",
        properties: ["openDirectory", "createDirectory"],
        defaultPath: preferences.value.downloadDirectory,
      });
      if (!result.canceled && result.filePaths[0])
        preferences.update({ downloadDirectory: result.filePaths[0] });
      break;
    }
    case "clearCache":
      if (
        confirm(
          "Clear cached website files?",
          "Websites may load more slowly next time. Cookies, logins, task notes and page addresses are kept.",
          "Clear cache",
        )
      ) {
        await guests.clearCache();
        notice = "Cached website files cleared.";
      }
      break;
    case "importExtension": {
      const result = await dialog.showOpenDialog(window, {
        title: "Import extension package",
        properties: ["openFile"],
        filters: [{ name: "Extension packages", extensions: ["zip", "crx"] }],
      });
      if (result.canceled || !result.filePaths[0]) break;
      const extension = await prepareExtensionPackage(
        result.filePaths[0],
        app.getPath("userData"),
      );
      try {
        const response = await dialog.showMessageBox(window, {
          type: "question",
          message: "Load " + extension.name + "?",
          detail: `Version ${extension.version}\nPermissions: ${extension.permissions}\n\nThis imports unpacked code. Trailrest does not verify the package's publisher signature. Extensions can read and change websites; some Chrome APIs and toolbar popups are unsupported.`,
          buttons: ["Cancel", "Load extension"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response.response !== 1) {
          await rm(extension.directory, { recursive: true, force: true });
          break;
        }
        await extensions.add(extension.path);
      } catch (error) {
        await rm(extension.directory, { recursive: true, force: true });
        throw error;
      }
      break;
    }
    case "downloadExtension": {
      notice = "";
      publish();
      const source = chromeStorePackage(
        text(value.source, 2048),
        process.versions.chrome,
      );
      const result = await dialog.showSaveDialog(window, {
        title: "Download extension package",
        defaultPath: join(
          preferences.value.downloadDirectory,
          source.id + ".crx",
        ),
        filters: [{ name: "Chrome extension", extensions: ["crx"] }],
      });
      if (result.canceled || !result.filePath) break;
      const download = {
        id: randomUUID(),
        name: source.id + ".crx",
        status: "Downloading extension package",
      };
      downloads.unshift(download);
      downloads.splice(20);
      publish();
      try {
        const response = await net.fetch(source.url, {
          credentials: "omit",
          signal: AbortSignal.timeout(30000),
        });
        if (!response.ok || !response.body)
          throw new Error(
            "The Chrome Web Store did not provide a downloadable package. Use a package from the extension developer instead.",
          );
        const chunks: Buffer[] = [];
        const reader = response.body.getReader();
        let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > PACKAGE_LIMIT) {
            await reader.cancel();
            throw new Error("Extension package exceeds 64 MB.");
          }
          chunks.push(Buffer.from(chunk.value));
        }
        const data = Buffer.concat(chunks);
        if (data.subarray(0, 4).toString() !== "Cr24")
          throw new Error(
            "The store did not return a Chrome extension package.",
          );
        await writeFile(result.filePath, data, { mode: 0o600 });
        download.status = "Completed";
        notice =
          "Extension package downloaded. Use Import package to review and load it.";
      } catch (error) {
        download.status = "Failed";
        publish();
        throw error;
      }
      break;
    }
    case "loadExtension": {
      const result = await dialog.showOpenDialog(window, {
        title: "Load unpacked extension",
        properties: ["openDirectory"],
        buttonLabel: "Load extension",
      });
      if (!result.canceled && result.filePaths[0])
        await extensions.add(result.filePaths[0]);
      break;
    }
    case "removeExtension":
      extensions.remove(text(value.path, 8192));
      break;
    case "moveTask": {
      const task = workspace.tasks.find(
        (task) => task.id === text(value.id, 100),
      );
      if (!task || !["Active", "Later", "Settled"].includes(value.lifecycle))
        throw new Error("Invalid task destination.");
      task.lifecycle = value.lifecycle;
      break;
    }
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
  preferences.read();
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  await app.whenReady();
  guests = session.fromPartition("persist:trailrest-web");
  extensions = new ExtensionLibrary(guests, app.getPath("userData"));
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
      downloadDestinations.delete(item.getSavePath());
      download.status =
        state === "completed"
          ? "Completed"
          : state === "cancelled"
            ? "Canceled"
            : "Interrupted";
      publish();
    });
    const filename = basename(item.getFilename());
    let destination = join(preferences.value.downloadDirectory, filename);
    if (preferences.value.askDownloadLocation) {
      destination =
        dialog.showSaveDialogSync(window, {
          title: "Save download",
          buttonLabel: "Save file",
          defaultPath: destination,
        }) || "";
    } else {
      const extension = extname(filename);
      const name = filename.slice(0, filename.length - extension.length);
      let index = 1;
      while (existsSync(destination) || downloadDestinations.has(destination))
        destination = join(
          preferences.value.downloadDirectory,
          `${name} (${index++})${extension}`,
        );
    }
    if (destination) {
      downloadDestinations.add(destination);
      item.setSavePath(destination);
    } else item.cancel();
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
    backgroundColor: theme.background,
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
  window.on("blur", () =>
    window.webContents.send("shell:shortcut", "hints:off"),
  );
  const themeTimer = setInterval(() => {
    const next = readTheme();
    if (JSON.stringify(next) !== JSON.stringify(theme)) {
      theme = next;
      publish();
    }
  }, 1500);
  themeTimer.unref();
  window.on("closed", () => clearInterval(themeTimer));
  ipcMain.handle("workspace:read", (event) => {
    trusted(event);
    return snapshot();
  });
  ipcMain.handle("workspace:command", (event, value) => {
    trusted(event);
    return command(value);
  });
  ipcMain.on("guest:scroll", (event, direction) => {
    if (direction !== "up" && direction !== "down") return;
    if (
      event.sender !== currentContents() ||
      event.senderFrame !== event.sender.mainFrame
    )
      return;
    window.webContents.send("shell:shortcut", "scroll:" + direction);
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
  // Install permission/download handlers and create the window before running
  // any remembered extension background scripts.
  try {
    await extensions.restore();
  } catch (error) {
    notice = String(error);
  }
  await window.loadURL("trailrest://app/index.html");
}
void start().catch((error) => {
  console.error(error);
  app.exit(1);
});
