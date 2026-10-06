import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

let app: ElectronApplication, shell: Page, profile: string;
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), 'tern-metasearch-app-'));
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ summaryModel: '', autoHideToolbar: false, preloadLinks: false }));
  app = await electron.launch({ args: [resolve('dist/host/main.js')], env: { ...process.env, ELECTRON_RUN_AS_NODE: '', TERN_PROFILE: profile } });
  shell = await app.firstWindow();
  await shell.waitForFunction(() => !!(window as any).tern);
  await shell.evaluate(() => (window as any).tern.command({ type: 'createTask', title: 'Built-in search' }));
});
test.afterEach(async () => {
  await app.evaluate(({dialog}) => { dialog.showMessageBoxSync = () => 1; });
  await app.close(); await rm(profile, {recursive:true,force:true});
});
async function search(query: string) {
  const input = shell.getByRole('textbox', {name:'Address or search'});
  await input.fill(query); await input.press('Enter');
}
async function fixture() {
  await app.evaluate(() => {
    const htmlResponse = (html: string) => new Response(html, { headers: { 'Content-Type': 'text/html' } });
    (globalThis as any).searchRequests = [];
    globalThis.fetch = async (input: any, init: any) => {
      const url = new URL(String(input));
      (globalThis as any).searchRequests.push(url.href);
      if (url.hostname === 'html.duckduckgo.com') {
        if (url.searchParams.get('q') === 'partial') return new Response('<form id="challenge-form"></form>');
        if (url.searchParams.get('q') === 'broken') return new Response('', {status:429});
        const next = url.searchParams.has('s');
        return htmlResponse(`<div class="result"><a class="result__a" href="https://docs.example.org/docs/${next ? 'two' : 'one'}?utm_source=search">${next ? 'Second document' : 'Full document title'}</a><a class="result__snippet">Useful document excerpt</a></div>${next ? '' : '<form><input type="submit" value="Next"><input type="hidden" name="q" value="query"><input type="hidden" name="s" value="10"></form>'}`);
      }
      if (url.hostname === 'www.bing.com') {
        if (url.searchParams.get('q') === 'broken') return new Response('', {status:429});
        return htmlResponse('<ol id="b_results"><li class="b_algo"><h2><a href="https://docs.example.org/docs/one">Full document title with more detail</a></h2><div class="b_caption"><p>Bing excerpt</p></div></li><li class="b_algo"><h2><a href="https://github.com/example/project">Project source</a></h2><div class="b_caption"><p>Repository</p></div></li></ol>');
      }
      throw new Error('Unexpected request '+url.hostname);
    };
  });
}

test('default backend runs inside the app, merges providers and paginates without a server', async () => {
  await fixture(); await search('query');
  await expect(shell.locator('.search-result')).toHaveCount(2);
  await expect(shell.locator('.result-title').first()).toHaveText('Full document title with more detail');
  const state = await shell.evaluate(() => (window as any).tern.snapshot());
  const result = Object.values(state.searches)[0] as any;
  expect(result.results[0].engines).toEqual(['DuckDuckGo','Bing']);
  expect(result.results[0].url).toBe('https://docs.example.org/docs/one');
  await shell.locator('.keep-result').first().click();
  await shell.getByRole('button',{name:'Next page',exact:true}).click();
  await expect(shell.locator('.search-result')).toHaveCount(3);
  await expect(shell.getByText('Second document',{exact:true})).toBeVisible();
  await shell.getByRole('button',{name:'Previous page',exact:true}).click();
  await expect(shell.locator('.search-result')).toHaveCount(2);
  expect(await app.evaluate(() => (globalThis as any).searchRequests.length)).toBe(4);
  await shell.getByRole('button',{name:'Reload',exact:true}).click();
  await expect.poll(() => app.evaluate(() => (globalThis as any).searchRequests.length)).toBe(6);
  await shell.getByRole('button',{name:'Settings',exact:true}).click();
  await shell.screenshot({path:'../design/qa/search/desktop-search-settings.png'});
  await expect(shell.getByRole('textbox',{name:'SearXNG server'})).toHaveCount(0);
  await shell.getByRole('checkbox',{name:'Bing',exact:true}).uncheck();
  await expect(shell.getByRole('checkbox',{name:'DuckDuckGo',exact:true})).toBeDisabled();
  await shell.getByRole('button',{name:'Back to browsing'}).click();
  await shell.getByRole('textbox',{name:'Search the web'}).fill('selected source');
  await shell.getByRole('textbox',{name:'Search the web'}).press('Enter');
  await expect(shell.locator('.search-result')).toHaveCount(1);
  const requests = await app.evaluate(() => (globalThis as any).searchRequests);
  expect(new URL(requests.at(-1)).hostname).toBe('html.duckduckgo.com');
});

test('blocked sources retain partial results and total failure recovers on a new query', async () => {
  await fixture(); await search('partial');
  await expect(shell.locator('.search-result')).toHaveCount(2);
  await expect(shell.getByText('1 search engine unavailable')).toBeVisible();
  const input=shell.getByRole('textbox',{name:'Search the web'});
  await input.fill('broken'); await input.press('Enter');
  await expect(shell.getByRole('alert')).toContainText('Search unavailable');
  await input.fill('query'); await input.press('Enter');
  await expect(shell.getByRole('alert')).toHaveCount(0);
  await expect(shell.locator('.search-result')).toHaveCount(2);
});

test('starting a task opens its built-in reading list and preserves the original task', async () => {
  await fixture();
  await shell.evaluate(() => (window as any).tern.command({type:'startTask', request:'Find Svelte documentation', title:'Svelte research', useAI:false}));
  await expect(shell.locator('.search-result')).toHaveCount(2);
  const state = await shell.evaluate(() => (window as any).tern.snapshot());
  expect(state.tasks).toHaveLength(2);
  const task = state.tasks.find((task:any) => task.id === state.selectedTaskId);
  expect(task.title).toBe('Svelte research');
  const pages = state.pages.filter((page:any) => page.taskId === task.id);
  expect(pages).toHaveLength(1);
  expect(pages[0].search.query).toBe('Find Svelte documentation');
  expect(pages[0].url).toBe('');
});

test('live desktop search returns real results without configuration', async () => {
  test.skip(process.env.TERN_LIVE_SEARCH !== '1', 'Live provider check is opt-in because upstream availability varies.');
  await search('Svelte documentation');
  await expect(shell.locator('.search-result').first()).toBeVisible({timeout:20000});
  await expect(shell.getByRole('alert')).toHaveCount(0);
  const state = await shell.evaluate(() => (window as any).tern.snapshot());
  const result = Object.values(state.searches)[0] as any;
  expect(result.results.some((row:any) => row.url.includes('svelte.dev'))).toBe(true);
  console.log(JSON.stringify({results:result.results.length,warnings:result.warnings}));
  await shell.screenshot({path:'../design/qa/search/live-built-in-search.png'});
});
