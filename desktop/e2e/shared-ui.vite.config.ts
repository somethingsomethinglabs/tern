import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("e2e/fixtures/shared-ui"),
  base: "./",
  publicDir: resolve("../packages/app/public"),
  plugins: [svelte()],
  build: { outDir: resolve("test-results/shared-ui-build"), emptyOutDir: true },
});
