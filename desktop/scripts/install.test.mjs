import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdtemp, mkdir, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const installer = fileURLToPath(new URL("./install.mjs", import.meta.url));
async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), "tern-install-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "package");
  const prefix = join(dir, "prefix with ' spaces $ and %");
  await mkdir(join(source, "resources/app/dist/host"), { recursive: true });
  await copyFile(new URL("../resources/tern-icon.png", import.meta.url), join(source, "resources/tern-icon.png"));
  await writeFile(join(source, "resources/app/dist/host/main.js"), "");
  await writeFile(join(source, "resources/app/package.json"), JSON.stringify({ name: "@tern/desktop", version: "0.1.0" }));
  await writeFile(join(source, "Tern"), '#!/usr/bin/env bash\nprintf "%s\\n" "${ELECTRON_RUN_AS_NODE-unset}" "$PWD" "$@"\n', { mode: 0o755 });
  const run = (...args) => spawnSync(process.execPath, [installer, "--prefix", prefix, ...args], { encoding: "utf8" });
  return { dir, source, prefix, run, root: join(prefix, "share/tern") };
}

test("install, update and rollback preserve old builds and launch the selected version", async (t) => {
  const { source, prefix, run, root } = await fixture(t);
  let result = run("--from", source);
  assert.equal(result.status, 0, result.stderr);
  const original = await readlink(join(root, "current"));
  const launched = spawnSync(join(prefix, "bin/tern"), ["argument with spaces"], {
    encoding: "utf8", env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  assert.equal(launched.status, 0, launched.stderr);
  assert.equal(launched.stdout, `unset\n${join(root, original)}\nargument with spaces\n`);
  const validation = spawnSync("desktop-file-validate", [join(prefix, "share/applications/tern.desktop")], { encoding: "utf8" });
  assert.equal(validation.status, 0, validation.stdout + validation.stderr);
  const entry = await readFile(join(prefix, "share/applications/tern.desktop"), "utf8");
  const icon = entry.match(/^Icon=(.+)$/m)?.[1];
  assert.equal(icon, join(root, "tern-icon.png"));
  assert.deepEqual(await readFile(icon), await readFile(join(source, "resources/tern-icon.png")));
  result = run("--from", source);
  assert.equal(result.status, 0, result.stderr);
  const updated = await readlink(join(root, "current"));
  assert.notEqual(updated, original);
  assert.equal(await readlink(join(root, "previous")), original);
  assert.match(await readFile(join(root, original, "Tern"), "utf8"), /printf/);
  result = run("--rollback");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readlink(join(root, "current")), original);
  assert.equal(await readlink(join(root, "previous")), updated);
  assert.deepEqual(await readFile(icon), await readFile(join(source, "resources/tern-icon.png")));
});

test("a bad update leaves the installed version intact", async (t) => {
  const { source, run, root } = await fixture(t);
  assert.equal(run("--from", source).status, 0);
  const original = await readlink(join(root, "current"));
  await writeFile(join(source, "resources/app/package.json"), "invalid");
  assert.notEqual(run("--from", source).status, 0);
  assert.equal(await readlink(join(root, "current")), original);
  assert.match(run("--rollback").stderr, /No previous installation/);
});

test("installs the archived format produced by Electron Packager", async (t) => {
  const { source, run } = await fixture(t);
  const { createPackage } = await import("@electron/asar");
  await createPackage(join(source, "resources/app"), join(source, "resources/app.asar"));
  await rm(join(source, "resources/app"), { recursive: true });
  const result = run("--from", source);
  assert.equal(result.status, 0, result.stderr);
});

test("installer refuses to overwrite an unrelated launcher", async (t) => {
  const { source, prefix, run } = await fixture(t);
  await mkdir(join(prefix, "bin"), { recursive: true });
  await writeFile(join(prefix, "bin/tern"), "existing command");
  const result = run("--from", source);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /unmanaged file/);
  assert.equal(await readFile(join(prefix, "bin/tern"), "utf8"), "existing command");
});

test("concurrent installers cannot switch the same installation", async (t) => {
  const { source, root, run } = await fixture(t);
  await mkdir(join(root, ".install-lock"), { recursive: true });
  assert.match(run("--from", source).stderr, /Installation is locked/);
});

test("rebranding redirects an owned old launcher and removes its duplicate menu entry", async (t) => {
  const { source, prefix, run } = await fixture(t);
  const legacyLauncher = join(prefix, "bin/trailrest");
  const legacyEntry = join(prefix, "share/applications/trailrest.desktop");
  await mkdir(join(prefix, "bin"), { recursive: true });
  await mkdir(join(prefix, "share/applications"), { recursive: true });
  await writeFile(legacyLauncher, "#!/usr/bin/env bash\n# Managed by Trailrest installer\nexit 9\n", { mode: 0o755 });
  await writeFile(legacyEntry, "# Managed by Trailrest installer\nName=Trailrest\n");
  const result = run("--from", source);
  assert.equal(result.status, 0, result.stderr);
  const launched = spawnSync(legacyLauncher, ["old entry point"], { encoding: "utf8" });
  assert.equal(launched.status, 0, launched.stderr);
  assert.match(launched.stdout, /old entry point/);
  await assert.rejects(readFile(legacyEntry), { code: "ENOENT" });
  assert.match(await readFile(join(prefix, "share/applications/tern.desktop"), "utf8"), /Name=Tern/);
});

test("rebranding leaves unrelated old-name files intact", async (t) => {
  const { source, prefix, run } = await fixture(t);
  const legacyLauncher = join(prefix, "bin/trailrest");
  const legacyEntry = join(prefix, "share/applications/trailrest.desktop");
  await mkdir(join(prefix, "bin"), { recursive: true });
  await mkdir(join(prefix, "share/applications"), { recursive: true });
  await writeFile(legacyLauncher, "unrelated command");
  await writeFile(legacyEntry, "unrelated menu entry");
  const result = run("--from", source);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(legacyLauncher, "utf8"), "unrelated command");
  assert.equal(await readFile(legacyEntry, "utf8"), "unrelated menu entry");
});

 test("encrypted profiles cannot be downgraded through rollback or a manual install", async t => {
  const {source, run, root} = await fixture(t);
  assert.equal(run("--from", source).status, 0);
  await writeFile(join(source, "resources/security.json"), JSON.stringify({cookieEncryption:true,hardened:true}));
  assert.equal(run("--from", source).status, 0);
  const encrypted = await readlink(join(root, "current"));
  assert.match(run("--rollback").stderr, /without cookie encryption is blocked/);
  await rm(join(source, "resources/security.json"));
  assert.match(run("--from", source).stderr, /without cookie encryption is blocked/);
  assert.equal(await readlink(join(root, "current")), encrypted);
});
