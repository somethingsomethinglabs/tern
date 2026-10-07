import { app, ipcMain, type IpcMainInvokeEvent, type Session, type WebContents } from "electron";
import { fileURLToPath } from "node:url";
import type { StoreExtensions } from "./store-extensions.js";

export const STORE_ORIGIN = "https://chromewebstore.google.com";
export function isStoreURL(value: string) {
  try { const url = new URL(value); return url.origin === STORE_ORIGIN && !url.username && !url.password; }
  catch { return false; }
}
export function trustedStoreSender(event: IpcMainInvokeEvent, session: Session) {
  return event.sender.session === session && !!event.senderFrame &&
    event.senderFrame === event.sender.mainFrame && isStoreURL(event.senderFrame.url);
}

// Use the upstream page bridge only. Tern supplies every host operation; the
// upstream installer, updater and permissive IPC handlers are never initialized.
export function installChromeWebStore(session: Session, library: StoreExtensions, options: {
  selected(contents: WebContents): boolean;
  confirmRemoval(name: string): Promise<boolean>;
}) {
  const handle = (channel: string, callback: (event: IpcMainInvokeEvent, ...args: any[]) => any) => {
    ipcMain.handle(channel, (event, ...args) => {
      if (!trustedStoreSender(event, session)) throw new Error("Store operations require the Chrome Web Store top-level page.");
      return callback(event, ...args);
    });
  };
  const active = (event: IpcMainInvokeEvent) => {
    if (!options.selected(event.sender)) throw new Error("Select the store page before changing extensions.");
  };
  const idValue = (id: unknown): string => {
    if (typeof id !== "string" || !/^[a-p]{32}$/.test(id)) throw new Error("Invalid extension ID.");
    return id;
  };
  const info = (id: string) => {
    const entry = library.list().find(entry => entry.id === id);
    const extension = session.extensions.getExtension(id);
    if (!entry) return undefined;
    return { id, name: entry.name, shortName: entry.name, version: entry.version,
      enabled: entry.enabled !== false && !!extension, installType: "normal", type: "extension",
      mayDisable: true, isApp: false, description: extension?.manifest.description ?? "",
      permissions: extension?.manifest.permissions ?? [], hostPermissions: extension?.manifest.host_permissions ?? [], icons: [] };
  };
  const installing = new Set<string>();
  handle("chromeWebstore.beginInstall", async (event, details) => {
    let id = "";
    try {
      active(event); id = idValue(details?.id);
      if (installing.has(id)) return { result: "install_in_progress" };
      if (library.has(id) || session.extensions.getExtension(id)) return { result: "already_installed" };
      installing.add(id);
      let navigated = false;
      const navigation = (_event: unknown, _url: string, _inPlace: boolean, mainFrame: boolean) => {
        if (mainFrame) navigated = true;
      };
      event.sender.on("did-start-navigation", navigation);
      let installed: boolean;
      try {
        installed = await library.install(id, () => !navigated && trustedStoreSender(event, session) && options.selected(event.sender));
      } finally { event.sender.removeListener("did-start-navigation", navigation); }
      if (!installed) return { result: "user_cancelled" };
      if (trustedStoreSender(event, session)) event.senderFrame!.send("chrome.management.onInstalled", info(id));
      return { result: "success" };
    } catch (error) { return { result: "install_error", message: error instanceof Error ? error.message : String(error) }; }
    finally { if (id) installing.delete(id); }
  });
  handle("chromeWebstore.completeInstall", (_event, id) => library.has(idValue(id)) ? "success" : "install_error");
  handle("chromeWebstore.getExtensionStatus", (_event, id, json) => {
    idValue(id);
    const entry = library.list().find(entry => entry.id === id);
    if (entry) return entry.enabled === false ? "disabled" : session.extensions.getExtension(id) ? "enabled" : "corrupted";
    if (session.extensions.getExtension(id)) return "enabled";
    if (typeof json === "string" && json.length < 1024 * 1024) {
      try {
        const manifest = JSON.parse(json);
        if (manifest.manifest_version !== 3) return "deprecated_manifest_version";
        if (manifest.app || manifest.theme || manifest.permissions?.includes("nativeMessaging")) return "blocked_by_policy";
      } catch { return "corrupted"; }
    }
    return "installable";
  });
  handle("chromeWebstore.getFullChromeVersion", () => ({ version_number: process.versions.chrome, app_name: app.getName() }));
  handle("chromeWebstore.getMV2DeprecationStatus", () => "soft_disable");
  handle("chromeWebstore.getWebGLStatus", () => "webgl_allowed");
  handle("chromeWebstore.getBrowserLogin", () => "");
  handle("chromeWebstore.getStoreLogin", () => "");
  handle("chromeWebstore.getReferrerChain", () => "EgIIAA==");
  handle("chromeWebstore.isInIncognitoMode", () => false);
  handle("chromeWebstore.isPendingCustodianApproval", () => false);
  handle("chromeWebstore.getIsLauncherEnabled", () => false);
  handle("chromeWebstore.enableAppLauncher", () => false);
  handle("chromeWebstore.setStoreLogin", () => false);
  handle("chromeWebstore.install", () => "unsupported_extension_type");
  handle("chrome.management.getAll", () => library.list().map(entry => info(entry.id)));
  handle("chrome.management.setEnabled", async (event, id, enabled) => {
    active(event); idValue(id);
    if (typeof enabled !== "boolean") throw new Error("Invalid extension state.");
    await library.setEnabled(id, enabled); return true;
  });
  handle("chrome.management.uninstall", async (event, id) => {
    active(event); idValue(id);
    const entry = library.list().find(entry => entry.id === id);
    if (!entry) return "unknown_error";
    if (!await options.confirmRemoval(entry.name)) return "user_cancelled";
    if (!trustedStoreSender(event, session)) return "user_cancelled";
    await library.remove(id);
    event.senderFrame!.send("chrome.management.onUninstalled", id);
    return "success";
  });
  session.registerPreloadScript({ id: "tern-chrome-web-store", type: "frame",
    filePath: fileURLToPath(new URL("./chrome-web-store-preload.cjs", import.meta.url)) });
}
