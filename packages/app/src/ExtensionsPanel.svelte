<script lang="ts">
  import type { Command, Snapshot } from "@tern/core/contracts";
  let {
    extensions,
    notice,
    send,
    close,
  }: {
    extensions: Snapshot["extensions"];
    notice: string;
    send(command: Command): Promise<boolean>;
    close(): void;
  } = $props();
  let busy = $state.raw(false);

  let source = $state.raw("");

  const run = async (command: Command) => {
    busy = true;
    try {
      await send(command);
    } finally {
      busy = false;
    }
  };
</script>

<section>
  <h2 id="dialog-title">Extensions</h2>
  <p>Developer imports are not publisher-verified. Extensions can read and change websites. Native messaging is disabled.</p>
  <p>
    Download a package from a Chrome Web Store link, or import a ZIP/CRX
    supplied by its developer. Chrome's Add to Chrome button is not connected to
    Tern.
  </p>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      void run({ type: "downloadExtension", source });
    }}
  >
    <label>
      Chrome Web Store link or extension ID
      <input
        value={source}
        oninput={(event) => (source = event.currentTarget.value)}
        placeholder="https://chromewebstore.google.com/detail/…"
      />
    </label>
    <button class="primary" disabled={busy || !source.trim()}>
      Download package
    </button>
  </form>
  <div class="extension-imports">
    <button
      disabled={busy}
      onclick={() => void run({ type: "importExtension" })}
    >
      Import package
    </button>
    <button disabled={busy} onclick={() => void run({ type: "loadExtension" })}>
      Load unpacked
    </button>
  </div>
  <p>
    Open an installed extension to sign in or use its tools. Some Chrome APIs
    remain unsupported; importing a package does not guarantee compatibility.
  </p>
  {#if busy}<p role="status">Working…</p>{/if}
  {#if !busy && notice.startsWith("Extension package downloaded")}<p
      role="status"
    >
      {notice}
    </p>{/if}
  <div class="extension-list">
    {#if extensions.length}{#each extensions as extension (extension.path)}<div
          class="extension"
        >
          <strong>{extension.name}</strong>
          <small>{extension.version}</small>
          <p class="extension-path">{extension.path}</p>
          {#if extension.error}<p role="alert">{extension.error}</p>{/if}
          {#if extension.canOpen}<button
              disabled={busy}
              onclick={async () => {
                if (await send({ type: "openExtension", id: extension.id }))
                  close();
              }}
            >
              Open {extension.name}
            </button>{/if}
          <button
            disabled={busy}
            onclick={() =>
              void run({ type: "removeExtension", path: extension.path })}
          >
            Remove {extension.name}
          </button>
        </div>{/each}{:else}<p>No extensions loaded.</p>{/if}
  </div>
  <p>
    Changes apply to newly opened or reloaded pages. Loaded extensions are
    remembered when you reopen Tern.
  </p>
  <footer>
    <button disabled={busy} onclick={close}> Done </button>
  </footer>
</section>
