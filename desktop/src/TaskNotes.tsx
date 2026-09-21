import { useState } from "react";
import { X } from "@phosphor-icons/react";
import type { Command, Task, Lifecycle } from "../host/contracts";

export function TaskNotes({
  task,
  open,
  send,
  close,
}: {
  task?: Task;
  open: boolean;
  send(command: Command): Promise<boolean>;
  close(): void;
}) {
  // Keep unfinished note drafts per task while the panel is closed or tasks switch.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const note = task ? (drafts[task.id] ?? task.note) : "";
  return (
    <aside
      className="context task-notes"
      hidden={!open}
      aria-label="Task notes"
    >
      <header className="context-heading">
        <h2>Task notes</h2>
        <button aria-label="Close task notes" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {task ? (
        <>
          <p className="note-task-title">{task.title}</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const id = task.id;
              setSaving(true);
              if (await send({ type: "saveNote", id, note })) {
                setDrafts((current) => {
                  const next = { ...current };
                  if (next[id] === note) delete next[id];
                  return next;
                });
                setSaved(id);
              }
              setSaving(false);
            }}
          >
            <label htmlFor="task-note">Next step</label>
            <textarea
              id="task-note"
              rows={9}
              value={note}
              placeholder="What needs doing next? Add a reminder or a useful link."
              onChange={(event) => {
                setSaved("");
                setDrafts((current) => ({
                  ...current,
                  [task.id]: event.target.value,
                }));
              }}
            />
            <div className="note-save-row">
              <small className={note.length > 500 ? "invalid-note" : ""}>
                {note.length}/500
              </small>
              <button
                className="primary"
                disabled={saving || note.length > 500 || note === task.note}
              >
                Save note
              </button>
            </div>
            {note.length > 500 && (
              <p role="alert">
                Shorten the note to 500 characters. Your draft is kept here.
              </p>
            )}
            <p className="save-status" role="status">
              {note !== task.note
                ? "Unsaved note"
                : saved === task.id
                  ? "Note saved"
                  : ""}
            </p>
          </form>
          <label className="task-status">
            Move task to
            <select
              aria-label="Task status"
              value={task.lifecycle}
              onChange={(event) =>
                void send({
                  type: "moveTask",
                  id: task.id,
                  lifecycle: event.target.value as Lifecycle,
                })
              }
            >
              <option>Active</option>
              <option>Later</option>
              <option>Settled</option>
            </select>
          </label>
        </>
      ) : (
        <p>Create or select a task to keep a note with it.</p>
      )}
    </aside>
  );
}
