<script module lang="ts">
  export type MenuAction = {
    label: string;
    run(): void;
    disabled?: boolean;
    separator?: boolean;
  };
  export type MenuState = {
    anchor: HTMLElement;
    x: number;
    y: number;
    label: string;
    actions: MenuAction[];
  };
</script>

<script lang="ts">
  import { untrack } from "svelte";
  import { entrance } from "./motion.svelte";
  let {
    menu,
    close,
  }: {
    menu: MenuState;
    close(): void;
  } = $props();
  let ref = $state.raw<HTMLDivElement | null>(null);
  $effect(() => {
    menu;
    close;
    return untrack(() => {
      const element = ref!;
      const sidebar = menu.anchor.closest(".sidebar")!.getBoundingClientRect();
      element.style.width = Math.min(240, sidebar.width - 16) + "px";
      const bounds = element.getBoundingClientRect();
      element.style.left =
        Math.max(
          sidebar.left + 8,
          Math.min(menu.x, sidebar.right - bounds.width - 8),
        ) + "px";
      element.style.top =
        Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8)) +
        "px";
      element
        .querySelector<HTMLButtonElement>("button:not(:disabled)")
        ?.focus();
      const dismiss = (event: PointerEvent) => {
        if (!element.contains(event.target as Node)) close();
      };
      const dismissOnScroll = (event: Event) => {
        if (!element.contains(event.target as Node)) close();
      };
      document.addEventListener("pointerdown", dismiss, true);
      document.addEventListener("scroll", dismissOnScroll, true);
      window.addEventListener("resize", close);
      window.addEventListener("blur", close);
      return () => {
        document.removeEventListener("pointerdown", dismiss, true);
        document.removeEventListener("scroll", dismissOnScroll, true);
        window.removeEventListener("resize", close);
        window.removeEventListener("blur", close);
      };
    });
  });
  entrance(
    () => ref,
    () => true,
    () => "feedback",
  );
  const returnFocus = () => {
    const anchor = menu.anchor;
    close();
    if (anchor.isConnected) anchor.focus();
  };
</script>

<div
  bind:this={ref}
  class="context-menu"
  role="menu"
  tabindex="-1"
  aria-label={menu.label}
  oncontextmenu={(event) => event.preventDefault()}
  onkeydown={(event) => {
    const items = [
      ...ref!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      returnFocus();
    }
  }}
>
  <div class="context-menu-title">{menu.label}</div>
  {#each menu.actions as action (action.label)}<button
      role="menuitem"
      tabindex={-1}
      disabled={action.disabled}
      class={action.separator ? "menu-separator" : ""}
      onclick={() => {
        const run = action.run;
        returnFocus();
        run();
      }}
    >
      {action.label}
    </button>{/each}
</div>
