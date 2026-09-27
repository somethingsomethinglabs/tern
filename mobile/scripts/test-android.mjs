import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('../../', import.meta.url));
const adbPath = join(process.env.ANDROID_HOME || join(root, '.tools/android-sdk'), 'platform-tools/adb');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const adb = (...args) => execFileSync(adbPath, ['-s', serial, ...args], { encoding: 'utf8', timeout: 30000 }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const artifacts = join(root, 'mobile/test-results');
mkdirSync(artifacts, { recursive: true });
writeFileSync(join(artifacts, 'result.json'), JSON.stringify({ passed: false, status: 'running' }));
const fixture = createServer((request, response) => {
  if (request.url === '/download') {
    response.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="tern-test.txt"' });
    response.end('Tern download test'); return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>${request.url === '/second' ? 'Second page' : 'Test form'}</title><h1>${request.url === '/second' ? 'Second page' : 'Test form'}</h1><label>Amount <input aria-label="Amount"></label><p><a href="/second">Next page</a></p><p><a href="/popup" target="_blank">Open reference</a></p><p><a href="/download">Download</a></p><input type="file" aria-label="Attachment"><style>body{font:20px sans-serif;padding:20px}input{font:inherit;width:90%}</style>`);
});
await new Promise(resolve => fixture.listen(4199, '127.0.0.1', resolve));
let browser;
async function connect() {
  const pid = adb('shell', 'pidof', 'app.tern.browser').split(' ')[0];
  adb('forward', 'tcp:9223', `localabstract:webview_devtools_remote_${pid}`);
  for (let i = 0; i < 30; i++) {
    try { browser = await chromium.connectOverCDP('http://127.0.0.1:9223', { timeout: 5000, noDefaults: true }); break; }
    catch (error) { if (i === 29) throw error; await delay(1000); }
  }
  if (!browser) throw new Error('WebView debugging endpoint did not start');
  const context = browser.contexts()[0];
  for (let i = 0; i < 30; i++) {
    const shell = context.pages().find(page => page.url().startsWith('https://localhost'));
    if (shell) { shell.setDefaultTimeout(45000); await shell.getByRole('button', { name: 'Tasks and tabs' }).waitFor(); return { shell, context }; }
    await delay(1000);
  }
  throw new Error('Tern shell did not load');
}
async function start() { adb('shell', 'am', 'start', '-W', '-n', 'app.tern.browser/.MainActivity'); return connect(); }
async function screen(name) {
  // CDP DOM changes can precede the Android compositor's next frame.
  await delay(400);
  const bytes = execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 30000 });
  writeFileSync(join(artifacts, name + '.png'), bytes);
}
try {
  assert.equal(adb('shell', 'getprop', 'sys.boot_completed'), '1', 'Boot an Android emulator first');
  // This suite owns only this emulator test app's data, never a user's phone profile.
  if (!serial.startsWith('emulator-')) throw new Error('This destructive test suite requires an emulator serial');
  adb('install', '-r', join(root, 'mobile/artifacts/tern-android-debug.apk'));
  adb('shell', 'pm', 'clear', 'app.tern.browser');
  adb('shell', 'rm', '-f', '/sdcard/Download/tern-test.txt');
  adb('reverse', 'tcp:4199', 'tcp:4199');
  let { shell, context } = await start();
  await screen('01-overview');
  await shell.getByRole('button', { name: 'Tasks and tabs' }).click();
  await shell.getByRole('textbox', { name: 'New task', exact: true }).fill('Android task');
  await shell.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
  const address = shell.getByRole('textbox', { name: 'Address or search' });
  await address.fill('http://127.0.0.1:4199/'); await address.press('Enter');
  await expect.poll(() => context.pages().some(page => page.url().includes('127.0.0.1:4199')), { timeout: 60000 }).toBe(true);
  let site = context.pages().find(page => page.url().includes('127.0.0.1:4199'));
  site.setDefaultTimeout(45000);
  await site.getByLabel('Amount', { exact: true }).waitFor();
  const fullHeight = await shell.evaluate(() => innerHeight);
  const targets = await (await fetch('http://127.0.0.1:9223/json')).json();
  const placement = JSON.parse(targets.find(target => target.url.includes('127.0.0.1:4199')).description);
  const amount = await site.getByLabel('Amount', { exact: true }).boundingBox();
  adb('shell', 'input', 'tap', String(Math.round(placement.screenX + amount.x + amount.width / 2)), String(Math.round(placement.screenY + amount.y + amount.height / 2)));
  await expect.poll(() => shell.evaluate(() => innerHeight), { timeout: 10000 }).toBeLessThan(fullHeight);
  adb('shell', 'input', 'text', '47.50');
  await expect(site.getByLabel('Amount', { exact: true })).toHaveValue('47.50');
  await screen('02-keyboard');
  adb('shell', 'input', 'keyevent', '4');
  await expect.poll(() => shell.evaluate(() => innerHeight)).toBe(fullHeight);
  assert.equal(await site.evaluate(() => typeof window.Capacitor + '/' + typeof window.tern), 'undefined/undefined');
  await screen('02-live-page');
  await shell.getByRole('button', { name: 'Tasks and tabs' }).click();
  await shell.getByRole('textbox', { name: 'New task', exact: true }).fill('Second task');
  await shell.getByRole('textbox', { name: 'New task', exact: true }).press('Enter');
  await shell.getByRole('button', { name: 'Tasks and tabs' }).click();
  await shell.getByRole('button', { name: 'Select task Android task', exact: true }).click();
  assert.equal(await site.getByLabel('Amount', { exact: true }).inputValue(), '47.50');
  await site.getByRole('link', { name: 'Next page', exact: true }).click();
  await site.getByRole('heading', { name: 'Second page', exact: true }).waitFor();
  adb('shell', 'input', 'keyevent', '4');
  await site.getByRole('heading', { name: 'Test form', exact: true }).waitFor();
  await site.getByRole('link', { name: 'Download', exact: true }).click();
  await shell.getByRole('button', { name: 'Downloads', exact: true }).click();
  await expect(shell.getByRole('dialog').getByText('Complete', { exact: true })).toBeVisible({ timeout: 60000 });
  assert.equal(adb('shell', 'cat', '/sdcard/Download/tern-test.txt'), 'Tern download test');
  await shell.getByRole('button', { name: 'Done', exact: true }).click();
  await site.getByRole('link', { name: 'Open reference', exact: true }).click();
  await expect.poll(() => context.pages().some(page => page.url().endsWith('/popup')), { timeout: 30000 }).toBe(true);
  await shell.getByRole('button', { name: 'Tasks and tabs' }).click();
  await expect(shell.getByRole('button', { name: 'Select page Test form', exact: true })).toHaveCount(2);
  await shell.getByRole('button', { name: 'Select page Test form', exact: true }).first().click();
  await shell.getByRole('button', { name: 'Tasks and tabs' }).click();
  await shell.getByRole('button', { name: 'Put aside', exact: true }).click();
  await shell.getByRole('textbox', { name: /Next step|Where|note/i }).fill('Check the amount tomorrow');
  await shell.getByRole('button', { name: 'Put aside task', exact: true }).click();
  await screen('03-paused');
  // Force-stop models Android ending the process, including its website renderers.
  adb('shell', 'am', 'force-stop', 'app.tern.browser');
  await browser.close().catch(() => {}); browser = null;
  ({ shell, context } = await start());
  await shell.getByRole('button', { name: 'Tasks and tabs' }).click();
  await shell.getByRole('button', { name: 'Later tasks', exact: true }).click();
  await shell.getByRole('button', { name: 'Select task Android task', exact: true }).click();
  await shell.getByRole('heading', { name: 'Reopen this reference', exact: true }).waitFor();
  await shell.getByRole('button', { name: 'Toggle task notes', exact: true }).click();
  await expect(shell.getByRole('textbox', { name: /next.step|note/i }).first()).toHaveValue('Check the amount tomorrow');
  await screen('04-restored-notes');
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify({ passed: true, checks: ['shared UI loads', 'real web browsing', 'native touch input and keyboard resizing', 'website bridge isolation', 'live form survives task switches', 'Android Back navigates page history', 'native download completes', 'popup links open a new tab', 'pause note and page references survive force-stop'] }, null, 2));
  console.log('Android checks passed. Screenshots and result.json are in mobile/test-results.');
} catch (error) {
  await screen('failure').catch(() => {});
  writeFileSync(join(artifacts, 'result.json'), JSON.stringify({ passed: false, error: String(error) }, null, 2));
  throw error;
} finally {
  await browser?.close().catch(() => {});
  fixture.close();
  try { adb('forward', '--remove', 'tcp:9223'); adb('reverse', '--remove', 'tcp:4199'); } catch {}
}
