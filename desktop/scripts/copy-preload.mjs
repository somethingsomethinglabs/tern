import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
await copyFile("host/preload.cjs", "dist/host/preload.cjs");

await writeFile(
  "dist/host/page-preload.cjs",
  (await readFile("host/link-preloading.cjs", "utf8")) + "\n" +
    (await readFile("host/page-preload.cjs", "utf8")),
);
await copyFile(
  "host/extension-contexts-preload.cjs",
  "dist/host/extension-contexts-preload.cjs",
);

// The pinned adapter publishes a development preload that logs API arguments
// and results. Keep those values out of extension consoles in this browser.
const require = createRequire(import.meta.url);
const adapter = await readFile(
  require.resolve("electron-chrome-extensions/preload"),
  "utf8",
);
const logging = /\s*if \(true\) \{\s*console\.log\([^;]+;\s*\}/g;
if ([...adapter.matchAll(logging)].length !== 3)
  throw new Error("Review extension preload logging after dependency changes.");
await writeFile(
  "dist/host/extension-api-preload.cjs",
  "// electron-chrome-extensions 4.9.0; API argument logging removed by Tern.\n" +
    adapter.replace(logging, ""),
);

// Only use the pinned package's renderer bridge. All installation and IPC
// authorization lives in Tern. Review these edits when upgrading the package.
const store = await readFile(require.resolve("electron-chrome-web-store/preload"), "utf8");
if (createHash("sha256").update(store).digest("hex") !== "46dc49be10c911cce297de9d1e706bf251e374220b0a9c71d198a1eae0bb78ea")
  throw new Error("Review Chrome Web Store preload after dependency changes.");
const storeBridge = store
  .replace('location.href.startsWith("https://chromewebstore.google.com")',
    'location.origin === "https://chromewebstore.google.com" && window === window.top')
  .replace('var DEBUG = true;', 'var DEBUG = false;')
  .replace('document.querySelectorAll("span")', 'document.querySelectorAll("button span")')
  .replace('node.innerText.includes("Chrome")', '/^(Add to|Remove from|Added to) Chrome$/.test(node.innerText.trim())')
  .replace(/const setExtensionError = \(message\) => \{[\s\S]*?\n    \};/, `const setExtensionError = (message) => {
      import_electron.contextBridge.executeInMainWorld({ func: (value) => {
        chrome.extension ||= {};
        chrome.extension.lastError = value ? { message: value } : null;
      }, args: [message] });
    };`)
  .replace(/import_electron\.webFrame\.executeJavaScript\(\s*`\(\$\{function\(userAgent2\) \{[\s\S]*?\n    \);/,
    'import_electron.contextBridge.executeInMainWorld({ func: (value) => Object.defineProperty(navigator, "userAgent", { value }), args: [userAgent] });')
  .replace(/import_electron\.webFrame\.executeJavaScript\(`\s*\(function \(\) \{[\s\S]*?\n  `\);/, `import_electron.contextBridge.executeInMainWorld({ func: () => {
    chrome.webstorePrivate = globalThis.electronWebstore;
    chrome.runtime ||= {}; Object.assign(chrome.runtime, globalThis.electronRuntime);
    chrome.management ||= {}; Object.assign(chrome.management, globalThis.electronManagement);
  } });`)
  .replace('const management = {', 'const listeners = new Map(); const management = {')
  .replaceAll('import_electron.ipcRenderer.on("chrome.management.onInstalled", callback);',
    'const listener = (_event, info) => callback(info); listeners.set(callback, listener); import_electron.ipcRenderer.on("chrome.management.onInstalled", listener);')
  .replaceAll('import_electron.ipcRenderer.removeListener("chrome.management.onInstalled", callback);',
    'const listener = listeners.get(callback); if (listener) import_electron.ipcRenderer.removeListener("chrome.management.onInstalled", listener); listeners.delete(callback);')
  .replaceAll('import_electron.ipcRenderer.on("chrome.management.onUninstalled", callback);',
    'const listener = (_event, id) => callback(id); listeners.set(callback, listener); import_electron.ipcRenderer.on("chrome.management.onUninstalled", listener);')
  .replaceAll('import_electron.ipcRenderer.removeListener("chrome.management.onUninstalled", callback);',
    'const listener = listeners.get(callback); if (listener) import_electron.ipcRenderer.removeListener("chrome.management.onUninstalled", listener); listeners.delete(callback);');
if (storeBridge.includes('webFrame.executeJavaScript') || storeBridge.includes('var DEBUG = true;'))
  throw new Error("Store bridge must use main-world functions and disable development logging.");
await writeFile("dist/host/chrome-web-store-preload.cjs", storeBridge);
