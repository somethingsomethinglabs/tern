import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createHash } from 'node:crypto';

// Exercise the real sandboxed Store preload at its real origin, without a
// network dependency or permission to silently install fixture code.
test('store page bridge is scoped to its origin and unsigned packages never reach consent', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'tern-store-bridge-'));
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ summaryModel: '' }));
  const app = await electron.launch({ args: ['.'], cwd: process.cwd(), chromiumSandbox: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TERN_PROFILE: profile } });
  try {
    const shell = await app.firstWindow();
    await shell.getByRole('img', { name: 'Tern', exact: true }).waitFor();
    await app.evaluate(({ session, net, dialog }) => {
      const guests = session.fromPartition('persist:trailrest-web');
      guests.protocol.handle('https', () => new Response('<title>Store fixture</title><h1>Store fixture</h1>', {
        headers: { 'content-type': 'text/html', 'content-security-policy': "require-trusted-types-for 'script'; trusted-types test-policy" },
      }));
      const fetch = net.fetch;
      net.fetch = async (url, options) => String(url).startsWith('https://clients2.google.com/service/update2/crx') ? new Response('unsigned archive') : fetch(url, options);
      dialog.showMessageBox = async () => { throw new Error('Consent must not run for unsigned code'); };
    });
    await shell.getByRole('button', { name: 'Extensions', exact: true }).click();
    await expect(shell.getByLabel('Chrome Web Store link or extension ID')).not.toBeVisible();
    await shell.getByRole('button', { name: 'Browse Chrome Web Store' }).click();
    await expect.poll(() => app.context().pages().some(page => page.url() === 'https://chromewebstore.google.com/')).toBe(true);
    const store = app.context().pages().find(page => page.url() === 'https://chromewebstore.google.com/')!;
    await expect.poll(() => store.evaluate(() => typeof (window as any).chrome?.webstorePrivate?.beginInstallWithManifest3)).toBe('function');
    expect(await store.evaluate(async () => {
      const api = (window as any).chrome.webstorePrivate;
      return [await api.getFullChromeVersion(), await api.getExtensionStatus('a'.repeat(32), '{"manifest_version":3}')];
    })).toEqual([expect.objectContaining({ version_number: expect.any(String) }), 'installable']);
    expect(await store.evaluate(async () => {
      let callbackResult = '';
      const result = await (window as any).chrome.webstorePrivate.beginInstallWithManifest3({ id: 'a'.repeat(32) }, (value: string) => { callbackResult = value; });
      return [result, callbackResult, (window as any).chrome.extension.lastError?.message];
    })).toEqual(['install_error', 'install_error', expect.stringContaining('CRX3')]);
    const state = await shell.evaluate(() => (window as any).tern.snapshot());
    expect(state.extensions).toEqual([]);
    await store.goto('https://chromewebstore.google.com.evil.example/');
    expect(await store.evaluate(() => typeof (window as any).electronWebstore)).toBe('undefined');
    await store.goto('https://chromewebstore.google.com/');
    await expect.poll(() => store.evaluate(() => typeof (window as any).electronWebstore)).toBe('object');
    await store.evaluate(() => { const frame = document.createElement('iframe'); frame.src = 'https://chromewebstore.google.com/frame'; document.body.append(frame); });
    await expect.poll(() => store.frames().length).toBe(2);
    expect(await store.frames()[1].evaluate(() => typeof (window as any).electronWebstore)).toBe('undefined');
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
    await app.close(); await rm(profile, { recursive: true, force: true });
  }
});


test('store registrations still restore when the developer import list is corrupt', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'tern-store-restore-'));
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'der' });
  const id = createHash('sha256').update(key).digest('hex').slice(0, 32).replace(/[0-9a-f]/g, digit => String.fromCharCode(97 + parseInt(digit, 16)));
  const path = join(profile, 'store-extensions', id, '1.0');
  await mkdir(path, { recursive: true });
  await writeFile(join(path, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Restored store fixture', version: '1.0', key: key.toString('base64') }));
  await writeFile(join(profile, 'extensions.json'), 'broken developer registry');
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ summaryModel: '' }));
  await writeFile(join(profile, 'store-extensions.json'), JSON.stringify({ format: 1, entries: [{ id, path, name: 'Restored store fixture', version: '1.0', key: key.toString('base64'), enabled: true, permissions: [], source: 'chrome-web-store' }] }));
  const app = await electron.launch({ args: ['.'], cwd: process.cwd(), chromiumSandbox: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TERN_PROFILE: profile } });
  try {
    const shell = await app.firstWindow();
    await shell.getByRole('img', { name: 'Tern', exact: true }).waitFor();
    const state = await shell.evaluate(() => (window as any).tern.snapshot());
    expect(state.extensions).toEqual([expect.objectContaining({ id, name: 'Restored store fixture', enabled: true, error: '' })]);
    expect(await app.evaluate(({ session }, id) => !!session.fromPartition('persist:trailrest-web').extensions.getExtension(id), id)).toBe(true);
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
    await app.close(); await rm(profile, { recursive: true, force: true });
  }
});
