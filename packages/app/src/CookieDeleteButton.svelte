<script lang="ts">
  import type { Command } from "@tern/core/contracts";
  let { disabled, send }: {
    disabled: boolean;
    send(command: Command): Promise<boolean>;
  } = $props();
  let busy = $state(false);
</script>

<button
  class="cookie-delete-button"
  aria-label="Delete cookies for this site"
  title={disabled ? "Open a website to delete its cookies" : "Delete cookies for this site"}
  aria-busy={busy}
  disabled={disabled || busy}
  onclick={async () => {
    if (busy) return;
    busy = true;
    try { await send({ type: "clearSiteCookies" }); }
    finally { busy = false; }
  }}
>
  <svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <!-- A bitten cookie dropping into a bin, drawn to match the toolbar icons. -->
    <path d="M12.5 3.1a2.8 2.8 0 0 0 3.2 3.2A6.3 6.3 0 1 1 12.5 3.1Z" />
    <circle cx="7" cy="6.9" r=".8" fill="currentColor" stroke="none" />
    <circle cx="5.6" cy="10.5" r=".8" fill="currentColor" stroke="none" />
    <circle cx="10.6" cy="8.8" r=".8" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12.8" r=".8" fill="currentColor" stroke="none" />
    <path d="M13 13.5h8l-.7 7.1a1 1 0 0 1-1 .9h-4.6a1 1 0 0 1-1-.9Z" fill="var(--chrome)" />
    <path d="M12 13.5h10M15 13.5v-2h4v2M16 16.5v2M18 16.5v2" />
  </svg>
</button>
