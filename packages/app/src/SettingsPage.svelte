<script lang="ts">
  import { tick, untrack } from "svelte";
  import type { Command, Snapshot, Preferences } from "@tern/core/contracts";
  import { BUILTIN_MODEL, builtinModel } from "@tern/core/local-ai-config";
  import type { Bridge } from "@tern/core/contracts";
  import CookieManager from "./CookieManager.svelte";
  type Props = {
    snapshot: Snapshot;
    send(command: Command): Promise<boolean>;
    close(): void;
    cookies?: Bridge["cookies"];
    initialSection?: "localAI" | "shortcuts" | "search" | null;
    closeLabel?: string;
  };
  let { snapshot, send, close, cookies, initialSection = null, closeLabel = "Back to browsing" }: Props = $props();
  let cookiesOpen = $state(false);
  let searchHeading = $state.raw<HTMLHeadingElement>();
  let aiSelect = $state.raw<HTMLSelectElement>();
  let shortcutHeading = $state.raw<HTMLHeadingElement>();
  $effect(() => {
    const target = initialSection === "localAI" ? aiSelect : initialSection === "shortcuts" ? shortcutHeading : initialSection === "search" ? searchHeading : undefined;
    if (!target) return;
    void tick().then(() => {
      if (!target.isConnected) return;
      target.focus();
      target.scrollIntoView({ block: "center" });
    });
  });
  let pending = $state.raw<Partial<Preferences>>({});

  let summaryModel = $state.raw(
    untrack(() =>
      snapshot.preferences.summaryModel.startsWith("builtin:")
        ? "lfm2.5-thinking"
        : snapshot.preferences.summaryModel,
    ),
  );

  let summaryMode = $state.raw(
    untrack(() =>
      snapshot.preferences.summaryModel === BUILTIN_MODEL.id
        ? "builtin"
        : snapshot.preferences.summaryModel
          ? "ollama"
          : "off",
    ),
  );

  const prefs = $derived({ ...snapshot.preferences, ...pending });
  const builtIn = $derived(BUILTIN_MODEL);
  $effect(() => {
    snapshot.preferences;
    return untrack(() => {
      // Keep the optimistic choice until the host's published snapshot catches up.
      pending = ((current: typeof pending) => {
        const confirmed = (
          Object.keys(current) as (keyof Preferences)[]
        ).filter((key) => current[key] === snapshot.preferences[key]);
        if (!confirmed.length) return current;
        const next = { ...current };
        for (const key of confirmed) delete next[key];
        return next;
      })(pending);
    });
  });
  const revisions: Partial<Record<keyof Preferences, number>> = {};
  const update = async (
    patch: Partial<Omit<Preferences, "downloadDirectory">>,
  ) => {
    const attempts = Object.fromEntries(
      Object.keys(patch).map((key) => {
        const field = key as keyof Preferences;
        const revision = (revisions[field] ?? 0) + 1;
        revisions[field] = revision;
        return [field, revision];
      }),
    );
    pending = { ...pending, ...patch };
    if (await send({ type: "setPreferences", patch })) return;
    pending = ((current: typeof pending) => {
      const next = { ...current };
      for (const key of Object.keys(patch) as (keyof typeof patch)[])
        if (revisions[key] === attempts[key] && next[key] === patch[key])
          delete next[key];
      return next;
    })(pending);
  };
</script>

