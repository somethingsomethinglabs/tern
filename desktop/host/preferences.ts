import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Preferences } from "./contracts.js";

export class BrowserPreferences {
  value: Preferences;
  error = "";
  private path: string;
  constructor(
    private directory: string,
    downloads: string,
  ) {
    this.path = join(directory, "preferences.json");
    this.value = {
      searchEngine: "duckduckgo",
      autoHideToolbar: true,
      sidebarCollapsed: false,
      defaultZoom: 1,
      askDownloadLocation: true,
      downloadDirectory: downloads,
    };
  }
  private validated(raw: unknown): Preferences {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Invalid browser settings.");
    const patch = raw as Partial<Preferences>;
    if (Object.keys(patch).some((key) => !Object.hasOwn(this.value, key)))
      throw new Error("Unknown browser setting.");
    const next = { ...this.value, ...patch };
    if (
      !["duckduckgo", "google", "bing", "brave"].includes(next.searchEngine) ||
      ![
        next.autoHideToolbar,
        next.sidebarCollapsed,
        next.askDownloadLocation,
      ].every((value) => typeof value === "boolean") ||
      ![0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].includes(next.defaultZoom) ||
      typeof next.downloadDirectory !== "string" ||
      !isAbsolute(next.downloadDirectory)
    )
      throw new Error("Invalid browser settings.");
    return next;
  }
  read() {
    if (!existsSync(this.path)) return;
    try {
      this.value = this.validated(JSON.parse(readFileSync(this.path, "utf8")));
    } catch {
      try {
        renameSync(this.path, this.path + ".recovery-" + Date.now());
      } catch {
        this.error =
          "Browser settings could not be read or backed up. Changes cannot be saved.";
        return;
      }
      this.error =
        "Browser settings were unreadable and have been preserved in a recovery file. Defaults are in use.";
    }
  }
  update(patch: unknown) {
    if (this.error.includes("cannot be saved")) throw new Error(this.error);
    const next = this.validated(patch);
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(this.path + ".tmp", JSON.stringify(next, null, 2), {
        mode: 0o600,
      });
      renameSync(this.path + ".tmp", this.path);
    } catch {
      throw new Error(
        "Could not save browser settings. Check profile permissions and disk space.",
      );
    }
    this.value = next;
    this.error = "";
  }
}
