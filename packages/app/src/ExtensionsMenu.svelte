<script lang="ts">
  import PushPin from "phosphor-svelte/lib/PushPin";
  import GearSix from "phosphor-svelte/lib/GearSix";
  import X from "phosphor-svelte/lib/X";
  import type { Command, Snapshot } from "@tern/core/contracts";
  let { extensions, send, close, manage }: {
    extensions: Snapshot["extensions"];
    send(command: Command): Promise<boolean>;
    close(): void;
    manage(): void;
  } = $props();
  let busy = $state(false);
  async function pin(id: string, pinned: boolean) {
    busy = true;
    try { await send({ type: "setExtensionPinned", id, pinned }); }
    finally { busy = false; }
  }
</script>
<section class="extensions-menu">
  <header><h2 id="dialog-title">Extensions</h2><button aria-label="Close extensions" onclick={close}><X size={18} /></button></header>
  <p class="extensions-menu-caption">Your installed extensions</p>
  <div class="extensions-menu-list">
    {#each extensions as extension (extension.path)}
      <div class="extensions-menu-row">
        <button class="extension-launch" disabled={!extension.canOpen || extension.enabled === false || !!extension.error} onclick={async () => { if (await send({ type: "openExtension", id: extension.id })) close(); }}>
          <span class="extension-avatar" aria-hidden="true">{extension.name.slice(0, 1)}</span>
          <span><strong>{extension.name}</strong><small>{extension.error ? "Could not load" : extension.enabled === false ? "Disabled" : "Enabled"}</small></span>
        </button>
        <button class:extension-pinned={extension.pinned} disabled={busy || !extension.id} aria-label={`${extension.pinned ? "Unpin" : "Pin"} ${extension.name}`} aria-pressed={!!extension.pinned} title={extension.pinned ? "Unpin from toolbar" : "Pin to toolbar"} onclick={() => void pin(extension.id, !extension.pinned)}><PushPin size={19} weight={extension.pinned ? "fill" : "regular"} /></button>
      </div>
    {:else}<p>No extensions installed yet.</p>{/each}
  </div>
  <button class="extensions-manage" onclick={manage}><GearSix size={19} />Manage extensions</button>
</section>
