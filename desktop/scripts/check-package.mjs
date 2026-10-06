import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile, readFile, symlink, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { listPackage } from '@electron/asar';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import { verifyReleaseFuses } from './release-fuses.mjs';

const source = process.argv[2] ? resolve(process.argv[2]) : fileURLToPath(new URL('../release/Tern-linux-x64/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'tern-package-check-'));
let browser, child;
const requireEncryption = process.env.TERN_PACKAGE_REQUIRE_ENCRYPTION === '1';
const cookieValue = 'tern-encryption-migration-fixture';
const server = createServer((_request, response) => {
  response.setHeader('Content-Type', 'text/html');
  response.end('<!doctype html><title>Packaged fixture</title><label>Draft<input aria-label="Draft"></label>');
});
async function close() {
  if (child && child.exitCode === null && child.signalCode === null) {
    const ended = new Promise(resolve => child.once('exit', resolve));
    child.kill('SIGTERM');
    await ended;
  }
  child = undefined;
  await browser?.close().catch(() => {}); browser = undefined;
}
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const profile = join(temporary, 'profile'); await mkdir(profile);
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ summaryModel: '', searchView: 'external' }));
  if (requireEncryption) {
    const seed = join(temporary, 'seed-cookie.cjs');
    await writeFile(seed, `const {app,session}=require('electron');
      app.setPath('userData',${JSON.stringify(profile)});app.enableSandbox();
      app.whenReady().then(async()=>{const site=session.fromPartition('persist:trailrest-web');
        await site.cookies.set({url:${JSON.stringify(origin)},name:'migration',value:${JSON.stringify(cookieValue)},expirationDate:Date.now()/1000+86400});
        await site.cookies.flushStore();app.quit();}).catch(()=>app.exit(1));`);
    const executable = createRequire(import.meta.url)('electron');
    const seeded = spawnSync(executable, [seed, '--password-store=gnome-libsecret'], { env:{...process.env,ELECTRON_RUN_AS_NODE:''},encoding:'utf8',timeout:30000 });
    assert.equal(seeded.status,0,seeded.stderr);
    const db = new DatabaseSync(join(profile,'Partitions/trailrest-web/Cookies'),{readOnly:true});
    try { assert.equal(db.prepare("SELECT value FROM cookies WHERE name='migration'").get().value,cookieValue); }
    finally { db.close(); }
  }
  const prefix = join(temporary, "installed prefix with ' spaces $ and %");
  const installed = spawnSync('bash', [join(source, 'install.sh'), '--prefix', prefix], { encoding: 'utf8' });
  assert.equal(installed.status, 0, installed.stderr);
  const distribution = await realpath(join(prefix, 'share/tern/current'));
  const menu = spawnSync('desktop-file-validate', [join(prefix, 'share/applications/tern.desktop')], { encoding: 'utf8' });
  assert.equal(menu.status, 0, menu.stdout + menu.stderr);
  await verifyReleaseFuses(join(distribution, 'Tern'));
  const contents = listPackage(join(distribution, 'resources/app.asar'));
  assert.ok(contents.includes('/node_modules/@tern/core/dist/workspace-model.js'));
  assert.ok(!contents.some(path => path.startsWith('/node_modules/@tern/app/')));
  assert.ok(!contents.some(path => /^\/node_modules\/(react|react-dom)(\/|$)/.test(path)));
  assert.ok(!contents.includes('/dist/host/contracts.js'));
  const launch = async () => {
    // Chromium CDP tests the real hardened binary without enabling Electron's
    // main-process inspector or modifying the production fuse settings.
    child = spawn(join(distribution, 'Tern'), ['--remote-debugging-port=0', ...(requireEncryption ? ['--password-store=gnome-libsecret'] : [])], {
      cwd: temporary, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TERN_PROFILE: profile }, stdio: ['ignore', 'ignore', 'pipe'],
    });
    const endpoint = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Packaged browser did not start.')), 20000);
      let output = '';
      child.stderr.on('data', chunk => {
        output += chunk.toString(); const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Packaged browser exited before startup, code ${code}.`)); });
    });
    browser = await chromium.connectOverCDP(endpoint);
    const context = browser.contexts()[0];
    for (let attempt = 0; attempt < 100; attempt++) {
      const shell = context.pages().find(page => page.url() === 'tern://app/index.html');
      if (shell) { await shell.getByRole('img', { name: 'Tern', exact: true }).waitFor(); return shell; }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Trusted shell did not open.');
  };
  let shell = await launch();
  const initial = await shell.evaluate(async () => window.tern.snapshot());
  assert.equal(initial.updates.configured, true, 'Bundled installation must enable managed updates');
  const security = initial.security;
  if (requireEncryption) assert.equal(security.cookieStorage,'encrypted');
  assert.ok(['encrypted', 'session'].includes(security.cookieStorage), 'Release must encrypt cookies or use memory-only storage');
  await shell.getByRole('button', { name: 'New task', exact: true }).click();
  await shell.getByRole('textbox', { name: 'New task', exact: true }).fill('Packaged shared core');
  await shell.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
  await shell.getByRole('button', { name: 'Select task Packaged shared core', exact: true }).waitFor();
  await shell.getByRole('textbox', { name: 'Address or search' }).fill(origin);
  await shell.getByRole('textbox', { name: 'Address or search' }).press('Enter');
  await shell.getByRole('button', { name: 'Select page Packaged fixture', exact: true }).waitFor();
  const website = browser.contexts()[0].pages().find(page => page.url() === origin);
  assert.ok(website); await website.getByLabel('Draft').fill('Keep this live form');
  const isolation = await website.evaluate(() => ({ node: typeof require, bridge: typeof window.tern }));
  assert.deepEqual(isolation, { node: 'undefined', bridge: 'undefined' });
  await shell.getByRole('button', { name: 'Settings', exact: true }).click();
  await shell.getByLabel('Default search engine').selectOption('brave');
  await shell.getByRole('button', { name: 'Back to browsing' }).click();
  assert.equal(await website.getByLabel('Draft').inputValue(), 'Keep this live form');
  await shell.getByRole('button', { name: 'Put aside', exact: true }).click();
  await shell.getByLabel('Where I left off').fill('Resume outside the repository');
  await shell.getByRole('button', { name: 'Put aside task', exact: true }).click();
  await shell.getByRole('dialog').waitFor({ state: 'hidden' });
  await close();
  if (requireEncryption) {
    const db = new DatabaseSync(join(profile,'Partitions/trailrest-web/Cookies'),{readOnly:true});
    try {
      const cookie = db.prepare("SELECT value,length(encrypted_value) AS encrypted FROM cookies WHERE name='migration'").get();
      assert.equal(cookie.value,''); assert.ok(cookie.encrypted > 0);
    } finally { db.close(); }
    await readFile(join(profile,'encrypted-cookies-v1'));
  }
  shell = await launch();
  if (requireEncryption) {
    const cookies = await shell.evaluate(() => window.tern.cookies({type:'list'}));
    assert.equal(cookies.find(cookie => cookie.name === 'migration').value,cookieValue);
    console.log('Existing plaintext cookie was encrypted and survived restart through the isolated OS keyring.');
  }
  const state = await shell.evaluate(() => window.tern.snapshot());
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].title, 'Packaged shared core');
  assert.equal(state.tasks[0].lifecycle, 'Later');
  assert.equal(state.tasks[0].note, 'Resume outside the repository');
  assert.equal(state.preferences.searchEngine, 'brave');
  assert.equal(state.pages[0].url, origin); assert.equal(state.pages[0].live, false);
  if (process.env.TERN_AI_BUILTIN_MODEL) {
    const model = { id: "builtin:lfm2.5-1.2b-instruct-qad-q4-8ed2880", filename: "LFM2.5-1.2B-Instruct-QAD-Q4_0.gguf" };
    await mkdir(join(profile, "models"), { recursive: true });
    await symlink(resolve(process.env.TERN_AI_BUILTIN_MODEL), join(profile, "models", model.filename));
    await browser.contexts()[0].route(/^https?:\/\//, route => route.fulfill({status:200,body:'<title>AI test destination</title>'}));
    await shell.evaluate(async id => {
      await window.tern.command({type:"setPreferences", patch:{summaryModel:id}});
      await window.tern.command({type:"startTask",request:"Research SQLite transaction isolation",useAI:true});
    }, model.id);
    const generated = await shell.evaluate(() => window.tern.snapshot());
    assert.equal(generated.tasks.length, 2, "Hardened binary must generate a task with native local AI");
    console.log("Native local AI generated a task in the hardened production binary.");
  }
  console.log(`Hardened release runs outside the repository, restores work and protects website processes. Cookie storage: ${security.cookieStorage}.`);
} finally {
  await close(); await new Promise(resolve => server.close(resolve)); await rm(temporary, { recursive: true, force: true });
}
