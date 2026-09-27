<script lang="ts">
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";
  import Globe from "phosphor-svelte/lib/Globe";
  import ClockCounterClockwise from "phosphor-svelte/lib/ClockCounterClockwise";
  import type { Command, Snapshot } from "@tern/core/contracts";
  import { entrance } from "./motion.svelte";
  import {
    browsingRecap,
    pageLabel,
    recentPages,
    siteName,
  } from "@tern/core/task-recap";
  let {
    snapshot,
    send,
    createTask,
  }: {
    snapshot: Snapshot;
    send(command: Command): Promise<boolean>;
    createTask(): void;
  } = $props();
  let opening = $state.raw<string | null>(null);

  let busy = $state.raw(false);
  let root = $state.raw<HTMLElement | null>(null);
  entrance(
    () => root,
    () => true,
    () => "overview",
  );
  const tasks = $derived(
    snapshot.tasks
      .filter((task) => task.lifecycle === "Active")
      .sort(
        (a, b) =>
          (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) ||
          Number(b.id === snapshot.selectedTaskId) -
            Number(a.id === snapshot.selectedTaskId),
      ),
  );
</script>

<section bind:this={root} class="task-overview" aria-label="Task overview">
  <header class="overview-heading">
    <div>
      <p class="overview-eyebrow">YOUR WORKSPACE</p>
      <h1>Pick up where you left off</h1>
      <p>Choose a task to open its tabs and get back to work.</p>
    </div>
    <span class="overview-count">
      {tasks.length} active {tasks.length === 1 ? "task" : "tasks"}
    </span>
  </header>
  {#if tasks.length}<div class="task-tiles">
      {#each tasks as task (task.id)}{@const pages = recentPages(
          task,
          snapshot.pages,
        )}{@const selected = pages.find(
          (page) => page.id === task.selectedPageId,
        )}{@const summary = snapshot.summaries[task.id]}{@const generating =
          snapshot.pendingSummaryTaskIds.includes(task.id)}{@const sites = [
          ...new Set(pages.map((page) => siteName(page.url))),
        ]}
        <article class="task-tile">
          <button
            class="task-tile-open"
            aria-label={`Resume ${task.title}`}
            aria-busy={opening === task.id}
            disabled={opening !== null}
            onclick={async () => {
              if (busy) return;
              busy = true;
              opening = task.id;
              await send({ type: "openTask", id: task.id });
              busy = false;
              opening = null;
            }}
          >
            <span class="tile-topline">
              <span>
                {task.lastOpenedAt
                  ? `Last opened ${new Date(task.lastOpenedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : "Active task"}
              </span>
            </span>
            <span role="heading" aria-level={2} class="tile-title">
              {task.title}
            </span>
            <span class="tile-description" aria-busy={generating}>
              {#if generating}<span
                  class="tile-description-loading"
                  role="status"
                >
                  <span class="tile-description-skeleton" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                  <span class="tile-inference"> Writing description... </span>
                </span>{:else}{summary?.text ??
                  browsingRecap(task, snapshot.pages)}{/if}
            </span>
            {#if summary && !generating}<span class="tile-inference">
                AI description · inferred from saved tabs
              </span>{/if}
            {#if selected}<span class="tile-focus">
                <ClockCounterClockwise aria-hidden="true" size={16}
                ></ClockCounterClockwise>
                <span>
                  <span class="tile-label">Last selected</span>
                  <span>{pageLabel(selected)}</span>
                </span>
              </span>{/if}
            {#if task.note}<span class="tile-note">
                <span class="tile-label">Your next step</span>
                <span>{task.note}</span>
              </span>{/if}
            <span class="tile-sites" aria-label="Saved sites">
              {#each sites.slice(0, 3) as site (site)}<span>
                  <Globe aria-hidden="true" size={12}></Globe>
                  {site}
                </span>{/each}
              {#if sites.length > 3}<span>+{sites.length - 3} sites</span>{/if}
            </span>
            <span class="tile-footer">
              <span>
                {pages.length}
                {pages.length === 1 ? "tab" : "tabs"}
              </span>
              <span>
                {opening === task.id ? "Opening..." : "Resume task"}
                <ArrowRight aria-hidden="true" size={17}></ArrowRight>
              </span>
            </span>
          </button>
        </article>{/each}
    </div>{:else}<div class="overview-empty">
      <span class="tern-glyph" aria-hidden="true"></span>
      <h2>
        {snapshot.tasks.length
          ? "No active tasks right now"
          : "A place for your unfinished work"}
      </h2>
      <p>
        {snapshot.tasks.length
          ? "Your other tasks are in Later and Settled in the sidebar. Bring one back or start something new."
          : "Describe what you need to do. Start with a goal and a few useful searches."}
      </p>
      <button class="primary" onclick={createTask}>
        {snapshot.tasks.length ? "Create a task" : "Create your first task"}
      </button>
    </div>{/if}
  <footer class="overview-footnote">
    {#if snapshot.summaryStatus}<p aria-live="polite">
        {snapshot.summaryStatus}
      </p>{/if}
    <p>
      Saved notes and tabs keep your place. Reopened sites may need you to sign
      in again; unsaved forms are not restored after quitting.
    </p>
  </footer>
</section>
