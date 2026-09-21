import { useRef, useState } from "react";
import {
  ArrowSquareOut,
  FileText,
  Paperclip,
  Sparkle,
} from "@phosphor-icons/react";
import { ReferencePage } from "./ReferencePage";
import type { PageId, Task } from "./model";

const examples = {
  claim:
    "The receipt shows AUD 24.00 for return rail travel. The policy asks for a receipt and business purpose. Check both before submitting.",
  browser:
    "The team wants to keep related pages together, record a next step, and understand whether forms are saved. Compare groups of tabs with tasks and notes in the sample evaluation.",
};
export function RecapReview({
  task,
  onKeep,
}: {
  task: Task;
  onKeep: (text: string) => void;
}) {
  const [draft, setDraft] = useState(task.recap || examples[task.id]);
  const [editing, setEditing] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [evidence, setEvidence] = useState<Exclude<PageId, "form"> | null>(
    null,
  );
  const evidenceLink = useRef<HTMLAnchorElement | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  const sources: { id: Exclude<PageId, "form">; name: string }[] =
    task.id === "claim"
      ? [
          { id: "receipt", name: "Receipt" },
          { id: "policy", name: "Travel policy" },
        ]
      : [
          { id: "brief", name: "Team requirements" },
          { id: "comparison", name: "Browser comparison" },
        ];
  if (task.assistant !== "ready" || discarded) return null;
  return (
    <section className="recap-review" aria-label="Sample AI recap">
      <div hidden={evidence !== null}>
        <div className="recap-title">
          <Sparkle size={25} />
          <p>
            <strong>
              {task.recap === draft ? "Kept recap" : "Draft recap"}
            </strong>{" "}
            · Review before keeping
          </p>
        </div>
        <div className="recap-body">
          {editing ? (
            <label className="recap-editor">
              Draft recap
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
            </label>
          ) : (
            <p className="recap-text">{draft}</p>
          )}
          <span className="example-label">
            Sample AI · Selected sources only
          </span>
          <p className="sources-label">Selected sources</p>
          <div className="source-links">
            {sources.map((source) => (
              <a
                key={source.id}
                href={`#${source.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  evidenceLink.current = event.currentTarget;
                  setEvidence(source.id);
                  requestAnimationFrame(() => back.current?.focus());
                }}
              >
                {source.id === "receipt" ? (
                  <Paperclip size={23} />
                ) : (
                  <FileText size={23} />
                )}
                <span>{source.name}</span>
                <ArrowSquareOut size={15} />
              </a>
            ))}
          </div>
          <div className="recap-actions">
            <button onClick={() => setEditing((value) => !value)}>
              {editing ? "Preview recap" : "Edit recap"}
            </button>
            <button
              onClick={() => {
                onKeep(draft.trim());
                setEditing(false);
              }}
              disabled={!draft.trim() || task.recap === draft}
            >
              Keep recap
            </button>
            <button onClick={() => setDiscarded(true)}>Discard draft</button>
          </div>
        </div>
      </div>
      {evidence && (
        <div className="evidence-view">
          <button
            ref={back}
            className="underlined"
            onClick={() => {
              setEvidence(null);
              requestAnimationFrame(() => evidenceLink.current?.focus());
            }}
          >
            Back to pause
          </button>
          <ReferencePage id={evidence} />
        </div>
      )}
    </section>
  );
}
