<script lang="ts">
  import { onMount, untrack } from "svelte";
  import CaretDown from "phosphor-svelte/lib/CaretDown";
  import type { Task } from "@tern/core/contracts";
  let {
    tasks,
    onCreate,
    inputRef = $bindable(null),
  }: {
    tasks: Task[];
    onCreate: (title: string) => Promise<boolean>;
    inputRef: HTMLInputElement | null;
  } = $props();
  let title = $state.raw("");

  let submitting = $state.raw(false);

  let form = $state.raw<HTMLFormElement | null>(null);
  let pending = $state.raw<{
    ids: Set<string>;
    title: string;
    origin: DOMRect;
  } | null>(null);
  let busy = $state.raw(false);
  let stopAnimation = $state.raw<(() => void) | null>(null);
  onMount(() => () => stopAnimation?.());
  $effect(() => {
    tasks;
    return untrack(() => {
      const creation = pending;
      if (!creation) return;
      const task = tasks.find(
        (task) => !creation.ids.has(task.id) && task.title === creation.title,
      );
      if (!task) return;
      const card = form
        ?.closest("aside")
        ?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(task.id)}"]`);
      if (!card) return;
      pending = null;
      stopAnimation?.();
      card.scrollIntoView({ block: "nearest", behavior: "instant" });
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // Fly a copy above the scrolling list so its overflow cannot clip the trip.
      const destination = card.getBoundingClientRect();
      const origin = creation.origin;
      const flyingCard = card.cloneNode(true) as HTMLElement;
      flyingCard.removeAttribute("data-task-id");
      flyingCard.classList.add("task-arrival");
      flyingCard.setAttribute("aria-hidden", "true");
      flyingCard.inert = true;
      Object.assign(flyingCard.style, {
        left: `${origin.left}px`,
        top: `${origin.top}px`,
        width: `${origin.width}px`,
        height: `${origin.height}px`,
      });
      document.body.append(flyingCard);
      const duration = 420;
      const reveal = card.animate([{ opacity: 0 }, { opacity: 0 }], {
        duration,
      });
      const flight = flyingCard.animate(
        [
          {
            transform: "translate(0, 0)",
            width: `${origin.width}px`,
            height: `${origin.height}px`,
          },
          {
            transform: `translate(${destination.left - origin.left}px, ${destination.top - origin.top}px)`,
            width: `${destination.width}px`,
            height: `${destination.height}px`,
          },
        ],
        {
          duration,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
          fill: "forwards",
        },
      );
      const cleanup = () => {
        flyingCard.remove();
        flight.cancel();
        reveal.cancel();
        stopAnimation = null;
      };
      stopAnimation = cleanup;
      flight.onfinish = cleanup;
    });
  });
</script>

<form
  bind:this={form}
  class="new-task"
  aria-busy={submitting}
  onsubmit={async (event) => {
    event.preventDefault();
    if (!title.trim() || busy || !form) return;
    busy = true;
    submitting = true;
    pending = {
      ids: new Set(tasks.map((task) => task.id)),
      title: title.trim(),
      origin: form.getBoundingClientRect(),
    };
    if (await onCreate(title.trim())) title = "";
    else pending = null;
    busy = false;
    submitting = false;
  }}
>
  <CaretDown size={18} aria-hidden="true"></CaretDown>
  <input
    bind:this={inputRef}
    aria-label="New task"
    aria-describedby="new-task-hint"
    placeholder="New task"
    autocomplete="off"
    maxlength={120}
    value={title}
    readonly={submitting}
    oninput={(event) => (title = event.currentTarget.value)}
    onkeydown={(event) => {
      if (event.isComposing) {
        if (event.key === "Enter") event.preventDefault();
        return;
      }
      if (event.key === "Escape" && !busy) {
        title = "";
        event.currentTarget.blur();
      }
    }}
  />
  <kbd id="new-task-hint" aria-label="Press Enter to create task">
    Enter ↵
  </kbd>
</form>
