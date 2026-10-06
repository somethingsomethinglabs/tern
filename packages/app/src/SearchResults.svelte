<script lang="ts">
  import { onMount, onDestroy, tick, untrack } from "svelte";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";
  import ArrowUpRight from "phosphor-svelte/lib/ArrowUpRight";
  import BookmarkSimple from "phosphor-svelte/lib/BookmarkSimple";
  import EyeSlash from "phosphor-svelte/lib/EyeSlash";
  import X from "phosphor-svelte/lib/X";
  import SlidersHorizontal from "phosphor-svelte/lib/SlidersHorizontal";
  import type { Command, PageRecord, SearchState, Task } from "@tern/core/contracts";
  import { SEARCH_FILTERS, visibleSearchResults } from "@tern/core/search";
  export type SearchViewState = { scroll: number; expanded: string[]; focused: string | null; kept: boolean };
  let { page, task, searchState, send, view, saveView, settings }: {
    page: PageRecord; task: Task; searchState?: SearchState;
    send(command: Command): Promise<boolean>;
    view?: SearchViewState; saveView(view: SearchViewState): void; settings(): void;
  } = $props();
  let input = $state(untrack(() => page.search!.query));
  let expanded = $state<string[]>(untrack(() => view?.expanded ?? []));
  let kept = $state(untrack(() => view?.kept ?? false));
  let refine = $state(false);
  let focused = $state<string | null>(untrack(() => view?.focused ?? null));
  let scroll = untrack(() => view?.scroll ?? 0);
  let container: HTMLElement;
  const definition = $derived(page.search!);
  const results = $derived(visibleSearchResults(definition, searchState));
  const links = $derived(task.keptLinks ?? []);
  const hiddenCount = $derived((searchState?.results ?? []).filter(result => definition.hiddenDomains.includes(result.domain)).length);
  const querySource = $derived(page.search!.query);
  $effect(() => { input = querySource; });
  onMount(() => {
    void tick().then(() => {
      container.scrollTop = view?.scroll ?? 0;
      if (view?.focused) [...container.querySelectorAll<HTMLButtonElement>("[data-result-url]")].find(button => button.dataset.resultUrl === view?.focused)?.focus({ preventScroll: true });
    });
  });
  onDestroy(() => saveView({ scroll, expanded, kept, focused }));
  const search = (first = false) => {
    kept = false;
    void send({ type: "searchPage", id: page.id, query: input, first });
    container.scrollTop = 0;
  };
  const open = (url: string, background = false) => void send({ type: "openSearchResult", id: page.id, url, background });
</script>

