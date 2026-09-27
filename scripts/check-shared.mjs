import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

async function check(name) {
  const directory = resolve(root, "packages", name, "src");
  const manifest = JSON.parse(await readFile(resolve(directory, "../package.json"), "utf8"));
  const dependencies = new Set(Object.keys(manifest.dependencies ?? {}));
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.(ts|tsx|svelte)$/.test(entry.name)) continue;
    const path = resolve(entry.parentPath, entry.name);
    const source = await readFile(path, "utf8");
    // Covers static imports/re-exports and literal import()/require() calls.
    const imports = source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?|require\s*\(\s*)["']([^"']+)["']/g);
    for (const [, specifier] of imports) {
      if (specifier.startsWith(".")) {
        assert.ok(resolve(dirname(path), specifier).startsWith(directory + sep),
          `${path}: shared code cannot import outside its package: ${specifier}`);
      } else {
        const packageName = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
        assert.ok(dependencies.has(packageName), `${path}: undeclared dependency ${specifier}`);
        assert.ok(!/^(node:|electron|@capacitor\/|@tern\/(desktop|mobile))/.test(specifier),
          `${path}: platform dependency ${specifier} belongs in a host adapter`);
      }
    }
    assert.ok(!/window\.tern\b/.test(source), `${path}: receive the host bridge as a dependency`);
  }
}

await check("core");
await check("app");
console.log("Shared packages have no host imports or implicit Electron bridge.");
