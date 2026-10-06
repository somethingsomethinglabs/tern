import { createPublicKey, verify } from "node:crypto";

export type ReleaseManifest = { format: 1; sequence: number; version: string; publishedAt: number;
  expires: number; platform: "linux"; arch: "x64"; url: string; sha256: string; bytes: number };
export function verifyManifest(raw: unknown, publicKey: string, minimumSequence: number, now = Date.now()): ReleaseManifest {
  if (!raw || typeof raw !== "object") throw new Error("Invalid signed release.");
  const envelope = raw as { payload?: unknown; signature?: unknown };
  if (typeof envelope.payload !== "string" || envelope.payload.length > 16384 ||
      typeof envelope.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) throw new Error("Invalid release signature.");
  const key = createPublicKey(publicKey);
  if (key.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(envelope.payload), key, Buffer.from(envelope.signature, "base64")))
    throw new Error("Release signature does not match the trusted publisher.");
  const value = JSON.parse(envelope.payload) as ReleaseManifest;
  const url = new URL(value.url);
  if (value.format !== 1 || value.platform !== "linux" || value.arch !== "x64" ||
      !Number.isSafeInteger(value.sequence) || value.sequence <= minimumSequence ||
      !/^\d+\.\d+\.\d+$/.test(value.version) ||
      !Number.isSafeInteger(value.publishedAt) || value.publishedAt > now + 300000 ||
      !Number.isSafeInteger(value.expires) || value.expires <= now || value.expires <= value.publishedAt ||
      value.expires - value.publishedAt > 14 * 86400000 ||
      !/^[a-f0-9]{64}$/.test(value.sha256) ||
      !Number.isSafeInteger(value.bytes) || value.bytes < 1 || value.bytes > 1024 * 1024 * 1024 ||
      url.protocol !== "https:" || url.username || url.password || url.hash)
    throw new Error("Release is expired, older, incompatible or malformed.");
  return value;
}
export function compareVersions(a: string, b: string) {
  const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (aa[i] !== bb[i]) return aa[i] > bb[i] ? 1 : -1;
  return 0;
}
