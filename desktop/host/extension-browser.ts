import {
  BrowserWindow,
  Menu,
  webContents,
  type Session,
  type WebContents,
  type Input,
} from "electron";
import { ElectronChromeExtensions } from "electron-chrome-extensions";
import { fileURLToPath } from "node:url";
import { installExtensionContexts } from "./extension-contexts.js";

type Pages = {
  create(url: string, active: boolean): WebContents;
  select(contents: WebContents): void;
  close(contents: WebContents): void;
  error(message: string): void;
};

/** Connect extension tabs and windows to Tern without exposing the shell. */
export class ExtensionBrowser {
  private api: ElectronChromeExtensions;
  private popups = new Map<string, BrowserWindow>();
  private windows = new Set<BrowserWindow>();
  private selected?: WebContents;
  private observed = new WeakSet<WebContents>();
  private registeringPage = false;

  constructor(
    private session: Session,
    private window: BrowserWindow,
    private pages: Pages,
  ) {
    this.api = new ElectronChromeExtensions({
      license: "GPL-3.0",
      session,
      createTab: async (details) => {
        const url = details.url || "about:blank";
        if (this.extensionURL(url)) {
          const popup = this.openURL(url, false);
          return [popup.webContents, popup];
        }
        return [pages.create(url, details.active !== false), window];
      },
      selectTab: (contents) => {
        if (!this.registeringPage) pages.select(contents);
      },
      removeTab: (contents) => pages.close(contents),
      createWindow: async (details) => {
        const url = Array.isArray(details.url) ? details.url[0] : details.url;
        if (!url || !this.extensionURL(url))
          throw new Error("Only extension windows are supported.");
        return this.openURL(url, false);
      },
      removeWindow: (target) => target.close(),
      // Optional native messaging and privacy control are not granted silently.
      requestPermissions: async () => false,
    });
    // Use the same adapter preload with development argument logging removed
    // at build time. Do this before loading any installed extensions.
    const filePath = fileURLToPath(
      new URL("./extension-api-preload.cjs", import.meta.url),
    );
    for (const [id, type] of [
      ["crx-mv2-preload", "frame"],
      ["crx-mv3-preload", "service-worker"],
    ] as const) {
      session.unregisterPreloadScript(id);
      session.registerPreloadScript({ id, type, filePath });
    }
    installExtensionContexts(session, (id) =>
      [...this.windows].some(
        (popup) => !popup.isDestroyed() && popup.webContents.id === id,
      ),
    );
    this.api.on(
      "browser-action-popup-created",
      ({
        browserWindow,
        extensionId,
      }: {
        browserWindow?: BrowserWindow;
        extensionId: string;
      }) => {
        if (!browserWindow) return;
        this.windows.add(browserWindow);
        this.popups.set(extensionId, browserWindow);
        browserWindow.once("closed", () => {
          this.windows.delete(browserWindow);
          if (this.popups.get(extensionId) === browserWindow)
            this.popups.delete(extensionId);
        });
      },
    );
    session.extensions.on("extension-unloaded", (_event, extension) => {
      this.popups.get(extension.id)?.close();
      for (const popup of this.windows)
        if (
          !popup.isDestroyed() &&
          popup.webContents
            .getURL()
            .startsWith(`chrome-extension://${extension.id}/`)
        )
          popup.close();
    });
    window.on("closed", () => {
      for (const popup of this.windows)
        if (!popup.isDestroyed()) popup.destroy();
    });
  }

  private extensionURL(value: string) {
    try {
      const url = new URL(value);
      return (
        url.protocol === "chrome-extension:" &&
        !url.username &&
        !url.password &&
        !!this.session.extensions.getExtension(url.hostname)
      );
    } catch {
      return false;
    }
  }

  addPage(contents: WebContents, browserItems: (params: Electron.ContextMenuParams) => Electron.MenuItemConstructorOptions[] = () => []) {
    // The adapter activates every newly observed tab. Registration must not
    // change the user's task/page selection, especially for background links.
    this.registeringPage = true;
    try {
      this.api.addTab(contents, this.window);
      if (this.selected && !this.selected.isDestroyed())
        this.api.selectTab(this.selected);
    } finally {
      this.registeringPage = false;
    }
    if (this.observed.has(contents)) return;
    this.observed.add(contents);
    contents.on("context-menu", (_event, params) => {
      const items = this.api.getContextMenuItems(contents, params);
      const ownItems = browserItems(params);
      if (items.length || ownItems.length) {
        if (items.length && ownItems.length) ownItems.push({ type: "separator" });
        const menu = Menu.buildFromTemplate(ownItems);
        for (const item of items) menu.append(item);
        menu.popup({ window: this.window });
      }
    });
  }

  selectPage(contents?: WebContents) {
    if (contents && !contents.isDestroyed() && contents !== this.selected) {
      this.selected = contents;
      this.api.selectTab(contents);
    }
    if (!contents) this.selected = undefined;
  }

  canOpen(id: string) {
    const manifest = this.session.extensions.getExtension(id)?.manifest;
    return (
      typeof (manifest?.action || manifest?.browser_action)?.default_popup ===
      "string"
    );
  }

