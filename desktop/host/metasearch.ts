import { load, type CheerioAPI } from "cheerio";
import type { SearchDefinition, SearchResponse, SearchResult } from "@tern/core/contracts";
import { createSearxngTransport, DEFAULT_SEARXNG_URL, BUILTIN_SEARCH_URL, classifySearchResult, type SearchTransport } from "@tern/core/search";
import { isWebURL } from "@tern/core/navigation";

export type Provider = "duckduckgo" | "bing";
type Batch = { results: SearchResult[]; hasNext: boolean; next?: string };
const DDG = "https://html.duckduckgo.com/html/";
const BING = "https://www.bing.com/search";
const LIMIT = 4 * 1024 * 1024;
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  Accept: "text/html", "Accept-Language": "en-US,en;q=0.9",
};

/** Reject only obvious lexical mismatches on longer English queries, not rank relevance. */
export function unrelatedBatch(query: string, results: SearchResult[]): boolean {
  if (results.length < 3 || /[^\x00-\x7f]/.test(query)) return false;
  const ignored = new Set(["the", "and", "for", "with", "from", "into", "that", "this", "what", "when", "where", "which", "how", "are", "can", "does", "about", "find", "best"]);
  const words = (value: string) => (value.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(word => word.length > 1 && !ignored.has(word))
    .map(word => word.length > 4 ? word.replace(/(?:ing|ed|s)$/, "") : word);
  const terms = [...new Set(words(query.slice(0, 8192)))];
  if (terms.length < 4) return false;
  const found = new Set(results.flatMap(result => words(`${result.title.slice(0, 1000)} ${result.excerpt.slice(0, 5000)} ${result.domain}`)));
  return !terms.some(term => found.has(term));
}

function text(value: string, length: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, length);
}

/** Decode provider redirects locally; never visit a tracking link to resolve it. */
export function destination(href: string, provider: Provider): string | null {
  try {
    let url = new URL(href, provider === "bing" ? BING : DDG);
    if (provider === "duckduckgo" && /(^|\.)duckduckgo\.com$/.test(url.hostname)) {
      const target = url.searchParams.get("uddg");
      if (!target) return null;
      url = new URL(target);
    } else if (provider === "bing" && /(^|\.)bing\.com$/.test(url.hostname)) {
      const encoded = url.searchParams.get("u");
      if (!encoded || url.pathname !== "/ck/a" || !encoded.startsWith("a1")) return null;
      url = new URL(Buffer.from(encoded.slice(2), "base64url").toString("utf8"));
    }
    if (url.href.length > 32768 || !isWebURL(url.href)) return null;
    for (const name of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(name) || ["gclid", "fbclid", "msclkid"].includes(name.toLowerCase())) url.searchParams.delete(name);
    }
    return url.href;
  } catch { return null; }
}

