import { test, expect, _electron as electron } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('extension menu pins toolbar actions, manages disabled state and restores pins', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'tern-extension-menu-'));
  const path = join(profile, 'fixture'); await mkdir(path);
  await writeFile(join(path, 'manifest.json'), JSON.stringify({ manifest_version: 3, name: 'Menu fixture', version: '1.0', action: { default_popup: 'popup.html' } }));
  await writeFile(join(path, 'popup.html'), '<h1>Fixture popup</h1>');
  await writeFile(join(profile, 'extensions.json'), JSON.stringify([path]));
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ summaryModel: '' }));
  const launch = () => electron.launch({ args: ['.'], cwd: process.cwd(), chromiumSandbox: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TERN_PROFILE: profile } });
  let app = await launch();
  try {
    let shell = await app.firstWindow();
    await expect(shell.getByRole('button', { name: 'Open Menu fixture', exact: true })).toHaveCount(0);
    await shell.getByRole('button', { name: 'Extensions', exact: true }).click();
    await expect(shell.getByRole('button', { name: 'Menu fixture Enabled', exact: true })).toBeVisible();
    await mkdir(join(process.cwd(), "../design/qa/extensions"), { recursive: true });
    await shell.screenshot({ path: "../design/qa/extensions/extension-menu.png" });
    await shell.getByRole('button', { name: 'Pin Menu fixture', exact: true }).click();
    await expect(shell.getByRole('button', { name: 'Unpin Menu fixture', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await shell.getByRole('button', { name: 'Manage extensions', exact: true }).click();
    await shell.screenshot({ path: "../design/qa/extensions/manage-extensions.png" });
    await shell.getByRole('button', { name: 'Disable Menu fixture', exact: true }).click();
    await shell.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(shell.getByRole('button', { name: 'Open Menu fixture', exact: true })).toHaveCount(0);
    await app.close(); app = await launch(); shell = await app.firstWindow();
    await shell.getByRole('button', { name: 'Extensions', exact: true }).click();
    await expect(shell.getByRole('button', { name: 'Menu fixture Disabled', exact: true })).toBeVisible();
    await expect(shell.getByRole('button', { name: 'Unpin Menu fixture', exact: true })).toBeVisible();
    await shell.getByRole('button', { name: 'Manage extensions', exact: true }).click();
    await shell.getByRole('button', { name: 'Enable Menu fixture', exact: true }).click();
    await shell.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(shell.getByRole('button', { name: 'Open Menu fixture', exact: true })).toBeVisible();
    await shell.getByRole('button', { name: 'Extensions', exact: true }).click();
    await shell.getByRole('button', { name: 'Unpin Menu fixture', exact: true }).click();
    await shell.keyboard.press('Escape');
    await expect(shell.getByRole('button', { name: 'Open Menu fixture', exact: true })).toHaveCount(0);
  } finally { await app.close(); await rm(profile, { recursive: true, force: true }); }
});
