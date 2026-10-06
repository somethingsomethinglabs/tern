import type { Preferences } from "./contracts.js";
import { builtinModel } from "./local-ai-config.js";
import { isWebURL } from "./navigation.js";

export function validatePreferences(current: Preferences, raw: unknown): Preferences {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("Invalid browser settings.");
    const patch = raw as Partial<Preferences>;
    if (Object.keys(patch).some((key) => !Object.hasOwn(current, key) && !["searchView", "searxngURL", "searchProviders"].includes(key)))
      throw new Error("Unknown browser setting.");
    const next = { ...current, ...patch };
    if (
      !["duckduckgo", "google", "bing", "brave"].includes(next.searchEngine) ||
      (next.searchView !== undefined && !["reading-list", "external"].includes(next.searchView)) ||
      (next.searchProviders !== undefined && (!Array.isArray(next.searchProviders) || next.searchProviders.length < 1 || next.searchProviders.length > 2 || new Set(next.searchProviders).size !== next.searchProviders.length || next.searchProviders.some(provider => !["duckduckgo", "bing"].includes(provider)))) ||
      (next.searxngURL !== undefined && (typeof next.searxngURL !== "string" || next.searxngURL.length > 2048 || !isWebURL(next.searxngURL) || !!new URL(next.searxngURL).search || !!new URL(next.searxngURL).hash)) ||
      ![
        next.autoHideToolbar,
        next.sidebarCollapsed,
        next.showSnapshotTool,
        next.preloadLinks,
        next.askDownloadLocation,
      ].every((value) => typeof value === "boolean") ||
      ![0.75, 0.9, 1, 1.1, 1.25, 1.5, 2].includes(next.defaultZoom) ||
      typeof next.summaryModel !== "string" ||
      next.summaryModel.length > 100 ||
      (next.summaryModel.startsWith("builtin:") && !builtinModel(next.summaryModel)) ||
      (next.summaryModel !== "" &&
        !/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(next.summaryModel)) ||
      typeof next.downloadDirectory !== "string"
    )
      throw new Error("Invalid browser settings.");
    return next;
}
