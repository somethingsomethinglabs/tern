import { availableParallelism } from "node:os";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { responseSchemas, type AIResponseKind } from "@tern/core/ai-response";

// Used only in the AI utility process, never in a page or the browser host.
export async function loadCaptionModel(modelPath: string) {
  const threads = Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2)));
  const llama = await getLlama({
    gpu: false,
    build: "never",
    skipDownload: true,
    progressLogs: false,
    logger: () => {},
    maxThreads: threads,
  });
  try {
    const model = await llama.loadModel({ modelPath, gpuLayers: 0 });
    const context = await model.createContext({
      contextSize: 4096,
      sequences: 1,
      threads,
      batchSize: 256,
    });
    const grammars = {
      summary: await llama.createGrammarForJsonSchema(responseSchemas.summary),
      "task-context": await llama.createGrammarForJsonSchema(responseSchemas["task-context"]),
      "task-start": await llama.createGrammarForJsonSchema(responseSchemas["task-start"]),
    };
    return {
      async generate(systemPrompt: string, input: string, signal: AbortSignal, kind: AIResponseKind = "summary") {
        signal.throwIfAborted();
        // A fresh sequence prevents one task's private context leaking into
        // the next task's description while keeping model weights loaded.
        const sequence = context.getSequence();
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt,
          autoDisposeSequence: false,
        });
        try {
          return await session.prompt(input, {
            grammar: grammars[kind],
            signal,
            maxTokens: 256,
            temperature: 0.1,
            topK: 50,
            repeatPenalty: { penalty: 1.05 },
          });
        } finally {
          session.dispose();
          await sequence.dispose();
        }
      },
      async dispose() { await llama.dispose(); },
    };
  } catch (error) {
    await llama.dispose();
    throw error;
  }
}
