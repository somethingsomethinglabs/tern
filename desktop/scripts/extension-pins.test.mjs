import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExtensionPins } from '../dist/host/extension-pins.js';
test('pins persist independently of extension enabled state and can be removed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tern-pins-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const id = 'a'.repeat(32);
  const pins = new ExtensionPins(directory);
  assert.equal(pins.has(id), false);
  pins.set(id, true);
  const restored = new ExtensionPins(directory);
  assert.equal(restored.has(id), true);
  restored.set(id, false);
  assert.equal(new ExtensionPins(directory).has(id), false);
});
test('corrupt pin preferences cannot be overwritten', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'tern-pins-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'extension-pins.json');
  await writeFile(path, 'broken');
  assert.throws(() => new ExtensionPins(directory).set('a'.repeat(32), true), /left unchanged/);
  assert.equal(await readFile(path, 'utf8'), 'broken');
});
