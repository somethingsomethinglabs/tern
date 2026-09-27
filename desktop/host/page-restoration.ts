import type { WebContents } from "electron";

// Give the selected document a head start, then open one background document
// at a time. DOM readiness releases a slot even if images are still loading.
export class PageRestoration {
  private pending = new Set<string>();
  private waiting = new Map<string, () => void>();
  private startPage: (id: string) => WebContents | undefined;

  constructor(startPage: (id: string) => WebContents | undefined) {
    this.startPage = startPage;
  }

  get size() {
    return this.pending.size;
  }
  has(id: string) {
    return this.pending.has(id);
  }

  resume(selectedId: string | null, ids: string[]) {
    for (const id of ids) this.pending.add(id);
    if (selectedId) this.open(selectedId);
    else this.pump();
  }

  open(id: string) {
    this.pending.delete(id);
    if (this.waiting.has(id)) return;
    const contents = this.startPage(id);
    if (!contents || contents.isDestroyed() || !contents.isLoadingMainFrame()) {
      this.pump();
      return;
    }
    const cleanup = () => {
      clearTimeout(timer);
      contents.removeListener("dom-ready", done);
      contents.removeListener("did-stop-loading", done);
      contents.removeListener("destroyed", done);
    };
    const done = () => {
      cleanup();
      this.waiting.delete(id);
      this.pump();
    };
    // A stalled server must not hold the other saved tabs indefinitely.
    const timer = setTimeout(done, 5000);
    timer.unref();
    this.waiting.set(id, cleanup);
    contents.once("dom-ready", done);
    contents.once("did-stop-loading", done);
    contents.once("destroyed", done);
  }

  forget(id: string) {
    this.pending.delete(id);
  }

  stop() {
    this.pending.clear();
    for (const cleanup of this.waiting.values()) cleanup();
    this.waiting.clear();
  }

  private pump() {
    if (this.waiting.size) return;
    const next = this.pending.values().next().value;
    if (next) this.open(next);
  }
}
