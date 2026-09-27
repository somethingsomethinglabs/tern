import { utilityProcess } from "electron";
import { fileURLToPath } from "node:url";
import type { AIResponseKind } from "@tern/core/ai-response";

export async function startLocalAI(modelPath: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const child = utilityProcess.fork(fileURLToPath(new URL("./local-ai-worker.js", import.meta.url)), [], {
    serviceName: "Tern local AI",
    stdio: "ignore",
  });
  let pending: { resolve(value: string): void; reject(error: Error): void } | undefined;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    signal.removeEventListener("abort", close);
    pending?.reject(new Error("Local AI stopped."));
    pending = undefined;
    child.kill();
  };
  signal.addEventListener("abort", close, { once: true });
  // kill() can return false before the process has spawned. Do not let a
  // canceled startup finish loading its model in an orphaned utility process.
  child.once("spawn", () => { if (closed) child.kill(); });
  child.on("exit", () => {
    pending?.reject(new Error("Local AI could not run on this device."));
    pending = undefined;
    close();
  });
  child.on("error", close);
  child.on("message", (message) => {
    if (!pending) return;
    if (message?.type === "ready") pending.resolve("");
    else if (message?.type === "result" && typeof message.text === "string") pending.resolve(message.text);
    else pending.reject(new Error("Local AI could not generate a description."));
    pending = undefined;
  });
  const request = (message: object, timeout: number) => new Promise<string>((resolve, reject) => {
    if (closed || pending) { reject(new Error("Local AI is not ready.")); return; }
    const timer = setTimeout(close, timeout);
    pending = {
      resolve: (text) => { clearTimeout(timer); resolve(text); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    };
    try { child.postMessage(message); }
    catch { close(); }
  });
  try {
    await request({ type: "load", path: modelPath }, 60_000);
    return {
      generate: (prompt: string, input: string, kind: AIResponseKind = "summary") => request({ type: "generate", prompt, input, kind }, 30_000),
      close,
    };
  } catch (error) { close(); throw error; }
}
