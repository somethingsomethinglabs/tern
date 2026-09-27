const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("tern", {
  snapshot: () => ipcRenderer.invoke("workspace:read"),
  command: (command) => ipcRenderer.invoke("workspace:command", command),
  layout: (bounds) => ipcRenderer.send("page:layout", bounds),
  subscribe: (listener) => {
    const handler = (_, state) => listener(state);
    ipcRenderer.on("workspace:changed", handler);
    return () => ipcRenderer.removeListener("workspace:changed", handler);
  },
  shortcuts: (listener) => {
    const handler = (_, shortcut) => listener(shortcut);
    ipcRenderer.on("shell:shortcut", handler);
    return () => ipcRenderer.removeListener("shell:shortcut", handler);
  },
});
