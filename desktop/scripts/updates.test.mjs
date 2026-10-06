import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, readlink, symlink, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ReleaseUpdater } from '../dist/host/updates.js';

async function fixture(t, tamper = false) {
  const root = await mkdtemp(join(tmpdir(), 'tern-updater-')); t.after(() => rm(root, { recursive: true, force: true }));
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const config = { manifestURL: 'https://fixture.example/manifest', publicKey: publicKey.export({type:'spki',format:'pem'}) };
  const current = join(root, 'releases', 'old'); await mkdir(join(current, 'resources'), { recursive: true });
  await writeFile(join(current, 'Tern'), 'old', { mode: 0o755 });
  await writeFile(join(current, 'resources', 'update-config.json'), JSON.stringify(config));
  await symlink('releases/old', join(root, 'current'));
  const next = join(root, 'build', 'Tern-linux-x64'); await mkdir(join(next, 'resources'), { recursive: true });
  await writeFile(join(next, 'Tern'), 'new', { mode: 0o755 });
  await writeFile(join(next, 'resources', 'update-config.json'), JSON.stringify(config));
  await writeFile(join(next, 'resources', 'security.json'), JSON.stringify({format:1,cookieEncryption:true,hardened:true}));
  const archive = join(root, 'release.tar.gz');
  assert.equal(spawnSync('tar', ['-czf', archive, '-C', join(root, 'build'), 'Tern-linux-x64']).status, 0);
  const bytes = await readFile(archive);
  const payload = JSON.stringify({ format: 1, sequence: 1, version: '0.1.1', publishedAt: Date.now(), expires: Date.now()+86400000,
    platform:'linux',arch:'x64',url:'https://fixture.example/release',sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length });
  const envelope = {payload,signature:sign(null,Buffer.from(payload),privateKey).toString('base64')};
  const fetchBefore = globalThis.fetch;
  globalThis.fetch = async url => String(url).endsWith('/manifest') ? new Response(JSON.stringify(envelope)) : new Response(tamper ? Buffer.alloc(bytes.length) : bytes);
  t.after(() => { globalThis.fetch = fetchBefore; });
  const updater = new ReleaseUpdater(join(current,'Tern'),'0.1.0',join(current,'resources'),()=>{});
  await updater.initialize();
  return {root,updater};
}
test('downloads, verifies and atomically switches a signed release without replacing the running version', async t => {
  const {root,updater} = await fixture(t);
  await updater.check(); assert.equal(updater.state.version, '0.1.1');
  await updater.install(); assert.match(updater.state.status, /Update installed/);
  assert.equal(await readlink(join(root,'current')), 'releases/0.1.1-signed-1');
  assert.equal(await readlink(join(root,'previous')), 'releases/old');
  assert.equal(await readFile(join(root,'releases/old/Tern'),'utf8'), 'old');
  assert.deepEqual(JSON.parse(await readFile(join(root,'update-state.json'),'utf8')), {sequence:1});
});
test('a tampered download preserves the installed release and update high-water mark', async t => {
  const {root,updater} = await fixture(t,true);
  await updater.check(); await updater.install();
  assert.match(updater.state.status,/checksum/);
  assert.equal(await readlink(join(root,'current')), 'releases/old');
  await assert.rejects(readFile(join(root,'update-state.json')), {code:'ENOENT'});
});
