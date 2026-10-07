import { mkdtempSync, rmSync, statfsSync } from "node:fs";
import { join } from "node:path";

// Electron loads extensions only in a persistent Session. On Linux without a
// usable keyring, give that Session a fresh profile on verified tmpfs rather
// than writing unencrypted website data to the user's disk profile. Website
// and extension account data still expire at exit; installed code is separate.
export function volatileWebsiteProfile(base = "/dev/shm") {
  if (process.platform !== "linux") return undefined;
  try {
    if (statfsSync(base).type !== 0x01021994) return undefined;
    const path = mkdtempSync(join(base, "tern-web-"));
    return { path, close() { rmSync(path, { recursive: true, force: true }); } };
  } catch { return undefined; }
}
