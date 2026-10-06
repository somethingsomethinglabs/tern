<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { BrowserCookie, CookieDraft, CookieRequest } from "@tern/core/contracts";

  let { request }: { request: (action: CookieRequest) => Promise<BrowserCookie[]> } = $props();
  let cookies = $state.raw<BrowserCookie[]>([]);
  let loaded = $state(false);
  let busy = $state(false);
  let error = $state("");
  let status = $state("");
  let search = $state("");
  let editing = $state<CookieDraft | null>(null);
  let selected = $state.raw<BrowserCookie | null>(null);
  let reveal = $state(false);
  let session = $state(true);
  let expiry = $state("");
  let confirmation = $state.raw<{ action: CookieRequest; description: string } | null>(null);
  let editorForm = $state.raw<HTMLFormElement>();
  let confirmationBox = $state.raw<HTMLDivElement>();
  let refreshButton = $state.raw<HTMLButtonElement>();
  let returnFocus: HTMLElement | null = null;

  const groups = $derived.by(() => {
    const query = search.trim().toLowerCase();
    const sites = new Map<string, BrowserCookie[]>();
    for (const cookie of cookies) {
      if (query && ![cookie.domain, cookie.name, cookie.path, cookie.partitionSite ?? ""].some((text) => text.toLowerCase().includes(query))) continue;
      const site = cookie.domain.replace(/^\./, "");
      sites.set(site, [...(sites.get(site) ?? []), cookie]);
    }
    return [...sites.entries()].sort(([a], [b]) => a.localeCompare(b));
  });
  const shown = $derived(groups.reduce((count, [, items]) => count + items.length, 0));

  async function run(action: CookieRequest, message = "") {
    if (busy) return false;
    busy = true;
    error = "";
    status = "";
    try {
      cookies = await request(action);
      loaded = true;
      status = message;
      return true;
    } catch (failure) {
      error = failure instanceof Error ? failure.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "") : "Could not access cookies. Try refreshing the list.";
      return false;
    } finally {
      busy = false;
    }
  }
  onMount(() => { void run({ type: "list" }); });

  async function edit(cookie: BrowserCookie | null, trigger: HTMLElement) {
    returnFocus = trigger;
    selected = cookie;
    editing = cookie ? { ...cookie } : {
      name: "", value: "", domain: "", path: "/", secure: true,
      httpOnly: false, sameSite: "Lax", expires: null,
    };
    reveal = false;
    session = cookie?.expires == null;
    expiry = cookie?.expires ? localDate(cookie.expires) : "";
    confirmation = null;
    error = "";
    status = "";
    await tick();
    editorForm?.querySelector<HTMLInputElement>(selected ? "input[type=password]" : "input")?.focus();
  }
  function localDate(seconds: number) {
    const date = new Date(seconds * 1000);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!editing) return;
    const expires = session ? null : new Date(expiry).getTime() / 1000;
    if (expires !== null && (!Number.isFinite(expires) || expires <= Date.now() / 1000)) {
      error = "Choose a future expiry date or use a session cookie.";
      return;
    }
    if (await run({ type: "save", cookie: { ...editing, expires }, ...(selected ? { id: selected.id } : {}) }, "Cookie saved.")) {
      editing = null;
      selected = null;
      await restoreFocus();
    }
  }
  async function restoreFocus() {
    await tick();
    (returnFocus?.isConnected ? returnFocus : refreshButton)?.focus();
  }
  async function ask(action: CookieRequest, description: string, trigger: HTMLElement) {
    returnFocus = trigger;
    editing = null;
    selected = null;
    confirmation = { action, description };
    error = "";
    status = "";
    await tick();
    confirmationBox?.focus();
  }
  async function remove() {
    if (!confirmation) return;
    if (await run(confirmation.action, "Cookies deleted. Open websites can create them again.")) {
      confirmation = null;
      await restoreFocus();
    }
  }
</script>

