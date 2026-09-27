<script lang="ts">
  import Check from "phosphor-svelte/lib/Check";
  import X from "phosphor-svelte/lib/X";
  import { entrance } from "./motion.svelte";
  import type {
    Command,
    Task,
    Lifecycle,
    Snapshot,
  } from "@tern/core/contracts";
  import TaskContextPanel from "./TaskContextPanel.svelte";
  let {
    task,
    open,
    send,
    close,
    snapshot,
  }: {
    task?: Task;
    open: boolean;
    send(command: Command): Promise<boolean>;
    close(): void;
    snapshot: Snapshot | null;
  } = $props();
  const revisions: Record<string, number> = {};
  let drafts = $state.raw<Record<string, string>>({});

  let saved = $state.raw("");

  let saving = $state.raw(false);

  const note = $derived(task ? (drafts[task.id] ?? task.note) : "");
  let panel = $state.raw<HTMLElement | null>(null);
  let confirmation = $state.raw<HTMLParagraphElement | null>(null);
  const isSaved = $derived(!!task && saved === task.id && note === task.note);
  entrance(
    () => panel,
    () => open,
  );
  entrance(
    () => confirmation,
    () => open && isSaved,
    () => "feedback",
  );
</script>

<aside
  bind:this={panel}
  id="task-notes"
  class="context task-notes"
  hidden={!open}
  aria-label="Task notes"
>
  <header class="context-heading">
    <h2>Task notes</h2>
    <button aria-label="Close task notes" onclick={close}>
      <X aria-hidden="true" size={18}></X>
    </button>
  </header>
  {#if task && snapshot}
    <p class="note-task-title">{task.title}</p>
    <TaskContextPanel
      {task}
      result={snapshot.taskContext}
      status={snapshot.contextStatus}
      pending={snapshot.contextPending}
      enabled={!!snapshot.preferences.summaryModel}
      noteDirty={note !== task.note}
      {send}
    >
      <form
        onsubmit={async (event) => {
          event.preventDefault();
          const id = task.id;
          const submitted = note;
          const revision = revisions[id] ?? 0;
          saving = true;
          if (await send({ type: "saveNote", id, note: submitted })) {
            drafts = ((current: typeof drafts) => {
              const next = { ...current };
              if ((revisions[id] ?? 0) === revision && next[id] === submitted)
                delete next[id];
              return next;
            })(drafts);
            saved = id;
          }
          saving = false;
        }}
      >
        <label for="task-note">Next step</label>
        <textarea
          id="task-note"
          rows={3}
          value={note}
          placeholder="What needs doing next? Add a reminder or a useful link."
          oninput={(event) => {
            saved = "";
            revisions[task!.id] = (revisions[task!.id] ?? 0) + 1;
            drafts = {
              ...drafts,
              [task.id]: event.currentTarget.value,
            };
          }}></textarea>
        <div class="note-save-row">
          <small class={note.length > 500 ? "invalid-note" : ""}>
            {note.length}/500
          </small>
          <button
            class="primary"
            disabled={saving || note.length > 500 || note === task.note}
          >
            {saving ? "Saving..." : "Save note"}
          </button>
        </div>
        {#if note.length > 500}<p role="alert">
            Shorten the note to 500 characters. Your draft is kept here.
          </p>{/if}
        <p
          bind:this={confirmation}
          class={`save-status ${isSaved ? "is-saved" : ""}`}
          role="status"
        >
          {#if isSaved}<Check size={15} aria-hidden="true"></Check>{/if}
          {note !== task.note
            ? "Unsaved note"
            : saved === task.id
              ? "Note saved"
              : ""}
        </p>
      </form>
    </TaskContextPanel>
    <label class="task-status">
      Move task to
      <select
        aria-label="Task status"
        value={task.lifecycle}
        onchange={(event) => {
          const lifecycle = event.currentTarget.value as Lifecycle;
          event.currentTarget.value = task.lifecycle;
          void send({
            type: "moveTask",
            id: task.id,
            lifecycle,
          });
        }}
      >
        <option>Active</option>
        <option>Later</option>
        <option>Settled</option>
      </select>
    </label>
  {:else}<p>Create or select a task to keep a note with it.</p>{/if}
</aside>
