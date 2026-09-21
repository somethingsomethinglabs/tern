import { copyFile } from "node:fs/promises";
await copyFile("host/preload.cjs", "dist/host/preload.cjs");

await copyFile("host/page-preload.cjs", "dist/host/page-preload.cjs");
