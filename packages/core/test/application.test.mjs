import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserApplication } from '../dist/application.js';

function host(saved = null) {
  const calls = [];
  let serial = 0;
  let listener;
  let fail = false;
  const platform = {
    read: async () => saved,
    write: async value => { if (fail) throw new Error('Disk full'); saved = value; calls.push(['write']); },
    open: async page => calls.push(['open', page.id, page.url]),
    activate: async id => calls.push(['activate', id]),
    navigate: async (id, url) => calls.push(['navigate', id, url]),
    close: async id => calls.push(['close', id]),
    action: async (id, action) => calls.push([action, id]),
    layout: () => {}, clearCache: async () => {}, clipboard: async () => {}, confirm: async () => true,
    exit: async () => calls.push(['exit']), setZoom: async () => {},
    listen: async callback => { listener = callback; return () => {}; },
    id: () => `id-${++serial}`, now: () => 1000,
  };
  return { platform, calls, saved: () => saved, fail: () => { fail = true; }, event: event => listener(event) };
}

test('live task switching and settlement use shared rules; restart restores references', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform);
  await app.command({ type: 'createTask', title: 'First' });
  await app.command({ type: 'navigate', address: 'https://example.com/form' });
  const original = await app.snapshot();
  const task = original.tasks[0], page = original.pages[0];
  await app.command({ type: 'pause', note: 'Check the amount' });
  await app.command({ type: 'createTask', title: 'Second' });
  await app.command({ type: 'openTask', id: task.id });
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 1);
  assert.equal((await app.snapshot()).pages[0].live, true);
  await app.command({ type: 'settle' });
  assert.ok(h.calls.some(call => call[0] === 'close' && call[1] === page.id));
  assert.equal((await app.snapshot()).pages[0].live, false);
  const restarted = await BrowserApplication.open(host(h.saved()).platform);
  const restored = await restarted.snapshot();
  assert.equal(restored.pages[0].live, false);
  assert.equal(restored.tasks[0].note, 'Check the amount');
  assert.equal(restored.tasks[0].lifecycle, 'Settled');
});

test('manual goal setup persists the entire task before starting a website', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform);
  const result = await app.command({ type: 'startTask', request: 'Compare Linux laptops', useAI: false });
  const state = await app.snapshot();
  assert.equal(result.createdTaskId, state.tasks[0].id);
  assert.equal(state.tasks[0].request, 'Compare Linux laptops');
  assert.ok(h.calls.findIndex(call => call[0] === 'write') < h.calls.findIndex(call => call[0] === 'open'));
  const broken = host(); const failing = await BrowserApplication.open(broken.platform); broken.fail();
  await assert.rejects(failing.command({ type: 'startTask', request: 'Keep my request', useAI: false }));
  assert.equal((await failing.snapshot()).tasks.length, 0);
  assert.equal(broken.calls.filter(call => call[0] === 'open').length, 0);
});

test('corrupt saved data is not overwritten', async () => {
  const h = host('not json'); const app = await BrowserApplication.open(h.platform);
  assert.match((await app.snapshot()).storageError, /preserved/);
  await assert.rejects(app.command({ type: 'createTask', title: 'Unsaved' }));
  assert.equal(h.saved(), 'not json');
});

test('commands serialize writes and invalid navigation never reaches the native adapter', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform);
  await Promise.all([app.command({ type: 'createTask', title: 'One' }), app.command({ type: 'createTask', title: 'Two' })]);
  assert.deepEqual(JSON.parse(h.saved()).workspace.tasks.map(task => task.title), ['One', 'Two']);
  await assert.rejects(app.command({ type: 'navigate', address: 'file:///etc/passwd' }));
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 0);
});

test('failed native pages can be retried and discarded renderers reopen', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform);
  await app.command({ type: 'createTask', title: 'Page' });
  await app.command({ type: 'navigate', address: 'https://example.com' });
  const page = (await app.snapshot()).pages[0];
  const event = { type: 'page', id: page.id, url: page.url, title: 'Page', loading: false, canGoBack: false, canGoForward: false };
  h.event({ ...event, live: true, error: 'Network unavailable' });
  await app.command({ type: 'reopen' });
  assert.ok(h.calls.some(call => call[0] === 'navigate'));
  h.event({ ...event, live: false, error: 'Renderer ended' });
  await app.command({ type: 'reopen' });
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 2);
});

test('Android Back navigates history, then overview, then yields to Android', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform);
  await app.command({ type: 'createTask', title: 'Read' });
  await app.command({ type: 'navigate', address: 'https://example.com' });
  const page = (await app.snapshot()).pages[0];
  h.event({ type: 'page', id: page.id, url: page.url, title: 'Read', live: true, loading: false, error: '', canGoBack: true, canGoForward: false });
  await app.command({ type: 'back' });
  assert.ok(h.calls.some(call => call[0] === 'back'));
  h.event({ type: 'page', id: page.id, url: page.url, title: 'Read', live: true, loading: false, error: '', canGoBack: false, canGoForward: false });
  await app.command({ type: 'back' });
  assert.equal((await app.snapshot()).overviewOpen, true);
  await app.command({ type: 'back' });
  assert.ok(h.calls.some(call => call[0] === 'exit'));
});
