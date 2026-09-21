import { useEffect, useRef, useState } from "react";
import { CheckCircle, Paperclip, UserCircle } from "@phosphor-icons/react";
import type { PageId, PageReport } from "./model";

export function ExpenseSite({
  onReport,
  onNavigate,
}: {
  onReport: (report: PageReport) => void;
  onNavigate: (page: PageId) => void;
}) {
  const [values, setValues] = useState({
    purpose: "Client workshop",
    expense: "Rail travel",
    receipt: "train-receipt.pdf",
    details: "Return travel for the client workshop.",
  });
  const [savedOnce, setSavedOnce] = useState(false);
  const [baseline, setBaseline] = useState({
    purpose: "",
    expense: "",
    receipt: "",
    details: "",
  });
  const unknown =
    new URLSearchParams(location.search).get("status") === "unknown";
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validation, setValidation] = useState<string[]>([]);
  const failNextSubmit = useRef(
    new URLSearchParams(location.search).get("submit") === "fail-once",
  );
  const failNextSave = useRef(
    new URLSearchParams(location.search).get("save") === "fail-once",
  );
  const delay = Math.min(
    5000,
    Math.max(
      0,
      Number(new URLSearchParams(location.search).get("delay") ?? 350) || 0,
    ),
  );
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const label = submitting
    ? "Submitting sample claim…"
    : saving
      ? "Saving draft…"
      : error
        ? "Website action failed · Check the form"
        : dirty
          ? "Unsaved changes"
          : submitted
            ? "Sample claim submitted"
            : savedOnce
              ? "Draft saved for this session"
              : "No unsaved changes reported";
  const pending = saving || submitting;
  useEffect(() => {
    onReport({
      knowledge: unknown ? "unknown" : "known",
      dirty: !unknown && dirty,
      pending,
      label: unknown ? "Page state unknown · Check the website" : label,
      canSettle: !unknown && !dirty && !pending && !error,
    });
  }, [dirty, pending, error, label, unknown, onReport]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pending]);
  function save() {
    const snapshot = { ...values };
    setError("");
    setSubmitted(false);
    setSaving(true);
    timer.current = setTimeout(() => {
      if (failNextSave.current) {
        failNextSave.current = false;
        setError(
          "Could not save the sample draft. Your edits are still here. Please retry.",
        );
      } else {
        setBaseline(snapshot);
        setSavedOnce(true);
      }
      setSaving(false);
    }, delay);
  }
  function submit() {
    const missing = [
      !values.purpose.trim() && "Enter a trip purpose.",
      !values.expense && "Choose an expense type.",
      !values.receipt && "Attach the sample receipt.",
    ].filter((item): item is string => !!item);
    setValidation(missing);
    if (missing.length) return;
    const snapshot = { ...values };
    setError("");
    setSubmitting(true);
    timer.current = setTimeout(() => {
      if (failNextSubmit.current) {
        failNextSubmit.current = false;
        setError(
          "Could not submit the sample claim. Your edits are still here. Please retry.",
        );
      } else {
        setBaseline(snapshot);
        setSavedOnce(true);
        setSubmitted(true);
      }
      setSubmitting(false);
    }, delay);
  }
  function edit(field: keyof typeof values, value: string) {
    setSubmitted(false);
    setValues((previous) => ({ ...previous, [field]: value }));
  }
  return (
    <div className="expense-site">
      <header className="site-header">
        <strong className="site-brand">Expenses</strong>
        <nav aria-label="Expense website">
          <button onClick={() => onNavigate("form")}>Claims</button>
          <button onClick={() => onNavigate("receipt")}>Receipts</button>
          <button onClick={() => onNavigate("policy")}>Policy</button>
        </nav>
        <UserCircle size={30} weight="light" />
      </header>
      <main className="form-content">
        <h1>New travel claim</h1>
        <p className="lead">
          Submit your travel and expense claim for reimbursement.
        </p>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {submitted && !dirty && (
            <div className="submission-receipt">
              <CheckCircle size={30} />
              <div>
                <h2>Sample claim submitted</h2>
                <p>Confirmation SAMPLE-0921. No real claim was sent.</p>
              </div>
            </div>
          )}
          {validation.length > 0 && (
            <div className="error" role="alert">
              {validation.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          <fieldset disabled={submitting}>
            <label>
              Trip purpose
              <input
                value={values.purpose}
                onChange={(e) => edit("purpose", e.target.value)}
              />
            </label>
            <label>
              Expense type
              <select
                value={values.expense}
                onChange={(e) => edit("expense", e.target.value)}
              >
                <option value="">Select an expense type</option>
                <option>Rail travel</option>
                <option>Accommodation</option>
                <option>Meals</option>
              </select>
            </label>
            <label>
              Receipt
              <span className="receipt-field">
                <Paperclip size={24} />
                <select
                  value={values.receipt}
                  onChange={(e) => edit("receipt", e.target.value)}
                >
                  <option value="">No receipt attached</option>
                  <option value="train-receipt.pdf">train-receipt.pdf</option>
                </select>
              </span>
            </label>
            <label>
              Additional details <span className="optional">(optional)</span>
              <textarea
                value={values.details}
                onChange={(e) => edit("details", e.target.value)}
              />
            </label>
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              disabled={pending}
              onClick={save}
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
            <button
              type="submit"
              className="primary"
              disabled={pending || (submitted && !dirty)}
            >
              {submitting ? "Submitting…" : "Submit claim"}
            </button>
          </div>
        </form>
      </main>
      <footer className="site-footer">
        <span>Sample expense website</span>
        <span>© 2026 Expenses</span>
      </footer>
    </div>
  );
}