  allowsClipboard(
    contents: WebContents | null,
    permission: string,
    origin: string,
  ) {
    if (
      !contents ||
      contents.session !== this.session ||
      !this.extensionURL(origin)
    )
      return false;
    const id = new URL(origin).hostname;
    if (!contents.getURL().startsWith(`chrome-extension://${id}/`))
      return false;
    const required =
      permission === "clipboard-read"
        ? "clipboardRead"
        : permission === "clipboard-sanitized-write"
          ? "clipboardWrite"
          : "";
    return (
      !!required &&
      !!this.session.extensions
        .getExtension(id)
        ?.manifest.permissions?.includes(required)
    );
  }

  open(id: string) {
    const extension = this.session.extensions.getExtension(id);
    const path = (
      extension?.manifest.action || extension?.manifest.browser_action
    )?.default_popup;
    if (!extension || typeof path !== "string")
      throw new Error("This extension has no popup to open.");
    if (!this.selected || this.selected.isDestroyed())
      this.pages.create("about:blank", true);
    const url = new URL(path, `chrome-extension://${id}/`);
    if (url.protocol !== "chrome-extension:" || url.hostname !== id)
      throw new Error("Invalid extension popup address.");
    this.openURL(url.href);
  }

  private openURL(url: string, reuse = true) {
    if (!this.extensionURL(url)) throw new Error("Unknown extension address.");
    const id = new URL(url).hostname;
    const existing = this.popups.get(id);
    if (reuse && existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return existing;
    }
    const popup = new BrowserWindow({
      parent: this.window,
      title: this.session.extensions.getExtension(id)!.name,
      width: 440,
      height: 720,
      useContentSize: true,
      resizable: false,
      maximizable: false,
      minimizable: false,
      fullscreenable: false,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: "#101416",
      webPreferences: {
        session: this.session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    popup.once("ready-to-show", () => {
      if (!popup.isDestroyed()) popup.show();
    });
    this.popups.set(id, popup);
    this.windows.add(popup);
    popup.on("closed", () => {
      this.windows.delete(popup);
      if (this.popups.get(id) === popup) this.popups.delete(id);
    });
    const openWebsite = (value: string) => {
      try {
        this.pages.create(value, true);
      } catch (error) {
        this.pages.error(String(error));
      }
    };
    const guard = (event: Electron.Event, value: string) => {
      if (this.extensionURL(value) && new URL(value).hostname === id) return;
      event.preventDefault();
      if (/^https?:/.test(value)) openWebsite(value);
    };
    popup.webContents.on("will-navigate", guard);
    popup.webContents.on("will-redirect", guard);
    popup.webContents.setWindowOpenHandler(({ url: target }) => {
      if (/^https?:/.test(target)) openWebsite(target);
      return { action: "deny" };
    });
    popup.webContents.on("before-input-event", (event, input) => {
      if (input.type === "keyDown" && input.key === "Escape") {
        event.preventDefault();
        popup.close();
      }
    });
    void popup.loadURL(url).catch((error) => this.pages.error(String(error)));
    return popup;
  }

  handleShortcut(input: Input) {
    if (input.type !== "keyDown") return false;
    if (input.alt && !input.control && !input.meta && !input.shift)
      return false;
    if (
      (input.control || input.meta) &&
      !input.shift &&
      ["l", "t", "f", "w", "r"].includes(input.key.toLowerCase())
    )
      return false;
    const pressed = [
      input.control ? "Ctrl" : "",
      input.alt ? "Alt" : "",
      input.shift ? "Shift" : "",
      input.meta ? "Command" : "",
      input.key.toUpperCase(),
    ]
      .filter(Boolean)
      .join("+");
    for (const extension of this.session.extensions.getAllExtensions()) {
      for (const [name, raw] of Object.entries(
        extension.manifest.commands || {},
      )) {
        const command = raw as {
          suggested_key?: { linux?: string; default?: string };
        };
        const shortcut =
          command.suggested_key?.linux || command.suggested_key?.default;
        if (!shortcut || shortcut.toLowerCase() !== pressed.toLowerCase())
          continue;
        if (name === "_execute_action" || name === "_execute_browser_action")
          this.open(extension.id);
        else
          void this.dispatchCommand(extension.id, name).catch((error) =>
            this.pages.error(String(error)),
          );
        return true;
      }
    }
    return false;
  }

  private async dispatchCommand(id: string, name: string) {
    if (!this.selected || this.selected.isDestroyed()) return;
    const tab =
      this.selected && !this.selected.isDestroyed()
        ? {
            id: this.selected.id,
            windowId: this.window.id,
            url: this.selected.getURL(),
            active: true,
          }
        : undefined;
    // Pinned electron-chrome-extensions 4.9 event channel. Wake MV3 workers first.
    const extension = this.session.extensions.getExtension(id);
    if (extension?.manifest.background?.service_worker) {
      const worker = await this.session.serviceWorkers.startWorkerForScope(
        `chrome-extension://${id}/`,
      );
      worker.send("crx-commands.onCommand", name, tab);
    } else {
      for (const contents of webContents.getAllWebContents())
        if (
          contents.session === this.session &&
          contents.getURL().startsWith(`chrome-extension://${id}/`)
        )
          contents.send("crx-commands.onCommand", name, tab);
    }
  }
}
