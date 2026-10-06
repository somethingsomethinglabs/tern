<script lang="ts">
  let {
    request,
    title,
    setTitle,
    setRequest,
    pending,
    status,
    enabled,
    aiAvailable = true,
    firstResult = true,
    engine,
    start,
    cancel,
    configureAI,
  }: {
    request: string;
    title: string;
    setTitle(value: string): void;
    setRequest(value: string): void;
    pending: boolean;
    status: string;
    enabled: boolean;
    aiAvailable?: boolean;
    firstResult?: boolean;
    engine: string;
    start(useAI: boolean): void;
    cancel(): void;
    configureAI(): void;
  } = $props();
</script>

<form
  class="start-task-form"
  onsubmit={(event) => {
    event.preventDefault();
    if (!pending && request.trim()) start(enabled);
  }}
>
  <h2 id="dialog-title">What do you need to do?</h2>
  <p>
    {enabled
      ? "Create a task and run two or three searches based on your request."
      : "Create a task and search your request."}
  </p>
  {#if aiAvailable && !enabled}<button type="button" disabled={pending} onclick={configureAI}>Set up local AI</button>{/if}
  <label for="task-request">Your request</label>
  <!-- svelte-ignore a11y_autofocus (This form opens inside a modal dialog.) -->
  <textarea
    id="task-request"
    autofocus
    rows={5}
    maxlength={1000}
    value={request}
    disabled={pending}
    oninput={(event) => setRequest(event.currentTarget.value)}
    placeholder="I need a Linux laptop under $1,500 with reliable suspend and good battery life."
  ></textarea>
  <div class="task-request-details">
    <small>{request.length}/1000</small>
    <small
      >Searches use {engine}.{firstResult
        ? " If no result is available, the search page stays open."
        : " Choose a result to begin browsing."}</small
    >
  </div>
  <label for="task-title">Task name{enabled ? " (optional)" : ""}</label>
  <input id="task-title" maxlength={60} value={title} disabled={pending}
    oninput={(event) => setTitle(event.currentTarget.value)}
    placeholder={enabled ? "Let AI name it, or enter a short name" : "For example, Weekend hike"}
    aria-describedby="task-title-hint" />
  <small id="task-title-hint">A short name for the sidebar. Your full request stays in Task notes.</small>
  {#if pending}<p role="status">{status || "Preparing your task..."}</p>{/if}
  <footer>
    <button type="button" onclick={cancel}
      >{pending ? "Cancel setup" : "Cancel"}</button
    >
    {#if enabled && !pending}<button
        type="button"
        title="Save your request and search without AI"
        disabled={!request.trim()}
        onclick={() => start(false)}>Create without AI</button
      >{/if}
    <button class="primary" disabled={pending || !request.trim()}
      >{pending ? "Preparing..." : "Start task"}</button
    >
  </footer>
</form>
