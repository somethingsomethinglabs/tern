import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserApplication } from '../dist/application.js';

const emptySearch = { searchTransport: async () => ({ results: [], warnings: [], hasNext: false }) };

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
  const h = host(); const app = await BrowserApplication.open(h.platform, emptySearch);
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
  const restarted = await BrowserApplication.open(host(h.saved()).platform, emptySearch);
  const restored = await restarted.snapshot();
  assert.equal(restored.pages[0].live, false);
  assert.equal(restored.tasks[0].note, 'Check the amount');
  assert.equal(restored.tasks[0].lifecycle, 'Settled');
});

test('manual goal setup persists the entire task before searching', async () => {
  const h = host();
  const app = await BrowserApplication.open(h.platform, { searchTransport: async () => { assert.ok(h.saved()); return { results: [], warnings: [], hasNext: false }; } });
  const result = await app.command({ type: 'startTask', request: 'Compare Linux laptops', useAI: false });
  const state = await app.snapshot();
  assert.equal(result.createdTaskId, state.tasks[0].id);
  assert.equal(state.tasks[0].request, 'Compare Linux laptops');
  assert.equal(state.pages[0].search.query, 'Compare Linux laptops');
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 0);
  const broken = host(); const failing = await BrowserApplication.open(broken.platform, emptySearch); broken.fail();
  await assert.rejects(failing.command({ type: 'startTask', request: 'Keep my request', useAI: false }));
  assert.equal((await failing.snapshot()).tasks.length, 0);
  assert.equal(broken.calls.filter(call => call[0] === 'open').length, 0);
});

test('corrupt saved data is not overwritten', async () => {
  const h = host('not json'); const app = await BrowserApplication.open(h.platform, emptySearch);
  assert.match((await app.snapshot()).storageError, /preserved/);
  await assert.rejects(app.command({ type: 'createTask', title: 'Unsaved' }));
  assert.equal(h.saved(), 'not json');
});

test('commands serialize writes and invalid navigation never reaches the native adapter', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform, emptySearch);
  await Promise.all([app.command({ type: 'createTask', title: 'One' }), app.command({ type: 'createTask', title: 'Two' })]);
  assert.deepEqual(JSON.parse(h.saved()).workspace.tasks.map(task => task.title), ['One', 'Two']);
  await assert.rejects(app.command({ type: 'navigate', address: 'file:///etc/passwd' }));
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 0);
});

test('failed native pages can be retried and discarded renderers reopen', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform, emptySearch);
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
  const h = host(); const app = await BrowserApplication.open(h.platform, emptySearch);
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

test('reopening a settled task activates it and restores its selected reference', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform, emptySearch);
  await app.command({ type: 'createTask', title: 'Supplier call' });
  await app.command({ type: 'navigate', address: 'https://example.com/form' });
  const before = await app.snapshot();
  await app.command({ type: 'settle' });
  await app.command({ type: 'openTask', id: before.selectedTaskId });
  const after = await app.snapshot();
  assert.equal(after.tasks[0].lifecycle, 'Active');
  assert.equal(after.pages[0].live, true);
  assert.equal(after.tasks[0].selectedPageId, before.tasks[0].selectedPageId);
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 2);
});

test('a chosen task name keeps the original request and rejects invalid names before opening', async () => {
  const h = host(); const app = await BrowserApplication.open(h.platform, emptySearch);
  const request = 'Plan a weekend hike near Melbourne with an easy trail and public transport';
  await app.command({ type: 'startTask', request, useAI: false, title: 'Weekend hike' });
  const state = await app.snapshot();
  assert.equal(state.tasks[0].title, 'Weekend hike');
  assert.equal(state.tasks[0].request, request);
  assert.equal(state.tasks[0].goal, request);
  await assert.rejects(app.command({ type: 'startTask', request, useAI: false, title: 'x'.repeat(61) }));
  assert.equal((await app.snapshot()).tasks.length, 1);
  assert.equal((await app.snapshot()).pages[0].search.query, request.slice(0, 160));
  assert.equal(h.calls.filter(call => call[0] === 'open').length, 0);
});

test('Android defaults to search websites, preserves engine choice and migrates saved internal searches', async () => {
  const h = host();
  const app = await BrowserApplication.open(h.platform, { capabilities: { mobile: true } });
  assert.equal((await app.snapshot()).preferences.searchView, 'external');
  await app.command({ type: 'createTask', title: 'Phone search' });
  await app.command({ type: 'navigate', address: 'Svelte documentation' });
  assert.match(h.calls.find(call => call[0] === 'open')[2], /^https:\/\/duckduckgo\.com\//);
  await app.command({ type: 'setPreferences', patch: { searchEngine: 'bing', searchView: 'reading-list' } });
  const saved = JSON.parse(h.saved());
  saved.preferences.searchView = 'reading-list';
  saved.workspace.pages[0].url = '';
  saved.workspace.pages[0].search = { query: 'saved query', endpoint: 'http://127.0.0.1:8888/', filter: 'Docs', page: 1, hiddenDomains: [] };
  const restarted = await BrowserApplication.open(host(JSON.stringify(saved)).platform, { capabilities: { mobile: true } });
  const state = await restarted.snapshot();
  assert.equal(state.preferences.searchView, 'external'); assert.equal(state.preferences.searchEngine, 'bing');
  assert.match(state.pages[0].url, /^https:\/\/www.bing.com\/search\?q=saved%20query/);
  assert.equal(state.pages[0].search, undefined);
});
