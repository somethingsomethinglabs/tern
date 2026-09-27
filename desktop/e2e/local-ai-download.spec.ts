import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureLocalModel } from "../host/local-ai-download";

const originalFetch = globalThis.fetch;
const data = Buffer.from("synthetic model bytes for download verification");
const model = {
  filename: "test.gguf",
  url: "http://test.invalid/model",
  bytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
};
let directory: string;
test.beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "tern-ai-download-")); });
test.afterEach(async () => {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
});

test("a verified model is reused offline, and corruption triggers a fresh download", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(data); };
  const ensure = () => ensureLocalModel(directory, model, new AbortController().signal, () => {});
  const path = await ensure();
  expect(await readFile(path)).toEqual(data);
  await ensure();
  expect(requests).toBe(1);
  await writeFile(path, Buffer.alloc(data.length));
  await ensure();
  expect(requests).toBe(2);
  expect(await readFile(path)).toEqual(data);
});

test("a partial model resumes from the saved offset and is verified before use", async () => {
  await writeFile(join(directory, model.filename + ".part"), data.subarray(0, 8));
  globalThis.fetch = async (_url, options) => {
    expect(new Headers(options?.headers).get("range")).toBe("bytes=8-");
    return new Response(data.subarray(8), {
      status: 206,
      headers: { "Content-Range": `bytes 8-${data.length - 1}/${data.length}` },
    });
  };
  const path = await ensureLocalModel(directory, model, new AbortController().signal, () => {});
  expect(await readFile(path)).toEqual(data);
  await expect(stat(path + ".part")).rejects.toThrow();
});

test("a server that ignores Range replaces the partial file without duplicating bytes", async () => {
  await writeFile(join(directory, model.filename + ".part"), data.subarray(0, 8));
  globalThis.fetch = async () => new Response(data);
  const path = await ensureLocalModel(directory, model, new AbortController().signal, () => {});
  expect(await readFile(path)).toEqual(data);
});

test("concurrent callers share the completed download without overlapping writes", async () => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return new Response(data); };
  const [first, second] = await Promise.all([
    ensureLocalModel(directory, model, new AbortController().signal, () => {}),
    ensureLocalModel(directory, model, new AbortController().signal, () => {}),
  ]);
  expect(first).toBe(second);
  expect(requests).toBe(1);
  expect(await readFile(first)).toEqual(data);
});

test("a bad checksum never becomes a loadable model and is retriable", async () => {
  globalThis.fetch = async () => new Response(Buffer.alloc(data.length));
  await expect(ensureLocalModel(directory, model, new AbortController().signal, () => {}))
    .rejects.toThrow("verification");
  await expect(stat(join(directory, model.filename))).rejects.toThrow();
  await expect(stat(join(directory, model.filename + ".part"))).rejects.toThrow();
  globalThis.fetch = async () => new Response(data);
  await ensureLocalModel(directory, model, new AbortController().signal, () => {});
});

test("canceling after a chunk preserves bytes for a subsequent resume", async () => {
  const controller = new AbortController();
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(stream) { stream.enqueue(data.subarray(0, 8)); },
  }));
  await expect(ensureLocalModel(directory, model, controller.signal, (status) => {
    if (status.includes("17%")) controller.abort();
  })).rejects.toThrow();
  expect(await readFile(join(directory, model.filename + ".part"))).toEqual(data.subarray(0, 8));
  await expect(stat(join(directory, model.filename))).rejects.toThrow();
});
