<script lang="ts">
  import Keyboard from "phosphor-svelte/lib/Keyboard";
  let { open = $bindable(false) }: { open?: boolean } = $props();
  let hovered = $state(false);
  let focused = $state(false);
  let pinned = $state(false);
  let control = $state<HTMLDivElement | null>(null);
  $effect(() => { open = hovered || focused || pinned; });
  const close = () => { hovered = false; focused = false; pinned = false; };
  $effect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!control?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("keydown", escape, true);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("keydown", escape, true);
      window.removeEventListener("blur", close);
    };
  });
</script>

<div
  bind:this={control}
  class="shortcut-control"
  role="group"
  aria-label="Shortcut help"
  onpointerenter={() => (hovered = true)}
  onpointerleave={() => (hovered = false)}
  onfocusin={() => (focused = true)}
  onfocusout={(event) => {
    if (!control?.contains(event.relatedTarget as Node)) focused = false;
  }}
>
  <button
    class="shortcuts-button"
    aria-label="Keyboard shortcuts"
    aria-expanded={open}
    aria-controls="sidebar-shortcut-help"
    onclick={() => {
      if (pinned) close();
      else pinned = true;
    }}
  ><Keyboard aria-hidden="true" size={21}></Keyboard></button>
  <div id="sidebar-shortcut-help" class="shortcut-popover" role="region" aria-label="Keyboard shortcut hints" hidden={!open}>
    <strong>Keyboard shortcuts</strong>
    <p>Hold <kbd>Alt</kbd> to show task letters and tab numbers.</p>
    <dl>
      <div><dt><kbd>Alt + A–Z</kbd></dt><dd>Switch tasks</dd></div>
      <div><dt><kbd>Alt + 1–9 / 0</kbd></dt><dd>Switch tabs 1–10</dd></div>
      <div><dt><kbd>Ctrl + L</kbd></dt><dd>Address or search</dd></div>
      <div><dt><kbd>Ctrl + T</kbd></dt><dd>New tab</dd></div>
      <div><dt><kbd>Ctrl + W</kbd></dt><dd>Close tab</dd></div>
      <div><dt><kbd>Ctrl + F</kbd></dt><dd>Find on page</dd></div>
    </dl>
    <small>Press Escape to close.</small>
  </div>
</div>
