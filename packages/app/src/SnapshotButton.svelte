<script lang="ts">
  import { untrack } from "svelte";
  import Camera from "phosphor-svelte/lib/Camera";
  import Check from "phosphor-svelte/lib/Check";
  import type { Command } from "@tern/core/contracts";
  let {
    disabled,
    send,
  }: {
    disabled: boolean;
    send(command: Command): Promise<boolean>;
  } = $props();
  let phase = $state.raw<"idle" | "saving" | "saved">("idle");

  let busy = $state.raw(false);
  $effect(() => {
    phase;
    return untrack(() => {
      if (phase !== "saved") return;
      const timer = setTimeout(() => (phase = "idle"), 1200);
      return () => clearTimeout(timer);
    });
  });
</script>

<button
  class={`snapshot-button snapshot-${phase}`}
  aria-label="Take snapshot"
  title={disabled
    ? "Open a website to take a snapshot"
    : "Save snapshot to download folder"}
  aria-busy={phase === "saving"}
  disabled={disabled || phase === "saving"}
  onclick={async () => {
    if (busy) return;
    busy = true;
    phase = "saving";
    try {
      phase = (await send({ type: "takeSnapshot" })) ? "saved" : "idle";
    } finally {
      busy = false;
    }
  }}
>
  {#if phase === "saved"}<Check aria-hidden="true" size={21}
    ></Check>{:else}<Camera aria-hidden="true" size={21}></Camera>{/if}
</button>
