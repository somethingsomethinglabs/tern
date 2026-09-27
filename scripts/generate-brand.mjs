// Run from anywhere with `node scripts/generate-brand.mjs`.
// librsvg's rsvg-convert is needed only when changing the identity, not to build apps.
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const brand = join(root, "design/brand");
const master = await readFile(join(brand, "tern-master.svg"), "utf8");
const group = (id) => {
  const match = master.match(new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`));
  if (!match) throw new Error(`Missing ${id} in tern-master.svg`);
  return match[1].trim();
};
const glyph = group("glyph");
const lettering = group("lettering");
const green = "#245c4d";
const paper = "#f6f7f2";
const svg = (viewBox, body, color = green) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="${color}" fill-rule="evenodd" role="img" aria-labelledby="title"><title id="title">Tern</title>${body}</svg>\n`;
const icon = `<rect x="4" y="4" width="120" height="120" rx="28" fill="${green}"/><g transform="translate(-35.2 -14.4) scale(.2)" fill="${paper}">${glyph}</g>`;
const files = {
  "tern-glyph.svg": svg("176 72 640 640", glyph),
  "tern-glyph-inverse.svg": svg("176 72 640 640", glyph, paper),
  "tern-glyph-mono.svg": svg("176 72 640 640", glyph, "currentColor"),
  "tern-wordmark.svg": svg("216 187 1110 416", glyph + lettering),
  "tern-wordmark-inverse.svg": svg("216 187 1110 416", glyph + lettering, paper),
  "tern-wordmark-mono.svg": svg("216 187 1110 416", glyph + lettering, "currentColor"),
  "tern-icon.svg": svg("0 0 128 128", icon),
};
for (const [name, source] of Object.entries(files)) await writeFile(join(brand, name), source);
function render(source, target, width, height) {
  const args = ["-w", String(width)];
  if (height) args.push("-h", String(height));
  args.push(join(brand, source), "-o", join(brand, target));
  const result = spawnSync("rsvg-convert", args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not render ${source}`);
}
for (const size of [16, 24, 32, 48, 64, 128, 180, 256, 512, 1024])
  render("tern-icon.svg", `tern-icon-${size}.png`, size, size);
render("tern-glyph.svg", "tern-glyph.png", 1024, 1024);
render("tern-wordmark.svg", "tern-wordmark.png", 1110, 416);

const preview = `<rect width="1440" height="960" fill="${paper}"/>
<g transform="translate(53 50) scale(.92)">${glyph}${lettering}</g>
<rect x="88" y="650" width="570" height="222" rx="20" fill="${green}"/>
<g transform="translate(30 600) scale(.43)" fill="${paper}">${glyph}${lettering}</g>
<g transform="translate(762 690)">${icon}</g>
${[16, 24, 32, 48].map((size, i) => `<g transform="translate(${980 + i * 85} ${756 - size / 2}) scale(${size / 640}) translate(-176 -72)">${glyph}</g>`).join("")}`;
await writeFile(join(brand, "preview.svg"), svg("0 0 1440 960", preview));
render("preview.svg", "preview.png", 1440, 960);

for (const app of ["packages/app", "prototype", "website"]) {
  const target = join(root, app, "public/brand");
  await mkdir(target, { recursive: true });
  for (const name of Object.keys(files)) await copyFile(join(brand, name), join(target, name));
  await copyFile(join(brand, "tern-icon-32.png"), join(root, app, "public/favicon.png"));
}
await copyFile(join(brand, "tern-wordmark.png"), join(root, "website/public/brand/tern-wordmark.png"));
await copyFile(join(brand, "tern-icon-180.png"), join(root, "website/public/apple-touch-icon.png"));
await mkdir(join(root, "desktop/resources"), { recursive: true });
await copyFile(join(brand, "tern-icon-512.png"), join(root, "desktop/resources/tern-icon.png"));
console.log("Generated Tern identity assets and updated all three applications.");
