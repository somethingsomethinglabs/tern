import { useCallback, useRef, useState } from "react";
import {
  NotePencil,
  ArrowClockwise,
  Archive,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  Briefcase,
  CaretDown,
  CaretRight,
  Circle,
  FileText,
  Info,
  Link,
  MagnifyingGlass,
  Paperclip,
  Plus,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { ExpenseSite } from "./ExpenseSite";
import { PauseDrawer } from "./PauseDrawer";
import { ReferencePage } from "./ReferencePage";
import {
  initialTasks,
  pages,
  visitPage,
  type PageId,
  type PageReport,
  type TaskId,
  type Task,
} from "./model";

export function App() {
  const resumeButton = useRef<HTMLButtonElement>(null);
  const [settledOpen, setSettledOpen] = useState(false);
  const [formGeneration, setFormGeneration] = useState(0);
  const [settleError, setSettleError] = useState("");
  const [drawerMode, setDrawerMode] = useState<"pause" | "note">("pause");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [tasks, setTasks] = useState(initialTasks);
  const [selected, setSelected] = useState<TaskId>("claim");
  const [expanded, setExpanded] = useState<TaskId[]>(["claim"]);
  const [report, setReport] = useState<PageReport>({
    knowledge: "known",
    dirty: true,
    pending: false,
    canSettle: false,
    label: "Unsaved changes",
  });
  const active = tasks.find((task) => task.id === selected)!;
  const updateReport = useCallback((next: PageReport) => setReport(next), []);
  function navigate(page: PageId) {
    setTasks((current) =>
      current.map((task) =>
        task.id === selected ? visitPage(task, page) : task,
      ),
    );
  }
  function traverse(direction: -1 | 1) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== selected) return task;
        const historyIndex = task.historyIndex + direction;
        if (historyIndex < 0 || historyIndex >= task.history.length)
          return task;
        return {
          ...task,
          historyIndex,
          selectedPage: task.history[historyIndex],
        };
      }),
    );
  }
  function reloadSample() {
    if (active.selectedPage !== "form") return;
    if (
      !report.canSettle &&
      !window.confirm(
        "Reload the sample form? Current edits will be lost. Keeping a page open has not saved the form.",
      )
    )
      return;
    setFormGeneration((value) => value + 1);
    setAnnouncement("Sample form reloaded to its starting example.");
  }
  function selectTask(id: TaskId) {
    setSettleError("");
    setSelected(id);
    setExpanded((current) =>
      current.includes(id) ? current : [...current, id],
    );
  }
  function pause(note: string) {
    if (drawerMode === "note") {
      setTasks((current) =>
        current.map((task) =>
          task.id === selected ? { ...task, note } : task,
        ),
      );
      setDrawerOpen(false);
      setAnnouncement("Task note kept for this session.");
      return;
    }
    setTasks((current) =>
      current.map((task) =>
        task.id === selected ? { ...task, lifecycle: "Later", note } : task,
      ),
    );
    setDrawerOpen(false);
    const next = tasks.find(
      (task) => task.id !== selected && task.lifecycle === "Active",
    );
    if (next) selectTask(next.id);
    setAnnouncement(`${active.title} moved to Later. Its pages remain open.`);
  }
  function settle() {
    if (selected === "claim" && !report.canSettle) {
      setSettleError(
        report.knowledge === "unknown"
          ? "Check the website before settling. Tern cannot verify whether this page is saved."
          : "Finish and save on the website before settling this task. Expense form needs attention.",
      );
      return;
    }
    setSettleError("");
    setSettledOpen(true);
    setTasks((current) =>
      current.map((task) =>
        task.id === selected ? { ...task, lifecycle: "Settled" } : task,
      ),
    );
    setAnnouncement(`${active.title} moved to Settled.`);
  }
  function resume() {
    setTasks((current) =>
      current.map((task) =>
        task.id === selected ? { ...task, lifecycle: "Active" } : task,
      ),
    );
    setAnnouncement(`${active.title} resumed.`);
  }
  return (
    <div className={`app-shell ${drawerOpen ? "drawer-open" : ""}`}>
      <div className="sr-only" role="status">
        {announcement}
      </div>
      <aside className="sidebar" aria-label="Tasks">
        <div className="brand">
          <img className="brand-logo" src="/brand/tern-wordmark-inverse.svg" alt="Tern" width="104" height="39" />
          <span className="prototype-tag">PROTOTYPE</span>
        </div>
        <div className="search-row">
          <div className="disabled-search">
            <MagnifyingGlass size={20} />
            <span>Search tasks...</span>
            <kbd>⌘K</kbd>
          </div>
          <button
            aria-label="New task unavailable in prototype"
            disabled
            className="icon-button"
          >
            <Plus size={23} />
          </button>
        </div>
        <div className="task-groups">
          {(["Active", "Later", "Settled"] as const).map((group) => (
            <section
              className="task-group"
              key={group}
              aria-label={`${group} tasks`}
            >
              <h2>
                {group === "Settled" ? (
                  <button
                    className="group-toggle"
                    aria-label="Toggle Settled tasks"
                    aria-expanded={settledOpen}
                    onClick={() => setSettledOpen((value) => !value)}
                  >
                    Settled{" "}
                    {settledOpen ? (
                      <CaretDown size={14} />
                    ) : (
                      <CaretRight size={14} />
                    )}
                  </button>
                ) : (
                  group
                )}
                <span>
                  {tasks.filter((task) => task.lifecycle === group).length}
                </span>
              </h2>
              {tasks
                .filter(
                  (task) =>
                    task.lifecycle === group &&
                    (group !== "Settled" || settledOpen),
                )
                .map((task) => (
                  <div
                    key={task.id}
                    className={`task ${selected === task.id ? "selected" : ""}`}
                  >
                    <div className="task-heading">
                      <button
                        className="task-select"
                        aria-label={task.title}
                        onClick={() => selectTask(task.id)}
                      >
                        {task.id === "claim" ? (
                          <Briefcase size={24} />
                        ) : (
                          <Users size={24} />
                        )}
                        <span>
                          {task.title}
                          {task.id === "claim" && !report.canSettle && (
                            <small className="attention">Needs attention</small>
                          )}
                          {task.assistant !== "off" && (
                            <small
                              className={
                                task.assistant === "ready"
                                  ? "ai-ready"
                                  : "ai-stopped"
                              }
                            >
                              {task.assistant === "ready"
                                ? "AI ready for review"
                                : "AI stopped"}
                            </small>
                          )}
                        </span>
                      </button>
                      <button
                        className="expand-button"
                        aria-expanded={expanded.includes(task.id)}
                        aria-label={`${expanded.includes(task.id) ? "Collapse" : "Expand"} ${task.title}`}
                        onClick={() =>
                          setExpanded((current) =>
                            current.includes(task.id)
                              ? current.filter((id) => id !== task.id)
                              : [...current, task.id],
                          )
                        }
                      >
                        {expanded.includes(task.id) ? (
                          <CaretDown size={16} />
                        ) : (
                          <CaretRight size={16} />
                        )}
                      </button>
                    </div>
                    {expanded.includes(task.id) && (
                      <div className="page-list">
                        {task.pages.map((id) => (
                          <button
                            key={id}
                            aria-label={pages[id].title}
                            aria-current={
                              selected === task.id && active.selectedPage === id
                                ? "page"
                                : undefined
                            }
                            onClick={() => {
                              selectTask(task.id);
                              setTasks((current) =>
                                current.map((item) =>
                                  item.id === task.id
                                    ? visitPage(item, id)
                                    : item,
                                ),
                              );
                            }}
                          >
                            {id === "receipt" ? (
                              <Paperclip size={21} />
                            ) : id === "policy" ? (
                              <Link size={21} />
                            ) : (
                              <FileText size={21} />
                            )}
                            <span>
                              {pages[id].title}
                              {id === "form" && report.dirty && (
                                <small className="attention">
                                  <Circle size={8} weight="fill" /> Unsaved
                                  changes
                                </small>
                              )}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              {tasks.every((task) => task.lifecycle !== group) && (
                <p className="empty-group">
                  {group === "Later"
                    ? "Room to put things aside."
                    : "Finished work lives here."}
                </p>
              )}
            </section>
          ))}
        </div>
        <details className="prototype-controls">
          <summary>Prototype controls</summary>
          <label>
            Assistant example
            <select
              value={active.assistant}
              onChange={(event) =>
                setTasks((current) =>
                  current.map((task) =>
                    task.id === selected
                      ? {
                          ...task,
                          assistant: event.target.value as Task["assistant"],
                        }
                      : task,
                  ),
                )
              }
            >
              <option value="ready">AI ready for review</option>
              <option value="stopped">AI stopped</option>
              <option value="off">Off</option>
            </select>
          </label>
          <p>Scripted examples for the selected task. No model is connected.</p>
        </details>
        <div className="sidebar-footer">
          <Info size={18} />
          <span>
            A little space between tasks.
            <small>Session only. Reloading resets this prototype.</small>
          </span>
        </div>
      </aside>
      <div className="workspace">
        <header className="browser-toolbar">
          <button
            className="icon-button"
            aria-label="Back"
            onClick={() => traverse(-1)}
            disabled={active.historyIndex === 0}
          >
            <ArrowLeft size={22} />
          </button>
          <button
            className="icon-button"
            aria-label="Forward"
            onClick={() => traverse(1)}
            disabled={active.historyIndex >= active.history.length - 1}
          >
            <ArrowRight size={22} />
          </button>
          <button
            className="icon-button"
            aria-label="Reload sample page"
            disabled={
              active.selectedPage !== "form" || active.lifecycle !== "Active"
            }
            onClick={reloadSample}
          >
            <ArrowClockwise size={22} />
          </button>
          <div className="address">
            <FileText size={17} />
            <span>{pages[active.selectedPage].address}</span>
            <span className="sample-tag">SAMPLE</span>
          </div>
        </header>
        <div className="task-bar">
          <span>
            <Briefcase size={17} />
            {active.title}
          </span>
          <div className="task-actions">
            <button
              className="text-button"
              aria-label="Task notes"
              onClick={() => {
                setDrawerMode("note");
                setDrawerOpen(true);
              }}
            >
              <NotePencil size={17} /> Notes
            </button>
            <button
              className="text-button"
              onClick={settle}
              disabled={active.lifecycle === "Settled"}
              aria-label="Settle task"
            >
              <CheckCircle size={17} /> Settle
            </button>
            <button
              className="text-button"
              onClick={() => {
                setSettleError("");
                setDrawerMode("pause");
                setDrawerOpen(true);
              }}
              disabled={active.lifecycle !== "Active"}
            >
              <Archive size={17} /> Put aside
            </button>
          </div>
        </div>
        {settleError && (
          <div className="settle-error" role="alert">
            {settleError}
            <button
              onClick={() => {
                resume();
                navigate("form");
                setSettleError("");
              }}
            >
              Go to expense form
            </button>
          </div>
        )}
        {selected === "claim" && (
          <div
            className={`page-status ${!report.canSettle ? "warning" : "saved"}`}
            role="status"
          >
            <WarningCircle size={22} />
            {report.label} {report.dirty && <span>· Keep this page open</span>}
          </div>
        )}
        {active.lifecycle !== "Active" && (
          <section className="task-context">
            <p className="eyebrow">
              {active.lifecycle === "Later" ? "Put aside for later" : "Settled"}
            </p>
            <h1>{active.title}</h1>
            <h2>Where I left off</h2>
            <p className="context-note">
              {active.note || "No next step recorded."}
            </p>
            {active.recap && (
              <>
                <h2>Kept recap</h2>
                <p className="context-recap">{active.recap}</p>
              </>
            )}
            <p className="context-hint">
              Your pages are still open. Retained for this session.
            </p>
            <button ref={resumeButton} className="primary" onClick={resume}>
              {active.lifecycle === "Later" ? "Resume task" : "Reopen task"}
            </button>
            {active.selectedPage !== "form" && (
              <ReferencePage id={active.selectedPage} />
            )}
          </section>
        )}
        <div className="page-host" hidden={active.lifecycle !== "Active"}>
          <div hidden={selected !== "claim" || active.selectedPage !== "form"}>
            <ExpenseSite
              key={formGeneration}
              onReport={updateReport}
              onNavigate={navigate}
            />
          </div>
          {(Object.keys(pages) as PageId[])
            .filter((id): id is Exclude<PageId, "form"> => id !== "form")
            .map((id) => (
              <div key={id} hidden={active.selectedPage !== id}>
                <ReferencePage id={id} />
              </div>
            ))}
        </div>
      </div>
      {drawerOpen && (
        <PauseDrawer
          fallbackFocus={resumeButton}
          mode={drawerMode}
          task={active}
          needsAttention={selected === "claim" && report.dirty}
          onCancel={() => setDrawerOpen(false)}
          onPause={pause}
          onKeepRecap={(recap) =>
            setTasks((current) =>
              current.map((task) =>
                task.id === selected ? { ...task, recap } : task,
              ),
            )
          }
        />
      )}
    </div>
  );
}
