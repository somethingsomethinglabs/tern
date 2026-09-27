import { loadCaptionModel } from "./local-ai-inference.js";

const port = process.parentPort;
if (!port) throw new Error("Local AI must run in an Electron utility process.");
let model: Awaited<ReturnType<typeof loadCaptionModel>> | undefined;
let busy = false;
port.on("message", async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    if (data.type === "load" && !model && typeof data.path === "string") {
      model = await loadCaptionModel(data.path);
      port.postMessage({ type: "ready" });
    } else if (data.type === "generate" && model &&
        typeof data.prompt === "string" && typeof data.input === "string" &&
        (data.kind === undefined || data.kind === "summary" || data.kind === "task-context" || data.kind === "task-start")) {
      const text = await model.generate(data.prompt, data.input, AbortSignal.timeout(30_000), data.kind);
      port.postMessage({ type: "result", text });
    } else {
      throw new Error("Invalid local AI request.");
    }
  } catch {
    // Native errors may include prompts or local paths. Keep them out of UI.
    port.postMessage({ type: "error" });
  } finally { busy = false; }
});
