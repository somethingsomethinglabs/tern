import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SearchController, normalizeSearxng, createSearxngTransport, visibleSearchResults } from '../dist/search.js';
import { WorkspaceModel } from '../dist/workspace-model.js';
import { emptyWorkspace, parseWorkspace } from '../dist/workspace.js';
import { BrowserApplication } from '../dist/application.js';

const response = () => normalizeSearxng({ results: [
  { title: '<b>API</b> &amp; full title', url: 'https://docs.example.com/api', content: 'Full excerpt', engines: ['one'] },
  { title: 'Repository', url: 'https://chatgpt.com/', content: 'Project excerpt' },
  { title: 'Discussion', url: 'https://example.com/articles/one', content: 'Discussion excerpt' },
] });
const settle = () => new Promise(resolve => setImmediate(resolve));
function owner(transport = async () => response()) {
  let serial = 0; const workspace = emptyWorkspace();
  const model = new WorkspaceModel(workspace, { id: () => `id-${++serial}`, now: () => 1000 });
  model.command({ type: 'createTask', title: 'Research' });
  const opened = [];
  const search = new SearchController(model, transport, () => {}, async page => { opened.push(page); });
  return { workspace, model, search, opened };
}

test('normalization rejects unsafe destinations, preserves query identity and merges provenance', () => {
  const data = normalizeSearxng({ results: [
    { url: 'javascript:alert(1)', title: 'Unsafe' },
    { url: 'https://user:password@example.com', title: 'Credentials' },
    { url: 'https://docs.example.com/api?version=1#one', title: 'A &amp; B', content: '<b>Text</b>', engines: ['first'] },
    { url: 'https://docs.example.com/api?version=1#two', engines: ['second'] },
    { url: 'https://docs.example.com/api?version=2', title: 'Version two' },
  ], unresponsive_engines: [['google', 'timeout']] });
  assert.equal(data.results.length, 2);
  assert.equal(data.results[0].title, 'A & B');
  assert.equal(data.results[0].excerpt, 'Text');
  assert.deepEqual(data.results[0].engines, ['first', 'second']);
  assert.equal(data.warnings[0], 'google: timeout');
  assert.deepEqual(response().results.map(result => result.kind), ['Docs', 'Applications', 'Articles']);
});

test('first-result selection honors filters and hidden domains; results open as task pages', async () => {
  const h = owner(); const page = h.search.create(h.model.task().id, 'search', {});
  await settle();
  await h.search.command({ type: 'refineSearch', id: page.id, filter: 'Applications' }, {});
  await h.search.command({ type: 'openSearchResult', id: page.id, first: true, background: true }, {});
  assert.equal(h.opened[0].url, 'https://chatgpt.com/');
  assert.equal(h.opened[0].sourceSearchId, page.id);
  assert.equal(h.model.task().selectedPageId, page.id);
  await h.search.command({ type: 'refineSearch', id: page.id, hiddenDomains: ['chatgpt.com'] }, {});
  assert.equal(visibleSearchResults(page.search, h.search.state(page.id)).length, 0);
  await assert.rejects(h.search.command({ type: 'openSearchResult', id: page.id, first: true }, {}));
});

test('late responses and cancelled searches cannot replace a newer query or open a result', async () => {
  const requests = []; const h = owner((definition, signal) => new Promise(resolve => requests.push({ definition, signal, resolve })));
  const page = h.search.create(h.model.task().id, 'first', {}, undefined, true);
  h.search.create(page.taskId, 'second', {}, page);
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve({ ...response(), results: [response().results[1]] }); await settle();
  requests[0].resolve(response()); await settle();
  assert.equal(h.search.state(page.id).results[0].title, 'Repository');
  assert.equal(h.opened.length, 0);
  h.search.run(page, true); h.search.stop(page.id);
  requests[2].resolve(response()); await settle();
  assert.equal(h.opened.length, 0);
  assert.equal(h.search.state(page.id).loading, false);
});

test('a delayed first-result request cannot switch away from a different task', async () => {
  let resolve; const h = owner(() => new Promise(done => resolve = done));
  h.search.create(h.model.task().id, 'query', {}, undefined, true);
  h.model.command({ type: 'createTask', title: 'Other work' });
  resolve(response()); await settle();
  assert.equal(h.opened.length, 0);
  assert.equal(h.model.task().title, 'Other work');
});

test('retrying a saved search uses the newly configured server without losing its filters', async () => {
  const requests = [];
  const h = owner(async definition => { requests.push(definition.endpoint); return response(); });
  const page = h.search.create(h.model.task().id, 'query', { searxngURL: 'https://old.example.com/' });
  await settle();
  await h.search.command({ type: 'refineSearch', id: page.id, filter: 'Docs' }, {});
  h.search.refresh(page, { searxngURL: 'https://new.example.com/' });
  await settle();
  assert.deepEqual(requests, ['https://old.example.com/', 'https://new.example.com/']);
  assert.equal(page.search.filter, 'Docs');
});

