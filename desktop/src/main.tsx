import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  ArrowClockwise,
  X,
  Plus,
  Leaf,
  MagnifyingGlass,
  CaretRight,
  Globe,
  Pause,
  PencilSimple,
  Play,
  Check,
  SidebarSimple,
} from "@phosphor-icons/react";
import type { Bridge, Command, Snapshot } from "../host/contracts";
import "./styles.css";
declare global {
  interface Window {
    trailrest: Bridge;
  }
}

function App() {
  const [state, setState] = useState<Snapshot | null>(null);
  const [address, setAddress] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<
    "create" | "pause" | "settle" | "rename" | null
  >(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(window.innerWidth > 800);
  const [compact, setCompact] = useState(window.innerWidth <= 800);
  const [finding, setFinding] = useState(false);
  const [findText, setFindText] = useState("");
  const findInput = useRef<HTMLInputElement>(null);
  const site = useRef<HTMLDivElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const task = state?.tasks.find((task) => task.id === state.selectedTaskId);
  const page = state?.pages.find((page) => page.id === task?.selectedPageId);
  const pageCount =
    state?.pages.filter((page) => page.taskId === task?.id).length ?? 0;
  const send = async (command: Command) => {
    try {
      setError("");
      await window.trailrest.command(command);
      return true;
    } catch (error) {
      setError(String(error).replace(/^Error:.*?: /, ""));
      return false;
    }
  };
  useEffect(() => {
    const unsubscribe = window.trailrest.subscribe(setState);
    void window.trailrest.snapshot().then(setState);
    return unsubscribe;
  }, []);
  useEffect(() => {
    setAddress(page?.url ?? "");
  }, [page?.id, page?.url]);
  useEffect(() => {
    const resize = () => setCompact(window.innerWidth <= 800);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const measure = () => {
      const rect = site.current?.getBoundingClientRect();
      if (rect)
        window.trailrest.layout({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          visible:
            !modal &&
            !(compact && drawer) &&
            !!page?.live &&
            !page.error &&
            rect.width > 0,
        });
    };
    const observer = new ResizeObserver(measure);
    if (site.current) observer.observe(site.current);
    measure();
    return () => observer.disconnect();
  }, [modal, drawer, compact, page?.id, page?.live, page?.error, state]);
  useEffect(() => {
    if (modal) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [modal]);
  useEffect(() => {
    if (finding) findInput.current?.focus();
  }, [finding]);
  useEffect(
    () =>
      window.trailrest.shortcuts((key) => {
        if (key === "l") {
          addressInput.current?.focus();
          addressInput.current?.select();
        }
        if (key === "f") {
          setFinding(true);
          findInput.current?.focus();
        }
        if (key === "t")
          void send({ type: "newPage" }).then(() =>
            addressInput.current?.focus(),
          );
      }),
    [],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        addressInput.current?.focus();
        addressInput.current?.select();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <Leaf size={25} weight="duotone" />
          <strong>Trailrest</strong>
          <span>DESKTOP</span>
        </div>
        <div className="task-search">
          <MagnifyingGlass size={18} />
          <input
            aria-label="Search tasks and pages"
            placeholder="Find a task or page"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <button
          className="new-task"
          onClick={() => {
            setName("");
            setModal("create");
          }}
        >
          <Plus size={18} />
          New task
        </button>
        <nav aria-label="Tasks">
          {(["Active", "Later", "Settled"] as const).map((group) => (
            <section className="task-group" key={group}>
              <h2>
                {group}
                <span>
                  {state?.tasks.filter((task) => task.lifecycle === group)
                    .length ?? 0}
                </span>
              </h2>
              {state?.tasks
                .filter(
                  (task) =>
                    task.lifecycle === group &&
                    (
                      task.title +
                      " " +
                      state.pages
                        .filter((page) => page.taskId === task.id)
                        .map((page) => page.title + " " + page.url)
                        .join(" ")
                    )
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                )
                .map((item) => (
                  <div
                    key={item.id}
                    className={
                      "task " + (task?.id === item.id ? "selected" : "")
                    }
                  >
                    <div className="task-heading">
                      <button
                        aria-label={"Select task " + item.title}
                        title={item.title}
                        className="task-title"
                        onClick={() =>
                          void send({ type: "selectTask", id: item.id })
                        }
                      >
                        <CaretRight size={15} />
                        <span>{item.title}</span>
                      </button>
                      {task?.id === item.id && (
                        <div
                          className="task-actions"
                          role="group"
                          aria-label="Task actions"
                        >
                          <button
                            aria-label="Rename task"
                            title="Rename task"
                            onClick={() => {
                              setName(task.title);
                              setModal("rename");
                            }}
                          >
                            <PencilSimple size={16} />
                          </button>
                          {task.lifecycle === "Active" ? (
                            <button
                              aria-label="Put aside"
                              title="Put aside"
                              onClick={() => {
                                setNote(task.note);
                                setModal("pause");
                              }}
                            >
                              <Pause size={16} />
                            </button>
                          ) : (
                            <button
                              aria-label="Resume task"
                              title="Resume task"
                              onClick={() => void send({ type: "resume" })}
                            >
                              <Play size={16} />
                            </button>
                          )}
                          {task.lifecycle !== "Settled" && (
                            <button
                              aria-label="Settle"
                              title="Settle"
                              onClick={() => setModal("settle")}
                            >
                              <Check size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {task?.id === item.id && (
                      <div className="pages">
                        {state.pages
                          .filter((page) => page.taskId === item.id)
                          .map((item) => (
                            <button
                              key={item.id}
                              className={page?.id === item.id ? "chosen" : ""}
                              aria-label={"Select page " + item.title}
                              onClick={() =>
                                void send({ type: "selectPage", id: item.id })
                              }
                            >
                              <Globe size={14} />
                              <span>{item.title}</span>
                              <i
                                title={
                                  item.live
                                    ? "Live page"
                                    : "Reference to reopen"
                                }
                              >
                                {item.live ? "●" : "○"}
                              </i>
                            </button>
                          ))}
                        <button
                          className="add-page"
                          onClick={() =>
                            void send({ type: "newPage" }).then(() =>
                              addressInput.current?.focus(),
                            )
                          }
                        >
                          <Plus size={15} />
                          New page
                        </button>
                      </div>
                    )}
                  </div>
                ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span className="live-dot" />
          Local browser <small>0.1 · Linux</small>
        </div>
      </aside>
      <main>
        <div className="toolbar">
          <button
            aria-label="Back"
            disabled={!page?.canGoBack}
            onClick={() => void send({ type: "back" })}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            aria-label="Forward"
            disabled={!page?.canGoForward}
            onClick={() => void send({ type: "forward" })}
          >
            <ArrowRight size={18} />
          </button>
          <button
            aria-label={page?.loading ? "Stop loading" : "Reload"}
            disabled={!page?.live}
            onClick={() =>
              void send({ type: page?.loading ? "stop" : "reload" })
            }
          >
            {page?.loading ? <X size={18} /> : <ArrowClockwise size={18} />}
          </button>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send({ type: "navigate", address });
            }}
          >
            <Globe size={16} />
            <input
              ref={addressInput}
              aria-label="Address or search"
              placeholder={
                task
                  ? "Enter an address or search DuckDuckGo"
                  : "Create a task to start browsing"
              }
              disabled={!task}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onFocus={(event) => event.target.select()}
            />
          </form>
          <button
            aria-label="Close current page"
            disabled={!page}
            onClick={() => void send({ type: "closePage" })}
          >
            <X size={17} />
          </button>
          <button
            aria-label="Toggle task context"
            onClick={() => setDrawer(!drawer)}
          >
            <SidebarSimple size={21} />
          </button>
        </div>
        {finding && (
          <form
            className="findbar"
            onSubmit={(event) => {
              event.preventDefault();
              void send({ type: "find", text: findText });
            }}
          >
            <input
              ref={findInput}
              aria-label="Find on page"
              placeholder="Find on page"
              value={findText}
              onChange={(event) => {
                setFindText(event.target.value);
                void send({ type: "find", text: event.target.value });
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setFinding(false);
                  void send({ type: "stopFind" });
                }
              }}
            />
            <button
              type="button"
              aria-label="Previous match"
              onClick={() =>
                void send({ type: "find", text: findText, backward: true })
              }
            >
              <ArrowLeft size={16} />
            </button>
            <button aria-label="Next match">
              <ArrowRight size={16} />
            </button>
            <button
              type="button"
              aria-label="Close find"
              onClick={() => {
                setFinding(false);
                void send({ type: "stopFind" });
              }}
            >
              <X size={16} />
            </button>
          </form>
        )}
        <div className="taskbar">
          <div>
            <small>{task?.lifecycle ?? "YOUR WORKSPACE"}</small>
            <h1>{task?.title ?? "A little room to pick things up."}</h1>
          </div>
        </div>
        {(error || state?.notice || state?.storageError) && (
          <div role="alert" className="notice">
            {error || state?.storageError || state?.notice}
            <button
              aria-label="Dismiss message"
              onClick={() => {
                setError("");
                void send({ type: "dismissNotice" });
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="content">
          <div ref={site} className="website">
            {!page?.live && !page?.error && (
              <div className="empty">
                <Leaf size={44} weight="duotone" />
                <h2>
                  {page?.url
                    ? "Reopen this reference"
                    : task
                      ? "Where will this task take you?"
                      : "Keep your place in the work."}
                </h2>
                <p>
                  {page?.url
                    ? "This address was saved. Reopening starts a new page; unsaved form state from a previous session is not restored."
                    : task
                      ? "Open a website using the address bar. Its page stays live when you switch tasks."
                      : "Give your work a name. Keep its pages together, put it aside, and come back with context."}
                </p>
                {page?.url && (
                  <button
                    className="primary"
                    onClick={() => void send({ type: "reopen" })}
                  >
                    Reopen page
                  </button>
                )}
                {!task && (
                  <button
                    className="primary"
                    onClick={() => setModal("create")}
                  >
                    Create your first task
                  </button>
                )}
              </div>
            )}
            {page?.error && (
              <div className="empty">
                <h2>Couldn’t open this page</h2>
                <p>{page.error}</p>
                <button
                  className="primary"
                  onClick={() => void send({ type: "reopen" })}
                >
                  Reopen page
                </button>
              </div>
            )}
          </div>
          {drawer && (
            <aside className="context">
              <div className="context-heading">
                <h2>Task context</h2>
                <button
                  aria-label="Close task context"
                  onClick={() => setDrawer(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="eyebrow">WHERE I LEFT OFF</p>
              <p className="note">
                {task?.note || "Leave a note when you put this task aside."}
              </p>
              <div className="rule" />
              <h3>
                {pageCount} {pageCount === 1 ? "page" : "pages"} in this task
              </h3>
              <p className="muted">
                Live pages keep their state while Trailrest is running.
              </p>
              <div className="attention">
                <span>Website state is unknown</span>
                <p>
                  Putting a task aside does not save or submit anything on a
                  website.
                </p>
              </div>
              {state?.downloads.length ? (
                <section className="downloads">
                  <h3>Downloads</h3>
                  {state.downloads.map((download) => (
                    <p key={download.id}>
                      {download.name}
                      <small>{download.status}</small>
                    </p>
                  ))}
                </section>
              ) : null}
              <div className="context-bottom">
                Your tasks and notes stay on this device.
              </div>
            </aside>
          )}
        </div>
      </main>
      <dialog
        ref={dialogRef}
        aria-labelledby="dialog-title"
        className="dialog"
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
      >
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const command: Command =
              modal === "pause"
                ? { type: "pause", note }
                : modal === "settle"
                  ? { type: "settle" }
                  : modal === "rename"
                    ? { type: "renameTask", id: task!.id, title: name }
                    : { type: "createTask", title: name };
            if (await send(command)) setModal(null);
          }}
        >
          <h2 id="dialog-title">
            {modal === "pause"
              ? "A place to pick up again"
              : modal === "settle"
                ? "Ready to settle this task?"
                : modal === "rename"
                  ? "Rename this task"
                  : "Give this task a name"}
          </h2>
          <p>
            {modal === "pause"
              ? "Your pages stay live. Leave a short note for when you return."
              : modal === "settle"
                ? "Settling marks your work finished. It does not save or submit any website. Your pages stay available."
                : "What are you working toward?"}
          </p>
          {modal === "pause" ? (
            <>
              <label>
                Where I left off
                <textarea
                  autoFocus
                  rows={5}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="What is the next small step?"
                />
              </label>
              <small>{note.length}/500 · Optional</small>
            </>
          ) : (
            modal !== "settle" && (
              <label>
                Task name
                <input
                  autoFocus
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )
          )}
          <footer>
            <button type="button" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="primary"
              disabled={
                (modal === "create" || modal === "rename") && !name.trim()
              }
            >
              {modal === "pause"
                ? "Put aside task"
                : modal === "settle"
                  ? "Settle task"
                  : modal === "rename"
                    ? "Save name"
                    : "Create task"}
            </button>
          </footer>
        </form>
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
