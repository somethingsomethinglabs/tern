import { test, expect, _electron as electron, type ElectronApplication } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

// This exercises the actual Linux picker and Chromium filesystem implementation.
// All native input is directed to windows owned by this isolated test process.
test('a website saves a selected file through the real native picker', async () => {
  test.skip(process.platform !== 'linux' || !process.env.DISPLAY || spawnSync('xdotool', ['--version']).status !== 0, 'Linux X11 and xdotool are required for native chooser validation.');
  test.setTimeout(45000);
  const profile = await mkdtemp(join(tmpdir(), 'tern-native-file-'));
  const outputDirectory = await mkdtemp(join(tmpdir(), 'tern-native-output-'));
  const destination = join(outputDirectory, `${outputDirectory.split('/').pop()}.txt`);
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<title>Native file saving</title><button id="save">Save selected file</button><output></output><script>
      document.querySelector('#save').onclick=async()=>{try{const handle=await showSaveFilePicker({suggestedName:'${outputDirectory.split('/').pop()}.txt',startIn:'downloads'});
        const stream=await handle.createWritable();await stream.write('Saved by the website');await stream.close();document.querySelector('output').textContent='Saved';
      }catch(error){document.querySelector('output').textContent=error.name+': '+error.message;}};</script>`);
  });
  let app: ElectronApplication | undefined;
  try {
    await writeFile(join(profile, 'preferences.json'), JSON.stringify({ summaryModel: '', searchView: 'external' }));
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as any).port}`;
    app = await electron.launch({ args: ['.', '--ozone-platform=x11'], cwd: process.cwd(),
      env: { ...process.env, LC_ALL: 'C.UTF-8', GDK_BACKEND: 'x11', GTK_USE_PORTAL: '0', DBUS_SESSION_BUS_ADDRESS: 'unix:path=' + join(profile, 'no-session-bus'), ELECTRON_RUN_AS_NODE: '', TERN_PROFILE: profile }, chromiumSandbox: true });
    const shell = await app.firstWindow();
    await shell.waitForLoadState();
    await app.evaluate(({ dialog, BrowserWindow, app }, directory) => {
      app.setPath("downloads", directory);
      app.setPath("documents", directory);
      BrowserWindow.getAllWindows()[0].focus();
      dialog.showMessageBoxSync = (_window, options) => { (globalThis as any).lastFilePermission = options; return 1; };
    }, outputDirectory);
    await shell.evaluate(async () => { await (window as any).tern.command({ type: 'createTask', title: 'File saving' }); });
    await shell.getByRole('textbox', { name: 'Address or search' }).fill(origin);
    await shell.getByRole('textbox', { name: 'Address or search' }).press('Enter');
    await expect(shell.getByRole('button', { name: 'Select page Native file saving' })).toBeVisible();
    const website = app.context().pages().find(page => page.url().startsWith(origin))!;
    await website.getByRole('button', { name: 'Save selected file' }).click();
    const pid = app.process().pid!;
    const mainWindowId = String(await app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows()[0].getNativeWindowHandle().readUInt32LE(0)));
    let dialogId = '';
    await expect.poll(() => {
      try { dialogId = execFileSync('xdotool', ['search', '--pid', String(pid), '--onlyvisible', '--name', 'Save'], { encoding: 'utf8' }).trim().split('\n').find(id => id !== mainWindowId) ?? '';  }
      catch { dialogId = ''; }
      return !!dialogId;
    }, { timeout: 10000 }).toBe(true);
    execFileSync('xdotool', ['windowfocus', '--sync', dialogId]);
    expect(execFileSync('xdotool', ['getwindowfocus'], { encoding: 'utf8' }).trim()).toBe(dialogId);
    // Allow GTK to finish constructing its chooser after mapping the window.
    await new Promise(resolve => setTimeout(resolve, 300));
    // GTK can map the window before its Save control is ready. Retry only
    // while this test-owned chooser still holds focus, never another window.
    await expect.poll(async () => {
      const result = await website.locator('output').textContent();
      if (result) return result;
      try {
        if (execFileSync('xdotool', ['getwindowfocus'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === dialogId)
          execFileSync('xdotool', ['key', 'alt+s']);
      } catch { /* Closing the chooser briefly leaves X11 without a focused window. */ }
      return '';
    }, { timeout: 15000, intervals: [200, 300, 500] }).toBe('Saved');
    expect(await readFile(destination, 'utf8')).toBe('Saved by the website');
    const prompt = await app.evaluate(() => (globalThis as any).lastFilePermission);
    expect(prompt.message).toContain(origin);
    expect(prompt.detail).toContain(destination);
    expect(prompt.defaultId).toBe(0);
  } finally {
    if (app) {
      await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
      app.process().kill('SIGTERM');
    }
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(profile, { recursive: true, force: true });
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
