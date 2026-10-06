import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Metasearch, destination, parseProvider, mergeBatches, unrelatedBatch } from '../dist/host/metasearch.js';
import { BUILTIN_SEARCH_URL } from '@tern/core/search';

const definition = (query = 'term & words', page = 1) => ({ query, page, endpoint: BUILTIN_SEARCH_URL, filter: 'All', hiddenDomains: [] });
const signal = () => new AbortController().signal;
const ddgRow = (url, title = 'Document &amp; API', excerpt = 'Useful <b>excerpt</b>') => `<div class="result"><a class="result__a" href="${url}">${title}</a><a class="result__snippet">${excerpt}</a></div>`;
const ddgNext = `<form action="https://evil.example/" method="post"><input type="submit" value="Next"><input type="hidden" name="q" value="term &amp; words"><input type="hidden" name="s" value="10"><input type="hidden" name="vqd" value="token"><input type="hidden" name="unexpected" value="ignore"></form>`;
const bing = (rows, next = false) => `<ol id="b_results">${rows.map(([url, title, excerpt]) => `<li class="b_algo"><h2><a href="${url}">${title}</a></h2><div class="b_caption"><p>${excerpt}</p></div></li>`).join('')}</ol>${next ? '<a class="sb_pagN" href="/search">Next</a>' : ''}`;
const response = html => new Response(html, { headers: { 'Content-Type': 'text/html' } });

test('provider redirects decode locally; unsafe URLs and credentials are rejected', () => {
  const target = 'https://docs.example.com/reference?id=7&utm_source=bing#section';
  assert.equal(destination('//duckduckgo.com/l/?uddg='+encodeURIComponent(target), 'duckduckgo'), 'https://docs.example.com/reference?id=7#section');
  assert.equal(destination('https://www.bing.com/ck/a?u=a1'+Buffer.from(target).toString('base64url'), 'bing'), 'https://docs.example.com/reference?id=7#section');
  for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'https://user:secret@example.com', 'https://www.bing.com/ck/a?u=broken']) assert.equal(destination(url, 'bing'), null);
});

test('HTML parsers extract full text, reject ads and unsafe results, and restrict pagination origin', () => {
  const batch = parseProvider(ddgRow('https://docs.example.com/docs') + ddgRow('javascript:alert(1)') + '<div class="result result--ad"><a class="result__a" href="https://ad.example/">Advert</a></div>' + ddgNext, 'duckduckgo');
  assert.equal(batch.results.length, 1);
  assert.equal(batch.results[0].title, 'Document & API'); assert.equal(batch.results[0].excerpt, 'Useful excerpt'); assert.equal(batch.results[0].kind, 'Docs');
  assert.equal(new URL(batch.next).origin, 'https://html.duckduckgo.com');
  assert.equal(new URL(batch.next).searchParams.has('unexpected'), false);
  const source = parseProvider(bing([['https://github.com/example/repo', 'Full <b>project</b> title', 'Source']], true), 'bing');
  assert.equal(source.results[0].kind, 'All'); assert.equal(source.hasNext, true);
});

test('verification and changed layouts are failures; recognised empty results remain successful', () => {
  assert.throws(() => parseProvider('<form id="challenge-form" action="/anomaly.js"></form>', 'duckduckgo'), /verification/);
  assert.throws(() => parseProvider('<div id="b_captcha"></div>', 'bing'), /verification/);
  assert.throws(() => parseProvider('<h1>Different page</h1>', 'bing'), /could not be read/);
  assert.deepEqual(parseProvider('<div class="no-results">No results</div>', 'duckduckgo').results, []);
  assert.deepEqual(parseProvider('<ol id="b_results"><li class="b_no">No results found</li></ol>', 'bing').results, []);
  assert.equal(parseProvider(ddgRow('https://example.com/', 'How to verify you are human'), 'duckduckgo').results.length, 1);
});

test('fusion rewards agreement, merges provenance and preserves useful longer text', () => {
  const a = parseProvider(ddgRow('https://a.example/', 'A') + ddgRow('https://b.example/#section', 'B'), 'duckduckgo');
  const b = parseProvider(bing([['https://b.example/', 'Longer B title', 'Longer excerpt'], ['https://c.example/', 'C', 'Other']]), 'bing');
  const results = mergeBatches([a,b]);
  assert.equal(results[0].url, 'https://b.example/#section'); assert.deepEqual(results[0].engines, ['DuckDuckGo', 'Bing']); assert.equal(results[0].title, 'Longer B title');
  assert.deepEqual(a.results[1].engines, ['DuckDuckGo'], 'fusion must not mutate cached batches');
});

test('transport queries selected sources, merges results, caches briefly, and clears cache', async () => {
  const requests = [];
  const backend = new Metasearch(undefined, async (input, init) => {
    const url = new URL(input); requests.push(url); assert.equal(init.credentials, 'omit');
    assert.equal(url.searchParams.get('q'), 'term & words');
    return response(url.hostname.includes('bing') ? bing([['https://example.com/', 'Result', 'Excerpt']], true) : ddgRow('https://example.com/', 'Longer title') + ddgNext);
  });
  const result = await backend.transport(definition(), signal());
  assert.equal(result.results.length, 1); assert.deepEqual(result.results[0].engines, ['DuckDuckGo','Bing']); assert.equal(result.hasNext, true);
  result.results[0].title = 'mutated';
  assert.equal((await backend.transport(definition(), signal())).results[0].title, 'Longer title'); assert.equal(requests.length, 2);
  backend.clear(); await backend.transport(definition(), signal()); assert.equal(requests.length, 4);
});

