import { copyFile } from "node:fs/promises";
await copyFile("host/preload.cjs", "dist/host/preload.cjs");
