import type { Command, PageRecord, Preferences, SearchDefinition, SearchFilter, SearchResponse, SearchResult, SearchState } from "./contracts.js";
import { addressURL, isWebURL, searchURL } from "./navigation.js";
import { WorkspaceModel, checkedText } from "./workspace-model.js";

export const DEFAULT_SEARXNG_URL = "http://127.0.0.1:8888/";
export const BUILTIN_SEARCH_URL = "https://search.tern.invalid/";
export const SEARCH_FILTERS: SearchFilter[] = ["All", "Docs", "Articles", "Applications", "Videos"];
export type SearchTransport = (search: SearchDefinition, signal: AbortSignal) => Promise<SearchResponse>;

export function resultKind(url: URL): SearchFilter {
  return classifySearchResult(url);
}

/** Classify destination page types locally, using bounded provider metadata. */
export function classifySearchResult(url: URL, title = "", excerpt = ""): SearchFilter {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const on = (domain: string) => host === domain || host.endsWith("." + domain);
  if ((on("youtube.com") && (/^\/(watch|shorts|live|embed)(\/|$)/.test(path))) ||
      (on("youtu.be") && path.length > 1) || (on("vimeo.com") && /^\/(?:video\/)?\d+(?:\/|$)/.test(path))) return "Videos";
  // Thread text can mention docs or apps without being either destination type.
  if (["reddit.com", "stackoverflow.com", "stackexchange.com", "news.ycombinator.com", "lemmy.world"].some(on) ||
      (on("zhihu.com") && /^\/question\//.test(path)) || /\/(discussions|issues)(\/|$)/.test(path) ||
      /^(discuss|discussions|forum|forums|community)\./.test(host)) return "All";
  if (/^(docs|developer|developers|documentation|support|help)\./.test(host) ||
      (on("wikipedia.org") && /^\/wiki\//.test(path))) return "Docs";
  // A tutorial on a blog is an article; product names mentioned in it are not apps.
  if (/\/(articles?|blogs?|news|posts?)(\/|$)/.test(path) || /\/\d{4}\/\d{2}\/\d{2}\//.test(path) ||
      on("medium.com") || on("substack.com") || on("dev.to")) return "Articles";
  if (/\/(docs?|documentation|reference|manual|tutorials?|handbook|book|guides?)(\/|$)/.test(path) || /\.pdf$/.test(path)) return "Docs";
  if (/^\/videos?\//.test(path)) return "Videos";
  if (["chatgpt.com", "gemini.google.com", "claude.ai", "copilot.microsoft.com", "perplexity.ai", "aistudio.google.com"].some(on) ||
      /^app\./.test(host) || /^\/app(?:\/|$)/.test(path)) return "Applications";
  // Source repositories and package listings are not interactive applications.
  if (["github.com", "gitlab.com", "codeberg.org", "sr.ht", "pypi.org", "sourceforge.net"].some(on)) return "All";
  const heading = title.slice(0, 1000).replace(/\s+/g, " ").trim();
  const description = excerpt.slice(0, 1000);
  if (/\b(documentation|tutorial|handbook|reference manual|API reference|user guide|getting started|dictionary)\b/i.test(heading) ||
      /^(how to\b|introduction to\b)/i.test(heading) ||
      /\b(this (?:tutorial|guide|manual)|official documentation|API reference|step[- ]by[- ]step (?:guide|tutorial))\b/i.test(description)) return "Docs";
  if (/\b(web (?:app|application)|online (?:[\w-]+ )?(?:editor|compiler|calculator|converter)|browser[- ]based (?:tool|application))\b/i.test(heading) ||
      /\b(is (?:an? |the )?(?:[\w-]+ ){0,3}(?:web application|online editor|online compiler))\b/i.test(description)) return "Applications";
  if (/\b(opinion|editorial|case study|news article)\b/i.test(heading) || /\b(this article|in this post)\b/i.test(description)) return "Articles";
  return "All";
}

function plainText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return value.replace(/<[^>]*>/g, "").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? all;
    const number = entity.startsWith("#x") ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
  }).replace(/\s+/g, " ").trim().slice(0, max);
}

export function normalizeSearxng(raw: unknown): SearchResponse {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { results?: unknown }).results))
    throw new Error("SearXNG did not return search results. Enable JSON output on the server.");
  const value = raw as { results: unknown[]; unresponsive_engines?: unknown[] };
  const unique = new Map<string, SearchResult>();
  for (const row of value.results.slice(0, 200)) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    if (typeof item.url !== "string" || item.url.length > 32768 || !isWebURL(item.url)) continue;
    const url = new URL(item.url);
    // Only fragments are removed for duplicate detection. Query parameters can identify different pages.
    const key = new URL(url); key.hash = "";
    const engines = Array.isArray(item.engines) ? item.engines.filter((engine): engine is string => typeof engine === "string").map(engine => plainText(engine, 80)).slice(0, 20) : [];
    const previous = unique.get(key.href);
    if (previous) { previous.engines = [...new Set([...previous.engines, ...engines])]; continue; }
    const title = plainText(item.title, 1000) || url.hostname;
    const excerpt = plainText(item.content, 5000);
    unique.set(key.href, { url: url.href, domain: url.hostname, title, excerpt, kind: classifySearchResult(url, title, excerpt), engines });
  }
  const warnings = (Array.isArray(value.unresponsive_engines) ? value.unresponsive_engines : []).slice(0, 20).map(row => {
    if (!Array.isArray(row)) return "A search engine did not respond.";
    return `${plainText(row[0], 80) || "A search engine"}: ${plainText(row[1], 160) || "unavailable"}`;
  });
  return { results: [...unique.values()], warnings, hasNext: unique.size > 0 };
}

