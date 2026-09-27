import { validatePreferences } from "@tern/core/preferences";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import type { Preferences } from "@tern/core/contracts";
import { BUILTIN_MODEL, builtinModel } from "@tern/core/local-ai-config";

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
      showSnapshotTool: true,
      preloadLinks: true,
      summaryModel: BUILTIN_MODEL.id,
      defaultZoom: 1,
      askDownloadLocation: true,
      downloadDirectory: downloads,
    };
  }
  private validated(raw: unknown): Preferences {
    const next = validatePreferences(this.value, raw);
    if (!isAbsolute(next.downloadDirectory)) throw new Error("Invalid browser settings.");
    return next;
  }
  read() {
    if (!existsSync(this.path)) return;
    try {
      const stored = JSON.parse(readFileSync(this.path, "utf8"));
      // Built-in artifact IDs change when weights or quantization are updated.
      // Preserve the rest of the preferences when upgrading an older artifact.
      if (stored && typeof stored === "object" && !Array.isArray(stored) &&
          typeof stored.summaryModel === "string" && stored.summaryModel.startsWith("builtin:") &&
          !builtinModel(stored.summaryModel))
        stored.summaryModel = BUILTIN_MODEL.id;
      this.value = this.validated(stored);
      // Upgrade the previous shipped default to managed inference. Explicit
      // opt-outs and other custom Ollama model choices remain unchanged.
      if (["lfm2.5-thinking", "lfm2.5-thinking:latest"].includes(this.value.summaryModel))
        this.value.summaryModel = BUILTIN_MODEL.id;
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
