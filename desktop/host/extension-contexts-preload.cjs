const { contextBridge, ipcRenderer } = require("electron");
// Chromium does not classify Electron windows as extension popups. Supply only
// this extension's contexts so vaults can observe their own open/closed UI.
if (
  process.type === "service-worker" ||
  location.protocol === "chrome-extension:"
) {
  contextBridge.exposeInMainWorld("trailrestExtensionContexts", {
    get: (filter) => ipcRenderer.invoke("extension:contexts", filter),
  });
  contextBridge.executeInMainWorld({
    func: () => {
      const get = globalThis.trailrestExtensionContexts.get;
      chrome.runtime.getContexts = (filter = {}, callback) => {
        const result = get(filter);
        if (typeof callback === "function") result.then(callback);
        return result;
      };
      delete globalThis.trailrestExtensionContexts;
    },
  });
}