test('one failed provider preserves the other; total failure and cancellation are explicit', async () => {
  const backend = new Metasearch(undefined, async input => new URL(input).hostname.includes('bing') ? response(bing([['https://example.com/', 'Result', 'Text']])) : new Response('', { status: 429 }));
  const partial = await backend.transport(definition(), signal());
  assert.equal(partial.results.length, 1); assert.match(partial.warnings[0], /DuckDuckGo.*blocked/);
  const broken = new Metasearch(undefined, async () => response('<form id="challenge-form"></form>'));
  await assert.rejects(broken.transport(definition(), signal()), /Search unavailable/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(backend.transport(definition(), abort.signal), { name: 'AbortError' });
});

test('pagination follows provider cursors and sends correct Bing offsets, including restart recovery', async () => {
  const urls = [];
  const backend = new Metasearch(undefined, async input => {
    const url = new URL(input); urls.push(url);
    return response(url.hostname.includes('bing') ? bing([['https://bing.example/'+url.searchParams.get('first'), 'Bing', 'Text']]) : ddgRow('https://ddg.example/'+(url.searchParams.get('s') ?? '0')) + (url.searchParams.has('s') ? '' : ddgNext));
  });
  const page = await backend.transport(definition('term & words', 2), signal());
  assert.equal(page.results.length, 2);
  assert.equal(urls.find(url => url.hostname.includes('bing')).searchParams.get('first'), '11');
  assert.equal(urls.at(-1).searchParams.get('vqd'), 'token');
  assert.equal(page.hasNext, false);
});

test('requests are bounded; queues and active requests cancel without leaking slots', async () => {
  let active = 0, peak = 0;
  const backend = new Metasearch(undefined, async (_input, init) => {
    active++; peak = Math.max(peak, active);
    try {
      await new Promise((resolve, reject) => { const timer = setTimeout(resolve, 50); init.signal.addEventListener('abort', () => {clearTimeout(timer);reject(init.signal.reason)}, {once:true}); });
      return response('<div class="no-results"></div>');
    } finally { active--; }
  });
  const controllers = Array.from({length: 8}, () => new AbortController());
  const pending = controllers.map((controller,index) => backend.transport(definition('query '+index), controller.signal));
  controllers[5].abort(); controllers[0].abort();
  const settled = await Promise.allSettled(pending);
  assert.equal(peak, 4); assert.equal(active, 0); assert.equal(settled[0].status,'rejected'); assert.equal(settled[5].status,'rejected');
  await backend.transport(definition('after cancellation'), signal()); assert.equal(active, 0);
});

test('response limits, status and content types report failures without interpreting arbitrary data', async () => {
  for (const reply of [new Response('x'.repeat(4*1024*1024+1)), new Response('{}', {headers:{'content-type':'application/json'}}), new Response('',{status:202})]) {
    const backend = new Metasearch(() => ['duckduckgo'], async () => reply);
    await assert.rejects(backend.transport(definition(), signal()), /Search unavailable/);
  }
});

test('both provider parsers and fusion classify titles and snippets without page fetches', () => {
  const doc = parseProvider(ddgRow('https://example.net/start', 'Widget tutorial', 'Steps'), 'duckduckgo');
  const project = parseProvider(bing([['https://example.net/', 'Widgets', 'Widgets is a web application.']]), 'bing');
  assert.equal(doc.results[0].kind, 'Docs');
  assert.equal(project.results[0].kind, 'Applications');
  const sparse = parseProvider(ddgRow('https://example.net/start', 'Widgets', ''), 'duckduckgo');
  assert.equal(sparse.results[0].kind, 'All');
  assert.equal(mergeBatches([sparse, doc])[0].kind, 'Docs');
});

test('unrelated provider batches are rejected while a matching provider remains usable', async () => {
  const query = 'automating VM management with machine learning';
  const unrelated = [['https://sports.example/watch', 'Watch live sports in Australia', 'Stream football'], ['https://sports.example/login', 'Login and password', 'Help center'], ['https://sports.example/devices', 'How many devices can stream?', 'Concurrent streams']];
  const bad = new Metasearch(() => ['bing'], async () => response(bing(unrelated)));
  await assert.rejects(bad.transport(definition(query), signal()), /results did not match the query/);
  const mixed = new Metasearch(undefined, async input => response(new URL(input).hostname.includes('bing') ? bing(unrelated) : ddgRow('https://example.net/article', 'Machine learning for VM management', 'Automating resource allocation')));
  const result = await mixed.transport(definition(query), signal());
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0].engines, ['DuckDuckGo']);
  assert.match(result.warnings[0], /Bing.*results did not match the query/);
});

test('mismatch detection permits short, multilingual, sparse and partially matching results', () => {
  const batch = parseProvider(bing([['https://example.net/1', 'VM resource allocation', 'Useful'], ['https://example.net/2', 'Other result', 'Text'], ['https://example.net/3', 'Another result', 'Text']]), 'bing').results;
  assert.equal(unrelatedBatch('automating VM management with machine learning', batch), false);
  assert.equal(unrelatedBatch('virtual machine', batch), false);
  assert.equal(unrelatedBatch('虚拟机 管理 自动化 机器 学习', batch), false);
  assert.equal(unrelatedBatch('the and how what for', batch), false);
  assert.equal(unrelatedBatch('one two three four', batch.slice(0, 1)), false);
});
