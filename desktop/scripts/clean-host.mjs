import { rm } from "node:fs/promises";

// tsc does not remove output for modules moved into shared packages.
await rm(new URL("../dist/host/", import.meta.url), { recursive: true, force: true });
