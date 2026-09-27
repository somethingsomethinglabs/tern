import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
export default defineConfig({ plugins: [svelte()], base: "./", publicDir: "../packages/app/public", build: { outDir: "dist", emptyOutDir: true } });
