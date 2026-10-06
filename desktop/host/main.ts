import { SearchController, BUILTIN_SEARCH_URL, externalShortcut } from "@tern/core/search";
import { Metasearch } from "./metasearch.js";
import { WorkspaceModel, checkedText } from "@tern/core/workspace-model";
import { emptyWorkspace } from "@tern/core/workspace";
import { isWebURL, addressURL, searchURL } from "@tern/core/navigation";
import {
  app,
  BrowserWindow,
  WebContentsView,
  session,
  protocol,
  net,
  ipcMain,
  dialog,
  clipboard,
  safeStorage,
  shell,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type WebContents,
  type Session,
} from "electron";
import { fileURLToPath, pathToFileURL } from "node:url";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
  Finding,
  Task,
} from "@tern/core/contracts";
import { WorkspaceFile } from "./workspace-file.js";
import { PageSelection } from "@tern/core/page-selection";
import { readTheme } from "./theme.js";
import { ExtensionLibrary } from "./extensions.js";
import { ExtensionBrowser } from "./extension-browser.js";
import { TaskSummaries } from "./task-summaries.js";
import { TaskContexts } from "./task-context.js";
import { TaskStarter } from "./task-start.js";
import { basicTaskPlan, plannedWorkspace } from "@tern/core/task-plan";
import { profileDirectory, WEBSITE_PARTITION } from "./profile.js";
import { PageRestoration } from "./page-restoration.js";
import { CookieStore } from "./cookies.js";
import { ReleaseUpdater } from "./updates.js";
import { installWebsitePermissions } from "./website-permissions.js";
import { followFirstSearchResult, stopFollowingSearch } from "./first-search-result.js";