<section class="search-page" aria-label="Search results" bind:this={container} onscroll={event => scroll = event.currentTarget.scrollTop}>
  <div class="reading-list">
    <form class="web-search" onsubmit={event => { event.preventDefault(); search(); }}>
      <MagnifyingGlass size={20} aria-hidden="true" />
      <input aria-label="Search the web" bind:value={input} maxlength={8192} placeholder="Search the web" onkeydown={event => { if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); search(true); } }} />
      <button class="search-submit" type="submit" aria-label="Search"><ArrowRight size={20} aria-hidden="true" /></button>
    </form>
    <div class="search-actions">
      <button disabled={!results.length || !!searchState?.loading || kept} onclick={() => void send({ type: "openSearchResult", id: page.id, first: true })}>Open first result</button>
      <button aria-expanded={refine} onclick={() => refine = !refine}><SlidersHorizontal size={15} aria-hidden="true" />Refine{definition.hiddenDomains.length ? ` · ${definition.hiddenDomains.length}` : ""}</button>
      <button class="kept-control" aria-pressed={kept} onclick={() => kept = !kept}><BookmarkSimple size={15} aria-hidden="true" />Kept links{links.length ? ` · ${links.length}` : ""}</button>
    </div>
    {#if refine}<div class="search-refine">
      <button onclick={() => expanded = expanded.length ? [] : results.map(result => result.url)}>{expanded.length ? "Collapse excerpts" : "Expand excerpts"}</button>
      {#if definition.hiddenDomains.length}<div class="hidden-domains"><span>Hidden domains</span>{#each definition.hiddenDomains as domain}<button aria-label={`Restore ${domain}`} onclick={() => void send({ type: "refineSearch", id: page.id, hiddenDomains: definition.hiddenDomains.filter(item => item !== domain) })}>{domain}<X size={13} aria-hidden="true" /></button>{/each}</div>{/if}
      <p><code>!gh query</code> searches GitHub. <code>!w query</code> searches Wikipedia.</p>
      <button onclick={settings}>Search settings</button>
    </div>{/if}
    {#if kept}
      <h1>Kept links</h1>
      {#each links as link (link.url)}<article class="search-result">
        <span class="result-domain">{new URL(link.url).hostname}</span>
        <button class="result-title" onclick={() => void send({ type: "openKeptLink", taskId: task.id, url: link.url })}>{link.title}<ArrowUpRight size={17} aria-hidden="true" /></button>
        <button class="result-action" onclick={() => void send({ type: "removeKeptLink", taskId: task.id, url: link.url })}>Remove kept link</button>
      </article>{:else}<p class="search-status">No kept links in this task.</p>{/each}
    {:else}
      <nav class="search-filters" aria-label="Filter results">{#each SEARCH_FILTERS as filter}<button aria-pressed={definition.filter === filter} onclick={() => void send({ type: "refineSearch", id: page.id, filter })}>{filter === "All" ? "All results" : filter}</button>{/each}</nav>
      <div class="search-status" role="status">{#if searchState?.loading}Searching…{:else}{results.length} results{hiddenCount ? ` · ${hiddenCount} hidden` : ""}{/if}</div>
      {#if searchState?.error}<div class="search-error" role="alert"><p>{searchState.error}</p><button onclick={() => void send({ type: "reload", id: page.id })}>Retry</button><button onclick={settings}>Search settings</button></div>{/if}
      {#if searchState?.warnings.length}<details class="search-warnings"><summary>{searchState.warnings.length} search {searchState.warnings.length === 1 ? "engine" : "engines"} unavailable</summary>{#each searchState.warnings as warning}<p>{warning}</p>{/each}</details>{/if}
      {#each results as result, index (result.url)}
        <article class="search-result" class:opened={searchState?.opened.includes(result.url)}>
          <div class="result-meta"><span class="result-rank">{String(index + 1).padStart(2, "0")}</span><span class="result-domain">{result.domain}</span>{#if result.kind !== "All"}<span>{result.kind}</span>{/if}{#if searchState?.opened.includes(result.url)}<span class="result-opened">Opened</span>{/if}</div>
          <button class="result-title" data-result-url={result.url} onfocus={() => focused = result.url} onclick={event => open(result.url, event.ctrlKey || event.metaKey)}>{result.title}<ArrowUpRight size={17} aria-hidden="true" /></button>
          {#if result.excerpt}<p class="result-excerpt" class:full={expanded.includes(result.url)}>{result.excerpt}</p>{/if}
          {#if expanded.includes(result.url)}<div class="result-details"><span>{result.url}</span>{#if result.engines.length}<span>Found by {result.engines.join(", ")}</span>{/if}</div>{/if}
          <div class="result-actions">
            <button aria-expanded={expanded.includes(result.url)} onclick={() => expanded = expanded.includes(result.url) ? expanded.filter(url => url !== result.url) : [...expanded, result.url]}>{expanded.includes(result.url) ? "Less detail" : "More detail"}</button>
            <button class="background-open" onclick={() => open(result.url, true)}>Open in background</button>
            <button class="keep-result" aria-pressed={links.some(link => link.url === result.url)} aria-label={`${links.some(link => link.url === result.url) ? "Remove kept link" : "Keep link"}: ${result.title}`} onclick={() => void send({ type: "keepSearchResult", id: page.id, url: result.url })}><BookmarkSimple size={15} aria-hidden="true" />{links.some(link => link.url === result.url) ? "Kept" : "Keep"}</button>
            <button aria-label={`Hide ${result.domain}`} title={`Hide ${result.domain}`} onclick={() => void send({ type: "refineSearch", id: page.id, hiddenDomains: [...definition.hiddenDomains, result.domain] })}><EyeSlash size={16} aria-hidden="true" /></button>
          </div>
        </article>
      {:else}{#if !searchState?.loading && !searchState?.error}<div class="search-empty"><p>{searchState?.results.length ? "No results match these filters." : "No results found."}</p>{#if definition.filter !== "All" || definition.hiddenDomains.length}<button onclick={() => void send({ type: "refineSearch", id: page.id, filter: "All", hiddenDomains: [] })}>Reset filters</button>{/if}</div>{/if}{/each}
      <div class="search-pagination">{#if definition.page > 1}<button disabled={searchState?.loading} onclick={() => { void send({ type: "refineSearch", id: page.id, page: definition.page - 1 }); container.scrollTop = 0; }}>Previous page</button>{/if}{#if searchState?.hasNext && definition.page < 100}<button disabled={searchState.loading} onclick={() => { void send({ type: "refineSearch", id: page.id, page: definition.page + 1 }); container.scrollTop = 0; }}>Next page</button>{/if}</div>
    {/if}
  </div>
</section>

<style>
  .search-page { height: 100%; overflow: auto; padding: 44px 32px 80px; }
  .reading-list { max-width: 788px; margin: 0 auto; }
  .web-search { display: flex; gap: 14px; align-items: center; padding: 7px 8px 7px 17px; min-height: 58px; border: 1px solid var(--accent); background: var(--surface); border-radius: 8px; }
  .web-search:focus-within { outline: 2px solid var(--accent); outline-offset: 3px; }
  .web-search input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; padding: 8px 0; }
  .web-search input:focus-visible { outline: none; }
  .search-submit { width: 40px; height: 40px; background: var(--accent); color: var(--background); border-radius: 5px; flex-shrink: 0; }
  .search-actions { display: flex; align-items: center; gap: 22px; margin: 15px 0 24px; flex-wrap: wrap; }
  .search-actions button { padding: 5px 0; color: var(--muted); font-size: 12px; gap: 6px; min-height: 32px; }
  .search-actions .kept-control { margin-left: auto; }
  .search-refine { padding: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 22px; font-size: 12px; }
  .search-refine p { color: var(--muted); line-height: 1.6; margin: 0 0 12px; }
  .search-refine button, .search-error button, .search-empty button, .search-pagination button { border: 1px solid var(--border); padding: 8px 12px; border-radius: 4px; margin-right: 8px; }
  .hidden-domains { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 15px 0; }
  .hidden-domains button { gap: 8px; }
  .search-filters { display: flex; flex-wrap: wrap; gap: 0 24px; border-bottom: 1px solid var(--border); }
  .search-filters button { border-radius: 0; border-bottom: 2px solid transparent; padding: 10px 0 14px; color: var(--muted); font-size: 12px; }
  .search-filters button[aria-pressed="true"] { border-color: var(--accent); color: var(--foreground); }
  .search-status { color: var(--muted); font-size: 11px; margin: 20px 0 4px; }
  .search-result { padding: 22px 0 20px; border-bottom: 1px solid var(--border); }
  .result-meta { display: flex; gap: 10px; align-items: center; font-size: 10px; color: var(--muted); margin-bottom: 10px; }
  .result-rank { font-variant-numeric: tabular-nums; }
  .result-domain { font-size: 11px; overflow-wrap: anywhere; }
  .result-opened { margin-left: auto; }
  .result-title { display: flex; text-align: left; align-items: baseline; width: 100%; padding: 0; font-size: 20px; line-height: 1.5; font-weight: 400; color: var(--accent); overflow-wrap: anywhere; gap: 16px; }
  .result-title :global(svg) { margin-left: auto; flex-shrink: 0; }
  .result-title:hover { background: transparent; text-decoration: underline; }
  .result-excerpt { font-size: 13px; color: var(--muted); line-height: 1.8; margin: 13px 0; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
  .result-excerpt.full { display: block; }
  .result-details { display: grid; gap: 9px; font-size: 11px; color: var(--muted); border-left: 2px solid var(--border); padding-left: 14px; overflow-wrap: anywhere; margin: 14px 0; line-height: 1.7; }
  .result-actions { display: flex; align-items: center; gap: 16px; }
  .result-actions button, .result-action { color: var(--muted); font-size: 11px; padding: 4px 0; min-height: 32px; gap: 6px; }
  .result-actions .keep-result { margin-left: auto; }
  .keep-result[aria-pressed="true"] { color: var(--accent); }
  .search-error { padding: 20px 0; }
  .search-error p { overflow-wrap: anywhere; }
  .search-warnings { font-size: 12px; color: var(--muted); margin: 16px 0; }
  .search-warnings summary { cursor: pointer; }
  .search-pagination { display: flex; justify-content: flex-end; margin-top: 28px; font-size: 12px; }
  h1 { font-size: 18px; font-weight: 500; margin: 28px 0 0; }
  @media (max-width: 600px) {
    .search-page { padding: 24px 20px 60px; }
    .result-title { font-size: 18px; }
    .search-actions { gap: 14px; }
    .search-filters { gap: 20px; }
    .result-meta { flex-wrap: wrap; gap: 7px; }
    .result-actions { flex-wrap: wrap; gap: 12px; }
    .background-open { order: 2; }
    .search-actions button, .result-actions button, .search-filters button { min-height: 44px; }
  }
</style>
