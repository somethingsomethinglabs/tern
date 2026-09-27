import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { Snapshot, Workspace } from "@tern/core/contracts";
import { summaryInput } from "@tern/core/task-recap";
import { openSummaryProvider, type OpenSummaryProvider, type SummaryProvider } from "./summary-provider.js";

type Entry = { key: string; text: string; model: string };

import { SUMMARY_PROMPT, parseTaskSummary } from "@tern/core/task-summary";

export class TaskSummaries {
  private entries: Record<string, Entry> = {};
  private controller?: AbortController;
  private path: string;
  status = "";
  pendingTaskIds: string[] = [];

  constructor(
    private directory: string,
    private openProvider: OpenSummaryProvider = openSummaryProvider,
  ) {
    this.path = join(directory, "task-summaries.json");
    try {
      if (existsSync(this.path) && statSync(this.path).size < 1_000_000) {
        const data = JSON.parse(readFileSync(this.path, "utf8"));
        if (data && typeof data === "object" && !Array.isArray(data))
          for (const [id, entry] of Object.entries(data).slice(0, 200)) {
            const e = entry as Entry;
            if (
              e &&
              typeof e.key === "string" &&
              typeof e.text === "string" &&
              e.text.length <= 600 &&
              typeof e.model === "string"
            )
              this.entries[id] = e;
          }
      }
    } catch {
      /* Derived data can always be rebuilt. */
    }
  }

  private key(model: string, input: unknown) {
    return createHash("sha256")
      .update(JSON.stringify([SUMMARY_PROMPT, model, input]))
      .digest("hex");
  }

  snapshot(workspace: Workspace, model: string): Snapshot["summaries"] {
    if (!model) return {};
    return Object.fromEntries(
      workspace.tasks
        .filter((task) => {
          const entry = this.entries[task.id];
          return (
            entry?.key === this.key(model, summaryInput(task, workspace.pages))
          );
        })
        .map((task) => [
          task.id,
          { text: this.entries[task.id].text, source: "local-model", model },
        ]),
    );
  }

  stop(clear = false) {
    this.controller?.abort();
    this.controller = undefined;
    this.status = "";
    this.pendingTaskIds = [];
    if (clear) {
      this.entries = {};
      try {
        rmSync(this.path, { force: true });
      } catch {
        /* No cached results are used. */
      }
    }
  }

  async refresh(workspace: Workspace, model: string, publish: () => void) {
    this.stop();
    if (!model) return;
    const controller = new AbortController();
    this.controller = controller;
    const current = () =>
      this.controller === controller && !controller.signal.aborted;
    let provider: SummaryProvider | undefined;
    try {
      const tasks = workspace.tasks
        .filter((task) => task.lifecycle === "Active")
        .slice(0, 200);
      const pending = tasks.filter((task) => {
        const input = summaryInput(task, workspace.pages);
        return (
          input.totalPages > 0 &&
          this.entries[task.id]?.key !== this.key(model, input)
        );
      });
      if (!pending.length) return;
      provider = await this.openProvider(this.directory, model, SUMMARY_PROMPT, controller.signal, (message) => {
        if (current()) { this.status = message; publish(); }
      });
      if (!current()) return;
      this.pendingTaskIds = pending.map((task) => task.id);
      this.status = "Writing descriptions on this device...";
      publish();
      for (const task of pending) {
        if (!current()) return;
        const input = summaryInput(task, workspace.pages);
        const key = this.key(model, input);
        const text = parseTaskSummary(JSON.parse(await provider.generate(JSON.stringify(input))));
        if (!current()) return;
        this.pendingTaskIds = this.pendingTaskIds.filter((id) => id !== task.id);
        if (
          key !== this.key(model, summaryInput(task, workspace.pages)) ||
          task.lifecycle !== "Active"
        )
          continue;
        this.entries[task.id] = { key, model, text: text.trim() };
        this.entries = Object.fromEntries(
          Object.entries(this.entries).filter(([id]) =>
            tasks.some((task) => task.id === id),
          ),
        );
        try {
          writeFileSync(this.path + ".tmp", JSON.stringify(this.entries), {
            mode: 0o600,
          });
          renameSync(this.path + ".tmp", this.path);
        } catch {
          /* A cache failure must not block browsing. */
        }
        publish();
      }
      if (current()) this.status = "";
    } catch {
      if (current())
        this.status = model.startsWith("builtin:")
          ? "Built-in AI unavailable. Showing saved browsing details. Retry in Settings."
          : "Local AI unavailable. Showing saved browsing details.";
    } finally {
      provider?.close();
      if (current()) {
        this.controller = undefined;
        this.pendingTaskIds = [];
        publish();
      }
    }
  }
}
