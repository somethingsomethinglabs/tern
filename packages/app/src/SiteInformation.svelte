<script lang="ts">
  import type { Snapshot, Command } from "@tern/core/contracts";
  let { snapshot, send, close }: { snapshot: Snapshot; send(command: Command): Promise<boolean>; close(): void } = $props();
  const info = $derived(snapshot.siteInfo);
</script>
<section class="site-information" aria-label="Site information">
  <h2 id="dialog-title">Site information</h2>
  {#if info}
    <p class="site-origin">{info.origin}</p>
    <p>{info.secure ? "Connection uses HTTPS. This protects data in transit; it does not establish that the site is trustworthy." : "Not secure. HTTP traffic can be read or changed on the network. Sensitive permissions are unavailable except on local development sites."}</p>
    <h3>Permissions</h3>
    <p>Approvals last for this page. Blocking a permission is remembered for this origin. Changing permissions reloads its pages to stop existing access.</p>
    {#each info.permissions as permission (permission.name)}
      <div class="site-permission">
        <label>
          {permission.label}
          <select aria-label={permission.label} value={permission.state === "blocked" ? "block" : "ask"}
            disabled={!info.secure && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(info.origin)}
            onchange={event => void send({ type: "setSitePermission", origin: info.origin, permission: permission.name, policy: event.currentTarget.value as "ask" | "block" })}>
            <option value="ask">Ask</option><option value="block">Block</option>
          </select>
        </label>
        {#if permission.state === "allowed"}<small role="status">Allowed for this page</small>{/if}
      </div>
    {/each}
    <button onclick={() => void send({ type: "resetSitePermissions", origin: info.origin })}>Revoke access and reload</button>
    {#if snapshot.blockedPopups?.length}
      <h3>Blocked popups</h3>
      {#each snapshot.blockedPopups as popup (popup.id)}
        <p class="site-origin">{popup.url}</p>
        <button onclick={async () => { if (await send({ type: "openBlockedPopup", id: popup.id })) close(); }}>Open blocked page</button>
      {/each}
      <p>Opening a blocked page uses a new tab. It does not replay a form submission.</p>
    {/if}
    <h3>Page tools</h3>
    <div class="site-tools">
      <button onclick={async () => { close(); await send({ type: "printPage" }); }}>Print</button>
      <button onclick={async () => { close(); await send({ type: "savePDF" }); }}>Save as PDF</button>
      <button onclick={async () => { close(); await send({ type: "savePage" }); }}>Save webpage</button>
    </div>
  {:else}<p>Open a website to view its permissions.</p>{/if}
  <footer><button onclick={close}>Done</button></footer>
</section>