function blocked($: CheerioAPI, provider: Provider) {
  if ($('form[action*="anomaly"], #challenge-form, .anomaly-modal, #b_captcha, #b_captcha_container, .g-recaptcha').length)
    throw new Error("verification required");
  if ($('form[action*="consent"]').length) throw new Error("consent required");
  const body = $("body").text();
  const hasResults = $(provider === "bing" ? "#b_results > li.b_algo" : ".result__a").length > 0;
  if (!hasResults && /unusual traffic|verify (that )?you('re| are) (a )?human|complete the captcha/i.test(body))
    throw new Error("verification required");
  if (!hasResults && provider === "duckduckgo" && /Unfortunately, bots use DuckDuckGo too/i.test(body))
    throw new Error("verification required");
}

export function parseProvider(html: string, provider: Provider): Batch {
  const $ = load(html);
  blocked($, provider);
  $("script, style, noscript").remove();
  const results: SearchResult[] = [];
  const selector = provider === "bing" ? "#b_results > li.b_algo" : ".result:not(.result--ad)";
  $(selector).slice(0, 50).each((_, element) => {
    const row = $(element);
    if (row.find('.result__badge, .b_ad').length) return;
    const link = row.find(provider === "bing" ? "h2 a" : ".result__a").first();
    const url = destination(link.attr("href") ?? "", provider);
    const title = text(link.text(), 1000);
    if (!url || !title) return;
    const parsed = new URL(url);
    const excerpt = text(row.find(provider === "bing" ? ".b_caption p, .b_snippet" : ".result__snippet").first().text(), 5000);
    results.push({ url, title, excerpt, domain: parsed.hostname, kind: classifySearchResult(parsed, title, excerpt), engines: [provider === "bing" ? "Bing" : "DuckDuckGo"] });
  });
  if (provider === "bing") {
    const hasNext = $('a.sb_pagN, a[title="Next page"]').length > 0;
    if (!results.length && !$("#b_results .b_no").length && !/no results found|there are no results/i.test($("#b_results").text()))
      throw new Error("search page could not be read");
    return { results, hasNext };
  }
  const form = $("form").filter((_, element) => $(element).find('input[type="submit"]').attr("value") === "Next").first();
  let next: string | undefined;
  if (form.length) {
    // Use a fixed origin and allowlisted query fields, never a server-supplied form action.
    const url = new URL(DDG);
    form.find('input[type="hidden"]').each((_, element) => {
      const input = $(element), name = input.attr("name");
      if (name && ["q", "s", "nextParams", "v", "o", "dc", "api", "vqd", "kl"].includes(name))
        url.searchParams.set(name, (input.attr("value") ?? "").slice(0, 8192));
    });
    if (url.searchParams.has("s")) next = url.href;
  }
  if (!results.length && !$(".no-results, .result--no-result").length)
    throw new Error("search page could not be read");
  return { results, hasNext: !!next, next };
}

/** Reciprocal rank fusion rewards agreement without comparing provider-specific scores. */
export function mergeBatches(batches: Batch[]): SearchResult[] {
  const ranked = new Map<string, { result: SearchResult; score: number; order: number }>();
  for (const batch of batches) {
    const seen = new Set<string>();
    batch.results.forEach((result, position) => {
      const destination = new URL(result.url); destination.hash = "";
      const key = destination.href;
      if (seen.has(key)) return;
      seen.add(key);
      const previous = ranked.get(key);
      if (previous) {
        previous.score += 1 / (60 + position + 1);
        previous.result.engines = [...new Set([...previous.result.engines, ...result.engines])];
        if (result.title.length > previous.result.title.length) previous.result.title = result.title;
        if (result.excerpt.length > previous.result.excerpt.length) previous.result.excerpt = result.excerpt;
      } else ranked.set(key, { result: structuredClone(result), score: 1 / (60 + position + 1), order: ranked.size });
    });
  }
  return [...ranked.values()].sort((a, b) => b.score - a.score || a.order - b.order).map(({ result }) => ({
    ...result, kind: classifySearchResult(new URL(result.url), result.title, result.excerpt),
  }));
}

async function readHTML(response: Response): Promise<string> {
  if (!response.ok) throw new Error([202, 403, 429].includes(response.status) ? "temporarily blocked" : `HTTP ${response.status}`);
  if (response.status === 202) throw new Error("verification required");
  const type = response.headers.get("content-type");
  if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) throw new Error("unexpected response format");
  if (!response.body) throw new Error("empty response");
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); let html = "", size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > LIMIT) throw new Error("response exceeded 4 MB");
      html += decoder.decode(chunk.value, { stream: true });
    }
    return html + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}

export class Metasearch {
  private active = 0;
  private waiting = new Set<() => void>();
  private cursors = new Map<string, string | null>();
  private cache = new Map<string, { expires: number; value: SearchResponse }>();
  private custom: SearchTransport;
  readonly transport: SearchTransport;

  constructor(private providers: () => Provider[] = () => ["duckduckgo", "bing"], private fetcher: typeof fetch = (input, init) => fetch(input, init)) {
    this.custom = createSearxngTransport(fetcher);
    this.transport = (search, signal) => this.search(search, signal);
  }

