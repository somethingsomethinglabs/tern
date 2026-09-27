import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ModelArtifact } from "@tern/core/local-ai-config";

const downloads = new Map<string, Promise<string>>();
const verified = new Map<string, string>();

async function fileSize(path: string) {
  try { return (await stat(path)).size; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

async function checksum(path: string, signal: AbortSignal) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { signal })) hash.update(chunk);
  signal.throwIfAborted();
  return hash.digest("hex");
}

// Serialize access to the partial file. A canceled download can be resumed on
// the next overview visit, without overlapping writes from an older refresh.
export async function ensureLocalModel(
  directory: string,
  model: ModelArtifact,
  signal: AbortSignal,
  status: (message: string) => void,
) {
  const path = join(directory, model.filename);
  const previous = downloads.get(path);
  const operation = (previous ?? Promise.resolve()).catch(() => {}).then(async () => {
    signal.throwIfAborted();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (await fileSize(path) === model.bytes) {
      const info = await stat(path);
      const fingerprint = `${model.sha256}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
      if (verified.get(path) === fingerprint) return path;
      status("Checking the downloaded AI model...");
      if (await checksum(path, signal) === model.sha256) {
        verified.set(path, fingerprint);
        return path;
      }
    }
    signal.throwIfAborted();
    await rm(path, { force: true });
    verified.delete(path);
    const partial = path + ".part";
    let received = await fileSize(partial);
    if (received > model.bytes) {
      await rm(partial, { force: true });
      received = 0;
    }
    if (received < model.bytes) {
      const downloadSignal = AbortSignal.any([signal, AbortSignal.timeout(1_800_000)]);
      const report = () => status(`Downloading AI model: ${Math.floor(received / model.bytes * 100)}% of ${Math.round(model.bytes / 1_000_000)} MB`);
      report();
      const response = await fetch(model.url, {
        headers: received ? { Range: `bytes=${received}-` } : {},
        signal: downloadSignal,
      });
      if (!response.ok || !response.body ||
          (model.url.startsWith("https:") && !response.url.startsWith("https:")))
        throw new Error("Could not download the AI model. Check your connection and retry.");
      if (received && response.status === 206) {
        if (response.headers.get("content-range") !== `bytes ${received}-${model.bytes - 1}/${model.bytes}`) {
          await response.body.cancel();
          await rm(partial, { force: true });
          throw new Error("The model download could not resume. Please retry.");
        }
      } else if (response.status === 200) {
        received = 0; // Server ignored Range; replace the partial file.
      } else {
        await response.body.cancel();
        throw new Error("Unexpected AI model download response.");
      }
      const file = await open(partial, received ? "a" : "w", 0o600);
      let lastPercent = -1;
      try {
        for await (const chunk of response.body) {
          downloadSignal.throwIfAborted();
          if (received + chunk.length > model.bytes)
            throw new Error("The AI model download is larger than expected.");
          // FileHandle.write can write fewer bytes than requested.
          let offset = 0;
          while (offset < chunk.length) {
            const { bytesWritten } = await file.write(chunk, offset, chunk.length - offset);
            if (!bytesWritten) throw new Error("Could not save the AI model.");
            offset += bytesWritten;
          }
          received += chunk.length;
          const percent = Math.floor(received / model.bytes * 100);
          if (percent !== lastPercent) { lastPercent = percent; report(); }
          downloadSignal.throwIfAborted();
        }
      } finally { await file.close(); }
    }
    signal.throwIfAborted();
    if (received !== model.bytes)
      throw new Error("The AI model download was interrupted. Reopen the overview to resume.");
    status("Checking the downloaded AI model...");
    if (await checksum(partial, signal) !== model.sha256) {
      await rm(partial, { force: true });
      throw new Error("The AI model download failed verification. Please retry.");
    }
    await rename(partial, path);
    const info = await stat(path);
    verified.set(path, `${model.sha256}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`);
    return path;
  });
  downloads.set(path, operation);
  try { return await operation; }
  finally { if (downloads.get(path) === operation) downloads.delete(path); }
}
