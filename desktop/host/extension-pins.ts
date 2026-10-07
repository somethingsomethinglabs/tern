import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";

export class ExtensionPins {
  private pins = new Set<string>();
  private readonly path: string;
  private readable = true;
  constructor(directory: string) {
    this.path = join(directory, "extension-pins.json");
    if (!existsSync(this.path)) return;
    try {
      const saved: unknown = JSON.parse(readFileSync(this.path, "utf8"));
      if (!Array.isArray(saved) || !saved.every(id => typeof id === "string" && /^[a-p]{32}$/.test(id))) throw new Error();
      this.pins = new Set(saved);
    } catch { this.readable = false; }
  }
  has(id: string) { return this.pins.has(id); }
  set(id: string, pinned: boolean) {
    if (!this.readable) throw new Error("The saved extension pins could not be read. They have been left unchanged.");
    const next = new Set(this.pins);
    if (pinned) next.add(id); else next.delete(id);
    writeFileSync(this.path + ".tmp", JSON.stringify([...next]), { mode: 0o600 });
    renameSync(this.path + ".tmp", this.path);
    this.pins = next;
  }
}
