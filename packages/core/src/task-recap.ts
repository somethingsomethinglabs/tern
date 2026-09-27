import type { PageRecord, Task } from "./contracts.js";

export function siteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function recentPages(task: Task, pages: PageRecord[]) {
  return pages
    .filter((page) => page.taskId === task.id && page.url)
    .sort(
      (a, b) =>
        Number(b.id === task.selectedPageId) -
          Number(a.id === task.selectedPageId) ||
        (b.lastViewedAt ?? 0) - (a.lastViewedAt ?? 0),
    );
}

export function pageLabel(page: PageRecord) {
  return page.title &&
    !["Loading…", "New page"].includes(page.title) &&
    page.title !== page.url
    ? page.title
    : siteName(page.url);
}

// A factual recap is always available, including before a model has loaded.
export function browsingRecap(task: Task, pages: PageRecord[]) {
  const recent = recentPages(task, pages);
  if (!recent.length)
    return "No saved sites yet. Open this task to get started.";
  const titles = [...new Set(recent.map(pageLabel))].slice(0, 3);
  const topics = titles.map((title) =>
    title.length > 85 ? title.slice(0, 82) + "..." : title,
  );
  return `You had ${topics.join(" · ")} open${recent.length > titles.length ? `, alongside ${recent.length - titles.length} other ${recent.length - titles.length === 1 ? "page" : "pages"}` : ""}.`;
}

export function summaryInput(task: Task, pages: PageRecord[]) {
  const recent = recentPages(task, pages);
  return {
    task: task.title,
    nextStep: task.note,
    lastSelectedPage:
      recent.find((page) => page.id === task.selectedPageId)?.id ?? null,
    totalPages: recent.length,
    // Limit context and omit paths, query strings and fragments. No page bodies.
    recentPages: recent.slice(0, 12).map((page) => ({
      id: page.id,
      title: pageLabel(page).slice(0, 180),
      site: siteName(page.url),
    })),
  };
}
