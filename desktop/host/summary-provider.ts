import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { builtinModel } from "@tern/core/local-ai-config";
import { ensureLocalModel } from "./local-ai-download.js";
import { responseSchema, type AIResponseKind } from "@tern/core/ai-response";

export type SummaryProvider = {
  generate(input: string): Promise<string>;
  close(): void;
};
export type OpenSummaryProvider = typeof openSummaryProvider;

export async function openSummaryProvider(
  directory: string,
  model: string,
  prompt: string,
  signal: AbortSignal,
  status: (message: string) => void,
  kind: AIResponseKind = "summary",
): Promise<SummaryProvider> {
  const artifact = builtinModel(model);
  if (artifact) {
    const path = await ensureLocalModel(join(directory, "models"), artifact, signal, status);
    signal.throwIfAborted();
    await writeFile(join(directory, "models", "LFM-LICENSE.txt"),
      await readFile(new URL("../../resources/licenses/lfm-open-license-1.0.txt", import.meta.url)),
      { mode: 0o600 });
    signal.throwIfAborted();
    status("Loading built-in AI...");
    const { startLocalAI } = await import("./local-ai-process.js");
    const process = await startLocalAI(path, signal);
    return { generate: (input) => process.generate(prompt, input, kind), close: process.close };
  }
  if (model.startsWith("builtin:")) throw new Error("Unknown built-in model.");
  const request = async (route: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:11434/api/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) throw new Error("Local model unavailable");
    return response.json();
  };
  // Custom Ollama models remain local-only, including aliases.
  const info = await request("show", { model });
  if (info.remote_host || info.remote_model || !info.model_info || !Object.keys(info.model_info).length)
    throw new Error("Choose an installed local model");
  return {
    async generate(input) {
      const result = await request("chat", {
        model,
        stream: false,
        think: false,
        keep_alive: 0,
        options: { temperature: 0.05, top_k: 50, repeat_penalty: 1.05, num_predict: 256, num_ctx: 4096 },
        format: responseSchema(kind),
        messages: [{ role: "system", content: prompt }, { role: "user", content: input }],
      });
      if (result.remote_host || result.remote_model) throw new Error("Local model required");
      return result.message?.content ?? "{}";
    },
    close() {}, // Requests are canceled through the refresh's AbortSignal.
  };
}
