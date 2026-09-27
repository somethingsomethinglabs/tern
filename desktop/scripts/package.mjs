import { packager } from "@electron/packager";
import { lstat, mkdir, realpath, rm, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../", import.meta.url));
const createdLinks = [];

try {
  // Packager's dependency walker needs local links to npm workspaces. Keep
  // links temporary; Packager dereferences them into the standalone release.
  for (const name of ["core", "app"]) {
    const source = fileURLToPath(new URL(`../../packages/${name}/`, import.meta.url));
    const destination = join(directory, "node_modules", "@tern", name);
    const existing = await lstat(destination).catch(error => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (existing) {
      if (await realpath(destination) !== await realpath(source))
        throw new Error(`Unexpected workspace installation at ${destination}`);
      continue;
    }
    await mkdir(dirname(destination), { recursive: true });
    await symlink(source, destination, process.platform === "win32" ? "junction" : "dir");
    createdLinks.push(destination);
  }
  const paths = await packager({
    dir: directory,
    name: "Tern",
    platform: "linux",
    arch: "x64",
    out: join(directory, "release"),
    overwrite: true,
    icon: join(directory, "resources/tern-icon.png"),
    extraResource: [join(directory, "resources/tern-icon.png")],
    ignore: [
      /^\/(src|host|e2e|test-results|playwright-report|release)(\/|$)/,
      /node_modules\/@node-llama-cpp\/(?!linux-x64(\/|$))/,
      /^\/node_modules\/@tern\/core\/(src|test)(\/|$)/,
    ],
    asar: { unpack: "**/*.node", unpackDir: "**/node_modules/@node-llama-cpp/**" },
  });
  console.log(`Packaged Tern: ${paths.join(", ")}`);
} finally {
  for (const path of createdLinks) await rm(path);
}