<section class="settings-page" aria-label="Browser settings">
  <header>
    <div>
      <h1>Settings</h1>
    </div>
    <button onclick={close}>{closeLabel}</button>
  </header>
  <section>
    <h2 bind:this={searchHeading} tabindex="-1">Search</h2>
    {#if !snapshot.capabilities?.mobile}
    <label>
      Search view
      <select aria-label="Search view" value={prefs.searchView ?? "reading-list"} onchange={event => void update({ searchView: event.currentTarget.value as "reading-list" | "external" })}>
        <option value="reading-list">Reading list</option>
        <option value="external">Search engine website</option>
      </select>
    </label>
    {/if}
    {#if !snapshot.capabilities?.mobile && prefs.searchView !== "external"}
      <fieldset>
        <legend>Search providers</legend>
        {#each ["duckduckgo", "bing"] as provider}
          <label><input type="checkbox" checked={(prefs.searchProviders ?? ["duckduckgo", "bing"]).includes(provider as "duckduckgo" | "bing")}
            disabled={(prefs.searchProviders ?? ["duckduckgo", "bing"]).length === 1 && (prefs.searchProviders ?? ["duckduckgo", "bing"]).includes(provider as "duckduckgo" | "bing")}
            onchange={event => {
              const current = prefs.searchProviders ?? ["duckduckgo", "bing"];
              const next = event.currentTarget.checked ? [...new Set([...current, provider])] : current.filter(item => item !== provider);
              void update({ searchProviders: next as ("duckduckgo" | "bing")[], searxngURL: "https://search.tern.invalid/" });
            }} />{provider === "bing" ? "Bing" : "DuckDuckGo"}</label>
        {/each}
      </fieldset>
    {:else}
    <label>
      Default search engine
      <select
        aria-label="Default search engine"
        value={prefs.searchEngine}
        onchange={(event) =>
          void update({
            searchEngine: event.currentTarget
              .value as typeof prefs.searchEngine,
          })}
      >
        <option value="duckduckgo">DuckDuckGo</option>
        <option value="google">Google</option>
        <option value="bing">Bing</option>
        <option value="brave">Brave Search</option>
      </select>
    </label>
    {/if}
  </section>
  <section>
    <h2>Appearance</h2>
    <p>
      Theme: {snapshot.theme.name}. {snapshot.capabilities?.mobile
        ? ""
        : "Follows your Omarchy theme automatically."}
      The address bar stays dark.
    </p>
    {#if !snapshot.capabilities?.mobile}<label class="check-option">
        <input
          type="checkbox"
          checked={prefs.autoHideToolbar}
          oninput={(event) =>
            void update({ autoHideToolbar: event.currentTarget.checked })}
        />
        Hide the address bar while scrolling down
      </label>
      <p>
        Scroll up, use the strip at the top, or press Ctrl+L to show it.
      </p>{/if}
    <label>
      Default page zoom
      <select
        aria-label="Default page zoom"
        value={prefs.defaultZoom}
        onchange={(event) =>
          void update({ defaultZoom: Number(event.currentTarget.value) })}
      >
        {#each [0.75, 0.9, 1, 1.1, 1.25, 1.5, 2] as zoom (zoom)}<option
            value={zoom}
          >
            {Math.round(zoom * 100)}%
          </option>{/each}
      </select>
    </label>
  </section>
  {#if snapshot.capabilities?.preloadLinks !== false}<section>
      <h2>Page loading</h2>
      <label class="check-option">
        <input
          type="checkbox"
          checked={prefs.preloadLinks}
          oninput={(event) =>
            void update({ preloadLinks: event.currentTarget.checked })}
        />
        Preload likely pages when hovering over links
      </label>
      <p>
        Downloads eligible same-site pages before you click, using extra data.
        External links only prepare a connection. Skips slow connections,
        downloads and common account or checkout links.
      </p>
      <p>
        This controls Tern's hover hints. Websites can also preload their own
        resources.
      </p>
    </section>{/if}
  {#if snapshot.capabilities?.localAI !== false}<section>
      <h2>Task overview and assistance</h2>
      <p>
        On startup, active tasks show their saved sites, last selected page and
        next-step note. Choose a task to reopen all of its tabs.
      </p>
      <label>
        Local AI
        <select
          aria-label="Local AI"
          bind:this={aiSelect}
          value={summaryMode}
          onchange={(event) => {
            const mode = event.currentTarget.value;
            summaryMode = mode;
            if (mode === "builtin")
              void update({ summaryModel: BUILTIN_MODEL.id });
            if (mode === "off") void update({ summaryModel: "" });
          }}
        >
          <option value="builtin">Built-in LFM2.5 AI</option>
          <option value="ollama">Custom Ollama model</option>
          <option value="off">Off</option>
        </select>
      </label>
      {#if summaryMode.startsWith("builtin")}
        <p>
          {builtIn.name} runs on this device. Tern downloads the model once, about
          {builtIn.bytes >= 1000000000
            ? `${(builtIn.bytes / 1000000000).toFixed(2)} GB`
            : `${Math.round(builtIn.bytes / 1000000)} MB`}, then works offline.
          No separate AI app is needed. Memory is released after each batch of
          descriptions or task suggestions, and when you stop generation.
        </p>
        <button onclick={() => void update({ summaryModel: builtIn.id })}>
          Retry built-in AI
        </button>
      {/if}
      {#if summaryMode === "ollama"}<form
          onsubmit={(event) => {
            event.preventDefault();
            void update({ summaryModel: summaryModel.trim() });
          }}
        >
          <label>
            Local summary model
            <input
              aria-label="Local summary model"
              value={summaryModel}
              maxlength={100}
              placeholder="Installed Ollama model name"
              oninput={(event) => (summaryModel = event.currentTarget.value)}
            />
          </label>
          <p>Use a model already installed in Ollama on this device.</p>
          <button
            type="submit"
            disabled={!summaryModel.trim() ||
              summaryModel.startsWith("builtin:")}
          >
            Use local model
          </button>
        </form>{/if}
      <p>
        Overview descriptions use task names, notes, page titles and site names.
        Suggestions in Task notes also use your saved goal and recent findings.
        Starting a task from a goal uses only the request you enter and opens
        focused searches with your chosen search engine. Page bodies and forms
        are not read automatically. Suggestions run when requested and do not
        mark work complete.
      </p>
      {#if prefs.summaryModel}<button
          type="button"
          onclick={() => {
            summaryMode = "off";
            void update({ summaryModel: "" });
          }}
        >
          Turn off local AI
        </button>{/if}
      <p>
        {builtinModel(prefs.summaryModel)
          ? `Using built-in ${builtinModel(prefs.summaryModel)!.name}.`
          : prefs.summaryModel
            ? `Using ${prefs.summaryModel} through Ollama on this device.`
            : "Local AI is off. Saved goals, notes and findings remain available."}
      </p>
      {#if snapshot.summaryStatus}<p role="status">
          {snapshot.summaryStatus}
        </p>{/if}
    </section>{/if}
  {#if snapshot.capabilities?.snapshots !== false}<section>
      <h2>Tools</h2>
      <label class="check-option">
        <input
          type="checkbox"
          checked={prefs.showSnapshotTool}
          oninput={(event) =>
            void update({ showSnapshotTool: event.currentTarget.checked })}
        />
        Show snapshot button
      </label>
      <p>
        Save the visible part of a website as a PNG. Snapshots save immediately
        to your download folder without asking for a location.
      </p>
    </section>{/if}
  {#if snapshot.capabilities?.downloadDirectory !== false}<section>
      <h2>Downloads</h2>
      <label class="check-option">
        <input
          type="checkbox"
          checked={prefs.askDownloadLocation}
          oninput={(event) =>
            void update({ askDownloadLocation: event.currentTarget.checked })}
        />
        Ask where to save each file
      </label>
      <p class="folder-path">{prefs.downloadDirectory}</p>
      <button onclick={() => void send({ type: "chooseDownloadDirectory" })}>
        Change download folder
      </button>
    </section>{/if}
  {#if snapshot.updates}<section>
    <h2>Updates</h2>
    <p role="status">{snapshot.updates.status}</p>
    <button disabled={!snapshot.updates.configured || snapshot.updates.busy} onclick={() => void send({ type: "checkForUpdates" })}>Check for updates</button>
    {#if snapshot.updates.ready}<button onclick={() => void send({ type: "restartForUpdate" })}>Restart Tern</button>{/if}
    {#if snapshot.updates.version}<button disabled={snapshot.updates.busy} onclick={() => void send({ type: "installUpdate" })}>Install verified update</button>{/if}
  </section>{/if}
  <section>
    <h2>Privacy and storage</h2>
    {#if snapshot.security}<p>{snapshot.security.detail}</p>{/if}
    {#if snapshot.siteInfo}<p>Manage permissions for {snapshot.siteInfo.origin} using Site information in the address bar.</p>{/if}
    <p>
      Tasks, notes and website cookies stay in this browser profile. Reopening
      Tern restores page addresses; unsaved forms are not restored.
    </p>
    <button onclick={() => void send({ type: "clearCache" })}>
      Clear cached website files
    </button>
    {#if cookies}
      <button aria-expanded={cookiesOpen} onclick={() => (cookiesOpen = !cookiesOpen)}>
        {cookiesOpen ? "Close cookie manager" : "Manage cookies"}
      </button>
      {#if cookiesOpen}<CookieManager request={cookies} />{/if}
    {/if}
    <p>
      Websites can copy to the clipboard. Clipboard reading, camera, microphone,
      location and notification requests remain blocked in this build.
    </p>
  </section>
  {#if !snapshot.capabilities?.mobile}<section>
      <h2 bind:this={shortcutHeading} tabindex="-1">Keyboard shortcuts</h2>
      <p>Hold Alt to show task letters and tab numbers in the sidebar.</p>
      <dl class="shortcut-list">
        <dt>Alt+A–Z</dt>
        <dd>Switch tasks in creation order</dd>
        <dt>Alt+1–9 / 0</dt>
        <dd>Switch tabs 1–9 / 10</dd>
        <dt>Ctrl+L</dt>
        <dd>Show and focus the address bar</dd>
        <dt>Ctrl+T / W</dt>
        <dd>New tab / close tab</dd>
        <dt>Ctrl+F</dt>
        <dd>Find on page</dd>
        <dt>Alt+← / →</dt>
        <dd>Back / forward</dd>
      </dl>
    </section>{/if}
  {#if closeLabel !== "Back to browsing"}<footer><button onclick={close}>{closeLabel}</button></footer>{/if}
</section>
