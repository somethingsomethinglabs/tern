import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';

test('embedded storage access requires scoped consent and can be blocked', async () => {
  let embeddedOrigin = '';
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(request.headers.host?.startsWith('localhost:')
      ? `<title>Embedded storage fixture</title><button onclick="document.cookie='fixture=present;SameSite=None;Secure';document.requestStorageAccess().then(()=>document.querySelector('output').textContent='Allowed').catch(()=>document.querySelector('output').textContent='Denied')">Use sign-in cookies</button><output></output>`
      : `<title>Hosting fixture</title><iframe src="${embeddedOrigin}/storage-fixture"></iframe>`);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as {port:number}).port;
  embeddedOrigin = `http://localhost:${port}`;
  const hostingOrigin = `http://127.0.0.1:${port}`;
  const profile = await mkdtemp(join(tmpdir(), 'tern-storage-access-'));
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ summaryModel: '', searchView: 'external' }));
  const app = await electron.launch({ args: ['.', '--test-third-party-cookie-phaseout'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TERN_PROFILE: profile }, chromiumSandbox: true });
  try {
    const shell = await app.firstWindow();
    await shell.getByRole('img', { name: 'Tern', exact: true }).waitFor();
    await app.evaluate(({ BrowserWindow, dialog }) => {
      BrowserWindow.getAllWindows()[0].setFullScreen(true);
      BrowserWindow.getAllWindows()[0].focus();
      dialog.showMessageBoxSync = (_window, options) => {
        (globalThis as any).storagePrompt = options;
        return 1;
      };
    });
    await shell.evaluate(async () => {
      await window.tern.command({ type: 'startTask', request: 'Storage access fixture', useAI: false });
    });
    await expect(shell.getByRole('button', { name: 'Select task Storage access fixture', exact: true })).toBeVisible();
    await shell.evaluate(address => window.tern.command({ type: 'navigate', address }), embeddedOrigin + '/storage-fixture');
    await expect.poll(() => app.context().pages().some(page => page.url() === embeddedOrigin + '/storage-fixture')).toBe(true);
    const google = app.context().pages().find(page => page.url() === embeddedOrigin + '/storage-fixture')!;
    await google.getByRole('button', { name: 'Use sign-in cookies' }).click();
    await shell.evaluate(address => window.tern.command({ type: 'navigate', address }), hostingOrigin + '/storage-fixture');
    await expect.poll(() => app.context().pages().some(page => page.url() === hostingOrigin + '/storage-fixture')).toBe(true);
    const host = app.context().pages().find(page => page.url() === hostingOrigin + '/storage-fixture')!;
    const embed = host.frameLocator('iframe');
    await embed.getByRole('button', { name: 'Use sign-in cookies' }).click();
    await expect(embed.locator('output')).toHaveText('Allowed');
    expect(await embed.locator('button').evaluate(() => document.cookie)).toContain('fixture=present');
    const prompt = await app.evaluate(() => (globalThis as any).storagePrompt);
    expect(prompt.detail).toContain(embeddedOrigin);
    expect(prompt.detail).toContain(hostingOrigin);
    expect(prompt.defaultId).toBe(0);
    await shell.evaluate(origin => window.tern.command({ type: 'setSitePermission', origin, permission: 'storage-access', policy: 'block' }), hostingOrigin);
    await expect.poll(() => app.context().pages().some(page => page !== host && page.url() === hostingOrigin + '/storage-fixture')).toBe(true);
    const blocked = app.context().pages().find(page => page !== host && page.url() === hostingOrigin + '/storage-fixture')!.frameLocator('iframe');
    await blocked.getByRole('button', { name: 'Use sign-in cookies' }).click();
    await expect(blocked.locator('output')).toHaveText('Denied');
  } finally {
    app.process().kill('SIGTERM'); await app.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
