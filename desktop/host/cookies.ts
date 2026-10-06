import { createHash } from "node:crypto";
import { WebContentsView, type Session } from "electron";
import type { BrowserCookie, CookieDraft } from "@tern/core/contracts";

type StoredCookie = {
  name: string; value: string; domain: string; path: string;
  secure: boolean; httpOnly: boolean; expires: number; session: boolean;
  size: number; sameSite?: "None" | "Lax" | "Strict";
  priority: string; sourceScheme: string; sourcePort: number;
  partitionKey?: { topLevelSite: string; hasCrossSiteAncestor: boolean };
  partitionKeyOpaque?: boolean;
};

function identity(cookie: StoredCookie) {
  return createHash("sha256").update(JSON.stringify([
    cookie.domain, cookie.path, cookie.name,
    cookie.partitionKey?.topLevelSite ?? "",
    cookie.partitionKey?.hasCrossSiteAncestor ?? false,
    cookie.partitionKeyOpaque ?? false,
    cookie.sourceScheme, cookie.sourcePort,
  ])).digest("hex");
}

function draft(raw: unknown): CookieDraft {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid cookie.");
  const cookie = raw as CookieDraft;
  if (typeof cookie.name !== "string" || cookie.name.length > 4096 ||
      /[\s\x00-\x1f\x7f()<>@,;:\\"/\[\]?={}]/.test(cookie.name) ||
      typeof cookie.value !== "string" || cookie.value.length > 4096 || /[\x00-\x1f\x7f;]/.test(cookie.value) ||
      typeof cookie.domain !== "string" || !cookie.domain || cookie.domain.length > 253 ||
      typeof cookie.path !== "string" || !cookie.path.startsWith("/") || cookie.path.length > 4096 || /[\x00-\x1f\x7f;]/.test(cookie.path) ||
      typeof cookie.secure !== "boolean" || typeof cookie.httpOnly !== "boolean" ||
      !["unspecified", "None", "Lax", "Strict"].includes(cookie.sameSite) ||
      (cookie.expires !== null && (typeof cookie.expires !== "number" || !Number.isFinite(cookie.expires) ||
        cookie.expires <= Date.now() / 1000 || cookie.expires > 253402300799)))
    throw new Error("Check the cookie fields and choose a future expiry date.");
  const domain = cookie.domain.toLowerCase();
  const host = domain.replace(/^\./, "");
  try {
    const url = new URL(`https://${host}/`);
    if (url.hostname !== host || url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error();
  } catch { throw new Error("Enter a hostname, such as example.com, without a URL or port."); }
  if (cookie.sameSite === "None" && !cookie.secure) throw new Error("SameSite=None requires Secure.");
  return { name: cookie.name, value: cookie.value, domain, path: cookie.path,
    secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite, expires: cookie.expires };
}

// A separate hidden target keeps cookie operations independent of the selected
// page and its DevTools. It uses only the existing website session. CDP retains
// partition keys, which Electron's Cookies API does not expose.
export class CookieStore {
  private view?: WebContentsView;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private session: Session) {}

  encryptExistingCookies(): Promise<void> {
    return this.enqueue(async () => {
      // Rewriting each cookie through Chromium encrypts existing plaintext rows
      // without dropping partition keys, expiry or security attributes.
      for (const cookie of await this.all()) {
        if (cookie.partitionKeyOpaque) throw new Error("An opaque cookie partition needs clearing before encryption migration.");
        await this.write(this.present(cookie), cookie);
      }
      await this.session.cookies.flushStore();
    });
  }

  close() {
    if (this.view && !this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = undefined;
  }

  request(raw: unknown): Promise<BrowserCookie[]> {
    return this.enqueue(() => this.execute(raw));
  }

  clearSite(origin: string): Promise<void> {
    return this.enqueue(async () => {
      // Use Chromium's public-suffix rules rather than guessing a site's root
      // from hostname labels. clearData handles the site's first-party cookies,
      // but does not clear cookies stored by embeds in that site's partition.
      const { schemefulSite } = await this.protocol("Network.fetchSchemefulSite", { origin });
      const embedded = (await this.all()).filter((cookie) => cookie.partitionKey?.topLevelSite === schemefulSite);
      await this.session.clearData({
        dataTypes: ["cookies"], origins: [origin], originMatchingMode: "third-parties-included",
      });
      for (const cookie of embedded) await this.write(this.present(cookie), cookie, true);
      await this.session.cookies.flushStore();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.queue.then(operation);
    this.queue = task.catch(() => {});
    return task;
  }

  private async protocol(method: string, params?: object) {
    if (!this.view || this.view.webContents.isDestroyed()) {
      this.view = new WebContentsView({ webPreferences: {
        session: this.session, sandbox: true, contextIsolation: true, nodeIntegration: false,
      } });
      await this.view.webContents.loadURL("about:blank");
    }
    const debuggerAPI = this.view.webContents.debugger;
    if (!debuggerAPI.isAttached()) debuggerAPI.attach("1.3");
    return debuggerAPI.sendCommand(method, params);
  }

  private async all(): Promise<StoredCookie[]> {
    // Storage.getCookies without a browserContextId reads Electron's default
    // context, even when the target belongs to a custom persistent session.
    return (await this.protocol("Network.getAllCookies")).cookies;
  }

  private async write(cookie: CookieDraft, original?: StoredCookie, deleting = false) {
    const result = await this.protocol("Network.setCookie", {
      name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
      secure: cookie.secure, httpOnly: cookie.httpOnly,
      ...(cookie.sameSite !== "unspecified" ? { sameSite: cookie.sameSite } : {}),
      ...(deleting ? { expires: 1 } : cookie.expires !== null ? { expires: cookie.expires } : {}),
      ...(original ? { priority: original.priority, sourceScheme: original.sourceScheme,
        sourcePort: original.sourcePort, partitionKey: original.partitionKey } : {
        url: `${cookie.secure ? "https" : "http"}://${cookie.domain.replace(/^\./, "")}${cookie.path}`,
      }),
    });
    if (result.success === false) throw new Error("Chromium rejected this cookie. Check its domain, size and security attributes.");
  }

  private present(cookie: StoredCookie): BrowserCookie {
    return { id: identity(cookie), name: cookie.name, value: cookie.value, domain: cookie.domain,
      path: cookie.path, secure: cookie.secure, httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite ?? "unspecified", expires: cookie.session ? null : cookie.expires,
      size: cookie.size, partitionSite: cookie.partitionKey?.topLevelSite,
      readOnly: !!cookie.partitionKeyOpaque };
  }

  private async execute(raw: unknown): Promise<BrowserCookie[]> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid cookie request.");
    const request = raw as { type?: string; cookie?: unknown; id?: unknown; domain?: unknown };
    if (!["list", "save", "delete", "deleteDomain", "deleteAll"].includes(request.type ?? ""))
      throw new Error("Unknown cookie action.");
    const cookies = await this.all();
    if (request.type === "save") {
      const cookie = draft(request.cookie);
      let original: StoredCookie | undefined;
      if (request.id !== undefined) {
        if (typeof request.id !== "string") throw new Error("Invalid cookie identity.");
        original = cookies.find((cookie) => identity(cookie) === request.id);
        if (!original) throw new Error("This cookie has changed or expired. Refresh the list.");
        if (original.partitionKeyOpaque) throw new Error("This cookie has an opaque partition and cannot be edited individually.");
        if (original.name !== cookie.name || original.domain !== cookie.domain || original.path !== cookie.path)
          throw new Error("Create a new cookie to change its name, domain or path.");
      } else if (cookies.some((stored) => !stored.partitionKey && !stored.partitionKeyOpaque &&
        stored.domain === cookie.domain && stored.path === cookie.path && stored.name === cookie.name)) {
        throw new Error("This cookie already exists. Edit it from the list.");
      }
      await this.write(cookie, original);
    } else if (request.type === "delete" || request.type === "deleteDomain") {
      if (request.type === "delete" ? typeof request.id !== "string" : typeof request.domain !== "string")
        throw new Error("Invalid cookie selection.");
      const selected = cookies.filter((cookie) => request.type === "delete"
        ? identity(cookie) === request.id : cookie.domain.replace(/^\./, "") === request.domain);
      if (selected.some((cookie) => cookie.partitionKeyOpaque))
        throw new Error("This selection contains an opaque partition. Use Delete all cookies to clear it.");
      for (const cookie of selected) {
        // Expiring the exact cookie preserves domain/path/partition identity.
        // URL/name removal can also remove a same-name cookie at another path.
        await this.write(this.present(cookie), cookie, true);
      }
    } else if (request.type === "deleteAll") {
      await this.protocol("Network.clearBrowserCookies");
    }
    if (request.type !== "list") await this.session.cookies.flushStore();
    return (await this.all()).map((cookie) => this.present(cookie)).sort((a, b) =>
      a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  }
}
