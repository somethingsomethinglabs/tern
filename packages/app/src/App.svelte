<script lang="ts">
  import { onMount, untrack } from "svelte";
  import ArrowLeft from "phosphor-svelte/lib/ArrowLeft";
  import ArrowRight from "phosphor-svelte/lib/ArrowRight";
  import ArrowClockwise from "phosphor-svelte/lib/ArrowClockwise";
  import X from "phosphor-svelte/lib/X";
  import Plus from "phosphor-svelte/lib/Plus";
  import MagnifyingGlass from "phosphor-svelte/lib/MagnifyingGlass";
  import CaretRight from "phosphor-svelte/lib/CaretRight";
  import Globe from "phosphor-svelte/lib/Globe";
  import Pause from "phosphor-svelte/lib/Pause";
  import PencilSimple from "phosphor-svelte/lib/PencilSimple";
  import Play from "phosphor-svelte/lib/Play";
  import Check from "phosphor-svelte/lib/Check";
  import SidebarSimple from "phosphor-svelte/lib/SidebarSimple";
  import GearSix from "phosphor-svelte/lib/GearSix";
  import PuzzlePiece from "phosphor-svelte/lib/PuzzlePiece";
  import NotePencil from "phosphor-svelte/lib/NotePencil";
  import DownloadSimple from "phosphor-svelte/lib/DownloadSimple";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import SquaresFour from "phosphor-svelte/lib/SquaresFour";
  import FolderPlus from "phosphor-svelte/lib/FolderPlus";
  import type {
    Bridge,
    Command,
    Snapshot,
    Lifecycle,
    Task,
    PageState,
  } from "@tern/core/contracts";
  import "./styles.css";
  import UpdatePrompt from "./UpdatePrompt.svelte";
  import SiteInformation from "./SiteInformation.svelte";
  import SettingsPage from "./SettingsPage.svelte";
  import SearchResults, { type SearchViewState } from "./SearchResults.svelte";
  import TaskNotes from "./TaskNotes.svelte";
  import TaskOverview from "./TaskOverview.svelte";
  import ExtensionsMenu from "./ExtensionsMenu.svelte";
  import ExtensionsPanel from "./ExtensionsPanel.svelte";
  import SnapshotButton from "./SnapshotButton.svelte";
  import CookieDeleteButton from "./CookieDeleteButton.svelte";
  import NewTask from "./NewTask.svelte";
  import ShortcutHelp from "./ShortcutHelp.svelte";
  import StartTaskForm from "./StartTaskForm.svelte";
  import { basicTaskPlan } from "@tern/core/task-plan";
  import { entrance } from "./motion.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuState, MenuAction } from "./ContextMenu.svelte";
  let {
    bridge,
  }: {
    bridge: Bridge;
  } = $props();
  let snapshot = $state.raw<Snapshot | null>(null);

  let mobileTasksOpen = $state.raw(false);

  const mobile = $derived(!!snapshot?.capabilities?.mobile);
  let address = $state.raw("");
  const searchViews: Record<string, SearchViewState> = {};
  const saveSearchView = (id: string) => (view: SearchViewState) => { searchViews[id] = view; };

  let query = $state.raw("");

  let modal = $state.raw<
    "pause" | "rename" | "downloads" | "extensionMenu" | "extensions" | "startTask" | "settle" | "site" | null
  >(null);

  let name = $state.raw("");

  let taskRequest = $state.raw("");
  let taskTitle = $state.raw<string | null>(null);
  let settlement = $state.raw<Command | null>(null);
  let settling = $state.raw(false);

  let startingTask = $state.raw(false);

  let startAttempt = $state.raw(0);
  let dialogGeneration = 0;
  let modalTaskId = $state.raw<string | undefined>(undefined);

  let menu = $state.raw<MenuState | null>(null);

  const closeMenu = () => (menu = null);
  let note = $state.raw("");

  let dialogRef = $state.raw<HTMLDialogElement | null>(null);
  let error = $state.raw("");

  let drawer = $state.raw(false);

  let settingsOpen = $state.raw(false);
  let settingsSection = $state.raw<"localAI" | "shortcuts" | "search" | null>(null);
  let returnToTaskStart = $state.raw(false);
  const openSettings = (section: typeof settingsSection = null, returnToStart = false) => {
    settingsSection = section;
    returnToTaskStart = returnToStart;
    modal = null;
    settingsOpen = true;
    mobileTasksOpen = false;
    toolbarHidden = false;
  };
  const closeSettings = () => {
    settingsOpen = false;
    settingsSection = null;
    if (returnToTaskStart) modal = "startTask";
    returnToTaskStart = false;
  };

  let toolbarHidden = $state.raw(false);

  let groups = $state.raw({ Later: false, Settled: true });
  let newTaskOpen = $state.raw(false);
  let newTaskButton = $state.raw<HTMLButtonElement | null>(null);
  let shortcutHelpOpen = $state.raw(false);
  let settledIds = new Set<string>();
  $effect(() => {
    const ids = new Set(snapshot?.tasks.filter((task) => task.lifecycle === "Settled").map((task) => task.id));
    if ([...ids].some((id) => !settledIds.has(id))) {
      untrack(() => { groups = { ...groups, Settled: true }; });
    }
    settledIds = ids;
  });

  let dragging = $state.raw<string | null>(null);

  let dropTarget = $state.raw<Lifecycle | null>(null);

  let hints = $state.raw(false);

  let pointerDrag = $state.raw<{
    id: string;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  let suppressClick = $state.raw(false);
  const destinationAt = (x: number, y: number) => {
    const group = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>("[data-task-group]")?.dataset.taskGroup;
    return group === "Active" || group === "Later" || group === "Settled"
      ? group
      : null;
  };
  const cancelDrag = () => {
    pointerDrag = null;
    dragging = null;
    dropTarget = null;
  };
  let finding = $state.raw(false);

  let findText = $state.raw("");

  let findInput = $state.raw<HTMLInputElement | null>(null);
  let site = $state.raw<HTMLDivElement | null>(null);
  let addressInput = $state.raw<HTMLInputElement | null>(null);
  let newTaskInput = $state.raw<HTMLInputElement | null>(null);
  let notesButton = $state.raw<HTMLButtonElement | null>(null);
  let searchInput = $state.raw<HTMLInputElement | null>(null);
  const showNewTask = () => {
    newTaskOpen = true;
    afterFrame(() => newTaskInput?.focus());
  };
  const task = $derived(
    snapshot?.tasks.find((task) => task.id === snapshot?.selectedTaskId),
  );
  const page = $derived(
    snapshot?.pages.find((page) => page.id === task?.selectedPageId),
  );
  const selectedPageIds = $derived(snapshot?.selectedPageIds ?? []);
  const overviewOpen = $derived(snapshot?.overviewOpen ?? true);
  const sidebarCollapsed = $derived(
    !mobile && !!snapshot?.preferences.sidebarCollapsed && !hints,
  );
  const hideToolbar = $derived(
    toolbarHidden &&
      !!snapshot?.preferences.autoHideToolbar &&
      !settingsOpen &&
      !overviewOpen &&
      !modal &&
      !finding &&
      !snapshot?.siteInfo?.permissions.some(permission => permission.name === "media" && permission.state === "allowed"),
  );
  const showAddress = () => {
    toolbarHidden = false;
    settingsOpen = false;
    afterFrame(() => {
      addressInput?.focus();
      addressInput?.select();
    });
  };
  const send = async (command: Command, confirmedSettlement = false) => {
    if (!confirmedSettlement && (command.type === "settle" ||
      (command.type === "moveTask" && command.lifecycle === "Settled"))) {
      const id = command.id ?? task?.id;
      const target = snapshot?.tasks.find((item) => item.id === id);
      if (target && snapshot?.pages.some((page) => page.taskId === id && page.live)) {
        settlement = { ...command, id: target.id };
        modalTaskId = id;
        name = target.title;
        note = target.note;
        modal = "settle";
        return false;
      }
    }
    if (command.type === "resume") {
      const id = command.id ?? task?.id;
      if (!id) return false;
      command = { type: "openTask", id };
    }
    const attempt = ++commandAttempt;
    try {
      error = "";
      const result = await bridge.command(command);
      if (!alive) return false;
      if (command.type === "startTask" && !result?.createdTaskId) return false;
      if (
        [
          "selectTask",
          "selectPage",
          "createTask",
          "startTask",
          "newPage",
          "openTask",
          "showOverview",
        ].includes(command.type)
      ) {
        settingsOpen = false;
        returnToTaskStart = false;
        settingsSection = null;
        mobileTasksOpen = false;
      }
      if (
        mobile &&
        [
          "navigate",
          "createTask",
          "startTask",
          "pause",
          "settle",
          "resume",
        ].includes(command.type)
      ) {
        if (document.activeElement instanceof HTMLElement)
          document.activeElement.blur();
        mobileTasksOpen = false;
      }
      return true;
    } catch (cause) {
      if (alive && attempt === commandAttempt)
        error = String(cause).replace(/^Error:.*?: /, "");
      return false;
    }
  };
  const cancelTaskStart = () => {
    startAttempt++;
    startingTask = false;
    void send({ type: "cancelTaskStart" });
    modal = null;
  };
  const startFromRequest = async (useAI: boolean) => {
    if (startingTask || !taskRequest.trim()) return;
    const attempt = ++startAttempt;
    startingTask = true;
    const success = await send({
      type: "startTask",
      request: taskRequest,
      useAI,
      title: taskTitle?.trim() || (useAI ? undefined : basicTaskPlan(taskRequest).title),
    });
    if (attempt !== startAttempt) return;
    startingTask = false;
    if (success) {
      taskRequest = "";
      taskTitle = null;
      query = "";
      modal = null;
      drawer = !mobile && window.innerWidth > 800;
    }
  };
  const taskDialog = (target: Task, kind: "rename" | "pause") => {
    modalTaskId = target.id;
    name = target.title;
    note = target.note;
    modal = kind;
  };
  const openMenu = (
    event:
      | (MouseEvent & { currentTarget: HTMLElement })
      | (KeyboardEvent & { currentTarget: HTMLElement }),
    label: string,
    actions: MenuAction[],
  ) => {
    event.preventDefault();
    cancelDrag();
    const anchor = event.currentTarget;
    const rect = anchor.getBoundingClientRect();
    menu = {
      anchor,
      x: "clientX" in event && event.clientX ? event.clientX : rect.left,
      y: "clientY" in event && event.clientY ? event.clientY : rect.bottom,
      label,
      actions,
    };
  };
  const taskMenu = (target: Task): MenuAction[] => [
    {
      label: "New tab",
      run: () => {
        void send({ type: "newPage", taskId: target.id }).then(showAddress);
      },
    },
    { label: "Rename task…", run: () => taskDialog(target, "rename") },
    ...(target.lifecycle !== "Active"
      ? [
          {
            label: "Return to active",
            run: () => {
              void send({ type: "resume", id: target.id });
            },
          },
        ]
      : []),
    ...(target.lifecycle !== "Later"
      ? [{ label: "Put aside…", run: () => taskDialog(target, "pause") }]
      : []),
    ...(target.lifecycle !== "Settled"
      ? [
          {
            label: "Settle task",
            run: () => {
              void send({ type: "settle", id: target.id });
            },
          },
        ]
      : []),
  ];
  const pageMenu = (target: PageState): MenuAction[] => {
    if (selectedPageIds.length > 1 && selectedPageIds.includes(target.id)) {
      const selected = snapshot!.pages.filter((page) =>
        selectedPageIds.includes(page.id),
      );
      const run = (
        action: "close" | "reload" | "duplicate" | "copyAddresses",
      ) => {
        void send({
          type: "pageSelectionAction",
          action,
          ids: selectedPageIds,
        });
      };
      return [
        { label: "Duplicate tabs", run: () => run("duplicate") },
        {
          label: selected.every((page) => !page.live || page.error)
            ? "Reopen tabs"
            : "Reload tabs",
          disabled: !selected.some((page) => page.url || page.search),
          run: () => run("reload"),
        },
        {
          label: "Copy addresses",
          disabled: !selected.some((page) => page.url),
          run: () => run("copyAddresses"),
        },
        { label: "Close tabs", separator: true, run: () => run("close") },
      ];
    }
    return [
      {
        label: "New tab",
        run: () => {
          void send({ type: "newPage", taskId: target.taskId }).then(
            showAddress,
          );
        },
      },
      {
        label: "Duplicate tab",
        run: () => {
          void send({ type: "duplicatePage", id: target.id });
        },
      },
      {
        label: target.search ? "Run search again" : target.live && !target.error ? "Reload tab" : "Reopen tab",
        disabled: !target.url && !target.search,
        run: () => {
          void send({
            type: target.live && !target.error ? "reload" : "reopen",
            id: target.id,
          });
        },
      },
      {
        label: "Copy address",
        disabled: !target.url,
        run: () => {
          void send({ type: "copyPageAddress", id: target.id });
        },
      },
      {
        label: "Close tab",
        separator: true,
        run: () => {
          void send({ type: "closePage", id: target.id });
        },
      },
    ];
  };
  const pageMenuLabel = (target: PageState) =>
    selectedPageIds.length > 1 && selectedPageIds.includes(target.id)
      ? `${selectedPageIds.length} tabs selected`
      : target.title;
  const menuKey = (event: KeyboardEvent & { currentTarget: HTMLElement }) =>
    event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
  let alive = true;
  let commandAttempt = 0;
  const frames = new Set<number>();
  function afterFrame(callback: () => void) {
    const frame = requestAnimationFrame(() => {
      frames.delete(frame);
      if (alive) callback();
    });
    frames.add(frame);
  }
  onMount(() => {
    let receivedEvent = false;
    const unsubscribe = bridge.subscribe((next) => {
      receivedEvent = true;
      if (alive) snapshot = next;
    });
    void bridge
      .snapshot()
      .then((next) => {
        if (alive && !receivedEvent) snapshot = next;
      })
      .catch((cause) => {
        if (alive && !receivedEvent) error = String(cause);
      });
    return () => {
      alive = false;
      startAttempt++;
      unsubscribe();
      for (const frame of frames) cancelAnimationFrame(frame);
      frames.clear();
      bridge.layout({ x: 0, y: 0, width: 0, height: 0, visible: false });
    };
  });
  $effect(() => {
    snapshot?.theme;
    return untrack(() => {
      if (!snapshot?.theme) return;
      for (const key of ["background", "foreground", "accent"] as const)
        document.documentElement.style.setProperty(
          "--" + key,
          snapshot.theme[key],
        );
    });
  });
  const addressSource = $derived(JSON.stringify([page?.id, page?.url, page?.search?.query]));
  $effect(() => {
    addressSource;
    return untrack(() => {
      address = page?.search?.query ?? page?.url ?? "";
      toolbarHidden = false;
    });
  });
  let lastLayout = "";
  function measureSite() {
    if (!alive) return;
    const rect = site?.getBoundingClientRect();
    if (!rect) return;
    const bounds = {
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
      width: Math.max(0, rect.width),
      height: Math.max(0, rect.height),
      visible:
        !modal &&
        !menu &&
        !shortcutHelpOpen &&
        !mobileTasksOpen &&
        !(mobile && drawer) &&
        !settingsOpen &&
        !overviewOpen &&
        !(window.innerWidth <= 800 && drawer) &&
        !!page?.live &&
        !page.search &&
        !page.error &&
        rect.width > 0 &&
        rect.height > 0,
    };
    const serialized = JSON.stringify(bounds);
    if (serialized !== lastLayout) {
      lastLayout = serialized;
      bridge.layout(bounds);
    }
  }
  onMount(() => {
    const observer = new ResizeObserver(measureSite);
    if (site) observer.observe(site);
    window.addEventListener("resize", measureSite);
    window.visualViewport?.addEventListener("resize", measureSite);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measureSite);
      window.visualViewport?.removeEventListener("resize", measureSite);
    };
  });
  $effect(() => {
    // Position can change without resizing the website element.
    mobile;
    mobileTasksOpen;
    menu;
    shortcutHelpOpen;
    modal;
    settingsOpen;
    overviewOpen;
    hideToolbar;
    sidebarCollapsed;
    drawer;
    finding;
    snapshot;
    site;
    untrack(measureSite);
  });
  $effect(() => {
    modal;
    return untrack(() => {
      dialogGeneration++;
      if (modal && dialogRef && !dialogRef.open) dialogRef.showModal();
      else if (!modal && dialogRef?.open) dialogRef.close();
    });
  });
  entrance(
    () => dialogRef,
    () => !!modal,
    () => "dialog",
  );
  $effect(() => {
    finding;
    return untrack(() => {
      if (finding) findInput?.focus();
    });
  });
  onMount(() =>
    bridge.shortcuts((key) => {
      if (key === "back") {
        if (modal) {
          if (modal === "startTask") cancelTaskStart();
          else modal = null;
        } else if (menu) closeMenu();
        else if (mobileTasksOpen) mobileTasksOpen = false;
        else if (settingsOpen) closeSettings();
        else if (drawer) drawer = false;
        else if (finding) finding = false;
        else void send({ type: "back" });
        return;
      }
      if (key === "dismissMenu") {
        closeMenu();
        return;
      }
      if (key.startsWith("hints:")) {
        hints = key === "hints:on" && !modal;
        return;
      }
      if (modal) return;
      if (key.startsWith("scroll:")) {
        closeMenu();
        if (
          !settingsOpen &&
          !finding &&
          document.activeElement !== addressInput
        )
          toolbarHidden = key === "scroll:down";
        return;
      }
      if (key.startsWith("switch:") && snapshot) {
        closeMenu();
        settingsOpen = false;
        const shortcut = key.slice(7);
        const index = shortcut.charCodeAt(0) - 97;
        if (index >= 0 && index < 26) {
          const target = (snapshot?.tasks ?? [])[index];
          if (target) {
            query = "";
            if (target.lifecycle !== "Active")
              groups = {
                ...groups,
                [target.lifecycle]: true,
              };
            void send({ type: "selectTask", id: target.id });
          }
        } else {
          const number = shortcut === "0" ? 9 : Number(shortcut) - 1;
          const target = (snapshot?.pages ?? []).filter(
            (page) => page.taskId === snapshot?.selectedTaskId,
          )[number];
          if (target) void send({ type: "selectPage", id: target.id });
        }
        return;
      }
      if (key === "l") {
        showAddress();
      }
      if (key === "f" && !overviewOpen) {
        finding = true;
        findInput?.focus();
      }
      if (key === "t") {
        settingsOpen = false;
        toolbarHidden = false;
        void send({ type: "newPage" }).then(() => addressInput?.focus());
      }
    }),
  );
  onMount(() => {
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
  });
