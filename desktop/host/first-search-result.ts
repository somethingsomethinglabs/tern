import type { WebContents } from "electron";

// This function runs in an isolated renderer world, with no Node access.
// Limit extraction to known organic-result containers, never arbitrary links.
export function firstSearchResult(searchURL: string): string | null {
  const search = new URL(searchURL);
  if (location.origin !== search.origin || location.pathname !== search.pathname ||
      new URL(location.href).searchParams.get("q") !== search.searchParams.get("q")) return null;
  const selectors: Record<string, string> = {
    "duckduckgo.com": '[data-testid="result"] [data-testid="result-title-a"], a.result__a',
    "www.google.com": '#search a:has(h3)',
    "www.bing.com": '#b_results .b_algo h2 a',
    "search.brave.com": '[data-type="web"] a:has(.search-snippet-title), [data-type="web"] a.snippet-title',
  };
  const selector = selectors[search.hostname];
  if (!selector) return null;
  for (const link of document.querySelectorAll<HTMLAnchorElement>(selector)) {
    if (!link.getClientRects().length || link.closest(
      '[hidden], [aria-hidden="true"], #tads, #tadsb, [data-text-ad], [data-ad], .b_ad, .result--ad, [data-testid="ad"], [data-type="ad"]',
    )) continue;
    try {
      let url = new URL(link.href);
      if (url.origin === search.origin) {
        let destination: string | null = null;
        if (search.hostname === "duckduckgo.com" && url.pathname === "/l/") destination = url.searchParams.get("uddg");
        if (search.hostname === "www.google.com" && url.pathname === "/url") destination = url.searchParams.get("q") || url.searchParams.get("url");
        if (search.hostname === "www.bing.com" && url.pathname === "/ck/a") {
          const encoded = url.searchParams.get("u");
          if (encoded?.startsWith("a1")) destination = atob(encoded.slice(2).replace(/-/g, "+").replace(/_/g, "/"));
        }
        if (!destination) continue;
        url = new URL(destination);
      }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
          url.origin === search.origin || url.href.length > 32768) continue;
      return url.href;
    } catch { /* Ignore malformed and non-web results. */ }
  }
  return null;
}

const following = new WeakMap<WebContents, () => void>();

export function stopFollowingSearch(contents?: WebContents) {
  if (contents) following.get(contents)?.();
}

/** Follow once, only for a newly started task. No automation survives user input. */
export function followFirstSearchResult(contents: WebContents, searchURL: string) {
  stopFollowingSearch(contents);
  let active = true;
  let checking = false;
  const search = new URL(searchURL);
  const matchesSearch = () => {
    try {
      const current = new URL(contents.getURL());
      return current.origin === search.origin && current.pathname === search.pathname &&
        current.searchParams.get("q") === search.searchParams.get("q");
    } catch { return false; }
  };
  const stop = () => {
    active = false;
    clearInterval(poll);
    clearTimeout(deadline);
    contents.removeListener("dom-ready", check);
    contents.removeListener("did-navigate", navigated);
    contents.removeListener("did-navigate-in-page", navigated);
    contents.removeListener("will-navigate", stop);
    contents.removeListener("before-input-event", stop);
    contents.removeListener("before-mouse-event", mouse);
    contents.removeListener("destroyed", stop);
    contents.removeListener("render-process-gone", stop);
    following.delete(contents);
  };
  const navigated = () => { if (!matchesSearch()) stop(); };
  const mouse = (_event: Electron.Event, input: Electron.MouseInputEvent) => {
    if (input.type === "mouseDown" || input.type === "mouseWheel") stop();
  };
  async function check() {
    if (!active || checking || contents.isDestroyed() || !matchesSearch()) return;
    checking = true;
    try {
      const result: unknown = await contents.executeJavaScriptInIsolatedWorld(1001, [
        { code: `(${firstSearchResult.toString()})(${JSON.stringify(searchURL)})` },
      ]);
      if (!active || contents.isDestroyed() || !matchesSearch() || typeof result !== "string") return;
      const url = new URL(result);
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return;
      stop();
      // A separate navigation preserves the search page in Back history.
      void contents.loadURL(url.href).catch(() => {});
    } catch { /* Keep the search page if extraction or navigation is unavailable. */ }
    finally { checking = false; }
  }
  const poll = setInterval(() => void check(), 500);
  const deadline = setTimeout(stop, 12_000);
  following.set(contents, stop);
  contents.on("dom-ready", check);
  contents.on("did-navigate", navigated);
  contents.on("did-navigate-in-page", navigated);
  contents.on("will-navigate", stop);
  contents.on("before-input-event", stop);
  contents.on("before-mouse-event", mouse);
  contents.on("destroyed", stop);
  contents.on("render-process-gone", stop);
}
