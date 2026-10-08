<script lang="ts">
  import type { Command, Snapshot } from "@tern/core/contracts";
  let { extensions, notice, send, close }: {
    extensions: Snapshot["extensions"];
    notice: string;
    send(command: Command): Promise<boolean>;
    close(): void;
  } = $props();
  let busy = $state.raw(false);
  let source = $state.raw("");
  const run = async (command: Command) => {
    busy = true;
    try { return await send(command); } finally { busy = false; }
  };
</script>

<section>
  <h2 id="dialog-title">Manage extensions</h2>
  <p>Find extensions in the Chrome Web Store and choose Add to Tern. Review their requested access before installing.</p>
  <button class="primary" disabled={busy} onclick={async () => {
    if (await run({ type: "browseExtensionStore" })) close();
  }}>Browse Chrome Web Store</button>
  <p>Some Chrome features are not supported. Extensions requiring a native desktop app cannot be installed.</p>
  {#if extensions.some(extension => extension.store)}
    <button disabled={busy} onclick={() => void run({ type: "checkExtensionUpdates" })}>Check for extension updates</button>
    <p>Store extensions update automatically. Updates requesting more access wait for your approval.</p>
  {/if}
  {#if busy}<p role="status">Working…</p>{/if}
  {#if !busy && (notice.startsWith("Extension update") || notice.startsWith("Extension package downloaded"))}<p role="status">{notice}</p>{/if}
  <div class="extension-list">
    {#each extensions as extension (extension.path)}
      <div class="extension">
        <strong>{extension.name}</strong>
        <small>{extension.version}{extension.enabled === false ? " · Disabled" : ""}</small>
        <p>{extension.store ? "Chrome Web Store" : "Developer extension"}</p>
        {#if extension.error}<p role="alert">{extension.error}</p>{/if}
        {#if extension.updateStatus}<p role="status">{extension.updateStatus}</p>{/if}
        {#if extension.canOpen}<button disabled={busy} onclick={async () => {
          if (await run({ type: "openExtension", id: extension.id })) close();
        }}>Open {extension.name}</button>{/if}
        {#if extension.id}<button disabled={busy} onclick={() => void run({
          type: "setExtensionEnabled", id: extension.id, enabled: extension.enabled === false,
        })}>{extension.enabled === false ? "Enable" : "Disable"} {extension.name}</button>{/if}
        <button disabled={busy} onclick={() => void run({ type: "removeExtension", path: extension.path })}>Remove {extension.name}</button>
      </div>
    {:else}<p>No extensions installed.</p>{/each}
  </div>
  <details>
    <summary>Developer options</summary>
    <p>Developer imports are not publisher-verified. Extensions can read and change websites.</p>
    <form onsubmit={event => {
      event.preventDefault(); void run({ type: "downloadExtension", source });
    }}>
      <label>Chrome Web Store link or extension ID
        <input bind:value={source} placeholder="https://chromewebstore.google.com/detail/…" />
      </label>
      <button disabled={busy || !source.trim()}>Download package</button>
    </form>
    <div class="extension-imports">
      <button disabled={busy} onclick={() => void run({ type: "importExtension" })}>Import package</button>
      <button disabled={busy} onclick={() => void run({ type: "loadExtension" })}>Load unpacked</button>
    </div>
  </details>
  <p>Changes apply to newly opened or reloaded pages. Installed extensions are remembered when you reopen Tern.</p>
  <footer><button disabled={busy} onclick={close}>Done</button></footer>
</section>
