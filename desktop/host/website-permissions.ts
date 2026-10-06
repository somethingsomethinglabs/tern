import type { Session, WebContents } from "electron";
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";

export const permissionLabels: Record<string, string> = {
  fileSystem: "Files and folders", media: "Camera and microphone",
  "storage-access": "Embedded sign-in and cookies",
  geolocation: "Location", notifications: "Notifications", "clipboard-read": "Clipboard reading",
};

/** File grants cover only approved paths and expire when the granting page leaves. */
export function installWebsitePermissions(
  session: Session,
  options: {
    policyPath?: string;
    changed?(): void;
    active(contents: WebContents): boolean;
    fileActive?(contents: WebContents): boolean;
    current(): WebContents | undefined;
    prompt(message: string, detail: string): boolean;
    notice(message: string): void;
    extensionClipboard(contents: WebContents | null, permission: string, origin: string): boolean;
  },
) {
  const originOf = (value: string) => {
    try {
      const url = new URL(value);
      if (url.username || url.password) return "";
      if (url.protocol === "https:" ||
          (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
        return url.origin;
    } catch {}
    return "";
  };
  const blocked = new Map<string, Set<string>>();
  if (options.policyPath && existsSync(options.policyPath)) {
    try {
      const raw = JSON.parse(readFileSync(options.policyPath, "utf8"));
      if (!Array.isArray(raw) || raw.length > 1000) throw new Error();
      for (const entry of raw) {
        if (!Array.isArray(entry) || entry.length !== 2 ||
            typeof entry[0] !== "string" || originOf(entry[0]) !== entry[0] ||
            !Array.isArray(entry[1]) || !entry[1].every(name => typeof name === "string" && name in permissionLabels)) throw new Error();
        blocked.set(entry[0], new Set(entry[1]));
      }
    } catch { throw new Error("Site permissions could not be read. Repair the profile before browsing."); }
  }
  const storageKey = (top: string, requesting: string) => `storage-access:${JSON.stringify([top, requesting])}`;
  const grants = new Map<WebContents, Set<string>>();
  const denied = new Map<WebContents, Set<string>>();
  const prompts = new Map<WebContents, number[]>();
  const files = new Map<WebContents, Set<string>>();
  const observed = new WeakSet<WebContents>();
  const documentVersions = new WeakMap<WebContents, number>();
  const fileKey = (origin: string, details: Electron.FilesystemPermissionRequest | Electron.PermissionCheckHandlerHandlerDetails) =>
    JSON.stringify([origin, details.filePath, details.isDirectory, details.fileAccessType]);
  const grantFile = (contents: WebContents, origin: string, details: Electron.FilesystemPermissionRequest) => {
    let grants = files.get(contents);
    if (!grants) {
      grants = new Set(); files.set(contents, grants);
    }
    observe(contents);
    grants.add(fileKey(origin, details));
    if (details.fileAccessType === "writable")
      grants.add(fileKey(origin, { ...details, fileAccessType: "readable" }));
    options.changed?.();
  };
  const observe = (contents: WebContents) => {
    if (!observed.has(contents)) {
      observed.add(contents);
      const clear = () => { documentVersions.set(contents, (documentVersions.get(contents) ?? 0) + 1); files.delete(contents); grants.delete(contents); denied.delete(contents); prompts.delete(contents); options.changed?.(); };
      contents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => {
        if (mainFrame && !inPlace) clear();
      });
      contents.once("destroyed", clear);
    }
  };
  const decide = (contents: WebContents, origin: string, permission: string, key: string, detail: string) => {
    observe(contents);
    if (blocked.get(origin)?.has(permission) || denied.get(contents)?.has(key)) return false;
    const recent = (prompts.get(contents) ?? []).filter(time => Date.now() - time < 60000);
    if (recent.length >= 8) { options.notice("Too many permission requests. Reload the page to try again."); return false; }
    recent.push(Date.now()); prompts.set(contents, recent);
    const documentVersion = documentVersions.get(contents);
    const approved = options.prompt(`${origin} requests permission`, detail);
    const allowed = approved && !contents.isDestroyed() && documentVersions.get(contents) === documentVersion;
    const target = allowed ? grants : denied;
    if (!target.has(contents)) target.set(contents, new Set());
    target.get(contents)!.add(key);
    options.changed?.();
    return allowed;
  };
  const fileDetail = (file: Electron.FilesystemPermissionRequest | Electron.PermissionCheckHandlerHandlerDetails) => {
    if (!file.filePath || typeof file.isDirectory !== "boolean" ||
        !["readable", "writable"].includes(file.fileAccessType || "")) return "";
    return `${file.fileAccessType === "writable" ? "Read and change" : "Read"} ${file.isDirectory ? "the selected folder and its contents" : "the selected file"}:\n${file.filePath}\n\nOnly approve a file or folder you intended to share with this website.`;
  };
  session.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (permission === "clipboard-sanitized-write" ||
        options.extensionClipboard(contents, permission, origin)) return true;
    const requestingOrigin = originOf(origin);
    if (blocked.get(requestingOrigin)?.has(permission)) return false;
    if (permission === "storage-access") {
      if (!contents || contents.isDestroyed() || !requestingOrigin) return false;
      const top = originOf(contents.getURL());
      if (!top || blocked.get(top)?.has(permission) || (details.isMainFrame && top !== requestingOrigin)) return false;
      return grants.get(contents)?.has(storageKey(top, requestingOrigin)) ?? false;
    }
    if (permission !== "fileSystem") {
      if (!contents || contents.isDestroyed() || originOf(contents.getURL()) !== requestingOrigin || !details.isMainFrame) return false;
      const key = permission === "media" ? `media:${details.mediaType}` : permission;
      return grants.get(contents)?.has(key) ?? false;
    }
    if (!details.filePath) return false;
    // Electron 44 calls filesystem checks with null webContents. Match the
    // exact origin/path/type and require the granting document to remain alive.
    for (const [owner, grants] of files) {
      if (!owner.isDestroyed() && (contents ? owner === contents : owner === options.current()) &&
          originOf(owner.getURL()) === originOf(origin) &&
          grants.has(fileKey(originOf(origin), details))) return true;
    }
    // Picker-created grants in Electron 44 also pass through this check, even
    // when Chromium has already granted the native selection internally.
    const owner = contents || options.current();
    const detail = fileDetail(details);
    if (!owner || owner.isDestroyed() || !(options.fileActive ?? options.active)(owner) || !requestingOrigin ||
        requestingOrigin !== originOf(owner.getURL()) || !detail) return false;
    if (!decide(owner, requestingOrigin, "fileSystem", fileKey(requestingOrigin, details), detail)) return false;
    grantFile(owner, requestingOrigin, { ...details, requestingUrl: origin, isMainFrame: false });
    return true;
  });
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    const requesting = details.requestingUrl;
    if (permission === "clipboard-sanitized-write" ||
        options.extensionClipboard(contents, permission, requesting)) {
      callback(true);
      return;
    }
    const origin = originOf(requesting);
    const top = originOf(contents.getURL());
    const storage = permission === "storage-access";
    const eligible = !contents.isDestroyed() && (permission === "fileSystem" ? (options.fileActive ?? options.active)(contents) : options.active(contents)) &&
      !!origin && !!top && (origin === top || (storage && !details.isMainFrame)) &&
      // Chromium reports fileSystem requests as subframes even for the main frame.
      (details.isMainFrame || permission === "fileSystem" || storage);
    let detail = "";
    switch (permission) {
      case "fileSystem": {
        detail = fileDetail(details as Electron.FilesystemPermissionRequest);
        break;
      }
      case "media": {
        const types = (details as Electron.MediaAccessPermissionRequest).mediaTypes;
        if (types?.length && types.every(type => type === "video" || type === "audio"))
          detail = `Use your ${types.map(type => type === "video" ? "camera" : "microphone").join(" and ")}.`;
        break;
      }
      case "storage-access":
        detail = origin === top
          ? "Use this website's existing cookies and sign-in data on this page."
          : `Allow ${origin}, embedded in ${top}, to use its existing cookies and sign-in data here. This can also enable tracking across websites. This approval ends when you leave or reload the hosting page.`;
        break;
      case "geolocation": detail = "Read your current location."; break;
      case "notifications": detail = "Show desktop notifications."; break;
      case "clipboard-read": detail = "Read your clipboard, which may contain private information."; break;
    }
    const types = (details as Electron.MediaAccessPermissionRequest).mediaTypes ?? [];
    const key = permission === "fileSystem" ? fileKey(origin, details as Electron.FilesystemPermissionRequest) : storage ? storageKey(top, origin) : permission;
    const already = permission === "media" ? types.length > 0 && types.every(type => grants.get(contents)?.has(`media:${type}`)) : grants.get(contents)?.has(key);
    const allowed = eligible && !!detail && !blocked.get(origin)?.has(permission) && !(storage && blocked.get(top)?.has(permission)) &&
      (!!already || decide(contents, origin, permission, key, detail));
    if (allowed && permission === "media")
      for (const type of types) grants.get(contents)!.add(`media:${type}`);
    if (allowed && permission === "fileSystem")
      grantFile(contents, origin, details as Electron.FilesystemPermissionRequest);
    callback(allowed);
    if (!allowed) options.notice(`${origin || "This website"} requested ${permission}. Permission denied.`);
  });
  // Never let a website override Chromium's sensitive-directory restrictions.
  session.on("file-system-access-restricted", (_event, _details, callback) => callback("deny"));
  session.setDevicePermissionHandler(() => false);
  session.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  return {
    snapshot(contents: WebContents | undefined) {
      if (!contents || contents.isDestroyed()) return undefined;
      let origin: string;
      try { origin = new URL(contents.getURL()).origin; } catch { return undefined; }
      if (!/^https?:/.test(origin)) return undefined;
      return { origin, secure: origin.startsWith("https:"),
        files: (files.get(contents)?.size ?? 0),
        permissions: Object.entries(permissionLabels).map(([name, label]) => ({ name, label,
          state: blocked.get(origin)?.has(name) ? "blocked" as const :
            (name === "fileSystem" ? files.get(contents)?.size : name === "media" ?
              grants.get(contents)?.has("media") : name === "storage-access" ?
              [...(grants.get(contents) ?? [])].some(key => key.startsWith("storage-access:")) : grants.get(contents)?.has(name)) ? "allowed" as const : "ask" as const,
        })),
      };
    },
    setPolicy(origin: string, permission: string, policy: string) {
      if (originOf(origin) !== origin || !(permission in permissionLabels) || !["ask", "block"].includes(policy))
        throw new Error("Invalid site permission.");
      const next = new Map([...blocked].map(([origin, values]) => [origin, new Set(values)]));
      const values = next.get(origin) ?? new Set<string>();
      if (policy === "block") values.add(permission); else values.delete(permission);
      if (values.size) next.set(origin, values); else next.delete(origin);
      if (next.size > 1000) throw new Error("Too many site permission rules.");
      if (options.policyPath) {
        mkdirSync(dirname(options.policyPath), { recursive: true, mode: 0o700 });
        writeFileSync(options.policyPath + ".tmp", JSON.stringify([...next].map(([origin, values]) => [origin, [...values]])), { mode: 0o600 });
        renameSync(options.policyPath + ".tmp", options.policyPath);
      }
      blocked.clear(); for (const [origin, values] of next) blocked.set(origin, values);
      for (const owner of observedOwners()) { if (originOf(owner.getURL()) === origin) { files.delete(owner); grants.delete(owner); denied.delete(owner); } }
      options.changed?.();
    },
    revoke(origin: string) {
      for (const owner of observedOwners()) {
        if (!owner.isDestroyed() && originOf(owner.getURL()) === origin) { files.delete(owner); grants.delete(owner); denied.delete(owner); }
      }
      options.changed?.();
    },
  };
  function observedOwners() { return new Set([...files.keys(), ...grants.keys(), ...denied.keys()]); }
}
