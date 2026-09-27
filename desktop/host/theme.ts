import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Snapshot } from "@tern/core/contracts";

const fallback: Snapshot["theme"] = {
  name: "System dark",
  background: "#181b1e",
  foreground: "#e0e4e7",
  accent: "#a4c4b5",
};

// Omarchy replaces its current theme directory on a theme change. Polling the
// small palette file follows that replacement without a stale directory watch.
export function readTheme(): Snapshot["theme"] {
  const override = process.env.TERN_THEME_DIR || process.env.TRAILREST_THEME_DIR;
  const roots = override
    ? [override]
    : [
        join(
          process.env.XDG_STATE_HOME || join(homedir(), ".local/state"),
          "omarchy/current",
        ),
        join(
          process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
          "omarchy/current",
        ),
      ];
  for (const root of roots) {
    try {
      const source = readFileSync(join(root, "theme/colors.toml"), "utf8");
      const color = (key: string) =>
        source.match(
          new RegExp(`^${key}\\s*=\\s*["'](#[\\da-fA-F]{6})["']`, "m"),
        )?.[1];
      const background = color("background"),
        foreground = color("foreground"),
        accent = color("accent");
      if (!background || !foreground || !accent) continue;
      let name = "Omarchy";
      try {
        name =
          readFileSync(join(root, "theme.name"), "utf8").trim().slice(0, 80) ||
          name;
      } catch {}
      return { name, background, foreground, accent };
    } catch {}
  }
  return fallback;
}
