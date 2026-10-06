import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('embedded Google storage access requires scoped consent and can be blocked', async () => {
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
    await app.context().route(/^https?:\/\//, route => {
      const url = new URL(route.request().url());
      const body = url.hostname === 'www.google.com'
        ? `<title>Google storage fixture</title><button onclick="document.cookie='fixture=present;SameSite=None;Secure';document.requestStorageAccess().then(()=>document.querySelector('output').textContent='Allowed').catch(()=>document.querySelector('output').textContent='Denied')">Use sign-in cookies</button><output></output>`
        : `<title>Hosting fixture</title><iframe src="https://www.google.com/storage-fixture"></iframe>`;
      return route.fulfill({ status: 200, contentType: 'text/html', body });
    });
    await shell.evaluate(async () => {
      await window.tern.command({ type: 'startTask', request: 'Storage access fixture', useAI: false });
    });
    await expect(shell.getByRole('button', { name: 'Select task Storage access fixture', exact: true })).toBeVisible();
    await shell.evaluate(() => window.tern.command({ type: 'navigate', address: 'https://www.google.com/storage-fixture' }));
    await expect.poll(() => app.context().pages().some(page => page.url() === 'https://www.google.com/storage-fixture')).toBe(true);
    const google = app.context().pages().find(page => page.url() === 'https://www.google.com/storage-fixture')!;
    await google.getByRole('button', { name: 'Use sign-in cookies' }).click();
    await shell.evaluate(() => window.tern.command({ type: 'navigate', address: 'https://hosting.example/storage-fixture' }));
    await expect.poll(() => app.context().pages().some(page => page.url() === 'https://hosting.example/storage-fixture')).toBe(true);
    const host = app.context().pages().find(page => page.url() === 'https://hosting.example/storage-fixture')!;
    const embed = host.frameLocator('iframe');
    await embed.getByRole('button', { name: 'Use sign-in cookies' }).click();
    await expect(embed.locator('output')).toHaveText('Allowed');
    const prompt = await app.evaluate(() => (globalThis as any).storagePrompt);
    expect(prompt.detail).toContain('https://www.google.com');
    expect(prompt.detail).toContain('https://hosting.example');
    expect(prompt.defaultId).toBe(0);
    await shell.evaluate(() => window.tern.command({ type: 'setSitePermission', origin: 'https://hosting.example', permission: 'storage-access', policy: 'block' }));
    await expect.poll(() => app.context().pages().some(page => page !== host && page.url() === 'https://hosting.example/storage-fixture')).toBe(true);
    const blocked = app.context().pages().find(page => page !== host && page.url() === 'https://hosting.example/storage-fixture')!.frameLocator('iframe');
    await blocked.getByRole('button', { name: 'Use sign-in cookies' }).click();
    await expect(blocked.locator('output')).toHaveText('Denied');
  } finally {
    app.process().kill('SIGTERM'); await app.close().catch(() => {});
    await rm(profile, { recursive: true, force: true });
  }
});
