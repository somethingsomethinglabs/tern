<script lang="ts">
  import type { Command, Snapshot } from "@tern/core/contracts";
  let { updates, send }: { updates: NonNullable<Snapshot["updates"]>; send: (command: Command) => Promise<unknown> } = $props();
  let dismissed = $state("");
  const identity = $derived(updates.ready ? "ready" : updates.version);
</script>

{#if updates.configured && identity && (updates.busy || dismissed !== identity)}
  <section class="update-prompt" aria-label="Application update">
    <div role="status" aria-live="polite">
      {#if updates.ready}
        <strong>Update installed</strong>
        <span>Restart Tern when your website work is saved.</span>
      {:else if updates.busy}
        <strong>Updating Tern</strong>
        <span>{updates.status}</span>
        <progress max="100" value={updates.progress ?? 0} aria-label="Update download"></progress>
      {:else}
        <strong>Tern {updates.version} is available</strong>
        <span>{updates.status.startsWith("Update was not installed") ? updates.status : "Download and install it here. Your pages stay open until you restart."}</span>
      {/if}
    </div>
    {#if !updates.busy}
      <button class="primary" onclick={() => void send({ type: updates.ready ? "restartForUpdate" : "installUpdate" })}>{updates.ready ? "Restart Tern" : "Update now"}</button>
      <button onclick={() => { dismissed = identity; }}>Later</button>
    {/if}
  </section>
{/if}

<style>
  .update-prompt { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--surface); flex-shrink: 0; }
  .update-prompt > div { flex: 1; min-width: 180px; display: grid; gap: 4px; }
  span { font-size: 12px; }
  progress { width: min(100%, 280px); height: 6px; }
</style>