<div class="cookie-manager" aria-label="Cookie manager" aria-busy={busy}>
  <h3>Website cookies</h3>
  <p>Cookies keep you signed in and remember website preferences. All tasks share these cookies. Deleting or editing them can sign you out or change how a website works.</p>
  {#if busy}<p role="status">Working on cookies…</p>{/if}
  {#if error}<p class="cookie-error" role="alert">{error}</p>{/if}
  {#if status}<p role="status">{status}</p>{/if}
  <fieldset disabled={busy}>
    <div class="cookie-actions">
      <label class="cookie-search">Search cookies
        <input type="search" bind:value={search} placeholder="Site, name or path" />
      </label>
      <button bind:this={refreshButton} onclick={() => { editing = null; confirmation = null; void run({ type: "list" }); }}>Refresh cookies</button>
      <button onclick={(event) => void edit(null, event.currentTarget)}>Add cookie</button>
      <button disabled={!cookies.length} onclick={(event) => void ask({ type: "deleteAll" }, `Delete all ${cookies.length} cookies in this browser profile?`, event.currentTarget)}>Delete all cookies</button>
    </div>
    {#if confirmation}
      <div class="cookie-confirmation" bind:this={confirmationBox} tabindex="-1" role="group" aria-label="Confirm cookie deletion">
        <h4>{confirmation.description}</h4>
        <p>This can sign you out. Tasks, notes, cached files and other website storage are kept.</p>
        <div class="cookie-actions">
          <button onclick={() => void remove()}>Confirm deletion</button>
          <button onclick={() => { confirmation = null; void restoreFocus(); }}>Cancel deletion</button>
        </div>
      </div>
    {/if}
    {#if editing}
      <form class="cookie-editor" bind:this={editorForm} onsubmit={save}>
        <h4>{selected ? "Edit cookie" : "Add cookie"}</h4>
        {#if selected}<p>Name, domain and path identify this cookie. Create a new cookie to change them.</p>{/if}
        <label>Cookie name <input bind:value={editing.name} readonly={!!selected} maxlength={4096} /></label>
        <label>Cookie domain <input bind:value={editing.domain} readonly={!!selected} required placeholder="example.com" maxlength={253} /></label>
        <p>A hostname applies only to that host. A leading dot, such as .example.com, also includes subdomains.</p>
        <label>Cookie path <input bind:value={editing.path} readonly={!!selected} required maxlength={4096} /></label>
        <label>Cookie value <input type={reveal ? "text" : "password"} bind:value={editing.value} maxlength={4096} autocomplete="off" spellcheck="false" /></label>
        <label class="check-option"><input type="checkbox" bind:checked={reveal} />Show cookie value</label>
        <label class="check-option"><input type="checkbox" bind:checked={editing.secure} />Secure, send only over HTTPS</label>
        <label class="check-option"><input type="checkbox" bind:checked={editing.httpOnly} />HttpOnly, hide from website JavaScript</label>
        <label>SameSite
          <select aria-label="SameSite" bind:value={editing.sameSite}>
            <option value="unspecified">Unspecified</option>
            <option value="Lax">Lax</option>
            <option value="Strict">Strict</option>
            <option value="None">None</option>
          </select>
        </label>
        <p>SameSite controls when a cookie can be sent across sites. None requires Secure.</p>
        <label class="check-option"><input type="checkbox" bind:checked={session} />Session cookie, no fixed expiry</label>
        {#if !session}<label>Cookie expiry <input type="datetime-local" bind:value={expiry} required step="1" /></label>{/if}
        {#if selected?.partitionSite}<p>Partitioned for {selected.partitionSite}. This partition is preserved when saving.</p>{/if}
        <div class="cookie-actions">
          <button type="submit">Save cookie</button>
          <button type="button" onclick={() => { editing = null; selected = null; error = ""; void restoreFocus(); }}>Cancel editing</button>
        </div>
      </form>
    {/if}
    {#if loaded}
      <p>{shown} of {cookies.length} cookies shown across {groups.length} {groups.length === 1 ? "site" : "sites"}.</p>
      {#if !cookies.length}<p>No cookies stored in this profile.</p>
      {:else if !groups.length}<p>No cookies match your search.</p>{/if}
      {#each groups as [site, items] (site)}
        <details class="cookie-site">
          <summary>{site} <span>{items.length} {items.length === 1 ? "cookie" : "cookies"}</span></summary>
          <button onclick={(event) => void ask({ type: "deleteDomain", domain: site }, `Delete all cookies for ${site}, including any hidden by the search?`, event.currentTarget)}>Delete cookies for {site}</button>
          {#each items as cookie (cookie.id)}
            <article class="cookie-row" aria-label={`Cookie ${cookie.name || "(unnamed)"} at ${cookie.path}`}>
              <div>
                <h4>{cookie.name || "(unnamed)"}</h4>
                <dl>
                  <dt>Domain</dt><dd>{cookie.domain} · {cookie.domain.startsWith(".") ? "Includes subdomains" : "Host only"}</dd>
                  <dt>Path</dt><dd>{cookie.path}</dd>
                  <dt>Expires</dt><dd>{cookie.expires === null ? "Session" : new Date(cookie.expires * 1000).toLocaleString()}</dd>
                  <dt>Attributes</dt><dd>{cookie.secure ? "Secure · " : ""}{cookie.httpOnly ? "HttpOnly · " : ""}SameSite {cookie.sameSite} · {cookie.size} bytes</dd>
                  {#if cookie.partitionSite}<dt>Partition</dt><dd>{cookie.partitionSite}</dd>{/if}
                </dl>
                {#if cookie.readOnly}<p>This cookie has an opaque partition. It can be cleared with Delete all cookies.</p>{/if}
              </div>
              <div class="cookie-actions">
                <button disabled={cookie.readOnly} onclick={(event) => void edit(cookie, event.currentTarget)}>Edit cookie</button>
                <button disabled={cookie.readOnly} onclick={(event) => void ask({ type: "delete", id: cookie.id }, `Delete ${cookie.name || "this unnamed cookie"} at ${cookie.domain}${cookie.path}?`, event.currentTarget)}>Delete cookie</button>
              </div>
            </article>
          {/each}
        </details>
      {/each}
    {/if}
  </fieldset>
  <p>Refresh to see changes from open websites. This manager changes stored cookies. Cookie blocking rules are not available yet.</p>
</div>

<style>
  .cookie-manager { margin-top: 24px; }
  h3 { font-size: 16px; }
  h4 { margin: 0 0 12px; overflow-wrap: anywhere; }
  fieldset { border: 0; padding: 0; min-width: 0; }
  .cookie-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cookie-search { flex: 1 1 100%; }
  .cookie-search input { flex: 1; min-width: 120px; }
  .cookie-confirmation, .cookie-editor { border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin: 18px 0; }
  .cookie-editor { display: grid; gap: 12px; }
  .cookie-editor label { justify-content: space-between; }
  .cookie-editor .check-option { justify-content: flex-start; }
  .cookie-editor input:not([type="checkbox"]) { width: min(100%, 380px); }
  .cookie-editor p { margin: 0; }
  .cookie-site { border-bottom: 1px solid var(--border); padding: 14px 0; }
  summary { cursor: pointer; overflow-wrap: anywhere; padding: 8px 0; }
  summary span { color: var(--muted); font-size: 12px; margin-left: 10px; }
  .cookie-row { padding: 18px 0; border-top: 1px solid var(--border); margin-top: 14px; }
  dl { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 6px 12px; font-size: 12px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .cookie-error { color: var(--danger, #e6a08a); }
</style>
