import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

// Keep the partition ID stable: it owns existing cookies and extension storage.
export const WEBSITE_PARTITION = "persist:trailrest-web";

export function profileDirectory(
  appData: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const override = env.TERN_PROFILE || env.TRAILREST_PROFILE;
  if (override) return resolve(override);
  const current = join(appData, "Tern");
  const legacy = join(appData, "Trailrest");
  // Reuse the old directory in place, including its single-instance lock.
  // Never copy a potentially live Chromium profile during startup.
  return !existsSync(current) && existsSync(legacy) ? legacy : current;
}