export function createSearxngTransport(fetcher: typeof fetch = fetch): SearchTransport {
  return async (search, signal) => {
    if (!isWebURL(search.endpoint)) throw new Error("Set a valid SearXNG server address in Settings.");
    const url = new URL("search", search.endpoint.endsWith("/") ? search.endpoint : search.endpoint + "/");
    url.search = new URLSearchParams({ q: search.query, format: "json", categories: "general", pageno: String(search.page) }).toString();
    const response = await fetcher(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]), headers: { Accept: "application/json" }, credentials: "omit" });
    if (!response.ok) throw new Error(response.status === 403 ? "SearXNG rejected JSON output. Enable the json search format on the server." : `SearXNG returned HTTP ${response.status}.`);
    if (!response.body) throw new Error("SearXNG returned an empty response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 4 * 1024 * 1024) throw new Error("Search response exceeded 4 MB.");
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    let raw: unknown;
    try { raw = JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error("SearXNG did not return JSON. Check the server address and JSON output setting."); }
    return normalizeSearxng(raw);
  };
}

export function visibleSearchResults(search: SearchDefinition, state?: SearchState) {
  return (state?.results ?? []).filter(result => !search.hiddenDomains.includes(result.domain) && (search.filter === "All" || result.kind === search.filter));
}

