import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import {
  access, copyFile, cp, lstat, mkdir, readFile, readlink, realpath, rename, rm,
  symlink, writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(`Usage: ./install-tern [--prefix DIRECTORY] [--from PACKAGE_DIRECTORY | --rollback]

Build and install Tern for this user. Run again to update.
--from installs an already packaged Linux x64 build without rebuilding.
--rollback switches back to the previous installed build.
--prefix overrides ~/.local and XDG_DATA_HOME, useful for isolated checks.
Updates take effect after quitting and reopening Tern.`);
  process.exit(0);
}
let prefix = join(homedir(), ".local");
let data = process.env.XDG_DATA_HOME || join(prefix, "share");
let source;
let rollback = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--rollback") rollback = true;
  else if (["--prefix", "--from"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) {
    const option = args[i];
    const value = resolve(args[++i]);
    if (option === "--prefix") { prefix = value; data = join(prefix, "share"); }
    else source = value;
  } else throw new Error(`Unknown or incomplete option: ${args[i]}. Use --help.`);
}
if (rollback && source) throw new Error("Choose --from or --rollback.");
if (process.platform !== "linux" || process.arch !== "x64")
  throw new Error("This installer currently supports Linux x64 only.");
if (!isAbsolute(data)) throw new Error("XDG_DATA_HOME must be an absolute path.");
const root = join(data, "tern");
const releases = join(root, "releases");
const launcher = join(prefix, "bin", "tern");
const entry = join(data, "applications", "tern.desktop");
const marker = "# Managed by Tern installer";
const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
// Desktop Exec has its own quoting rules, followed by desktop-entry escaping.
const execQuote = (value) => `"${value.replace(/[\\"`$]/g, "\\$&")}"`
  .replaceAll("\\", "\\\\").replaceAll("%", "%%");
