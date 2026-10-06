import type { Workspace } from "./contracts.js";
import { isWebURL } from "./navigation.js";

export function emptyWorkspace(): Workspace {
  return { version: 1, tasks: [], pages: [], selectedTaskId: null };
}

// Decode references and repair stale selections. Never restore live website state.
export function parseWorkspace(source: string): Workspace {
  const value = JSON.parse(source);
  const string = (text: unknown, max: number) =>
    typeof text === "string" && text.length <= max;
  if (
    !value || value.version !== 1 ||
    !Array.isArray(value.tasks) ||
    !Array.isArray(value.pages) ||
    value.tasks.length > 10000 ||
    value.pages.length > 100000
  )
    throw new Error("Unsupported workspace format.");
  if (
    !value.tasks.every(
      (task: Workspace["tasks"][number]) =>
        task &&
        string(task.id, 100) &&
        string(task.title, 120) &&
        string(task.note, 500) &&
        (task.goal === undefined || string(task.goal, 500)) &&
        (task.request === undefined || string(task.request, 1000)) &&
        (task.keptLinks === undefined || (Array.isArray(task.keptLinks) && task.keptLinks.length <= 100 && task.keptLinks.every(link => link && string(link.title, 1000) && string(link.url, 32768) && isWebURL(link.url)))) &&
        (task.findings === undefined || (
          Array.isArray(task.findings) && task.findings.length <= 50 &&
          new Set(task.findings.map((finding) => finding?.id)).size === task.findings.length &&
          task.findings.every((finding) => {
            if (!finding || !string(finding.id, 100) || !string(finding.text, 1000) ||
                !Number.isFinite(finding.createdAt) || finding.createdAt < 0) return false;
            if (finding.source === undefined) return true;
            if (!finding.source || !string(finding.source.title, 1000) ||
                !string(finding.source.url, 32768)) return false;
            const url = new URL(finding.source.url);
            return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
          })
        )) &&
        ["Active", "Later", "Settled"].includes(task.lifecycle),
    )
  )
    throw new Error("Invalid task data.");
  if (
    !value.pages.every((page: Workspace["pages"][number]) => {
      if (
        !page ||
        !string(page.id, 100) ||
        !string(page.title, 1000) ||
        typeof page.url !== "string" ||
        !value.tasks.some(
          (task: Workspace["tasks"][number]) => task.id === page.taskId,
        )
      )
        return false;
      if (page.search !== undefined) {
        const search = page.search;
        if (search && ["Projects", "Discussions"].includes(String(search.filter))) search.filter = "All";
        if (page.url !== "" || !search || !string(search.query, 8192) || !search.query.trim() ||
            !string(search.endpoint, 2048) || !isWebURL(search.endpoint) ||
            !["All", "Docs", "Articles", "Applications", "Videos"].includes(search.filter) ||
            !Number.isInteger(search.page) || search.page < 1 || search.page > 100 ||
            !Array.isArray(search.hiddenDomains) || search.hiddenDomains.length > 100 ||
            !search.hiddenDomains.every(domain => string(domain, 253) && /^[a-z\d.-]+$/i.test(domain))) return false;
      }
      if (page.sourceSearchId !== undefined && !string(page.sourceSearchId, 100)) return false;
      if (!page.url) return true;
      const url = new URL(page.url);
      return (
        ["http:", "https:"].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    })
  )
    throw new Error("Invalid page data.");
  if (
    new Set(value.tasks.map((task: Workspace["tasks"][number]) => task.id))
      .size !== value.tasks.length ||
    new Set(value.pages.map((page: Workspace["pages"][number]) => page.id))
      .size !== value.pages.length
  )
    throw new Error("Duplicate identifiers.");
  for (const task of value.tasks)
    if (
      typeof task.lastOpenedAt !== "number" ||
      !Number.isFinite(task.lastOpenedAt) ||
      task.lastOpenedAt < 0
    )
      delete task.lastOpenedAt;
  for (const page of value.pages)
    if (
      typeof page.lastViewedAt !== "number" ||
      !Number.isFinite(page.lastViewedAt) ||
      page.lastViewedAt < 0
    )
      delete page.lastViewedAt;
  for (const task of value.tasks)
    if (
      !value.pages.some(
        (page: Workspace["pages"][number]) =>
          page.id === task.selectedPageId && page.taskId === task.id,
      )
    )
      task.selectedPageId = null;
  for (const page of value.pages)
    if (page.sourceSearchId && !value.pages.some((source: Workspace["pages"][number]) => source.id === page.sourceSearchId && source.taskId === page.taskId && source.search)) delete page.sourceSearchId;
  if (
    !value.tasks.some(
      (task: Workspace["tasks"][number]) =>
        task.id === value.selectedTaskId,
    )
  )
    value.selectedTaskId = value.tasks[0]?.id ?? null;
  return value;
}
