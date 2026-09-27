import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const resources = join(root, "mobile/android/app/src/main/res");
const source = join(root, "design/brand/tern-icon.svg");
const foreground = readFileSync(source, "utf8").replace(/viewBox="[^"]+"/, 'viewBox="-32 -32 192 192"');
for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
  const directory = join(resources, `mipmap-${density}`);
  mkdirSync(directory, { recursive: true });
  for (const name of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground"]) {
    const size = Math.round((name.endsWith("foreground") ? 108 : 48) * scale);
    const result = spawnSync("rsvg-convert", ["-w", String(size), "-h", String(size), "-o", join(directory, name + ".png")], { input: name.endsWith("foreground") ? foreground : readFileSync(source), encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr || "Install rsvg-convert to regenerate Android icons");
  }
}
// Replace the generated Capacitor splash screens with the shared Tern mark.
for (const directory of readdirSync(resources).filter(name => name.startsWith("drawable"))) {
  const path = join(resources, directory, "splash.png");
  try { unlinkSync(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
writeFileSync(join(resources, "drawable/splash.xml"), `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
  <item android:drawable="@color/tern_background" />
  <item><bitmap android:src="@mipmap/ic_launcher" android:gravity="center" /></item>
</layer-list>\n`);
writeFileSync(join(resources, "values/ic_launcher_background.xml"), `<resources><color name="ic_launcher_background">#245c4d</color><color name="tern_background">#181b1e</color></resources>\n`);