  clear(): void { this.cache.clear(); this.cursors.clear(); }
  invalidate(query: string): void {
    for (const key of this.cache.keys()) if (JSON.parse(key)[1] === query) this.cache.delete(key);
    for (const key of this.cursors.keys()) if (JSON.parse(key)[0] === query) this.cursors.delete(key);
  }

  private async fetchPage(url: string, provider: Provider, signal: AbortSignal): Promise<Batch> {
    while (this.active >= 4) {
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const wake = () => { signal.removeEventListener("abort", abort); resolve(); };
        const abort = () => { this.waiting.delete(wake); reject(signal.reason); };
        this.waiting.add(wake);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
    signal.throwIfAborted();
    this.active++;
    try {
      const response = await this.fetcher(url, { headers: HEADERS, credentials: "omit", signal });
      return parseProvider(await readHTML(response), provider);
    } finally {
      this.active--;
      const next = this.waiting.values().next().value;
      if (next) { this.waiting.delete(next); next(); }
    }
  }

  private async duckduckgo(query: string, page: number, signal: AbortSignal): Promise<Batch> {
    const key = (number: number) => JSON.stringify([query, number]);
    let url = this.cursors.get(key(page));
    if (page > 1 && url === undefined) {
      // Recover a short cursor chain when a saved search reopens after a restart.
      if (page > 5) throw new Error("pagination expired; run this search again");
      for (let number = 1; number < page; number++) {
        await this.duckduckgo(query, number, signal);
        if (this.cursors.get(key(number + 1)) === null) return { results: [], hasNext: false };
      }
      url = this.cursors.get(key(page));
    }
    if (url === null) return { results: [], hasNext: false };
    if (page === 1) { const initial = new URL(DDG); initial.searchParams.set("q", query); url = initial.href; }
    if (!url) throw new Error("pagination unavailable");
    const batch = await this.fetchPage(url, "duckduckgo", signal);
    this.cursors.set(key(page + 1), batch.next ?? null);
    while (this.cursors.size > 200) this.cursors.delete(this.cursors.keys().next().value!);
    return batch;
  }

  private async search(search: SearchDefinition, signal: AbortSignal): Promise<SearchResponse> {
    signal.throwIfAborted();
    if (![BUILTIN_SEARCH_URL, DEFAULT_SEARXNG_URL].includes(search.endpoint)) return this.custom(search, signal);
    const providers = [...new Set(this.providers())];
    if (!providers.length || providers.some(provider => !["duckduckgo", "bing"].includes(provider))) throw new Error("Select at least one search provider in Settings.");
    const key = JSON.stringify([providers, search.query, search.page]);
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    const settled = await Promise.allSettled(providers.map(async provider => {
      let batch: Batch;
      if (provider === "duckduckgo") batch = await this.duckduckgo(search.query, search.page, deadline);
      else {
        const url = new URL(BING);
        url.search = new URLSearchParams({ q: search.query, count: "10", first: String((search.page - 1) * 10 + 1) }).toString();
        batch = await this.fetchPage(url.href, provider, deadline);
      }
      if (unrelatedBatch(search.query, batch.results)) throw new Error("results did not match the query");
      return batch;
    }));
    signal.throwIfAborted();
    const batches: Batch[] = [], warnings: string[] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") batches.push(result.value);
      else {
        const error = result.reason;
        const reason = error?.name === "TimeoutError" ? "timed out" : error?.name === "TypeError" ? "connection failed" : error instanceof Error ? error.message : "unavailable";
        warnings.push(`${providers[index] === "bing" ? "Bing" : "DuckDuckGo"}: ${reason}`);
      }
    });
    if (!batches.length) throw new Error(`Search unavailable. ${warnings.join(". ")}. Retry or use a search-engine website in Settings.`);
    const response = { results: mergeBatches(batches), warnings, hasNext: batches.some(batch => batch.hasNext) };
    if (!warnings.length) {
      this.cache.set(key, { expires: Date.now() + 60_000, value: structuredClone(response) });
      while (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
    }
    return response;
  }
}
