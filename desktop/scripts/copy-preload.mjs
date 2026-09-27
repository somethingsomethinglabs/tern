import { copyFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
await copyFile("host/preload.cjs", "dist/host/preload.cjs");

await writeFile(
  "dist/host/page-preload.cjs",
  (await readFile("host/link-preloading.cjs", "utf8")) + "\n" +
    (await readFile("host/page-preload.cjs", "utf8")),
);
await copyFile(
  "host/extension-contexts-preload.cjs",
  "dist/host/extension-contexts-preload.cjs",
);

// The pinned adapter publishes a development preload that logs API arguments
// and results. Keep those values out of extension consoles in this browser.
const require = createRequire(import.meta.url);
const adapter = await readFile(
  require.resolve("electron-chrome-extensions/preload"),
  "utf8",
);
const logging = /\s*if \(true\) \{\s*console\.log\([^;]+;\s*\}/g;
if ([...adapter.matchAll(logging)].length !== 3)
  throw new Error("Review extension preload logging after dependency changes.");
await writeFile(
  "dist/host/extension-api-preload.cjs",
  "// electron-chrome-extensions 4.9.0; API argument logging removed by Tern.\n" +
    adapter.replace(logging, ""),
);