test('search definitions and kept destination links survive restart without result bodies', async () => {
  const h = owner(); const page = h.search.create(h.model.task().id, 'query', {}); await settle();
  await h.search.command({ type: 'keepSearchResult', id: page.id, url: response().results[0].url }, {});
  const saved = JSON.stringify(h.workspace); const restored = parseWorkspace(saved);
  assert.equal(restored.pages[0].search.query, 'query');
  assert.equal(restored.tasks[0].keptLinks[0].url, response().results[0].url);
  assert.equal(saved.includes('Full excerpt'), false);
  assert.throws(() => parseWorkspace(JSON.stringify({ ...restored, pages: [{ ...restored.pages[0], search: { ...page.search, endpoint: 'file:///etc/passwd' } }] })));
  const old = parseWorkspace(JSON.stringify({ version: 1, tasks: restored.tasks, pages: [], selectedTaskId: restored.selectedTaskId }));
  assert.equal(old.tasks[0].selectedPageId, null);
});

test('HTTP transport retains partial results and reports missing JSON support', async () => {
  const definition = { query: 'term & second', endpoint: 'https://example.com/searx/', page: 2, filter: 'All', hiddenDomains: [] };
  let requested;
  const transport = createSearxngTransport(async url => { requested = new URL(url); return new Response(JSON.stringify({ results: [{ url: 'https://example.org', title: 'Result' }], unresponsive_engines: [['one', 'timeout']] })); });
  const data = await transport(definition, new AbortController().signal);
  assert.equal(requested.pathname, '/searx/search'); assert.equal(requested.searchParams.get('q'), definition.query);
  assert.equal(requested.searchParams.get('pageno'), '2'); assert.equal(data.results.length, 1); assert.equal(data.warnings.length, 1);
  await assert.rejects(createSearxngTransport(async () => new Response('', { status: 403 }))(definition, new AbortController().signal), /JSON/);
});

test('shared application keeps native views separate from internal searches and returns from results', async () => {
  let serial = 0; let saved; const calls = [];
  const platform = { read: async () => saved ?? null, write: async value => saved = value,
    open: async page => calls.push(['open', page.url]), activate: async id => calls.push(['activate', id]), navigate: async () => {}, close: async () => {}, action: async () => {}, layout() {}, clearCache: async () => {}, clipboard: async () => {}, confirm: async () => true, exit: async () => {}, setZoom: async () => {}, listen: async () => () => {}, id: () => `id-${++serial}`, now: () => 1 };
  const app = await BrowserApplication.open(platform, { searchTransport: async () => response() });
  await app.command({ type: 'createTask', title: 'Search' });
  await app.command({ type: 'navigate', address: 'ordinary query' }); await settle();
  const search = (await app.snapshot()).pages[0];
  assert.equal(calls.filter(call => call[0] === 'open').length, 0);
  await app.command({ type: 'openSearchResult', id: search.id, first: true });
  assert.equal(calls.filter(call => call[0] === 'open').length, 1);
  await app.command({ type: 'back' });
  assert.equal((await app.snapshot()).tasks[0].selectedPageId, search.id);
  assert.deepEqual(calls.at(-1), ['activate', null]);
  const restarted = await BrowserApplication.open(platform, { searchTransport: async () => response() });
  await restarted.command({ type: 'openTask', id: search.taskId }); await settle();
  assert.equal((await restarted.snapshot()).pages[0].search.query, 'ordinary query');
});

test('switching to website search makes an existing reading-list query use the selected engine', async () => {
  const h = owner(); const page = h.search.create(h.model.task().id, 'initial query', {}); await settle();
  await h.search.command({ type: 'searchPage', id: page.id, query: 'new query' }, { searchView: 'external', searchEngine: 'duckduckgo' });
  assert.equal(h.opened.length, 1);
  assert.equal(h.opened[0].url, 'https://duckduckgo.com/?q=new%20query');
  assert.equal(page.search.query, 'initial query');
});

test('saved legacy categories migrate to All while current category filters survive restart', async () => {
  const h = owner();
  const page = h.search.create(h.model.task().id, 'query', {});
  await settle();
  for (const filter of ['Projects', 'Discussions', 'Articles', 'Applications', 'Videos']) {
    const saved = structuredClone(h.workspace);
    saved.pages.find(row => row.id === page.id).search.filter = filter;
    const restored = parseWorkspace(JSON.stringify(saved));
    assert.equal(restored.pages.find(row => row.id === page.id).search.filter,
      ['Projects', 'Discussions'].includes(filter) ? 'All' : filter);
  }
});
