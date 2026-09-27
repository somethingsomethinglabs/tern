<script lang="ts">
  import { type Snippet } from "svelte";
  import type { Command, Task, TaskContext } from "@tern/core/contracts";
  let {
    task,
    result,
    status,
    pending,
    enabled,
    noteDirty,
    send,
    children,
  }: {
    task: Task;
    result: TaskContext | null;
    status: string;
    pending: boolean;
    enabled: boolean;
    noteDirty: boolean;
    send(command: Command): Promise<boolean>;
    children: Snippet;
  } = $props();
  const goalRevisions: Record<string, number> = {};
  let goals = $state.raw<Record<string, string>>({});

  let findings = $state.raw<
    Record<
      string,
      {
        text: string;
        id?: string;
      }
    >
  >({});

  let saving = $state.raw(false);

  const goal = $derived(goals[task.id] ?? task.goal ?? "");
  const draft = $derived(findings[task.id] ?? { text: "" });
  const dirty = $derived(goal !== (task.goal ?? ""));
  const setFinding = (text: string, id = draft.id) =>
    (findings = { ...findings, [task.id]: { text, id } });
</script>

{#if task.request}<details class="original-request">
    <summary>Original request</summary>
    <p>{task.request}</p>
  </details>{/if}
<form
  class="task-context-section"
  onsubmit={async (event) => {
    event.preventDefault();
    const id = task.id;
    const submitted = goal;
    const revision = goalRevisions[id] ?? 0;
    saving = true;
    if (await send({ type: "saveGoal", id, goal: submitted }))
      goals = ((current: typeof goals) => {
        const next = { ...current };
        if ((goalRevisions[id] ?? 0) === revision && next[id] === submitted)
          delete next[id];
        return next;
      })(goals);
    saving = false;
  }}
>
  <label for="task-goal">Goal</label>
  <textarea
    id="task-goal"
    rows={3}
    value={goal}
    placeholder="What are you trying to achieve?"
    oninput={(event) => {
      goalRevisions[task.id] = (goalRevisions[task.id] ?? 0) + 1;
      goals = { ...goals, [task.id]: event.currentTarget.value };
    }}></textarea>
  <div class="note-save-row">
    <small class={goal.length > 500 ? "invalid-note" : ""}
      >{goal.length}/500</small
    >
    <button class="primary" disabled={saving || !dirty || goal.length > 500}
      >Save goal</button
    >
  </div>
  {#if dirty}<p class="muted">Unsaved goal</p>{/if}
  {#if goal.length > 500}<p role="alert">
      Shorten the goal to 500 characters.
    </p>{/if}
</form>

{@render children()}

<section class="task-context-section" aria-label="Task suggestions">
  <h3>Suggested searches</h3>
  {#if !enabled}<p class="muted">
      Enable local AI in Settings for suggestions. You can still save goals and
      findings.
    </p>{:else}
    <p class="muted">
      Uses your saved goal, next step, recent page titles and findings.
      Suggestions may need editing.
    </p>
    {#if pending}<button
        onclick={() => void send({ type: "cancelTaskContext" })}
        >Stop generating</button
      >{:else}{#if !result}<button
          disabled={dirty || noteDirty}
          onclick={() => void send({ type: "suggestTaskContext", id: task.id })}
          >Generate suggestions</button
        >{/if}{/if}
    {#if dirty || noteDirty}<p class="muted">
        Save your goal and next step to use them in suggestions.
      </p>{/if}
    {#if status}<p class="muted" role="status">{status}</p>{/if}
    {#if result}
      {#if !task.goal && result.goal && !dirty}<div class="goal-suggestion">
          <small>Suggested goal</small>
          <p>{result.goal}</p>
          <button onclick={() => (goals = { ...goals, [task.id]: result.goal })}
            >Edit suggested goal</button
          >
        </div>{/if}
      {#if result.searches.length}
        <ul class="search-suggestions">
          {#each result.searches as query (query)}<li>
              <button
                disabled={dirty || noteDirty}
                onclick={() =>
                  void send({ type: "searchTask", id: task.id, query })}
                >{query}</button
              >
            </li>{/each}
        </ul>
        <p class="muted">
          Searches open in a new tab using your chosen search engine.
        </p>
      {:else}<p class="muted">
          No useful searches suggested yet. Add a goal or a next step.
        </p>{/if}
    {/if}
  {/if}
</section>

<section class="task-context-section" aria-label="Saved findings">
  <h3>
    Saved findings <span class="finding-count"
      >{task.findings?.length ?? 0}</span
    >
  </h3>
  <p class="muted">
    Keep what you have established. You can also select text on a page and
    right-click to save it with its source.
  </p>
  {#if !!task.findings?.length}<ul class="saved-findings">
      {#each task.findings as finding (finding.id)}<li>
          <p>{finding.text}</p>
          {#if finding.source}<button
              class="finding-source"
              onclick={() =>
                void send({
                  type: "openFindingSource",
                  id: task.id,
                  findingId: finding.id,
                })}
            >
              Source: {finding.source.title ||
                new URL(finding.source.url).hostname}
            </button>{/if}
          <div class="finding-actions">
            <button
              aria-label={`Edit finding: ${finding.text}`}
              onclick={() => {
                setFinding(finding.text, finding.id);
                document.getElementById("task-finding")?.focus();
              }}>Edit</button
            >
            <button
              aria-label={`Remove finding: ${finding.text}`}
              onclick={async () => {
                const id = task.id;
                const submitted = findings[id];
                if (
                  await send({
                    type: "removeFinding",
                    id,
                    findingId: finding.id,
                  })
                ) {
                  if (
                    findings[id] === submitted &&
                    submitted?.id === finding.id
                  )
                    findings = { ...findings, [id]: { text: "" } };
                }
              }}>Remove</button
            >
          </div>
        </li>{/each}
    </ul>{/if}
  <form
    onsubmit={async (event) => {
      event.preventDefault();
      const id = task.id;
      const submitted = draft;
      saving = true;
      const success = await send(
        draft.id
          ? { type: "editFinding", id, findingId: draft.id, text: draft.text }
          : { type: "addFinding", id, text: draft.text },
      );
      if (success)
        findings = ((current: typeof findings) => {
          const next = { ...current };
          if (next[id] === submitted) delete next[id];
          return next;
        })(findings);
      saving = false;
    }}
  >
    <label for="task-finding">{draft.id ? "Edit finding" : "New finding"}</label
    >
    <textarea
      id="task-finding"
      rows={3}
      value={draft.text}
      placeholder="What have you learned or decided?"
      oninput={(event) => setFinding(event.currentTarget.value)}></textarea>
    <div class="note-save-row">
      <small class={draft.text.length > 1000 ? "invalid-note" : ""}
        >{draft.text.length}/1000</small
      >
      <button
        class="primary"
        disabled={saving ||
          !draft.text.trim() ||
          draft.text.length > 1000 ||
          (!draft.id && (task.findings?.length ?? 0) >= 50)}
      >
        {draft.id ? "Save finding" : "Keep finding"}
      </button>
    </div>
    {#if draft.id}<button
        type="button"
        onclick={() => (findings = { ...findings, [task.id]: { text: "" } })}
        >Cancel edit</button
      >{/if}
    {#if draft.text.length > 1000}<p role="alert">
        Shorten the finding to 1,000 characters.
      </p>{/if}
    {#if (task.findings?.length ?? 0) >= 50}<p class="muted">
        This task has 50 findings. Remove one to keep another.
      </p>{/if}
  </form>
</section>
