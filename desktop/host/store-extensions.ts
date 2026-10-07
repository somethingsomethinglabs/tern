import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { Session } from "electron";
import type { Snapshot } from "@tern/core/contracts";
import { chromeStorePackage, PACKAGE_LIMIT, prepareExtensionPackage } from "./extension-packages.js";
import { extensionKeyId, verifyStoreCrx } from "./crx-verification.js";

type Manifest = Record<string, any>;
type RecordEntry = {
  id: string; name: string; version: string; path: string; key: string;
  enabled: boolean; permissions: string[]; source: "chrome-web-store";
};
export type StoreConsent = { id: string; name: string; version: string; permissions: string[]; update: boolean };
type Options = {
  fetch(url: string, options: RequestInit): Promise<Response>;
  consent(details: StoreConsent): Promise<boolean>;
  changed(): void;
  chromeVersion: string;
};
export function manifestPermissions(manifest: Manifest) {
  return [...new Set([
    ...(manifest.permissions ?? []), ...(manifest.host_permissions ?? []),
    ...(manifest.content_scripts ?? []).flatMap((script: any) => script.matches ?? []),
  ])].sort() as string[];
}
function validateManifest(manifest: Manifest) {
  if (!manifest || manifest.manifest_version !== 3 || manifest.app || manifest.theme)
    throw new Error("Only Manifest V3 browser extensions can be installed from the store.");
  if (typeof manifest.name !== "string" || !manifest.name || !validVersion(manifest.version))
    throw new Error("Invalid store extension manifest.");
  for (const property of ["permissions", "host_permissions", "optional_permissions", "optional_host_permissions"])
    if (manifest[property] !== undefined && (!Array.isArray(manifest[property]) ||
        manifest[property].length > 1000 || !manifest[property].every((value: unknown) => typeof value === "string" && value.length <= 2048)))
      throw new Error("Invalid extension permissions.");
  if (manifest.content_scripts !== undefined && (!Array.isArray(manifest.content_scripts) ||
      manifest.content_scripts.length > 1000 || !manifest.content_scripts.every((script: any) =>
        script && Array.isArray(script.matches) && script.matches.length <= 1000 &&
        script.matches.every((value: unknown) => typeof value === "string" && value.length <= 2048))))
    throw new Error("Invalid extension website access.");
  if (manifest.permissions?.includes("nativeMessaging"))
    throw new Error("Extensions requiring native messaging are not supported in Tern.");
}
function validVersion(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(value) &&
    value.split(".").every(part => Number(part) <= 65535);
}
export function newerVersion(next: string, previous: string) {
  if (!validVersion(next) || !validVersion(previous)) throw new Error("Invalid extension version.");
  const a = next.split(".").map(Number), b = previous.split(".").map(Number);
  for (let i = 0; i < 4; i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return false;
}

// Own the whole store lifecycle behind install-by-ID. The store page supplies
// identity only; consent always describes the downloaded, verified manifest.
export class StoreExtensions {
  private entries: RecordEntry[] = [];
  private errors = new Map<string, string>();
  private statuses = new Map<string, string>();
  private writable = true;
  private queue: Promise<unknown> = Promise.resolve();
  private root: string;
  private registry: string;
  constructor(private session: Session, private profile: string, private options: Options,
    private verifyPackage: typeof verifyStoreCrx = verifyStoreCrx) {
    this.root = join(profile, "store-extensions");
    this.registry = join(profile, "store-extensions.json");
  }
  list(): Snapshot["extensions"] {
    return this.entries.map(({ id, name, version, path, enabled }) => ({ id, name, version, path, enabled, error: this.errors.get(id) ?? "",
      updateStatus: this.statuses.get(id) ?? "", store: true }));
  }
  has(id: string) { return this.entries.some(entry => entry.id === id); }
  private serial<T>(work: () => Promise<T>) {
    const result = this.queue.then(work); this.queue = result.catch(() => {}); return result;
  }
  private save(entries: RecordEntry[]) {
    if (!this.writable) throw new Error("The saved store extension list needs repair before it can be changed.");
    mkdirSync(this.profile, { recursive: true });
    writeFileSync(this.registry + ".tmp", JSON.stringify({ format: 1, entries }), { mode: 0o600 });
    renameSync(this.registry + ".tmp", this.registry);
  }
  async restore() {
    if (!existsSync(this.registry)) return;
    try {
      const data = JSON.parse(readFileSync(this.registry, "utf8"));
      if (data.format !== 1 || !Array.isArray(data.entries) || data.entries.length > 50 ||
          !data.entries.every((entry: RecordEntry) => entry && /^[a-p]{32}$/.test(entry.id) &&
            typeof entry.name === "string" && validVersion(entry.version) && typeof entry.key === "string" &&
            entry.key.length < 16384 && extensionKeyId(Buffer.from(entry.key, "base64")) === entry.id &&
            entry.source === "chrome-web-store" && typeof entry.enabled === "boolean" &&
            typeof entry.path === "string" && resolve(entry.path).startsWith(resolve(this.root, entry.id) + sep) &&
            Array.isArray(entry.permissions) && entry.permissions.length <= 10000 &&
            entry.permissions.every(value => typeof value === "string" && value.length <= 2048)) ||
          new Set(data.entries.map((entry: RecordEntry) => entry.id)).size !== data.entries.length)
        throw new Error("Invalid registry");
      this.entries = data.entries;
    } catch {
      this.writable = false;
      throw new Error("The saved store extension list could not be read. It has been preserved.");
    }
    for (const entry of this.entries) if (entry.enabled) {
      try { await this.load(entry); } catch (error) { this.errors.set(entry.id, String(error)); }
    }
  }
  private async load(entry: RecordEntry) {
    if (this.session.extensions.getExtension(entry.id)) throw new Error("This extension is already loaded from another source.");
    const manifest = JSON.parse(await readFile(join(entry.path, "manifest.json"), "utf8"));
    validateManifest(manifest);
    if (manifest.key !== entry.key || manifest.version !== entry.version ||
        manifestPermissions(manifest).some(permission => !entry.permissions.includes(permission)))
      throw new Error("The installed extension differs from its approved registration.");
    const extension = await this.session.extensions.loadExtension(entry.path, { allowFileAccess: false });
    if (extension.id !== entry.id) {
      this.session.extensions.removeExtension(extension.id);
      throw new Error("The loaded extension identity does not match its signature.");
    }
  }
  install(id: string, authorized: () => boolean = () => true) { return this.serial(() => this.installNow(id, false, true, authorized)); }
  private async download(id: string) {
    const source = chromeStorePackage(id, this.options.chromeVersion);
    const response = await this.options.fetch(source.url, { credentials: "omit", signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error("The Chrome Web Store did not provide this extension package.");
    const reader = response.body.getReader();
    const chunks: Buffer[] = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > PACKAGE_LIMIT) throw new Error("Extension package exceeds 64 MB.");
        chunks.push(Buffer.from(chunk.value));
      }
    } finally { await reader.cancel().catch(() => {}); }
    return Buffer.concat(chunks);
  }
  private async installNow(id: string, update: boolean, interactive: boolean, authorized: () => boolean = () => true) {
    if (!/^[a-p]{32}$/.test(id)) throw new Error("Invalid store extension ID.");
    if (!this.writable) throw new Error("The saved store extension list needs repair before installation.");
    const previous = this.entries.find(entry => entry.id === id);
    if (!update && (previous || this.session.extensions.getExtension(id))) throw new Error("This extension is already installed.");
    if (!previous && this.entries.length + this.session.extensions.getAllExtensions().filter(extension => !this.has(extension.id)).length >= 50)
      throw new Error("Remove an extension before installing another.");
    this.statuses.set(id, update ? "Checking for updates…" : "Installing…"); this.options.changed();
    let staged: string | undefined, candidate: RecordEntry | undefined;
    try {
      const data = await this.download(id);
      const verified = this.verifyPackage(data, id);
      if (previous && previous.key !== verified.key) throw new Error("The update has a different signing key.");
      await mkdir(this.root, { recursive: true });
      const packagePath = join(this.root, randomUUID() + ".crx");
      let prepared: Awaited<ReturnType<typeof prepareExtensionPackage>>;
      try {
        await writeFile(packagePath, data, { mode: 0o600 });
        prepared = await prepareExtensionPackage(packagePath, this.profile);
      } finally { await rm(packagePath, { force: true }); }
      staged = prepared.directory;
      if (prepared.path !== prepared.directory) throw new Error("Store packages must have a root manifest.");
      const manifest = JSON.parse(await readFile(join(prepared.path, "manifest.json"), "utf8"));
      validateManifest(manifest);
      let name = prepared.name;
      const localizedName = /^__MSG_(\w+)__$/.exec(manifest.name);
      if (localizedName && typeof manifest.default_locale === "string" && /^[a-zA-Z_-]{1,40}$/.test(manifest.default_locale)) {
        const messages = JSON.parse(await readFile(join(prepared.path, "_locales", manifest.default_locale, "messages.json"), "utf8"));
        const message = Object.entries(messages).find(([key]) => key.toLowerCase() === localizedName[1].toLowerCase())?.[1] as { message?: unknown } | undefined;
        if (typeof message?.message === "string") name = message.message.slice(0, 120);
      }
      const permissions = manifestPermissions(manifest);
      if (permissions.length > 1000) throw new Error("This extension declares too many permissions.");
      if (!authorized()) throw new Error("The store page changed during installation. Please try again.");
      if (previous && !newerVersion(manifest.version, previous.version)) {
        this.statuses.set(id, "Up to date"); return true;
      }
      const extraPermissions = previous && permissions.some(permission => !previous.permissions.includes(permission));
      if (extraPermissions && !interactive) { this.statuses.set(id, "Update needs permission approval"); return false; }
      if ((!previous || extraPermissions) && !await this.options.consent({ id,
          name, version: manifest.version, permissions, update: !!previous })) {
        this.statuses.set(id, previous ? "Update postponed" : "Installation cancelled"); return false;
      }
      if (!authorized()) throw new Error("The store page changed during installation. Please try again.");
      // Bind Electron's unpacked loader to the verified developer identity.
      manifest.key = verified.key;
      await writeFile(join(prepared.path, "manifest.json"), JSON.stringify(manifest), { mode: 0o600 });
      const parent = join(this.root, id); await mkdir(parent, { recursive: true });
      const path = join(parent, manifest.version + "-" + randomUUID());
      await rename(prepared.directory, path); staged = path;
      candidate = { id, path, key: verified.key, source: "chrome-web-store", enabled: previous?.enabled ?? true,
        name, version: manifest.version, permissions };
      if (previous?.enabled) this.session.extensions.removeExtension(id);
      try {
        if (candidate.enabled) await this.load(candidate);
        const entries = this.entries.filter(entry => entry.id !== id).concat(candidate);
        this.save(entries); this.entries = entries;
      } catch (error) {
        if (candidate.enabled) this.session.extensions.removeExtension(id);
        if (previous?.enabled) await this.load(previous).catch(rollback => this.errors.set(id, "Could not restore previous extension: " + String(rollback)));
        throw error;
      }
      staged = undefined; this.errors.delete(id);
      this.statuses.set(id, previous ? "Updated" : "Installed");
      // Keep one previous working version for recovery, without accumulating
      // every historical package. Cleanup cannot turn a committed update into
      // a reported installation failure.
      for (const name of await readdir(parent).catch(() => [])) {
        const oldPath = join(parent, name);
        if (oldPath !== path && oldPath !== previous?.path)
          await rm(oldPath, { recursive: true, force: true }).catch(() => {});
      }
      return true;
    } catch (error) {
      this.statuses.set(id, update ? "Update failed" : "Installation failed");
      if (previous) this.errors.set(id, String(error));
      throw error;
    } finally {
      if (staged) await rm(staged, { recursive: true, force: true });
      this.options.changed();
    }
  }
  checkUpdates(interactive = false) {
    return this.serial(async () => {
      for (const entry of [...this.entries]) {
        // Disabled extensions stay disabled, including across automatic checks.
        if (!entry.enabled && !interactive) continue;
        await this.installNow(entry.id, true, interactive).catch(() => {});
      }
      this.options.changed();
    });
  }
  setEnabled(id: string, enabled: boolean) {
    return this.serial(async () => {
      const entry = this.entries.find(entry => entry.id === id);
      if (!entry) throw new Error("Store extension not found.");
      if (entry.enabled === enabled && !this.errors.has(id)) return;
      if (enabled) await this.load({ ...entry, enabled });
      try { this.save(this.entries.map(item => item === entry ? { ...entry, enabled } : item)); }
      catch (error) { if (enabled) this.session.extensions.removeExtension(id); throw error; }
      if (!enabled) this.session.extensions.removeExtension(id);
      entry.enabled = enabled; this.errors.delete(id); this.options.changed();
    });
  }
  remove(id: string) {
    return this.serial(async () => {
      if (!this.has(id)) throw new Error("Store extension not found.");
      const entries = this.entries.filter(entry => entry.id !== id);
      this.save(entries); this.entries = entries;
      this.session.extensions.removeExtension(id); this.errors.delete(id); this.statuses.delete(id);
      this.options.changed();
      await rm(join(this.root, id), { recursive: true, force: true });
    });
  }
}
