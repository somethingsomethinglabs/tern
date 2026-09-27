// Immutable upstream artifact. Model updates require a new ID and checksum so
// cached descriptions cannot silently survive a model change.
export const BUILTIN_MODEL = {
  id: "builtin:lfm2.5-1.2b-instruct-qad-q4-8ed2880",
  name: "LFM2.5 1.2B Instruct",
  filename: "LFM2.5-1.2B-Instruct-QAD-Q4_0.gguf",
  url: "https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct-GGUF/resolve/8ed288026e23958ad9dfa92d53ed773a8eee7125/LFM2.5-1.2B-Instruct-QAD-Q4_0.gguf",
  bytes: 695755488,
  sha256: "bb741ebb106d543e9de114b843a3d3d73d51c74b5801e69da2abde821a0cb3e1",
} as const;

export function builtinModel(id: string) {
  return [BUILTIN_MODEL].find((model) => model.id === id);
}

export type ModelArtifact = {
  filename: string;
  url: string;
  bytes: number;
  sha256: string;
};