app.setName("Tern");
app.setPath("userData", profileDirectory(app.getPath("appData")));
protocol.registerSchemesAsPrivileged([
  {
    scheme: "tern",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);
app.enableSandbox();
const directory = dirname(fileURLToPath(import.meta.url));
const storage = new WorkspaceFile(app.getPath("userData"));
const taskSummaries = new TaskSummaries(app.getPath("userData"));
const taskContexts = new TaskContexts(app.getPath("userData"));
const taskStarter = new TaskStarter(app.getPath("userData"));
let overviewOpen = true;
let focusResumedPage = false;
const preferences = new BrowserPreferences(
  app.getPath("userData"),
  app.getPath("downloads"),
);
const workspace: Workspace = emptyWorkspace();
const workspaceModel = new WorkspaceModel(workspace, { id: randomUUID, now: Date.now });
const metasearch = new Metasearch(() => preferences.value.searchProviders ?? ["duckduckgo", "bing"]);
const searches = new SearchController(workspaceModel, metasearch.transport, () => {
  if (quitting) return;
  storage.save(workspace);
  layout();
  publish();
}, async page => {
  if (views.size + restoration.size >= 100) { workspaceModel.removePage(page.id); throw new Error("Close a page before opening another."); }
  overviewOpen = false;
  showPage(page);
}, () => !overviewOpen);
const views = new Map<string, WebContentsView>();
const pageSelection = new PageSelection();
const startingSearches = new WeakSet<PageRecord>();
const preloadingState = new WeakMap<WebContents, boolean>();
const preconnectedOrigins = new WeakMap<WebContents, Set<string>>();
const restoration = new PageRestoration((id) => {
  const page = workspace.pages.find((page) => page.id === id);
  if (quitting || !page) return;
  if (page.search) { searches.ensure(page); return; }
  if (!page.url) return;
  return showPage(page);
});
const lostRenderers = new Set<string>();
const errors = new Map<string, string>();
let window: BrowserWindow;
let guests: Session;
let cookieStore: CookieStore;
let updater: ReleaseUpdater;
let permissionController: ReturnType<typeof installWebsitePermissions>;
let cookieSecurity: NonNullable<Snapshot["security"]> = { cookieStorage: "development", detail: "Development build. Use an isolated profile for testing." };
const recentGestures = new WeakMap<WebContents, number>();
const blockedPopups = new Map<string, { opener: WebContents; url: string }>();
const downloadItems = new Map<string, Electron.DownloadItem>();
let extensions: ExtensionLibrary;
let extensionBrowser: ExtensionBrowser;
let theme = readTheme();
let notice = "";
let quitting = false;
let restartForUpdate = false;
const downloads: Snapshot["downloads"] = [];
const downloadDestinations = new Set<string>();
let takingSnapshot = false;
let pageBounds: PageBounds = {
  x: 280,
  y: 56,
  width: 800,
  height: 600,
  visible: false,
};

function selectedTask() {
  return workspaceModel.task();
}
function selectedPage() {
  return workspaceModel.page();
}
function currentContents() {
  const id = selectedPage()?.id;
  return id ? views.get(id)?.webContents : undefined;
}
function unloadTaskPages(taskId: string) {
  const owned: WebContentsView[] = [];
  for (const page of workspace.pages.filter((page) => page.taskId === taskId)) {
    // Cancel every queued tab before closing a page can advance restoration.
    restoration.forget(page.id);
    const view = views.get(page.id);
    if (view) owned.push(view);
    // Detach all views first so their destroyed handlers keep the references,
    // including any popup that closes along with its opener.
    views.delete(page.id);
    errors.delete(page.id);
    lostRenderers.delete(page.id);
    startingSearches.delete(page);
  }
  for (const view of owned) {
    window.contentView.removeChildView(view);
    if (!view.webContents.isDestroyed()) {
      stopFollowingSearch(view.webContents);
      view.webContents.close();
    }
  }
}
function reopenPage(page: PageRecord) {
  if (page.search) { metasearch.invalidate(page.search.query); searches.refresh(page, preferences.value); return; }
  if (!page.url) return;
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
function closePages(pages: PageRecord[]) {
  if (pages.some(page => views.has(page.id)) && !confirm(
    pages.length === 1 ? "Close this page?" : `Close ${pages.length} tabs?`,
    "Unsaved website changes may be lost. Other pages in this task stay open.",
    pages.length === 1 ? "Close page" : "Close tabs",
  )) return;
  for (const page of pages) restoration.forget(page.id);
  for (const page of pages) {
    const contents = views.get(page.id)?.webContents;
    if (contents) {
      contents.close({ waitForBeforeUnload: true });
    } else {
      workspaceModel.removePage(page.id);
    }
  }
}
function snapshot(): Snapshot {
  return {
    ...workspace,
    security: cookieSecurity,
    updates: updater?.state,
    siteInfo: permissionController?.snapshot(currentContents()),
    blockedPopups: [...blockedPopups].filter(([, popup]) => popup.opener === currentContents()).map(([id, popup]) => ({ id, url: popup.url })),
    searches: searches.snapshot(),
    selectedPageIds: pageSelection.selected(workspace),
    overviewOpen,
    summaries: taskSummaries.snapshot(
      workspace,
      preferences.value.summaryModel,
    ),
    summaryStatus: taskSummaries.status,
    pendingSummaryTaskIds: taskSummaries.pendingTaskIds,
    taskContext: taskContexts.snapshot(workspace, preferences.value.summaryModel),
    contextStatus: taskContexts.status,
    contextPending: taskContexts.pendingTaskId === workspace.selectedTaskId && taskContexts.pendingTaskId !== null,
    taskStartStatus: taskStarter.status,
    taskStartPending: taskStarter.pending,
    preferences: preferences.value,
    theme,
    extensions: (extensions?.list() ?? []).map((extension) => ({
      ...extension,
      canOpen: extensionBrowser?.canOpen(extension.id) ?? false,
    })),
    notice,
    storageError: storage.error || preferences.error,
    downloads,
    pages: workspace.pages.map((page) => {
      const contents = views.get(page.id)?.webContents;
      return {
        ...page,
        live: !!contents && !lostRenderers.has(page.id),
        loading: page.search ? !!searches.state(page.id)?.loading : contents?.isLoading() ?? false,
        error: errors.get(page.id) ?? "",
        canGoBack: (contents?.navigationHistory.canGoBack() ?? false) || !!workspace.pages.find(source => source.id === page.sourceSearchId && source.search),
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
  extensionBrowser?.selectPage(currentContents());
  const [width, height] = window.getContentSize();
  for (const [id, view] of views) {
    const visible =
      !overviewOpen &&
      id === selectedPage()?.id &&
      pageBounds.visible &&
      !errors.has(id);
    view.setVisible(visible);
    const preloadLinks =
      visible && window.isFocused() && preferences.value.preloadLinks;
    if (
      !lostRenderers.has(id) && !view.webContents.isDestroyed() &&
      preloadingState.get(view.webContents) !== preloadLinks
    ) {
      preloadingState.set(view.webContents, preloadLinks);
      view.webContents.send("guest:link-preloading", preloadLinks);
    }
    if (visible) {
      view.setBounds({
        x: Math.min(width, Math.max(0, pageBounds.x)),
        y: Math.min(height, Math.max(0, pageBounds.y)),
        width: Math.max(0, Math.min(pageBounds.width, width - pageBounds.x)),
        height: Math.max(0, Math.min(pageBounds.height, height - pageBounds.y)),
      });
      if (focusResumedPage) {
        view.webContents.focus();
        focusResumedPage = false;
      }
    }
  }
}
function keepFinding(task: Task, text: string, source?: Finding["source"]) {
  workspaceModel.keepFinding(task, text, source);
  taskContexts.stop();
}
function newPage(taskId: string, url = "") {
  return workspaceModel.newPage(taskId, url);
}
function recordActivity() {
  if (overviewOpen) return;
  workspaceModel.recordActivity();
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
  if (views.size + restoration.size >= 100 && !restoration.has(page.id))
    throw new Error("Close a page before opening another.");
  restoration.forget(page.id);
  const view = new WebContentsView({
    ...(adopt ? { webContents: adopt } : {}),
    webPreferences: guestPreferences(),
  });
  lostRenderers.delete(page.id);
  views.set(page.id, view);
  window.contentView.addChildView(view);
  const contents = view.webContents;
  contents.on("dom-ready", () => {
    recentGestures.delete(contents);
    preloadingState.delete(contents);
    preconnectedOrigins.delete(contents);
    layout();
  });
  extensionBrowser.addPage(contents, (params) => {
    if (params.isEditable || !params.selectionText.trim()) return [];
    const owner = workspace.tasks.find((task) => task.id === page.taskId);
    const url = params.frameURL || params.pageURL || contents.getURL();
    if (!owner || !isWebURL(url)) return [];
    const selection = params.selectionText;
    const source = { title: url === contents.getURL() ? contents.getTitle().slice(0, 1000) : new URL(url).hostname, url };
    return [
      { role: "copy" },
      { label: "Keep selection as a finding", enabled: selection.length <= 1000 && url.length <= 32768,
        click: () => {
          try {
            keepFinding(owner, selection, source);
            storage.save(workspace);
            notice = "Finding saved with its source in Task notes.";
          } catch (error) { notice = (error as Error).message; }
          publish();
        },
      },
    ];
  });
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
    if (page.id === selectedPage()?.id && pageBounds.visible) recordActivity();
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
        "Blocked an unsupported address. Tern opens HTTP and HTTPS pages.";
      publish();
    }
  };
  contents.on("will-frame-navigate", (event) => {
    if (event.url !== "about:blank" && !isWebURL(event.url)) navigation(event, event.url);
  });
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
    for (const [id, popup] of blockedPopups) if (popup.opener === contents) blockedPopups.delete(id);
    if (views.get(page.id) !== view) return;
    views.delete(page.id);
    window.contentView.removeChildView(view);
    workspaceModel.removePage(page.id);
    storage.save(workspace);
    publish();
    layout();
  });
  const popupTimes: number[] = [];
  contents.setWindowOpenHandler((details) => {
    const now = Date.now();
    while (popupTimes.length && now - popupTimes[0] > 10000) popupTimes.shift();
    if (contents !== currentContents() || !pageBounds.visible || Date.now() - (recentGestures.get(contents) ?? 0) > 1500 || popupTimes.length >= 3) {
      if (isWebURL(details.url) && details.url.length <= 32768) {
        while (blockedPopups.size >= 20) blockedPopups.delete(blockedPopups.keys().next().value!);
        blockedPopups.set(randomUUID(), { opener: contents, url: details.url });
      }
      notice = "A background or repeated popup was blocked. Review it in Site information.";
      publish(); return { action: "deny" };
    }
    popupTimes.push(now);
    if (!isWebURL(details.url) || views.size + restoration.size >= 100) {
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
        const owner = workspace.tasks.find((task) => task.id === page.taskId)!;
        const previous = owner.selectedPageId;
        const popup = newPage(page.taskId, details.url);
        if (details.disposition === "background-tab")
          owner.selectedPageId = previous;
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
  contents.on("focus", () =>
    window.webContents.send("shell:shortcut", "dismissMenu"),
  );
  contents.on("before-mouse-event", (_event, input) => {
    if (input.type === "mouseDown" || input.type === "mouseWheel")
      window.webContents.send("shell:shortcut", "dismissMenu");
  });
  if (startingSearches.delete(page) && load && page.url)
    followFirstSearchResult(contents, page.url);
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
  if ((input.control || input.meta) && !input.alt && ["p", "s"].includes(key)) {
    event.preventDefault();
    void command({ type: key === "p" ? "printPage" : input.shift ? "savePDF" : "savePage" }).catch(error => { notice = String(error); publish(); });
    return;
  }
  if (
    key === "f12" ||
    ((input.control || input.meta) && input.shift && !input.alt && key === "i")
  ) {
    event.preventDefault();
    if (overviewOpen || !pageBounds.visible) return;
    const contents = currentContents();
    if (contents?.isDevToolsOpened()) contents.closeDevTools();
    else contents?.openDevTools({ mode: "detach" });
    return;
  }
  try {
    if (extensionBrowser?.handleShortcut(input)) {
      event.preventDefault();
      return;
    }
  } catch (error) {
    notice = String(error);
    publish();
    return;
  }
  if (alt && /^[a-z0-9]$/.test(key)) {
    event.preventDefault();
    window.webContents.focus();
    window.webContents.send("shell:shortcut", "switch:" + key);
    return;
  }
  if (
    (input.control || input.meta) &&
    !input.shift &&
    ["l", "t", "f", "w", "r"].includes(key)
  ) {
    event.preventDefault();
    if ((key === "w" || key === "r") && overviewOpen) return;
    if (key === "w" || key === "r") {
      const ids = pageSelection.selected(workspace);
      void command(key === "w" && ids.length > 1
        ? { type: "pageSelectionAction", action: "close", ids }
        : { type: key === "w" ? "closePage" : "reload" }).catch(() => {});
    }
    else {
      window.webContents.focus();
      window.webContents.send("shell:shortcut", key);
    }
  } else if (input.alt && ["arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
    if (overviewOpen) return;
    void command({ type: key === "arrowleft" ? "back" : "forward" }).catch(
      () => {},
    );
  } else if (key === "f5") {
    event.preventDefault();
    if (overviewOpen) return;
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
  const text = checkedText;
  const targetPage = (id?: string) => {
    if (id === undefined) return selectedPage();
    const page = workspace.pages.find((page) => page.id === text(id, 100));
    if (!page) throw new Error("Page not found.");
    return page;
  };
  const targetTask = (id?: string) => {
    if (id === undefined) return selectedTask();
    const task = workspace.tasks.find((task) => task.id === text(id, 100));
    if (!task) throw new Error("Task not found.");
    return task;
  };
  if (["openTask", "selectTask", "selectPage", "createTask", "showOverview", "newPage", "navigate", "suggestTaskContext"].includes(value.type))
    taskStarter.stop();
  let createdTaskId: string | undefined;
  const searchHandled = await searches.command(value, preferences.value);
  if (searchHandled) overviewOpen = false;
  const effects = searchHandled ? null : workspaceModel.command(value);
  if (searchHandled) { /* Shared search commands have already changed the workspace. */ }
  else if (effects) {
    if (effects.contextChanged) taskContexts.stop();
    if (effects.releaseTaskPages) unloadTaskPages(effects.releaseTaskPages);
  } else switch (value.type) {
    case "checkForUpdates": await updater.check(); break;
    case "installUpdate": await updater.install(); break;
    case "restartForUpdate":
      if (!updater.restartExecutable) throw new Error("Install an update before restarting.");
      restartForUpdate = true;
      try { window.close(); } finally { restartForUpdate = false; }
      break;
    case "setSitePermission":
    case "resetSitePermissions": {
      const origin = text(value.origin, 2048);
      if (!isWebURL(origin) || new URL(origin).origin !== origin) throw new Error("Invalid website origin.");
      const affected = [...views.values()].map(view => view.webContents).filter(contents =>
        !contents.isDestroyed() && isWebURL(contents.getURL()) && new URL(contents.getURL()).origin === origin);
      if (affected.length && !confirm("Reload this site's pages?",
        "Changing permissions reloads every open page from this origin to stop camera, microphone and file access. Unsaved website changes may be lost.", "Reload and update")) return;
      if (value.type === "setSitePermission") permissionController.setPolicy(origin, text(value.permission, 100), text(value.policy, 10));
      else permissionController.revoke(origin);
      for (const contents of affected) {
        const page = workspace.pages.find(page => views.get(page.id)?.webContents === contents);
        if (!page) continue;
        const view = views.get(page.id)!;
        views.delete(page.id); window.contentView.removeChildView(view);
        // The user already confirmed discarding this origin's live state.
        // Recreate the document so a beforeunload veto cannot retain capture.
        contents.close({ waitForBeforeUnload: false });
        showPage(page);
      }
      notice = "Website permissions updated. Camera and microphone streams stop when the pages reload.";
      break;
    }
    case "openBlockedPopup": {
      const popup = blockedPopups.get(text(value.id, 100));
      if (!popup || popup.opener.isDestroyed() || popup.opener !== currentContents()) throw new Error("This blocked popup is no longer available.");
      blockedPopups.delete(value.id);
      const owner = workspace.pages.find(page => views.get(page.id)?.webContents === popup.opener);
      if (!owner || !isWebURL(popup.url)) throw new Error("Invalid popup.");
      showPage(newPage(owner.taskId, popup.url));
      break;
    }
    case "printPage":
    case "savePDF":
    case "savePage": {
      const contents = currentContents();
      if (overviewOpen || !contents || contents.isDestroyed() || !isWebURL(contents.getURL())) throw new Error("Open a website first.");
      if (value.type === "printPage") {
        await new Promise<void>((resolve, reject) => contents.print({ silent: false }, (success, reason) => {
          if (success || reason === "cancelled") resolve(); else reject(new Error(reason || "Printing failed."));
        }));
      } else {
        const pdf = value.type === "savePDF";
        const title = contents.getTitle().replace(/[\/\\\x00-\x1f\x7f]/g, "_").slice(0, 100) || "page";
        const path = dialog.showSaveDialogSync(window, { title: pdf ? "Save as PDF" : "Save webpage",
          defaultPath: join(preferences.value.downloadDirectory, title + (pdf ? ".pdf" : ".html")),
          filters: [{ name: pdf ? "PDF" : "HTML", extensions: [pdf ? "pdf" : "html"] }] });
        if (!path) return;
        if (pdf) await writeFile(path, await contents.printToPDF({ printBackground: true }));
        else await contents.savePage(path, "HTMLComplete");
        downloads.unshift({ id: randomUUID(), name: basename(path), status: "Completed" }); downloads.splice(20);
        notice = pdf ? "PDF saved." : "Webpage saved with its resources.";
      }
      break;
    }
    case "downloadAction": {
      const item = downloadItems.get(text(value.id, 100));
      if (!item) throw new Error("Download is no longer available.");
      if (value.action === "cancel" && item.getState() === "progressing") item.cancel();
      else if (value.action === "resume" && item.canResume()) item.resume();
      else if (value.action === "showFolder" && item.getState() === "completed") shell.showItemInFolder(item.getSavePath());
      else throw new Error("This download action is unavailable.");
      break;
    }
    case "cancelTaskStart":
      taskStarter.stop();
      break;
    case "startTask": {
      const request = text(value.request, 1000).trim();
      if (!request) throw new Error("Describe what you need to do.");
      if (typeof value.useAI !== "boolean") throw new Error("Choose how to create the task.");
      if (taskStarter.pending) throw new Error("A task is already being prepared.");
      if (workspace.tasks.length >= 10000) throw new Error("The workspace has reached its task limit.");
      taskSummaries.stop();
      taskContexts.stop();
      const plan = value.useAI
        ? await taskStarter.prepare(request, preferences.value.summaryModel, publish)
        : basicTaskPlan(request);
      if (!plan || quitting) return;
      if (views.size + restoration.size + plan.searches.length > 100)
        throw new Error("Close a few pages before starting this task. Your request is still here.");
      const next = plannedWorkspace(workspace, plan, request, preferences.value.searchEngine, randomUUID, value.title, preferences.value.searchView !== "external" ? preferences.value.searxngURL ?? BUILTIN_SEARCH_URL : undefined);
      const task = next.tasks[next.tasks.length - 1];
      const pages = next.pages.filter(page => page.taskId === task.id);
      if (!storage.save(next)) { publish(); throw new Error(storage.error); }
      Object.assign(workspace, next);
      createdTaskId = task.id;
      overviewOpen = false;
      focusResumedPage = false;
      for (const page of pages) if (!page.search) startingSearches.add(page);
      restoration.resume(task.selectedPageId, pages.map((page) => page.id));
      recordActivity();
      notice = "";
      break;
    }
    case "clearSiteCookies": {
      const contents = currentContents();
      if (overviewOpen || !pageBounds.visible || !contents || contents.isDestroyed() || !isWebURL(contents.getURL()))
        throw new Error("Open a website before deleting its cookies.");
      const site = new URL(contents.getURL());
      const response = dialog.showMessageBoxSync(window, {
        type: "question",
        message: `Delete cookies for ${site.hostname}?`,
        detail: "This can sign you out in every tab using this site, including its subdomains. Site-specific cookies from embedded content will also be cleared.\n\nTasks, notes and other website storage are kept. The page will stay open. Reload it afterwards to use the cleared cookies.",
        buttons: ["Cancel", "Delete cookies"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response !== 1) break;
      await cookieStore.clearSite(site.origin);
      notice = `Cookies deleted for ${site.hostname}. Reload the page to use the cleared cookies.`;
      break;
    }
    case "takeSnapshot": {
      if (takingSnapshot) throw new Error("A snapshot is already being saved.");
      const page = selectedPage();
      const contents = currentContents();
      if (
        !preferences.value.showSnapshotTool ||
        overviewOpen ||
        !page ||
        !contents ||
        contents.isDestroyed() ||
        lostRenderers.has(page.id) ||
        errors.has(page.id) ||
        !pageBounds.visible
      )
        throw new Error("Open a website before taking a snapshot.");
      takingSnapshot = true;
      const destination = preferences.value.downloadDirectory;
      try {
        // Capture the guest itself, so browser controls never enter the image.
        const image = await contents.capturePage();
        if (image.isEmpty())
          throw new Error(
            "The page could not be captured. Try again when it is visible.",
          );
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const name = `Snapshot-${stamp}-${randomUUID().slice(0, 8)}.png`;
        const path = join(destination, name);
        try {
          await mkdir(destination, { recursive: true });
          await writeFile(path, image.toPNG(), { flag: "wx", mode: 0o600 });
        } catch {
          throw new Error(
            "Could not save the snapshot. Check your download folder permissions and disk space.",
          );
        }
        downloads.unshift({ id: randomUUID(), name, status: "Completed" });
        downloads.splice(20);
        notice = `Snapshot saved to ${path}`;
      } finally {
        takingSnapshot = false;
      }
      break;
    }
    case "suggestTaskContext": {
      const task = targetTask(value.id)!;
      if (overviewOpen || task.id !== workspace.selectedTaskId)
        throw new Error("Open this task before generating suggestions.");
      if (!preferences.value.summaryModel) throw new Error("Enable local AI in Settings to generate suggestions.");
      taskSummaries.stop();
      void taskContexts.refresh(workspace, task.id, preferences.value.summaryModel, publish);
      break;
    }
    case "cancelTaskContext":
      taskContexts.stop();
      break;
    case "searchTask":
    case "openFindingSource": {
      const task = targetTask(value.id)!;
      let url: string;
      if (value.type === "searchTask") {
        const query = text(value.query, 160).trim();
        if (!query) throw new Error("Enter a search query.");
        if (preferences.value.searchView !== "external") {
          searches.create(task.id, query, preferences.value);
          overviewOpen = false;
          break;
        }
        url = searchURL(query, preferences.value.searchEngine);
      } else {
        const source = task.findings?.find((finding) => finding.id === text(value.findingId, 100))?.source;
        if (!source || !isWebURL(source.url)) throw new Error("Source unavailable.");
        url = source.url;
      }
      if (views.size + restoration.size >= 100) throw new Error("Close a page before opening another.");
      workspace.selectedTaskId = task.id;
      showPage(newPage(task.id, url));
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
      if ("summaryModel" in value.patch) {
        taskSummaries.stop(true);
        taskContexts.stop(true);
        taskStarter.stop();
        if (overviewOpen)
          void taskSummaries.refresh(
            workspace,
            preferences.value.summaryModel,
            publish,
          );
      }
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
        metasearch.clear();
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
          detail: `Version ${extension.version}\nPermissions: ${extension.permissions}\n\nThis imports unpacked code. Tern does not verify the package's publisher signature. Extensions can read and change websites; some Chrome APIs and browser integrations remain unsupported.`,
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
    case "openExtension":
      extensionBrowser.open(text(value.id, 100));
      break;
    case "showOverview":
      taskContexts.stop();
      overviewOpen = true;
      focusResumedPage = false;
      void taskSummaries.refresh(
        workspace,
        preferences.value.summaryModel,
        publish,
      );
      break;
    case "openTask":
    case "selectTask": {
      const task = workspace.tasks.find(
        (task) => task.id === text(value.id, 100),
      );
      if (!task) throw new Error("Task not found.");
      if (value.type === "openTask") {
        if (!task.selectedPageId)
          task.selectedPageId =
            workspace.pages.find((page) => page.taskId === task.id)?.id ?? null;
        const pages = workspace.pages.filter(
          (page) => page.taskId === task.id && page.url && !views.has(page.id),
        );
        const unqueued = pages.filter((page) => !restoration.has(page.id));
        if (views.size + restoration.size + unqueued.length > 100)
          throw new Error(
            "This task would exceed 100 live pages. Select it in the sidebar to reopen individual pages.",
          );
        workspace.selectedTaskId = task.id;
        overviewOpen = false;
        restoration.resume(
          task.selectedPageId,
          pages.map((page) => page.id),
        );
        workspaceModel.command({ type: "resume", id: task.id });
      }
      workspace.selectedTaskId = task.id;
      focusResumedPage = value.type === "openTask";
      if (task.selectedPageId && restoration.has(task.selectedPageId))
        restoration.open(task.selectedPageId);
      break;
    }
    case "selectPage": {
      const page = workspace.pages.find(
        (page) => page.id === text(value.id, 100),
      );
      if (!page) throw new Error("Page not found.");
      if (value.selection !== undefined && !["toggle", "range", "addRange"].includes(value.selection))
        throw new Error("Invalid tab selection.");
      pageSelection.select(workspace, page, value.selection);
      const activeId = selectedTask()!.selectedPageId;
      if (activeId && restoration.has(activeId)) restoration.open(activeId);
      const active = selectedPage(); if (active?.search) searches.ensure(active);
      break;
    }
    case "pageSelectionAction": {
      if (!Array.isArray(value.ids) || !value.ids.length || value.ids.length > 100000)
        throw new Error("Select at least one tab.");
      const ids = new Set(value.ids.map(id => text(id, 100)));
      const pages = workspace.pages.filter(page => ids.has(page.id));
      if (pages.length !== ids.size || pages.some(page => page.taskId !== workspace.selectedTaskId))
        throw new Error("Select tabs from the current task.");
      switch (value.action) {
        case "close":
          closePages(pages);
          break;
        case "copyAddresses":
          clipboard.writeText(pages.map(page => page.url).filter(Boolean).join("\n"));
          break;
        case "duplicate": {
          if (views.size + restoration.size + pages.filter(page => page.url).length > 100)
            throw new Error("Close a page before opening more tabs.");
          if (pages.some(page => page.url && !isWebURL(page.url)))
            throw new Error("Unsupported page address.");
          const copies = pages.map(page => {
            const copy = newPage(page.taskId, page.url);
            if (page.search) { copy.search = structuredClone(page.search); copy.title = page.title; searches.ensure(copy); }
            return copy;
          });
          pageSelection.replace(workspace, copies);
          for (const copy of copies) if (copy.url) showPage(copy);
          break;
        }
        case "reload": {
          const missing = pages.filter(page => page.url && !views.has(page.id) && !restoration.has(page.id));
          if (views.size + restoration.size + missing.length > 100)
            throw new Error("Close a page before opening more tabs.");
          if (pages.some(page => views.has(page.id)) && !confirm(
            `Reload ${pages.length} tabs?`,
            "Unsaved website changes may be lost. Reloading does not save or submit the pages.",
            "Reload tabs",
          )) break;
          for (const page of pages) {
            const contents = views.get(page.id)?.webContents;
            if (contents && !errors.has(page.id)) {
              stopFollowingSearch(contents);
              contents.reload();
            } else reopenPage(page);
          }
          break;
        }
        default:
          throw new Error("Invalid tab action.");
      }
      break;
    }
    case "newPage": {
      const task = targetTask(value.taskId);
      if (task) {
        workspace.selectedTaskId = task.id;
        newPage(task.id);
      }
      break;
    }
    case "duplicatePage": {
      const original = targetPage(value.id)!;
      if (views.size + restoration.size >= 100)
        throw new Error("Close a page before opening another.");
      if (original.url && !isWebURL(original.url))
        throw new Error("Unsupported page address.");
      workspace.selectedTaskId = original.taskId;
      const copy = newPage(original.taskId, original.url);
      if (original.search) { copy.search = structuredClone(original.search); copy.title = original.title; searches.ensure(copy); }
      if (copy.url) showPage(copy);
      break;
    }
    case "copyPageAddress": {
      const page = targetPage(value.id)!;
      if (page.url) clipboard.writeText(page.url);
      break;
    }
    case "reopen": {
      const page = targetPage(value.id);
      if (page) reopenPage(page);
      break;
    }
    case "navigate": {
      if (searches.fromAddress(value.address, preferences.value)) break;
      const url = externalShortcut(value.address) ?? addressURL(text(value.address, 8192), preferences.value.searchEngine);
      if (!selectedTask()) throw new Error("Create a task first.");
      const page = !selectedPage() || selectedPage()?.search ? newPage(selectedTask()!.id) : selectedPage()!;
      stopFollowingSearch(views.get(page.id)?.webContents);
      startingSearches.delete(page);
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
      stopFollowingSearch(currentContents());
      if (currentContents()?.navigationHistory.canGoBack()) currentContents()!.navigationHistory.goBack();
      else if (selectedPage()?.sourceSearchId) await searches.command({ type: "returnToSearch", id: selectedPage()!.sourceSearchId! }, preferences.value);
      break;
    case "forward":
      stopFollowingSearch(currentContents());
      currentContents()?.navigationHistory.goForward();
      break;
    case "reload": {
      const page = targetPage(value.id);
      if (page?.search) { metasearch.invalidate(page.search.query); searches.refresh(page, preferences.value); break; }
      const contents = page && views.get(page.id)?.webContents;
      if (
        contents &&
        confirm(
          "Reload this page?",
          "Unsaved website changes may be lost. Reloading does not save or submit the page.",
          "Reload",
        )
      ) {
        stopFollowingSearch(contents);
        contents.reload();
      }
      break;
    }
    case "closePage": {
      const page = targetPage(value.id);
      if (page) closePages([page]);
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
      if (selectedPage()?.search) searches.stop(selectedPage()!.id);
      stopFollowingSearch(currentContents());
      currentContents()?.stop();
      break;
    case "dismissNotice":
      notice = "";
      break;
    default:
      throw new Error("This command is not available yet.");
  }
  if (
    [
      "openTask",
      "selectTask",
      "selectPage",
      "createTask",
      "newPage",
      "navigate",
      "duplicatePage",
      "reopen",
      "searchTask",
      "openFindingSource",
    ].includes(value.type) ||
    (value.type === "pageSelectionAction" && ["duplicate", "reload"].includes(value.action))
  ) {
    overviewOpen = false;
    taskSummaries.stop();
    taskContexts.stop();
    recordActivity();
  }
  searches.prune();
  const activeSearch = selectedPage(); if (!overviewOpen && activeSearch?.search) searches.ensure(activeSearch);
  storage.save(workspace);
  layout();
  publish();
  if (createdTaskId) return { createdTaskId };
}
function trusted(event: IpcMainEvent | IpcMainInvokeEvent) {
  if (
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame?.url !== "tern://app/index.html"
  )
    throw new Error("Untrusted request.");
}
let systemReady = false;
let pendingSystemURLs = process.argv.filter(isWebURL).slice(0, 20);
function openSystemURLs(arguments_: string[]) {
  const urls = arguments_.filter(value => value.length <= 32768 && isWebURL(value)).slice(0, 20);
  if (!systemReady) { pendingSystemURLs.push(...urls); pendingSystemURLs = pendingSystemURLs.slice(0, 20); return; }
  if (!urls.length) return;
  if (views.size + restoration.size + urls.length > 100 || workspace.tasks.length >= 10000) {
    notice = "Close a few pages before opening links from another application."; publish(); return;
  }
  if (overviewOpen || !selectedTask() || selectedTask()?.lifecycle === "Settled")
    workspaceModel.command({type:"createTask", title:"Opened links"});
  overviewOpen = false;
  for (const url of urls) showPage(newPage(selectedTask()!.id, url));
  storage.save(workspace); layout(); publish();
}
async function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  Object.assign(workspace, storage.read());
  preferences.read();
  app.on("second-instance", (_event, argv) => {
    openSystemURLs(argv);
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  await app.whenReady();
  const encryptionAvailable = safeStorage.isEncryptionAvailable() &&
    (process.platform !== "linux" || !["basic_text", "unknown"].includes(safeStorage.getSelectedStorageBackend()));
  const cookieMarker = join(app.getPath("userData"), "encrypted-cookies-v1");
  if (app.isPackaged) {
    cookieSecurity = encryptionAvailable
      ? { cookieStorage: "encrypted", detail: "Website cookies are encrypted using your operating system keyring." }
      : { cookieStorage: "session", detail: "The operating system keyring is unavailable. Website data stays in memory and sign-ins end when Tern closes. Tasks and notes are still saved." };
  } else if (existsSync(cookieMarker)) {
    cookieSecurity = { cookieStorage: "session", detail: "This profile uses encrypted cookies. Development builds use temporary website storage to protect it." };
  }
  updater = new ReleaseUpdater(app.getPath("exe"), app.getVersion(), process.resourcesPath, publish);
  if (app.isPackaged) await updater.initialize();
  guests = session.fromPartition(cookieSecurity.cookieStorage === "session" ? "tern-web-temporary" : WEBSITE_PARTITION);
  cookieStore = new CookieStore(guests);
  extensions = new ExtensionLibrary(guests, app.getPath("userData"));
  permissionController = installWebsitePermissions(guests, {
    policyPath: join(app.getPath("userData"), "site-permissions.json"),
    changed: publish,
    current: currentContents,
    active: contents => contents === currentContents() && pageBounds.visible && window.isFocused(),
    // Native file choosers temporarily take focus from their owning window.
    fileActive: contents => contents === currentContents() && pageBounds.visible,
    prompt: (message, detail) => dialog.showMessageBoxSync(window, {
      type: "question", message, detail,
      buttons: ["Deny", "Allow once"], defaultId: 0, cancelId: 0,
      noLink: true,
    }) === 1,
    notice: message => { notice = message; publish(); },
    extensionClipboard: (contents, permission, origin) =>
      extensionBrowser?.allowsClipboard(contents, permission, origin) ?? false,
  });
  guests.on("will-download", (_event, item) => {
    const download: Snapshot["downloads"][number] = {
      id: randomUUID(),
      name: item.getFilename(),
      status: "Choose a destination",
    };
    downloadItems.set(download.id, item);
    downloads.unshift(download);
    downloads.splice(20);
    for (const id of downloadItems.keys()) if (!downloads.some(download => download.id === id)) downloadItems.delete(id);
    publish();
    item.on("updated", (_event, state) => {
      download.canCancel = item.getState() === "progressing";
      download.canResume = item.canResume();
      download.receivedBytes = item.getReceivedBytes();
      download.totalBytes = item.getTotalBytes();
      download.status =
        state === "interrupted"
          ? "Interrupted"
          : `Downloading ${Math.round(item.getReceivedBytes() / 1024)} KB`;
      publish();
    });
    item.on("done", (_event, state) => {
      downloadDestinations.delete(item.getSavePath());
      download.canCancel = false;
      download.canResume = item.canResume();
      download.saved = state === "completed";
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
  if (cookieSecurity.cookieStorage === "encrypted" && !existsSync(cookieMarker)) {
    await cookieStore.encryptExistingCookies();
    await writeFile(cookieMarker, "1\n", { mode: 0o600 });
  }
  const shellSession = session.fromPartition("tern-shell");
  shellSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  shellSession.setPermissionCheckHandler(() => false);
  shellSession.setDevicePermissionHandler(() => false);
  const uiRoot = resolve(directory, "../ui");
  shellSession.protocol.handle("tern", (request) => {
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
    title: "Tern",
    icon: resolve(app.getAppPath(), "resources/tern-icon.png"),
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
  window.on("focus", layout);
  window.on("blur", layout);
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
  ipcMain.handle("browser:cookies", (event, value) => {
    trusted(event);
    return cookieStore.request(value);
  });
  app.on("will-quit", () => { metasearch.clear(); cookieStore.close(); });
  ipcMain.on("guest:gesture", event => {
    if (event.sender === currentContents() && event.senderFrame === event.sender.mainFrame && pageBounds.visible)
      recentGestures.set(event.sender, Date.now());
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
  ipcMain.on("guest:preconnect", (event, origin: unknown) => {
    if (
      typeof origin !== "string" || origin.length > 2048 ||
      !preferences.value.preloadLinks || !window.isFocused() ||
      overviewOpen || !pageBounds.visible ||
      event.sender !== currentContents() ||
      event.senderFrame !== event.sender.mainFrame ||
      !isWebURL(event.senderFrame.url) || !isWebURL(origin)
    ) return;
    const target = new URL(origin);
    if (target.origin !== origin || target.origin === new URL(event.senderFrame.url).origin) return;
    const origins = preconnectedOrigins.get(event.sender) ?? new Set<string>();
    if (origins.has(origin) || origins.size >= 2) return;
    origins.add(origin);
    preconnectedOrigins.set(event.sender, origins);
    guests.preconnect({ url: origin, numSockets: 1 });
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
        "Quit Tern?",
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
    if (restartForUpdate && updater.restartExecutable) app.relaunch({ execPath: updater.restartExecutable, args: [] });
    quitting = true;
    restoration.stop();
    taskSummaries.stop();
    taskContexts.stop();
    taskStarter.stop();
    const owned = [...views.values()];
    views.clear();
    for (const view of owned)
      if (!view.webContents.isDestroyed()) view.webContents.close();
  });
  app.on("window-all-closed", () => app.quit());
  extensionBrowser = new ExtensionBrowser(guests, window, {
    create(url, active) {
      if (url !== "about:blank" && !isWebURL(url))
        throw new Error("Only HTTP and HTTPS pages can be opened.");
      if (views.size + restoration.size >= 100)
        throw new Error("Close a page before opening another.");
      if (!selectedTask()) {
        const id = randomUUID();
        workspace.tasks.push({
          id,
          title: "Browsing",
          lifecycle: "Active",
          note: "",
          selectedPageId: null,
        });
        workspace.selectedTaskId = id;
      }
      const task = selectedTask()!;
      const previous = task.selectedPageId;
      const page = newPage(task.id, url === "about:blank" ? "" : url);
      if (!active) task.selectedPageId = previous;
      const contents = showPage(page);
      storage.save(workspace);
      return contents;
    },
    select(contents) {
      const page = workspace.pages.find(
        (page) => views.get(page.id)?.webContents === contents,
      );
      if (!page) {
        BrowserWindow.fromWebContents(contents)?.focus();
        return;
      }
      workspace.selectedTaskId = page.taskId;
      selectedTask()!.selectedPageId = page.id;
      storage.save(workspace);
      publish();
      layout();
    },
    close(contents) {
      if (contents.isDestroyed()) return;
      if (
        confirm(
          "Close this page?",
          "An extension requested closing this page. Unsaved website changes may be lost.",
          "Close page",
        )
      )
        contents.close({ waitForBeforeUnload: true });
      // The library removes its registration before asking the host to close.
      if (!contents.isDestroyed()) extensionBrowser.addPage(contents);
    },
    error(message) {
      notice = message;
      publish();
    },
  });
  // Install permission/download handlers and create the window before running
  // any remembered extension background scripts.
  try {
    await extensions.restore();
  } catch (error) {
    notice = String(error);
  }
  await window.loadURL("tern://app/index.html");
  systemReady = true;
  openSystemURLs(pendingSystemURLs); pendingSystemURLs = [];
  if (app.isPackaged && updater.state.configured) {
    const timer = setTimeout(() => void updater.check(), 10000); timer.unref();
    const recurring = setInterval(() => void updater.check(), 4 * 60 * 60 * 1000); recurring.unref();
  }
  void taskSummaries.refresh(
    workspace,
    preferences.value.summaryModel,
    publish,
  );
}
void start().catch((error) => {
  console.error(error);
  app.exit(1);
});
