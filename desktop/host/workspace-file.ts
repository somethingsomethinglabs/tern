import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Workspace } from "@tern/core/contracts";
import { emptyWorkspace, parseWorkspace } from "@tern/core/workspace";

// Persist references only. Live page instances and website form values stay in Chromium.
export class WorkspaceFile {
  error = "";
  private readonly path: string;
  private writable = true;
  constructor(private directory: string) {
    this.path = join(directory, "workspace.json");
  }
  read(): Workspace {
    const empty = emptyWorkspace();
    if (!existsSync(this.path)) return empty;
    try {
      return parseWorkspace(readFileSync(this.path, "utf8"));
    } catch (error) {
      // Preserve the unreadable original before allowing any fresh workspace writes.
      try {
        const backup = `${this.path}.recovery-${Date.now()}`;
        renameSync(this.path, backup);
        this.error = `Previous workspace could not be read. It was preserved at ${backup}.`;
      } catch {
        this.writable = false;
        this.error =
          "Workspace could not be read or backed up. Changes cannot be saved in this session.";
      }
      return empty;
    }
  }
  save(workspace: Workspace) {
    if (!this.writable) return false;
    try {
      mkdirSync(this.directory, { recursive: true });
      writeFileSync(this.path + ".tmp", JSON.stringify(workspace, null, 2), {
        mode: 0o600,
      });
      renameSync(this.path + ".tmp", this.path);
      if (this.error.startsWith("Could not save")) this.error = "";
      return true;
    } catch {
      this.error =
        "Could not save task changes. Check disk space and profile permissions before quitting.";
      return false;
    }
  }
}
