const { app, BrowserWindow } = require("electron");
app.setPath("userData", process.argv.at(-1));
app.whenReady().then(() => {
  const window = new BrowserWindow({ width: 1280, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.loadFile(process.argv.at(-2));
});
app.on("window-all-closed", () => app.quit());
