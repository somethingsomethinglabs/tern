import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  GearSix,
  PuzzlePiece,
  NotePencil,
  DownloadSimple,
  CaretDown,
} from "@phosphor-icons/react";
import type { Bridge, Command, Snapshot, Lifecycle } from "../host/contracts";
import "./styles.css";
import { SettingsPage } from "./SettingsPage";
import { TaskNotes } from "./TaskNotes";
import { ExtensionsPanel } from "./ExtensionsPanel";
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
    "create" | "pause" | "settle" | "rename" | "downloads" | "extensions" | null
  >(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [groups, setGroups] = useState({ Later: false, Settled: false });
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Lifecycle | null>(null);
  const [hints, setHints] = useState(false);
  const pointerDrag = useRef<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const destinationAt = (x: number, y: number) => {
    const group = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-task-group]")?.dataset.taskGroup;
    return group === "Active" || group === "Later" || group === "Settled"
      ? group
      : null;
  };
  const cancelDrag = () => {
    pointerDrag.current = null;
    setDragging(null);
    setDropTarget(null);
  };
  const [finding, setFinding] = useState(false);
  const [findText, setFindText] = useState("");
  const findInput = useRef<HTMLInputElement>(null);
  const site = useRef<HTMLDivElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const task = state?.tasks.find((task) => task.id === state.selectedTaskId);
  const page = state?.pages.find((page) => page.id === task?.selectedPageId);
  const sidebarCollapsed = !!state?.preferences.sidebarCollapsed && !hints;
  const hideToolbar =
    toolbarHidden &&
    !!state?.preferences.autoHideToolbar &&
    !settingsOpen &&
    !modal &&
    !finding;
  const showAddress = () => {
    setToolbarHidden(false);
    setSettingsOpen(false);
    requestAnimationFrame(() => {
      addressInput.current?.focus();
      addressInput.current?.select();
    });
  };
  const send = async (command: Command) => {
    try {
      setError("");
      await window.trailrest.command(command);
      if (
        ["selectTask", "selectPage", "createTask", "newPage"].includes(
          command.type,
        )
      )
        setSettingsOpen(false);
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
    if (!state?.theme) return;
    for (const key of ["background", "foreground", "accent"] as const)
      document.documentElement.style.setProperty("--" + key, state.theme[key]);
  }, [state?.theme]);
  useLayoutEffect(() => {
    setAddress(page?.url ?? "");
    setToolbarHidden(false);
  }, [page?.id, page?.url]);
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
            !settingsOpen &&
            !(window.innerWidth <= 800 && drawer) &&
            !!page?.live &&
            !page.error &&
            rect.width > 0,
        });
    };
    const observer = new ResizeObserver(measure);
    if (site.current) observer.observe(site.current);
    measure();
    return () => observer.disconnect();
  }, [
    modal,
    settingsOpen,
    hideToolbar,
    sidebarCollapsed,
    drawer,
    page?.id,
    page?.live,
    page?.error,
    state,
  ]);
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
        if (key.startsWith("hints:")) {
          setHints(key === "hints:on" && !modal);
          return;
        }
        if (modal) return;
        if (key.startsWith("scroll:")) {
          if (
            !settingsOpen &&
            !finding &&
            document.activeElement !== addressInput.current
          )
            setToolbarHidden(key === "scroll:down");
          return;
        }
        if (key.startsWith("switch:") && state) {
          setSettingsOpen(false);
          const shortcut = key.slice(7);
          const index = shortcut.charCodeAt(0) - 97;
          if (index >= 0 && index < 26) {
            const target = state.tasks[index];
            if (target) {
              setQuery("");
              if (target.lifecycle !== "Active")
                setGroups((groups) => ({
                  ...groups,
                  [target.lifecycle]: true,
                }));
              void send({ type: "selectTask", id: target.id });
            }
          } else {
            const number = shortcut === "0" ? 9 : Number(shortcut) - 1;
            const target = state.pages.filter(
              (page) => page.taskId === state.selectedTaskId,
            )[number];
            if (target) void send({ type: "selectPage", id: target.id });
          }
          return;
        }
        if (key === "l") {
          showAddress();
        }
        if (key === "f") {
          setFinding(true);
          findInput.current?.focus();
        }
        if (key === "t") {
          setSettingsOpen(false);
          setToolbarHidden(false);
          void send({ type: "newPage" }).then(() =>
            addressInput.current?.focus(),
          );
        }
      }),
    [state, modal, settingsOpen, finding],
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancelDrag();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        showAddress();
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancelDrag);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancelDrag);
    };
  }, []);
  return (
    <div className={"app " + (dragging ? "dragging-task" : "")}>
      <aside className={"sidebar " + (sidebarCollapsed ? "collapsed" : "")}>
        <div className="brand">
          <button
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() =>
              void send({
                type: "setPreferences",
                patch: {
                  sidebarCollapsed: !state?.preferences.sidebarCollapsed,
                },
              })
            }
          >
            <SidebarSimple size={21} />
          </button>
          <Leaf size={25} weight="duotone" />
          <strong>Trailrest</strong>
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
            <section
              className={
                "task-group " + (dropTarget === group ? "drop-target" : "")
              }
              data-task-group={group}
              key={group}
              aria-label={group + " tasks"}
            >
              {group === "Active" &&
                dragging &&
                !state?.tasks.some((task) => task.lifecycle === "Active") && (
                  <div className="drop-label">Move to Active</div>
                )}
              {group !== "Active" && (
                <button
                  className="group-toggle"
                  aria-label={group + " tasks"}
                  aria-expanded={groups[group]}
                  aria-controls={"group-" + group}
                  onClick={() =>
                    setGroups((current) => ({
                      ...current,
                      [group]: !current[group],
                    }))
                  }
                >
                  <CaretRight
                    size={14}
                    className={groups[group] ? "expanded" : ""}
                  />
                  {group}
                  <span>
                    {state?.tasks.filter((task) => task.lifecycle === group)
                      .length ?? 0}
                  </span>
                </button>
              )}
              <div
                id={"group-" + group}
                hidden={group !== "Active" && !groups[group]}
              >
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
                          title={
                            item.title +
                            (state.tasks.indexOf(item) < 26
                              ? " · Alt+" +
                                String.fromCharCode(
                                  65 + state.tasks.indexOf(item),
                                )
                              : "")
                          }
                          aria-current={
                            task?.id === item.id ? "true" : undefined
                          }
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            suppressClick.current = false;
                            pointerDrag.current = {
                              id: item.id,
                              x: event.clientX,
                              y: event.clientY,
                              moved: false,
                            };
                            event.currentTarget.setPointerCapture(
                              event.pointerId,
                            );
                          }}
                          onPointerMove={(event) => {
                            const start = pointerDrag.current;
                            if (!start) return;
                            if (
                              !start.moved &&
                              Math.hypot(
                                event.clientX - start.x,
                                event.clientY - start.y,
                              ) < 6
                            )
                              return;
                            start.moved = true;
                            setDragging(start.id);
                            setDropTarget(
                              destinationAt(event.clientX, event.clientY),
                            );
                          }}
                          onPointerUp={(event) => {
                            const start = pointerDrag.current;
                            if (start?.moved) {
                              suppressClick.current = true;
                              const lifecycle = destinationAt(
                                event.clientX,
                                event.clientY,
                              );
                              if (lifecycle)
                                void send({
                                  type: "moveTask",
                                  id: start.id,
                                  lifecycle,
                                });
                            }
                            cancelDrag();
                          }}
                          onPointerCancel={cancelDrag}
                          onLostPointerCapture={cancelDrag}
                          className="task-title"
                          onClick={() => {
                            if (!suppressClick.current)
                              void send({ type: "selectTask", id: item.id });
                            suppressClick.current = false;
                          }}
                        >
                          {hints && state.tasks.indexOf(item) < 26 ? (
                            <kbd>
                              {String.fromCharCode(
                                65 + state.tasks.indexOf(item),
                              )}
                            </kbd>
                          ) : (
                            <CaretRight size={15} />
                          )}
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
                            .map((item, index) => (
                              <button
                                key={item.id}
                                className={page?.id === item.id ? "chosen" : ""}
                                aria-label={"Select page " + item.title}
                                onClick={() =>
                                  void send({ type: "selectPage", id: item.id })
                                }
                              >
                                {hints && index < 10 ? (
                                  <kbd>{(index + 1) % 10}</kbd>
                                ) : (
                                  <Globe size={14} />
                                )}
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
              </div>
            </section>
          ))}
        </nav>
        <div className="sidebar-foot">
          {hints && (
            <p className="shortcut-help">Alt + letter: task · number: tab</p>
          )}
          <button
            className="settings-button"
            title="Settings"
            onClick={() => {
              setSettingsOpen(true);
              setToolbarHidden(false);
            }}
          >
            <GearSix size={19} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
      <main>
        {hideToolbar && (
          <button
            className="toolbar-reveal"
            aria-label="Show address bar"
            title="Show address bar (Ctrl+L)"
            onMouseEnter={() => setToolbarHidden(false)}
            onFocus={() => setToolbarHidden(false)}
            onClick={showAddress}
          >
            <CaretDown size={12} />
          </button>
        )}
        <div className="toolbar" hidden={hideToolbar}>
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
              void send({ type: "navigate", address }).then((ok) => {
                if (ok) addressInput.current?.blur();
              });
            }}
          >
            <Globe size={16} />
            <input
              ref={addressInput}
              aria-label="Address or search"
              placeholder={
                task
                  ? "Enter an address or search"
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
            aria-label="Toggle task notes"
            onClick={() => setDrawer(!drawer)}
          >
            <NotePencil size={21} />
          </button>
          <button
            aria-label="Downloads"
            title="Downloads"
            onClick={() => setModal("downloads")}
          >
            <DownloadSimple size={21} />
          </button>
          <button
            aria-label="Extensions"
            title="Extensions"
            onClick={() => setModal("extensions")}
          >
            <PuzzlePiece size={21} />
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
        {((error && !modal) || state?.notice || state?.storageError) && (
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
        {settingsOpen && state && (
          <SettingsPage
            state={state}
            send={send}
            close={() => setSettingsOpen(false)}
          />
        )}
        <div className="content" hidden={settingsOpen}>
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
          <TaskNotes
            task={task}
            open={drawer}
            send={send}
            close={() => setDrawer(false)}
          />
        </div>
      </main>
      <dialog
        ref={dialogRef}
        aria-labelledby="dialog-title"
        className="dialog"
        onCancel={() => setModal(null)}
        onClose={() => setModal(null)}
      >
        {error && modal && <p role="alert">{error}</p>}
        {modal === "extensions" ? (
          <ExtensionsPanel
            extensions={state?.extensions ?? []}
            notice={state?.notice ?? ""}
            send={send}
            close={() => setModal(null)}
          />
        ) : modal === "downloads" ? (
          <section>
            <h2 id="dialog-title">Downloads</h2>
            {state?.downloads.length ? (
              <div className="downloads-list">
                {state.downloads.map((download) => (
                  <div key={download.id}>
                    <strong>{download.name}</strong>
                    <p>{download.status}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p>No downloads in this session.</p>
            )}
            <footer>
              <button onClick={() => setModal(null)}>Done</button>
            </footer>
          </section>
        ) : (
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
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="What is the next small step?"
                  />
                </label>
                <small>{note.length}/500 · Optional</small>
                {note.length > 500 && (
                  <p role="alert">
                    Shorten the note to 500 characters. Your text is kept until
                    you edit or cancel.
                  </p>
                )}
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
                  ((modal === "create" || modal === "rename") &&
                    !name.trim()) ||
                  (modal === "pause" && note.length > 500)
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
        )}
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
