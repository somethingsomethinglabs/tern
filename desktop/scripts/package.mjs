import { packager } from "@electron/packager";
import { lstat, mkdir, realpath, rm, symlink, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { execFileSync } from "node:child_process";
import { hardenRelease } from "./release-fuses.mjs";

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
    // Use checksum metadata authenticated by the pinned npm package, including
    // on cache hits; do not weaken verification when downloads need retrying.
    download: { checksums: JSON.parse(await readFile(join(directory, "node_modules/electron/checksums.json"), "utf8")), downloadOptions: { timeout: { request: 120000 } } },
    platform: "linux",
    arch: "x64",
    out: join(directory, "release"),
    overwrite: true,
    icon: join(directory, "resources/tern-icon.png"),
    extraResource: [join(directory, "resources/tern-icon.png"), join(directory, "resources/update-config.json")],
    ignore: [
      /^\/(src|host|e2e|test|test-results|playwright-report|release)(\/|$)/,
      /node_modules\/@node-llama-cpp\/(?!linux-x64(\/|$))/,
      /^\/node_modules\/@tern\/core\/(src|test)(\/|$)/,
    ],
    asar: { unpack: "**/*.node", unpackDir: "**/node_modules/@node-llama-cpp/**" },
  });
  for (const path of paths) {
    await hardenRelease(join(path, "Tern"));
    const metadata = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
    const version = metadata.version;
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: directory, encoding: "utf8" }).trim();
    const dirty = !!execFileSync("git", ["status", "--porcelain", "--", "desktop", "packages/core", "packages/app", "package.json", "package-lock.json"], { cwd: join(directory, ".."), encoding: "utf8" }).trim();
    await writeFile(join(path, "resources/build.json"), JSON.stringify({format:1,sourceCommit,dirty,version,electron:metadata.devDependencies.electron}) + "\n");
    const installer = (await readFile(join(directory, "resources/install-linux.sh"), "utf8")).replaceAll("@VERSION@", version);
    await writeFile(join(path, "install.sh"), installer, { mode: 0o755 });
    await writeFile(join(path, "resources", "security.json"), JSON.stringify({
      format: 1, cookieEncryption: true, hardened: true,
    }) + "\n");
  }
  console.log(`Packaged Tern: ${paths.join(", ")}`);
} finally {
  for (const path of createdLinks) await rm(path);
}
