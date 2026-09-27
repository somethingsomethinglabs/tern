import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { profileDirectory, WEBSITE_PARTITION } from "../host/profile.ts";

test("new profiles use Tern; existing Trailrest data is reused without copying", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tern-profile-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(profileDirectory(root, {}), join(root, "Tern"));
  const legacy = join(root, "Trailrest");
  await mkdir(legacy);
  await writeFile(join(legacy, "workspace.json"), '{"version":1}');
  assert.equal(profileDirectory(root, {}), legacy);
  assert.equal(await readFile(join(legacy, "workspace.json"), "utf8"), '{"version":1}');
  assert.equal(WEBSITE_PARTITION, "persist:trailrest-web");
  await mkdir(join(root, "Tern"));
  assert.equal(profileDirectory(root, {}), join(root, "Tern"));
});

test("explicit profile overrides win, with compatibility for the previous variable", () => {
  assert.equal(profileDirectory("/unused", { TERN_PROFILE: "isolated" }), resolve("isolated"));
  assert.equal(profileDirectory("/unused", { TRAILREST_PROFILE: "legacy" }), resolve("legacy"));
  assert.equal(profileDirectory("/unused", {
    TERN_PROFILE: "new", TRAILREST_PROFILE: "old",
  }), resolve("new"));
});