export function externalShortcut(query: string): string | null {
  const match = /^!(gh|w)\s+(.+)$/i.exec(query.trim());
  if (!match) return null;
  return match[1].toLowerCase() === "gh" ? `https://github.com/search?q=${encodeURIComponent(match[2])}` : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(match[2])}`;
}

// Both hosts use this owner for internal search pages. Network results stay in memory;
// only definitions and explicitly kept destination links belong to the workspace.
export class SearchController {
  private states = new Map<string, SearchState>();
  private requests = new Map<string, AbortController>();
  constructor(private model: WorkspaceModel, private transport: SearchTransport,
    private changed: () => void, private openWebsite: (page: PageRecord) => Promise<void>, private allowFollow: () => boolean = () => true) {}

  snapshot(): Record<string, SearchState> { return Object.fromEntries(this.states); }
  state(id: string) { return this.states.get(id); }
  ensure(page: PageRecord) { if (page.search && !this.states.has(page.id)) this.run(page); }
  refresh(page: PageRecord, preferences: Preferences) {
    if (page.search) page.search.endpoint = preferences.searxngURL ?? BUILTIN_SEARCH_URL;
    this.run(page);
  }
  forget(id: string) { this.requests.get(id)?.abort(); this.requests.delete(id); this.states.delete(id); }
  prune() { for (const id of this.states.keys()) if (!this.model.page(id)) this.forget(id); }
  stop(id: string) {
    this.requests.get(id)?.abort(); this.requests.delete(id);
    const state = this.states.get(id); if (state) { state.loading = false; state.error = "Search stopped."; }
  }
  create(taskId: string, input: string, preferences: Preferences, existing?: PageRecord, first = false) {
    const query = checkedText(input, 8192).trim();
    if (!query) throw new Error("Enter a search query.");
    const endpoint = preferences.searxngURL ?? BUILTIN_SEARCH_URL;
    if (!isWebURL(endpoint)) throw new Error("Set a valid SearXNG server address in Settings.");
    const page = existing?.search || (existing && !existing.url) ? existing : this.model.newPage(taskId);
    page.url = ""; page.title = query.slice(0, 1000);
    page.search = { query, endpoint, page: 1, filter: page.search?.filter ?? "All", hiddenDomains: page.search?.hiddenDomains ?? [] };
    delete page.sourceSearchId;
    this.model.selectTask(taskId); this.model.task(taskId)!.selectedPageId = page.id;
    this.run(page, first); return page;
  }
  fromAddress(address: string, preferences: Preferences): boolean {
    const input = checkedText(address, 8192).trim();
    if (externalShortcut(input) || preferences.searchView === "external") return false;
    if (addressURL(input, preferences.searchEngine) !== searchURL(input, preferences.searchEngine)) return false;
    const task = this.model.task(); if (!task) throw new Error("Create a task first.");
    this.create(task.id, input, preferences, this.model.page()); return true;
  }
  run(page: PageRecord, first = false) {
    if (!page.search) return;
    this.requests.get(page.id)?.abort();
    const controller = new AbortController(); this.requests.set(page.id, controller);
    const definition = structuredClone(page.search);
    const current: SearchState = { results: [], warnings: [], hasNext: false, loading: true, error: "", opened: this.states.get(page.id)?.opened ?? [] };
    this.states.set(page.id, current);
    void this.transport(definition, controller.signal).then(async response => {
      if (this.requests.get(page.id) !== controller || !this.model.page(page.id)) return;
      this.requests.delete(page.id);
      Object.assign(current, response, { loading: false, error: "" });
      // A delayed first-result action must never move the user out of another task or page.
      if (first && this.model.task()?.selectedPageId === page.id && this.model.task()?.lifecycle === "Active" && this.allowFollow()) {
        const result = visibleSearchResults(page.search!, this.state(page.id))[0];
        if (result) await this.openResult(page, result.url, false);
      }
      this.changed();
    }).catch(error => {
      if (this.states.get(page.id) !== current || controller.signal.aborted) return;
      if (!this.model.page(page.id)) return;
      if (this.requests.get(page.id) === controller) this.requests.delete(page.id);
      const state = this.states.get(page.id)!;
      state.loading = false;
      state.error = error instanceof Error && !["TypeError", "TimeoutError"].includes(error.name) ? error.message : "Search could not connect. Check your connection and retry.";
      this.changed();
    });
  }
  private requireSearch(id: string) {
    const page = this.model.page(checkedText(id, 100));
    if (!page?.search) throw new Error("Search page not found.");
    return page;
  }
  private async openResult(search: PageRecord, url: string, background: boolean) {
    if (!isWebURL(url)) throw new Error("Only HTTP and HTTPS addresses can be opened.");
    const task = this.model.task(search.taskId)!;
    const previous = task.selectedPageId;
    const page = this.model.newPage(task.id, url); page.sourceSearchId = search.id;
    if (background) task.selectedPageId = previous;
    else this.model.selectTask(task.id);
    const state = this.state(search.id); if (state) state.opened = [...new Set([...state.opened, url])];
    await this.openWebsite(page);
  }
  async command(command: Command, preferences: Preferences): Promise<boolean> {
    switch (command.type) {
      case "searchPage": {
        const page = this.requireSearch(command.id);
        const query = checkedText(command.query, 8192).trim();
        if (!query) throw new Error("Enter a search query.");
        const shortcut = externalShortcut(query);
        if (shortcut) await this.openResult(page, shortcut, false);
        else if (preferences.searchView === "external") await this.openResult(page, searchURL(query, preferences.searchEngine), false);
        else this.create(page.taskId, query, preferences, page, !!command.first);
        return true;
      }
      case "refineSearch": {
        const page = this.requireSearch(command.id); const definition = page.search!;
        if (command.filter !== undefined && !SEARCH_FILTERS.includes(command.filter)) throw new Error("Invalid search filter.");
        if (command.hiddenDomains !== undefined && (!Array.isArray(command.hiddenDomains) || command.hiddenDomains.length > 100 || !command.hiddenDomains.every(domain => typeof domain === "string" && domain.length <= 253 && /^[a-z\d.-]+$/i.test(domain)))) throw new Error("Invalid hidden domains.");
        if (command.page !== undefined && (!Number.isInteger(command.page) || command.page < 1 || command.page > 100)) throw new Error("Invalid search page number.");
        if (command.filter !== undefined) definition.filter = command.filter;
        if (command.hiddenDomains !== undefined) definition.hiddenDomains = [...new Set(command.hiddenDomains)];
        if (command.page !== undefined && command.page !== definition.page) { definition.page = command.page; this.run(page); }
        return true;
      }
      case "openSearchResult": case "keepSearchResult": {
        const page = this.requireSearch(command.id);
        const results = visibleSearchResults(page.search!, this.state(page.id));
        const result = command.type === "openSearchResult" && command.first ? results[0] : this.state(page.id)?.results.find(result => result.url === command.url);
        if (!result) throw new Error("No matching result. Adjust the filters or run the search again.");
        if (command.type === "openSearchResult") await this.openResult(page, result.url, !!command.background);
        else {
          const task = this.model.task(page.taskId)!;
          const links = task.keptLinks ?? [];
          if (links.some(link => link.url === result.url)) task.keptLinks = links.filter(link => link.url !== result.url);
          else { if (links.length >= 100) throw new Error("Remove a kept link before adding another. Each task can keep 100."); task.keptLinks = [...links, { title: result.title, url: result.url }]; }
        }
        return true;
      }
      case "returnToSearch": {
        const page = this.requireSearch(command.id); this.model.selectTask(page.taskId); this.model.task(page.taskId)!.selectedPageId = page.id; this.ensure(page); return true;
      }
      case "openKeptLink": case "removeKeptLink": {
        const task = this.model.task(checkedText(command.taskId, 100));
        const link = task?.keptLinks?.find(link => link.url === command.url);
        if (!task || !link) throw new Error("Kept link not found.");
        if (command.type === "removeKeptLink") task.keptLinks = task.keptLinks!.filter(item => item.url !== link.url);
        else { this.model.selectTask(task.id); await this.openWebsite(this.model.newPage(task.id, link.url)); }
        return true;
      }
      default: return false;
    }
  }
}
