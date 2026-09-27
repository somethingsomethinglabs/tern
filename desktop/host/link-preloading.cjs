// Runs in the isolated guest preload. Only external origins reach the host;
// Chromium owns requests, cookies, priorities and the navigation prefetch cache.
function linkPrefetchCandidate(href, base) {
  try {
    const current = new URL(base);
    const url = new URL(href, current);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password)
      return null;
    if (url.search || url.hash || url.href === current.href) return null;
    const path = decodeURIComponent(url.pathname).toLowerCase();
    // Do not speculate on likely actions or personalized workflows. This is a
    // heuristic, not a promise that arbitrary GET endpoints are side-effect free.
    if (/(?:^|[\/_\-.])(?:accept|account|add|admin|api|approve|auth|basket|buy|cart|checkout|confirm|delete|downloads?|edit|login|logout|log-in|log-out|oauth|order|orders|payment|purchase|register|remove|reset|save|settings|signin|signout|sign-in|sign-out|subscribe|unsubscribe|uploads?|wishlist)(?:$|[\/_\-.])/.test(path))
      return null;
    if (/\.[a-z0-9]{1,8}$/i.test(path) && !/\.(?:html?|php|aspx?)$/i.test(path))
      return null;
    return { url: url.href, origin: url.origin, sameOrigin: url.origin === current.origin };
  } catch { return null; }
}

function installLinkPreloading(ipcRenderer) {
  if (!process.isMainFrame) return;
  const marker = `tern-${Array.from(crypto.getRandomValues(new Uint32Array(2))).join("-")}`;
  const attribute = "data-tern-prefetch";
  const marked = new Map();
  const connections = new Set();
  let enabled = false;
  let rule;
  let connectionTimer;
  let hovered;
  const connection = navigator.connection;
  const permitted = () => enabled && document.visibilityState === "visible" &&
    navigator.onLine && !connection?.saveData &&
    !["slow-2g", "2g", "3g"].includes(connection?.effectiveType);

  function candidate(anchor) {
    if (!anchor?.isConnected || !anchor.matches("a[href]") ||
      anchor.closest('[download], [ping], [onclick], [role="button"], [data-no-prefetch], [data-no-prerender], .no-prefetch, .no-prerender') ||
      anchor.relList.contains("nofollow") || anchor.relList.contains("external") ||
      (anchor.target && anchor.target.toLowerCase() !== "_self") ||
      document.querySelector('base[target]:not([target="_self"])')) return null;
    return linkPrefetchCandidate(anchor.href, location.href);
  }
  function unmark(anchor) {
    anchor.removeAttribute(attribute);
    marked.get(anchor)?.disconnect();
    marked.delete(anchor);
  }
  function clear() {
    clearTimeout(connectionTimer);
    hovered = undefined;
    for (const anchor of marked.keys()) unmark(anchor);
    rule?.remove();
    rule = undefined;
    connections.clear();
  }
  function configure() {
    if (!permitted()) { clear(); return; }
    if (!document.head || rule || !HTMLScriptElement.supports?.("speculationrules")) return;
    rule = document.createElement("script");
    rule.type = "speculationrules";
    rule.textContent = JSON.stringify({
      tag: "tern-hover",
      prefetch: [{
        where: { and: [
          { selector_matches: `a[${attribute}="${marker}"]` },
          { href_matches: `${location.origin}/*` },
        ] },
        eagerness: "moderate",
      }],
    });
    // The site's CSP still applies. Never copy a nonce or relax its policy.
    document.head.append(rule);
  }
  function over(event) {
    if (!event.isTrusted || !permitted()) return;
    const anchor = event.composedPath().find(node => node instanceof HTMLAnchorElement);
    if (anchor === hovered) return;
    clearTimeout(connectionTimer);
    hovered = anchor;
    const next = candidate(anchor);
    if (!next) return;
    configure();
    if (next.sameOrigin && rule) {
      if (!marked.has(anchor)) {
        // Bound our bookkeeping. Chromium retains at most two moderate
        // speculations and supplies the hover dwell and cancellation behavior.
        if (marked.size >= 20) unmark(marked.keys().next().value);
        const observer = new MutationObserver(() => {
          if (!candidate(anchor)?.sameOrigin) unmark(anchor);
        });
        marked.set(anchor, observer);
        observer.observe(anchor, { attributes: true, attributeFilter: [
          "href", "target", "rel", "download", "ping", "onclick", "role",
          "data-no-prefetch", "data-no-prerender", "class",
        ] });
      }
      anchor.setAttribute(attribute, marker);
    } else if (!next.sameOrigin && !connections.has(next.origin) && connections.size < 2) {
      // An external link gets a connection only, without fetching its page.
      connectionTimer = setTimeout(() => {
        if (!permitted() || hovered !== anchor || candidate(anchor)?.origin !== next.origin) return;
        connections.add(next.origin);
        ipcRenderer.send("guest:preconnect", next.origin);
      }, 200);
    }
  }
  window.addEventListener("pointerover", over, { passive: true, capture: true });
  window.addEventListener("pointerout", event => {
    if (hovered && !(event.relatedTarget instanceof Node && hovered.contains(event.relatedTarget))) {
      clearTimeout(connectionTimer);
      hovered = undefined;
    }
  }, { passive: true, capture: true });
  document.addEventListener("visibilitychange", configure);
  window.addEventListener("online", configure);
  window.addEventListener("offline", configure);
  connection?.addEventListener("change", configure);
  window.addEventListener("pagehide", clear);
  document.addEventListener("DOMContentLoaded", configure, { once: true });
  ipcRenderer.on("guest:link-preloading", (_event, value) => {
    enabled = value === true;
    configure();
  });
}

if (typeof module !== "undefined") module.exports = { linkPrefetchCandidate };
