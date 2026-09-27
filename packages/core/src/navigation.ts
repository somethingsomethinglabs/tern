import type { Preferences } from "./contracts.js";

export function isWebURL(value: string) {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}
export function addressURL(address: string, engine: Preferences["searchEngine"]) {
  const value = address.trim();
  if (!value || value.length > 8192)
    throw new Error("Enter an address or search query.");
  if (isWebURL(value)) return new URL(value).href;
  if (
    /^[a-z][a-z\d+.-]*:/i.test(value) &&
    !/^(localhost|[\w.-]+\.\w+):\d+(\/|$)/i.test(value)
  )
    throw new Error("Only HTTP and HTTPS addresses can be opened.");
  if (!/\s/.test(value) && /^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(value))
    return new URL("http://" + value).href;
  if (!/\s/.test(value) && value.includes(".")) {
    const url = "https://" + value;
    if (isWebURL(url)) return new URL(url).href;
  }
  return searchURL(value, engine);
}
export function searchURL(query: string, engine: Preferences["searchEngine"]) {
  const engines = {
    duckduckgo: "https://duckduckgo.com/?q=",
    google: "https://www.google.com/search?q=",
    bing: "https://www.bing.com/search?q=",
    brave: "https://search.brave.com/search?q=",
  };
  return engines[engine] + encodeURIComponent(query);
}
