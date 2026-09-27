import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join } from "node:path";
import type { Session } from "electron";
import type { Snapshot } from "@tern/core/contracts";

// Only extensions explicitly selected in the native folder picker are registered.
// They run in the website session, never the privileged shell session.
export class ExtensionLibrary {
  private entries: Snapshot["extensions"] = [];
  private writable = true;
  readonly path: string;
  constructor(
    private session: Session,
    private directory: string,
  ) {
    this.path = join(directory, "extensions.json");
  }
  list() {
    return this.entries;
  }
  async restore() {
    if (!existsSync(this.path)) return;
    let paths: string[];
    try {
      paths = JSON.parse(readFileSync(this.path, "utf8"));
      if (
        !Array.isArray(paths) ||
        paths.length > 50 ||
        !paths.every((path) => typeof path === "string" && isAbsolute(path))
      )
        throw new Error();
    } catch {
      this.writable = false;
      throw new Error(
        "The saved extension list could not be read. It has been left unchanged.",
      );
    }
    for (const path of new Set(paths)) {
      try {
        await this.load(path);
      } catch (error) {
        this.entries.push({
          id: "",
          name: basename(path),
          version: "",
          path,
          error: String(error),
        });
      }
    }
  }
  private save(entries: Snapshot["extensions"]) {
    if (!this.writable)
      throw new Error(
        "The saved extension list needs repair before it can be changed.",
      );
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(
        this.path + ".tmp",
        JSON.stringify(entries.map((item) => item.path)),
        { mode: 0o600 },
      );
      renameSync(this.path + ".tmp", this.path);
    } catch {
      throw new Error(
        "Could not save the extension list. Check disk space and profile permissions.",
      );
    }
  }
  private async load(path: string) {
    const extension = await this.session.extensions.loadExtension(path, {
      allowFileAccess: false,
    });
    const entry = {
      id: extension.id,
      name: extension.name,
      version: extension.version,
      path,
      error: "",
    };
    this.entries.push(entry);
    return entry;
  }
  async add(path: string) {
    // Canonicalize paths so choosing the same folder through a symlink cannot
    // create duplicate registrations.
    path = realpathSync(path);
    if (this.entries.some((item) => item.path === path))
      throw new Error(
        "This extension is already listed. Remove it before loading it again.",
      );
    if (this.entries.length >= 50)
      throw new Error("Remove an extension before adding another.");
    const entry = await this.load(path);
    try {
      this.save(this.entries);
    } catch (error) {
      this.session.extensions.removeExtension(entry.id);
      this.entries = this.entries.filter((item) => item !== entry);
      throw error;
    }
  }
  remove(path: string) {
    const entry = this.entries.find((item) => item.path === path);
    if (!entry) throw new Error("Extension not found.");
    const remaining = this.entries.filter((item) => item !== entry);
    this.save(remaining);
    if (entry.id) this.session.extensions.removeExtension(entry.id);
    this.entries = remaining;
  }
}