if (/[\r\n]/.test(root + launcher)) throw new Error("Installation paths cannot contain line breaks.");

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}
async function installedTarget(name) {
  const path = join(root, name);
  if (!await exists(path)) return null;
  const target = await readlink(path);
  if (!/^releases\/[a-zA-Z0-9._-]+$/.test(target))
    throw new Error(`Unrecognized installation link: ${path}`);
  await access(join(root, target, "Tern"), constants.X_OK);
  return target;
}
async function replaceLink(name, target) {
  const temp = join(root, `.${name}-${randomUUID()}`);
  try { await symlink(target, temp); await rename(temp, join(root, name)); }
  finally { await rm(temp, { force: true }); }
}
async function managedFile(path, contents, mode) {
  if (await exists(path)) {
    const stat = await lstat(path);
    if (!stat.isFile() || !(await readFile(path, "utf8")).includes(marker))
      throw new Error(`Refusing to replace an unmanaged file: ${path}`);
  }
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${randomUUID()}`;
  try { await writeFile(temp, contents, { mode }); await rename(temp, path); }
  finally { await rm(temp, { force: true }); }
}
async function redirectLegacyInstallation() {
  const oldMarker = "# Managed by Trailrest installer";
  const oldLauncher = join(prefix, "bin", "trailrest");
  const oldEntry = join(data, "applications", "trailrest.desktop");
  const isLegacyFile = async (path) =>
    await exists(path) && (await lstat(path)).isFile() &&
    (await readFile(path, "utf8")).includes(oldMarker);
  if (await isLegacyFile(oldLauncher)) {
    // Retain the ownership marker so future updates still recognise this alias.
    const temp = `${oldLauncher}.${randomUUID()}`;
    try {
      await writeFile(temp, `#!/usr/bin/env bash\n${oldMarker}\n# Compatibility alias after the Tern rebrand.\nexec ${shellQuote(launcher)} "$@"\n`, { mode: 0o755 });
      await rename(temp, oldLauncher);
    } finally { await rm(temp, { force: true }); }
  }
  if (await isLegacyFile(oldEntry)) await rm(oldEntry);
}
await mkdir(root, { recursive: true });
const lock = join(root, ".install-lock");
try { await mkdir(lock); }
catch (error) {
  if (error.code === "EEXIST") throw new Error(`Installation is locked. If no installer is running, remove ${lock} and retry.`);
  throw error;
}
let staging;
try {
  const current = await installedTarget("current");
  if (rollback) {
    const previous = await installedTarget("previous");
    if (!current || !previous) throw new Error("No previous installation is available.");
    const securityAt = async target => {
      try { return JSON.parse(await readFile(join(root, target, "resources/security.json"), "utf8")); }
      catch (error) { if (error.code === "ENOENT") return {}; throw error; }
    };
    const currentSecurity = await securityAt(current), previousSecurity = await securityAt(previous);
    if (currentSecurity.cookieEncryption && !previousSecurity.cookieEncryption)
      throw new Error("Rollback to a build without cookie encryption is blocked. Use a separate profile for older builds.");
    await replaceLink("current", previous);
    await replaceLink("previous", current);
    console.log(`Restored ${previous}. Quit and reopen Tern to use it.`);
  } else {
    if (!source) {
      const result = spawnSync("npm", ["run", "package"], { cwd: desktop, stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error("Packaging failed; installed build was not changed.");
      source = join(desktop, "release", "Tern-linux-x64");
    }
    source = await realpath(source);
    if (source === root || source.startsWith(`${root}/`))
      throw new Error("Package source must be outside the installation directory.");
    if (current) {
      const securityAt = async path => {
        try { return JSON.parse(await readFile(join(path, "resources/security.json"), "utf8")); }
        catch (error) { if (error.code === "ENOENT") return {}; throw error; }
      };
      const existing = await securityAt(join(root, current)), candidate = await securityAt(source);
      if (existing.cookieEncryption && !candidate.cookieEncryption)
        throw new Error("Installing a build without cookie encryption is blocked. Use a separate profile for older builds.");
    }
    await access(join(source, "Tern"), constants.X_OK);
    await access(join(source, "resources", "tern-icon.png"), constants.R_OK);
    const archive = join(source, "resources", "app.asar");
    let metadata;
    if (await exists(archive)) {
      const { extractFile } = await import("@electron/asar");
      metadata = JSON.parse(extractFile(archive, "package.json").toString());
      extractFile(archive, "dist/host/main.js");
    } else {
      metadata = JSON.parse(await readFile(join(source, "resources", "app", "package.json"), "utf8"));
      await access(join(source, "resources", "app", "dist", "host", "main.js"));
    }
    if (metadata.name !== "@tern/desktop" || !/^[a-zA-Z0-9._-]+$/.test(metadata.version))
      throw new Error("Package is not a recognized Tern build.");
    const id = `${metadata.version}-${Date.now()}-${randomUUID().slice(0, 8)}`;
    await mkdir(releases, { recursive: true });
    staging = join(releases, `.staging-${id}`);
    await cp(source, staging, { recursive: true, preserveTimestamps: true });
    await rename(staging, join(releases, id));
    staging = undefined;
    await managedFile(launcher, `#!/usr/bin/env bash\n${marker}\nset -euo pipefail\nunset ELECTRON_RUN_AS_NODE\nrelease="$(readlink -f -- ${shellQuote(join(root, "current"))})"\ncd -- "$release"\nexec "$release/Tern" "$@"\n`, 0o755);
    // Keep the icon outside releases so rollback to a pre-logo build still has it.
    const iconPath = join(root, "tern-icon.png");
    const iconTemp = join(root, `.icon-${randomUUID()}.png`);
    try {
      await copyFile(join(source, "resources", "tern-icon.png"), iconTemp);
      await rename(iconTemp, iconPath);
    } finally { await rm(iconTemp, { force: true }); }
    const icon = iconPath.replaceAll("\\", "\\\\");
    await managedFile(entry, `[Desktop Entry]\n${marker}\nType=Application\nName=Tern\nComment=Put tasks aside and resume their pages\nExec=${execQuote(launcher)} %U\nIcon=${icon}\nTerminal=false\nCategories=Network;WebBrowser;\nMimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;\nStartupWMClass=Tern\n`, 0o644);
    if (current) await replaceLink("previous", current);
    await replaceLink("current", `releases/${id}`);
    await redirectLegacyInstallation();
    const refresh = spawnSync("update-desktop-database", [dirname(entry)], { encoding: "utf8" });
    if (refresh.error || refresh.status !== 0)
      console.warn("Desktop menu cache was not refreshed; your launcher may need to be reopened.");
    console.log(`Installed Tern ${metadata.version}: ${join(releases, id)}\nLaunch from the app menu or ${launcher}\nUpdates take effect after quitting and reopening. Your browsing profile is unchanged.`);
  }
} finally {
  if (staging) await rm(staging, { recursive: true, force: true });
  await rm(lock, { recursive: true, force: true });
}
