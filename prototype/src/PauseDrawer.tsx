import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  Briefcase,
  FileText,
  Info,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { RecapReview } from "./RecapReview";
import type { Task } from "./model";

export function PauseDrawer({
  task,
  fallbackFocus,
  needsAttention,
  onCancel,
  onPause,
  onKeepRecap,
  mode = "pause",
}: {
  task: Task;
  fallbackFocus: RefObject<HTMLButtonElement | null>;
  needsAttention: boolean;
  onCancel: () => void;
  onPause: (note: string) => void;
  onKeepRecap: (text: string) => void;
  mode?: "pause" | "note";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement | null);
  const [note, setNote] = useState(task.note);
  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => {
      element.close();
      queueMicrotask(() => {
        const target = trigger.current;
        if (
          target?.isConnected &&
          !target.matches(":disabled") &&
          target.getClientRects().length
        )
          target.focus();
        else fallbackFocus.current?.focus();
      });
    };
  }, [fallbackFocus]);
  return (
    <dialog
      ref={dialog}
      className="pause-drawer"
      aria-labelledby="pause-title"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <div className="drawer-heading">
        <h2 id="pause-title">
          {mode === "pause" ? "Put this task aside" : "Task notes"}
        </h2>
        <button
          className="icon-button"
          aria-label="Close pause drawer"
          onClick={onCancel}
        >
          <X size={22} />
        </button>
      </div>
      <div className="drawer-task">
        <Briefcase size={36} weight="light" />
        <div>
          <h3>{task.title}</h3>
          <p>Your notes and links will be kept.</p>
        </div>
      </div>
      {needsAttention ? (
        <div className="retention-warning">
          <WarningCircle size={27} />
          <div>
            <strong>1 page needs to stay open</strong>
            <p>
              Expense form has unsaved changes.
              <br />
              Keeping the page open does not save the form.
            </p>
          </div>
          <div className="keep-page">
            <FileText size={26} />
            <span>Expense form</span>
            <span className="keep-pill">Keep open</span>
          </div>
        </div>
      ) : (
        <div className="retention-info">
          <Info size={20} />
          <p>
            Your pages and task context will stay available for this session.
          </p>
        </div>
      )}
      <div className="note-field">
        <label htmlFor="pause-note">Where I left off</label>
        <textarea
          id="pause-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          aria-invalid={note.length > 500}
          aria-describedby={
            note.length > 500 ? "note-counter note-limit" : "note-counter"
          }
        />
        <div className="note-meta">
          <span>Retained for this session</span>
          <span id="note-counter">{note.length}/500</span>
        </div>
        {note.length > 500 && (
          <p id="note-limit" className="error" role="alert">
            Keep the note to 500 characters or fewer. Your text has not been
            removed.
          </p>
        )}
      </div>
      <RecapReview task={task} onKeep={onKeepRecap} />
      <div className="drawer-actions">
        <button
          className="primary"
          onClick={() => onPause(note)}
          disabled={note.length > 500}
        >
          {mode === "note"
            ? "Save note"
            : needsAttention
              ? "Keep page open & pause"
              : "Pause task"}
        </button>
        <button className="underlined" onClick={onCancel}>
          Back to form
        </button>
      </div>
      <p className="drawer-footer">
        <Info size={22} />
        <span>Finish and save on the website before settling this task.</span>
      </p>
    </dialog>
  );
}
