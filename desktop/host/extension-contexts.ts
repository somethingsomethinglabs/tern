import {
  ipcMain,
  webContents,
  BrowserWindow,
  type Session,
  type ServiceWorkerMain,
} from "electron";
import { fileURLToPath } from "node:url";

export function installExtensionContexts(
  session: Session,
  isPopup: (contentsId: number) => boolean,
) {
  const extensionId = (url: string) => {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "chrome-extension:" ||
      !session.extensions.getExtension(parsed.hostname)
    )
      throw new Error("An installed extension is required.");
    return parsed.hostname;
  };
  const getContexts = (id: string, filter: Record<string, unknown> = {}) => {
    if (!filter || typeof filter !== "object" || Array.isArray(filter))
      throw new Error("Invalid context filter.");
    const origin = `chrome-extension://${id}`;
    const contexts: Record<string, unknown>[] = webContents
      .getAllWebContents()
      .filter(
        (contents) =>
          contents.session === session &&
          contents.getURL().startsWith(origin + "/"),
      )
      .map((contents) => ({
        contextType: isPopup(contents.id)
          ? "POPUP"
          : contents.getType() === "backgroundPage"
            ? "BACKGROUND"
            : "TAB",
        contextId: `${id}:frame:${contents.id}`,
        documentId: `${id}:document:${contents.mainFrame.frameTreeNodeId}`,
        documentUrl: contents.getURL(),
        documentOrigin: origin,
        frameId: 0,
        tabId: isPopup(contents.id) ? -1 : contents.id,
        windowId: BrowserWindow.fromWebContents(contents)?.id ?? -1,
        incognito: false,
      }));
    for (const [version, worker] of Object.entries(
      session.serviceWorkers.getAllRunning(),
    ))
      if (worker.scope === origin + "/")
        contexts.push({
          contextType: "BACKGROUND",
          contextId: `${id}:worker:${version}`,
          frameId: -1,
          tabId: -1,
          windowId: -1,
          incognito: false,
        });
    const fields: Record<string, string> = {
      contextTypes: "contextType",
      contextIds: "contextId",
      documentIds: "documentId",
      documentUrls: "documentUrl",
      documentOrigins: "documentOrigin",
      frameIds: "frameId",
      tabIds: "tabId",
      windowIds: "windowId",
    };
    return contexts.filter(
      (context) =>
        Object.entries(fields).every(
          ([key, field]) =>
            filter[key] === undefined ||
            (Array.isArray(filter[key]) &&
              filter[key].includes(context[field])),
        ) &&
        (filter.incognito === undefined ||
          filter.incognito === context.incognito),
    );
  };
  ipcMain.handle("extension:contexts", (event, filter) => {
    if (event.sender.session !== session || !event.senderFrame)
      throw new Error("Wrong extension session.");
    return getContexts(extensionId(event.senderFrame.url), filter);
  });
  const observed = new WeakSet<ServiceWorkerMain>();
  session.serviceWorkers.on("running-status-changed", ({ versionId }) => {
    const worker = session.serviceWorkers.getWorkerFromVersionID(versionId);
    if (
      !worker ||
      observed.has(worker) ||
      !worker.scope.startsWith("chrome-extension://")
    )
      return;
    observed.add(worker);
    worker.ipc.handle("extension:contexts", (_event, filter) =>
      getContexts(extensionId(worker.scope), filter),
    );
  });
  const filePath = fileURLToPath(
    new URL("./extension-contexts-preload.cjs", import.meta.url),
  );
  session.registerPreloadScript({ type: "frame", filePath });
  session.registerPreloadScript({ type: "service-worker", filePath });
}