</script>

<div
  class={"app " +
    (mobile ? "mobile " : "") +
    (mobileTasksOpen ? "tasks-open " : "") +
    (dragging ? "dragging-task" : "")}
>
  {#if mobileTasksOpen}<button
      class="tasks-backdrop"
      aria-label="Close tasks"
      onclick={() => (mobileTasksOpen = false)}
    ></button>{/if}
  <aside class={"sidebar " + (sidebarCollapsed ? "collapsed" : "")}>
    <div class="brand">
      <button
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        onclick={() =>
          void send({
            type: "setPreferences",
            patch: {
              sidebarCollapsed: !snapshot?.preferences.sidebarCollapsed,
            },
          })}
      >
        <SidebarSimple aria-hidden="true" size={21}></SidebarSimple>
      </button>
      <span class="brand-logo" role="img" aria-label="Tern"></span>
    </div>
    <div class="sidebar-search-row">
      <div class="task-search">
        <MagnifyingGlass aria-hidden="true" size={19}></MagnifyingGlass>
        <input
          bind:this={searchInput}
          aria-label="Search tasks and pages"
          placeholder="Search"
          value={query}
          oninput={(event) => (query = event.currentTarget.value)}
        />
        {#if query}<button
            aria-label="Clear search"
            title="Clear search"
            onclick={() => { query = ""; searchInput?.focus(); }}
          ><X aria-hidden="true" size={16}></X></button>{/if}
      </div>
      <div class="sidebar-search-actions" role="group" aria-label="Task navigation and creation">
        <button
          class="overview-button"
          aria-label="Task overview"
          aria-pressed={overviewOpen && !settingsOpen}
          title="Task overview"
          onclick={() => { finding = false; menu = null; void send({ type: "showOverview" }); }}
        ><SquaresFour aria-hidden="true" size={20}></SquaresFour></button>
        <button
          bind:this={newTaskButton}
          aria-label="New task"
          title="New task"
          aria-expanded={newTaskOpen}
          aria-controls="sidebar-new-task"
          onclick={() => {
            if (newTaskOpen) newTaskOpen = false;
            else showNewTask();
          }}
        ><FolderPlus aria-hidden="true" size={21}></FolderPlus></button>
        <button
          aria-label="Start from a goal"
          title="Start from a goal"
          onclick={() => { error = ""; modal = "startTask"; }}
        ><NotePencil aria-hidden="true" size={21}></NotePencil></button>
      </div>
    </div>
    <div id="sidebar-new-task" class="sidebar-new-task" hidden={!newTaskOpen}>
      <NewTask
        bind:inputRef={newTaskInput}
        tasks={snapshot?.tasks ?? []}
        onCancel={() => { newTaskOpen = false; newTaskButton?.focus(); }}
        onCreate={async (title) => {
          query = "";
          return send({ type: "createTask", title });
        }}
      ></NewTask>
    </div>
    <nav aria-label="Tasks">
      {#each ["Active", "Later", "Settled"] as const as group (group)}<section
          class={"task-group " + (dropTarget === group ? "drop-target" : "")}
          data-task-group={group}
          aria-label={group + " tasks"}
        >
          {#if group === "Active" && dragging && !snapshot?.tasks.some((task) => task.lifecycle === "Active")}<div
              class="drop-label"
            >
              Move to Active
            </div>{/if}
          {#if group !== "Active"}<button
              class="group-toggle"
              aria-label={group + " tasks"}
              aria-expanded={groups[group] || !!query}
              aria-controls={"group-" + group}
              onclick={() => (groups = { ...groups, [group]: !groups[group] })}
            >
              <span class="group-name">{group}</span>
              <span class="group-rule" aria-hidden="true"></span>
              <span class="group-count">{snapshot?.tasks.filter((task) => task.lifecycle === group).length ?? 0}</span>
              <CaretRight aria-hidden="true" size={14} class={groups[group] || !!query ? "expanded" : ""}></CaretRight>
            </button>{/if}
          <div
            id={"group-" + group}
            hidden={group !== "Active" && !groups[group] && !query}
          >
            {#each snapshot?.tasks.filter((task) => task.lifecycle === group && (task.title + " " + (snapshot?.pages ?? [])
                    .filter((page) => page.taskId === task.id)
                    .map((page) => page.title + " " + page.url)
                    .join(" "))
                  .toLowerCase()
                  .includes(query.toLowerCase())) ?? [] as item (item.id)}<div
                data-task-id={item.id}
                class={"task " + (task?.id === item.id ? "selected" : "")}
              >
                <div class="task-heading">
                  <button
                    aria-label={"Select task " + item.title}
                    aria-haspopup="menu"
                    oncontextmenu={(event) =>
                      openMenu(event, item.title, taskMenu(item))}
                    onkeydown={(event) => {
                      if (menuKey(event))
                        openMenu(event, item.title, taskMenu(item));
                    }}
                    title={item.title +
                      ((snapshot?.tasks ?? []).indexOf(item) < 26
                        ? " · Alt+" +
                          String.fromCharCode(
                            65 + (snapshot?.tasks ?? []).indexOf(item),
                          )
                        : "") +
                      " · Right-click for task actions"}
                    aria-current={task?.id === item.id ? "true" : undefined}
                    onpointerdown={(event) => {
                      if (event.button !== 0) return;
                      suppressClick = false;
                      pointerDrag = {
                        id: item.id,
                        x: event.clientX,
                        y: event.clientY,
                        moved: false,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onpointermove={(event) => {
                      const start = pointerDrag;
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
                      dragging = start.id;
                      dropTarget = destinationAt(event.clientX, event.clientY);
                    }}
                    onpointerup={(event) => {
                      const start = pointerDrag;
                      if (start?.moved) {
                        suppressClick = true;
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
                    onpointercancel={cancelDrag}
                    onlostpointercapture={cancelDrag}
                    class="task-title"
                    onclick={() => {
                      if (!suppressClick)
                        void send({ type: "selectTask", id: item.id });
                      suppressClick = false;
                    }}
                  >
                    {#if hints && (snapshot?.tasks ?? []).indexOf(item) < 26}<kbd
                      >
                        {String.fromCharCode(
                          65 + (snapshot?.tasks ?? []).indexOf(item),
                        )}
                      </kbd>{:else if task?.id === item.id}<CaretDown aria-hidden="true" size={15}
                      ></CaretDown>{:else}<CaretRight aria-hidden="true" size={15}
                      ></CaretRight>{/if}
                    <span>{item.title}</span>
                  </button>
                  {#if task?.id === item.id}<div
                      class="task-actions"
                      role="group"
                      aria-label="Task actions"
                    >
                      <button
                        aria-label="Rename task"
                        title="Rename task"
                        onclick={() => {
                          taskDialog(task, "rename");
                        }}
                      >
                        <PencilSimple aria-hidden="true" size={16}
                        ></PencilSimple>
                        <span>Rename</span>
                      </button>
                      {#if task.lifecycle === "Active"}<button
                          aria-label="Put aside"
                          title="Put aside"
                          onclick={() => {
                            taskDialog(task, "pause");
                          }}
                        >
                          <Pause aria-hidden="true" size={16}></Pause>
                          <span>Put aside</span>
                        </button>{:else}<button
                          aria-label="Resume task"
                          title="Resume task"
                          onclick={() => void send({ type: "resume" })}
                        >
                          <Play aria-hidden="true" size={16}></Play>
                          <span>Resume</span>
                        </button>{/if}
                      {#if task.lifecycle !== "Settled"}<button
                          aria-label="Settle"
                          title="Settle"
                          onclick={() =>
                            void send({ type: "settle", id: task.id })}
                        >
                          <Check aria-hidden="true" size={16}></Check>
                          <span>Settle</span>
                        </button>{/if}
                    </div>{/if}
                </div>
                {#if task?.id === item.id}<div class="pages">
                    {#if selectedPageIds.length > 1}<div
                        class="tab-selection-count"
                        role="status"
                      >
                        {selectedPageIds.length} tabs selected
                      </div>{/if}
                    {#each (snapshot?.pages ?? []).filter((page) => page.taskId === item.id) as tab, index (tab.id)}<button
                        class={[
                          page?.id === tab.id ? "chosen" : "",
                          selectedPageIds.length > 1 &&
                          selectedPageIds.includes(tab.id)
                            ? "multiselected"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-label={"Select page " + tab.title}
                        aria-pressed={selectedPageIds.includes(tab.id)}
                        aria-current={page?.id === tab.id ? "page" : undefined}
                        aria-haspopup="menu"
                        title={tab.title +
                          " · Ctrl-click to toggle selection · Shift-click to select a range · Right-click for tab actions · Middle-click to close"}
                        oncontextmenu={(event) =>
                          openMenu(event, pageMenuLabel(tab), pageMenu(tab))}
                        onkeydown={(event) => {
                          if (menuKey(event))
                            openMenu(event, pageMenuLabel(tab), pageMenu(tab));
                        }}
                        onmousedown={(event) => {
                          if (event.button === 1) event.preventDefault();
                        }}
                        onauxclick={(event) => {
                          if (event.button === 1) {
                            event.preventDefault();
                            closeMenu();
                            void send({
                              type: "closePage",
                              id: tab.id,
                            });
                          }
                        }}
                        onclick={(event) =>
                          void send({
                            type: "selectPage",
                            id: tab.id,
                            selection: event.shiftKey
                              ? event.ctrlKey || event.metaKey
                                ? "addRange"
                                : "range"
                              : event.ctrlKey || event.metaKey
                                ? "toggle"
                                : undefined,
                          })}
                      >
                        {#if hints && index < 10}<kbd>{(index + 1) % 10}</kbd
                          >{:else if tab.search}<MagnifyingGlass aria-hidden="true" size={14} />{:else}<Globe aria-hidden="true" size={14}
                          ></Globe>{/if}
                        <span>{tab.title}</span>
                        {#if !tab.search}<i
                          title={tab.live ? "Live page" : "Reference to reopen"}
                        >
                          {tab.live ? "●" : "○"}
                        </i>{/if}
                      </button>{/each}
                    <button
                      class="add-page"
                      onclick={() =>
                        void send({ type: "newPage" }).then(() =>
                          addressInput?.focus(),
                        )}
                    >
                      <Plus aria-hidden="true" size={15}></Plus>
                      New page
                    </button>
                  </div>{/if}
              </div>{/each}
          </div>
          {#if group === "Active" && !query && snapshot && !snapshot.tasks.some((task) => task.lifecycle === "Active")}
            <p class="group-empty">No active tasks. Create one above or resume a task from Later.</p>
          {/if}
        </section>{/each}
      {#if query && snapshot && !(snapshot?.tasks ?? []).some( (task) => (task.title + " " + (snapshot?.pages ?? [])
                .filter((page) => page.taskId === task.id)
                .map((page) => page.title + " " + page.url)
                .join(" "))
              .toLowerCase()
              .includes(query.toLowerCase()) )}<p
          class="search-empty"
          role="status"
        >
          No tasks or pages match
        </p>{/if}
    </nav>
    <div class="sidebar-foot">
      <button
        class="settings-button"
        title="Settings"
        aria-label="Settings"
        aria-current={settingsOpen ? "page" : undefined}
        onclick={() => openSettings()}
      ><GearSix aria-hidden="true" size={21}></GearSix></button>
      {#if !mobile}<ShortcutHelp bind:open={shortcutHelpOpen}></ShortcutHelp>{/if}
    </div>
  </aside>
  <main>
    {#if hideToolbar}<button
        class="toolbar-reveal"
        aria-label="Show address bar"
        title="Show address bar (Ctrl+L)"
        onmouseenter={() => (toolbarHidden = false)}
        onfocus={() => (toolbarHidden = false)}
        onclick={showAddress}
      >
        <CaretDown aria-hidden="true" size={12}></CaretDown>
      </button>{/if}
    <div class="toolbar" hidden={hideToolbar}>
      {#if mobile}<button
          aria-label="Tasks and tabs"
          aria-expanded={mobileTasksOpen}
          onclick={() => (mobileTasksOpen = !mobileTasksOpen)}
          ><SidebarSimple aria-hidden="true" size={21}></SidebarSimple></button
        >{/if}
      <button
        aria-label="Back"
        disabled={overviewOpen || !page?.canGoBack}
        onclick={() => void send({ type: "back" })}
      >
        <ArrowLeft aria-hidden="true" size={18}></ArrowLeft>
      </button>
      <button
        aria-label="Forward"
        disabled={overviewOpen || !page?.canGoForward}
        onclick={() => void send({ type: "forward" })}
      >
        <ArrowRight aria-hidden="true" size={18}></ArrowRight>
      </button>
      <button
        aria-label={page?.loading ? "Stop loading" : "Reload"}
        disabled={overviewOpen || (!page?.live && !page?.search)}
        onclick={() => void send({ type: page?.loading ? "stop" : "reload" })}
      >
        {#if page?.loading}<X aria-hidden="true" size={18}
          ></X>{:else}<ArrowClockwise aria-hidden="true" size={18}
          ></ArrowClockwise>{/if}
      </button>
      <form
        onsubmit={(event) => {
          event.preventDefault();
          void send({ type: "navigate", address }).then((ok) => {
            if (ok) addressInput?.blur();
          });
        }}
      >
        {#if page?.search}<MagnifyingGlass aria-hidden="true" size={16} />{:else if snapshot?.siteInfo}<button type="button" class="site-info-button" aria-label="Site information" title="Site information" onclick={() => (modal = "site")}>
          <Globe aria-hidden="true" size={16} />{#if !snapshot.siteInfo.secure}<span>Not secure</span>{/if}
        </button>{:else}<Globe aria-hidden="true" size={16}></Globe>{/if}
        <input
          bind:this={addressInput}
          aria-label="Address or search"
          placeholder={task
            ? "Enter an address or search"
            : "Create a task to start browsing"}
          disabled={!task}
          value={address}
          oninput={(event) => (address = event.currentTarget.value)}
          onfocus={(event) => event.currentTarget.select()}
        />
      </form>
      {#if snapshot?.siteInfo?.permissions.some(permission => permission.name === "media" && permission.state === "allowed")}<button class="permission-indicator" onclick={() => (modal = "site")}>Camera or microphone allowed</button>{/if}
      {#if snapshot?.blockedPopups?.length}<button onclick={() => (modal = "site")}>Popup blocked</button>{/if}
      {#if page?.sourceSearchId && snapshot?.pages.some(source => source.id === page.sourceSearchId && source.search)}<button class="return-to-results" onclick={() => void send({ type: "returnToSearch", id: page!.sourceSearchId! })}>Return to results</button>{/if}
      <button
        aria-label={selectedPageIds.length > 1
          ? "Close selected tabs"
          : "Close current page"}
        disabled={overviewOpen || !page}
        onclick={() =>
          void send(
            selectedPageIds.length > 1
              ? {
                  type: "pageSelectionAction",
                  action: "close",
                  ids: selectedPageIds,
                }
              : { type: "closePage" },
          )}
      >
        <X aria-hidden="true" size={17}></X>
      </button>
      <button
        bind:this={notesButton}
        aria-label="Toggle task notes"
        title="Task notes"
        aria-expanded={drawer && !overviewOpen && !settingsOpen}
        aria-controls="task-notes"
        onclick={() => {
          if (overviewOpen && task)
            void send({ type: "selectTask", id: task.id });
          drawer = !drawer;
          if (!drawer) void send({ type: "cancelTaskContext" });
        }}
      >
        <NotePencil aria-hidden="true" size={21}></NotePencil>
      </button>
      <button
        aria-label="Downloads"
        title="Downloads"
        onclick={() => (modal = "downloads")}
      >
        <DownloadSimple aria-hidden="true" size={21}></DownloadSimple>
      </button>
      {#if bridge.cookies}<CookieDeleteButton
          disabled={!page?.live || !/^https?:\/\//.test(page.url) || settingsOpen || overviewOpen || !!modal || (window.innerWidth <= 800 && drawer)}
          {send}
        />{/if}
      {#if snapshot?.preferences.showSnapshotTool}<SnapshotButton
          disabled={!page?.live ||
            !!page.error ||
            settingsOpen ||
            overviewOpen ||
            !!modal ||
            (window.innerWidth <= 800 && drawer)}
          {send}
        ></SnapshotButton>{/if}
      {#if snapshot?.capabilities?.extensions !== false}<button
          aria-label="Extensions"
          title="Extensions"
          onclick={() => (modal = "extensionMenu")}
        >
          <PuzzlePiece aria-hidden="true" size={21}></PuzzlePiece>
        </button>{/if}
      {#each snapshot?.extensions.filter((extension) => extension.canOpen && extension.pinned && extension.enabled !== false) ?? [] as extension (extension.id)}<button
          aria-label={`Open ${extension.name}`}
          title={`Open ${extension.name}`}
          onclick={() => void send({ type: "openExtension", id: extension.id })}
        >
          <span class="extension-initial">
            {extension.name.slice(0, 1)}
          </span>
        </button>{/each}
    </div>
    {#if finding}<form
        class="findbar"
        onsubmit={(event) => {
          event.preventDefault();
          void send({ type: "find", text: findText });
        }}
      >
        <input
          bind:this={findInput}
          aria-label="Find on page"
          placeholder="Find on page"
          value={findText}
          oninput={(event) => {
            findText = event.currentTarget.value;
            void send({ type: "find", text: event.currentTarget.value });
          }}
          onkeydown={(event) => {
            if (event.key === "Escape") {
              finding = false;
              void send({ type: "stopFind" });
            }
          }}
        />
        <button
          type="button"
          aria-label="Previous match"
          onclick={() =>
            void send({ type: "find", text: findText, backward: true })}
        >
          <ArrowLeft aria-hidden="true" size={16}></ArrowLeft>
        </button>
        <button aria-label="Next match">
          <ArrowRight aria-hidden="true" size={16}></ArrowRight>
        </button>
        <button
          type="button"
          aria-label="Close find"
          onclick={() => {
            finding = false;
            void send({ type: "stopFind" });
          }}
        >
          <X aria-hidden="true" size={16}></X>
        </button>
      </form>{/if}
    {#if (error && !modal) || snapshot?.notice || snapshot?.storageError}<div
        role="alert"
        class="notice"
      >
        {error || snapshot?.storageError || snapshot?.notice}
        <button
          aria-label="Dismiss message"
          onclick={() => {
            error = "";
            void send({ type: "dismissNotice" });
          }}
        >
          <X aria-hidden="true" size={16}></X>
        </button>
      </div>{/if}
    {#if snapshot?.updates}<UpdatePrompt updates={snapshot.updates} {send} />{/if}
    {#if settingsOpen && snapshot}<SettingsPage
        {snapshot}
        {send}
        cookies={bridge.cookies}
        initialSection={settingsSection}
        closeLabel={returnToTaskStart ? "Back to task setup" : "Back to browsing"}
        close={closeSettings}
      ></SettingsPage>{/if}
    {#if overviewOpen && !settingsOpen && snapshot}<TaskOverview
        {snapshot}
        {send}
        createTask={() => {
          error = "";
          modal = "startTask";
        }}
      ></TaskOverview>{/if}
    <div class="content" hidden={settingsOpen || overviewOpen}>
      <div bind:this={site} class="website">
        {#if page?.search && task}
          {#key page.id}<SearchResults {page} {task} searchState={snapshot?.searches?.[page.id]} {send}
            view={searchViews[page.id]} saveView={saveSearchView(page.id)} settings={() => openSettings("search")} />{/key}
        {:else if !page?.live && !page?.error}<div class="empty">
            <span class="tern-glyph" aria-hidden="true"></span>
            <h2>
              {page?.url
                ? "Reopen this reference"
                : task
                  ? "Where will this task take you?"
                  : "Keep your place in the work."}
            </h2>
            <p>
              {page?.url
                ? "This address was saved. Reopening starts a new page; unsaved form state is not restored."
                : task
                  ? "Open a website using the address bar. Its page stays live when you switch tasks."
                  : "Give your work a name. Keep its pages together, put it aside, and come back with context."}
            </p>
            {#if page?.url}<button
                class="primary"
                onclick={() => void send({ type: "reopen" })}
              >
                Reopen page
              </button>{/if}
            {#if !task}<button
                class="primary"
                onclick={async () => {
                  if (sidebarCollapsed)
                    await send({
                      type: "setPreferences",
                      patch: { sidebarCollapsed: false },
                    });
                  showNewTask();
                }}
              >
                Create your first task
              </button>{/if}
          </div>{/if}
        {#if page?.error}<div class="empty">
            <h2>Couldn’t open this page</h2>
            <p>{page.error}</p>
            <button
              class="primary"
              onclick={() => void send({ type: "reopen" })}
            >
              Reopen page
            </button>
          </div>{/if}
      </div>
      <TaskNotes
        {task}
        {snapshot}
        open={drawer}
        {send}
        close={() => {
          drawer = false;
          notesButton?.focus();
          void send({ type: "cancelTaskContext" });
        }}
      ></TaskNotes>
    </div>
  </main>
  {#if menu}<ContextMenu {menu} close={closeMenu}></ContextMenu>{/if}
  <dialog
    bind:this={dialogRef}
    aria-labelledby="dialog-title"
    class="dialog"
    class:extension-menu-dialog={modal === "extensionMenu"}
    onclick={(event) => { if (modal === "extensionMenu" && event.target === dialogRef) modal = null; }}
    oncancel={() =>
      modal === "startTask" ? cancelTaskStart() : (modal = null)}
    onclose={() => {
      if (!dialogRef?.open) modal = null;
    }}
  >
    {#if error && modal}<p role="alert">{error}</p>{/if}
    {#if modal === "startTask"}<StartTaskForm
        request={taskRequest}
        title={taskTitle ?? (!snapshot?.preferences.summaryModel ? basicTaskPlan(taskRequest).title : "")}
        setTitle={(value) => (taskTitle = value)}
        setRequest={(value) => {
          taskRequest = value;
        }}
        pending={startingTask || !!snapshot?.taskStartPending}
        status={snapshot?.taskStartStatus ?? ""}
        enabled={!!snapshot?.preferences.summaryModel}
        aiAvailable={snapshot?.capabilities?.localAI !== false}
        firstResult={snapshot?.preferences.searchView === "external" && snapshot?.capabilities?.firstSearchResult !== false}
        engine={snapshot?.preferences.searchView !== "external" ? "Web search" : {
          duckduckgo: "DuckDuckGo",
          google: "Google",
          bing: "Bing",
          brave: "Brave Search",
        }[snapshot?.preferences.searchEngine ?? "duckduckgo"]}
        start={(useAI) => void startFromRequest(useAI)}
        cancel={cancelTaskStart}
        configureAI={() => openSettings("localAI", true)}
      ></StartTaskForm>{:else if modal === "settle"}<section>
        <h2 id="dialog-title">Settle this task?</h2>
        <p>Settling "{name}" closes its live pages. Unsaved website changes cannot be restored. Saved notes and page addresses stay with the task.</p>
        <p>Put it aside instead to keep its pages live while Tern is open.</p>
        <footer>
          <!-- svelte-ignore a11y_autofocus (Cancel is the safe default for this destructive action.) -->
          <button autofocus disabled={settling} onclick={() => (modal = null)}>Cancel</button>
          <button disabled={settling} onclick={() => (modal = "pause")}>Put aside instead</button>
          <button class="primary" disabled={settling} onclick={async () => {
            if (!settlement || settling) return;
            const submittedDialog = dialogGeneration;
            settling = true;
            const success = await send(settlement, true);
            settling = false;
            if (success && dialogGeneration === submittedDialog) modal = null;
          }}>Settle anyway</button>
        </footer>
      </section>{:else}{#if modal === "site" && snapshot}<SiteInformation {snapshot} {send} close={() => (modal = null)} />{:else if modal === "extensionMenu"}<ExtensionsMenu extensions={snapshot?.extensions ?? []} {send} close={() => (modal = null)} manage={() => (modal = "extensions")} />{:else if modal === "extensions"}<ExtensionsPanel
          extensions={snapshot?.extensions ?? []}
          notice={snapshot?.notice ?? ""}
          {send}
          close={() => (modal = null)}
        ></ExtensionsPanel>{:else}{#if modal === "downloads"}<section>
            <h2 id="dialog-title">Downloads</h2>
            {#if snapshot?.downloads.length}<div class="downloads-list">
                {#each snapshot.downloads as download (download.id)}<div>
                    <strong>{download.name}</strong>
                    <p>{download.status}</p>
                    {#if download.totalBytes && download.receivedBytes !== undefined}<progress max={download.totalBytes} value={download.receivedBytes} aria-label={`Download progress for ${download.name}`}></progress>{/if}
                    {#if download.canCancel}<button onclick={() => void send({ type: "downloadAction", id: download.id, action: "cancel" })}>Cancel download</button>{/if}
                    {#if download.canResume}<button onclick={() => void send({ type: "downloadAction", id: download.id, action: "resume" })}>Resume download</button>{/if}
                    {#if download.saved}<button onclick={() => void send({ type: "downloadAction", id: download.id, action: "showFolder" })}>Show in folder</button>{/if}
                  </div>{/each}
              </div>{:else}<p>No downloads in this session.</p>{/if}
            <footer>
              <button onclick={() => (modal = null)}>Done</button>
            </footer>
          </section>{:else}<form
            onsubmit={async (event) => {
              event.preventDefault();
              const submittedDialog = dialogGeneration;
              const command: Command =
                modal === "pause"
                  ? { type: "pause", note, id: modalTaskId }
                  : {
                      type: "renameTask",
                      id: modalTaskId ?? task!.id,
                      title: name,
                    };
              if ((await send(command)) && dialogGeneration === submittedDialog)
                modal = null;
            }}
          >
            <h2 id="dialog-title">
              {modal === "pause"
                ? "A place to pick up again"
                : "Rename this task"}
            </h2>
            <p>
              {modal === "pause"
                ? "Your pages stay live while Tern is open. This does not save website changes. Leave a short note for when you return."
                : "What are you working toward?"}
            </p>
            {#if modal === "pause"}
              <label>
                Where I left off
                <!-- svelte-ignore a11y_autofocus (Initial focus belongs in the opened task dialog.) -->
                <textarea
                  autofocus
                  rows={5}
                  value={note}
                  oninput={(event) => (note = event.currentTarget.value)}
                  placeholder="What is the next small step?"></textarea>
              </label>
              <small>{note.length}/500 · Optional</small>
              {#if note.length > 500}<p role="alert">
                  Shorten the note to 500 characters. Your text is kept until
                  you edit or cancel.
                </p>{/if}
            {:else}<label>
                Task name
                <!-- svelte-ignore a11y_autofocus (Initial focus belongs in the opened rename dialog.) -->
                <input
                  autofocus
                  maxlength={120}
                  value={name}
                  oninput={(event) => (name = event.currentTarget.value)}
                />
              </label>{/if}
            <footer>
              <button type="button" onclick={() => (modal = null)}>
                Cancel
              </button>
              <button
                class="primary"
                disabled={(modal === "rename" && !name.trim()) ||
                  (modal === "pause" && note.length > 500)}
              >
                {modal === "pause" ? "Put aside task" : "Save name"}
              </button>
            </footer>
          </form>{/if}{/if}{/if}
  </dialog>
</div>
