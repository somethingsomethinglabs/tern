import { animate, createScope } from "animejs";
import { untrack } from "svelte";

/** Entrance only: closing never waits for motion or moves native page bounds. */
export function entrance(
  element: () => HTMLElement | null,
  active: () => boolean,
  variant: () => "panel" | "dialog" | "overview" | "feedback" = () => "panel",
) {
  $effect(() => {
    const root = element();
    const kind = variant();
    if (!active() || !root) return;
    return untrack(() => {
      const scope = createScope({
        root,
        mediaQueries: { reduced: "(prefers-reduced-motion: reduce)" },
      }).add((self) => {
        if (self?.matches.reduced) return;
        const targets =
          kind === "overview"
            ? root.querySelectorAll(
                ".overview-heading, .task-tile, .overview-empty",
              )
            : root;
        animate(targets, {
          opacity: [0.65, 1],
          ...(kind === "panel"
            ? { x: [10, 0] }
            : { y: [kind === "feedback" ? 3 : 8, 0] }),
          duration: kind === "feedback" ? 180 : 240,
          delay:
            kind === "overview"
              ? (_target: unknown, index = 0) => Math.min(index * 35, 175)
              : 0,
          ease: "out(3)",
        });
      });
      return () => scope.revert();
    });
  });
}
