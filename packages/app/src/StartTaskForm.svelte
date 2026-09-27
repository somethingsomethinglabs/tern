<script lang="ts">
  let {
    request,
    setRequest,
    pending,
    status,
    enabled,
    aiAvailable = true,
    firstResult = true,
    engine,
    start,
    cancel,
  }: {
    request: string;
    setRequest(value: string): void;
    pending: boolean;
    status: string;
    enabled: boolean;
    aiAvailable?: boolean;
    firstResult?: boolean;
    engine: string;
    start(useAI: boolean): void;
    cancel(): void;
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
      ? "Describe your goal. Tern will name the task, save its goal and run two or three focused searches and open the first web result from each."
      : !aiAvailable
        ? "Tern will save your request as a task and open a search. Your goal and notes stay with the task."
        : "Local AI is off. Tern will save your request as a task and open the first web result for your request. Enable local AI in Settings for a task name and focused searches."}
  </p>
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
  {#if pending}<p role="status">{status || "Preparing your task..."}</p>{/if}
  <footer>
    <button type="button" onclick={cancel}
      >{pending ? "Cancel setup" : "Cancel"}</button
    >
    {#if enabled && !pending}<button
        type="button"
        title="Save your request and open the first search result"
        disabled={!request.trim()}
        onclick={() => start(false)}>Create without AI</button
      >{/if}
    <button class="primary" disabled={pending || !request.trim()}
      >{pending ? "Preparing..." : "Start task"}</button
    >
  </footer>
</form>
