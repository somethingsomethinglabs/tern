import AdmZip from "adm-zip";
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

export const PACKAGE_LIMIT = 64 * 1024 * 1024;

export function chromeStorePackage(source: string, chromeVersion: string) {
  let id = source.trim();
  if (!/^[a-p]{32}$/.test(id)) {
    let url: URL;
    try {
      url = new URL(id);
    } catch {
      throw new Error(
        "Paste a Chrome Web Store extension link or its 32-letter ID.",
      );
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !["chromewebstore.google.com", "chrome.google.com"].includes(
        url.hostname,
      ) ||
      !url.pathname.includes("/detail/")
    )
      throw new Error("Use a Chrome Web Store extension link.");
    id = url.pathname.split("/").filter(Boolean).at(-1) || "";
  }
  if (!/^[a-p]{32}$/.test(id))
    throw new Error("This link does not contain a valid extension ID.");
  const url = new URL("https://clients2.google.com/service/update2/crx");
  url.search = new URLSearchParams({
    response: "redirect",
    acceptformat: "crx2,crx3",
    prodversion: chromeVersion,
    x: new URLSearchParams({ id, uc: "" }).toString(),
  }).toString();
  return { id, url: url.href };
}

// CRX is a signed container around a ZIP. Import here is explicitly treated as
// unpacked code, not as a Chrome-verified installation or a signature check.
function zipPayload(data: Buffer) {
  if (data.subarray(0, 4).toString() !== "Cr24") return data;
  if (data.length < 16) throw new Error("Incomplete CRX package.");
  const version = data.readUInt32LE(4);
  const offset =
    version === 2
      ? 16 + data.readUInt32LE(8) + data.readUInt32LE(12)
      : version === 3
        ? 12 + data.readUInt32LE(8)
        : -1;
  if (offset < 0 || offset >= data.length)
    throw new Error("Unsupported or incomplete CRX package.");
  return data.subarray(offset);
}

export async function prepareExtensionPackage(path: string, profile: string) {
  if ((await stat(path)).size > PACKAGE_LIMIT)
    throw new Error("Extension packages must be smaller than 64 MB.");
  const zip = new AdmZip(zipPayload(await readFile(path)));
  const entries = zip.getEntries();
  if (!entries.length || entries.length > 10000)
    throw new Error("This extension package has too many files.");
  let total = 0;
  const names = new Set<string>();
  for (const entry of entries) {
    const name = entry.entryName;
    if (
      name.startsWith("/") ||
      name.includes("\\") ||
      name.includes("\0") ||
      name.split("/").some((part) => part === ".." || part === ".") ||
      /^[A-Za-z]:/.test(name) ||
      names.has(name) ||
      ((entry.attr >>> 16) & 0o170000) === 0o120000
    )
      throw new Error("The package contains an unsafe or duplicate file path.");
    names.add(name);
    total += entry.header.size;
    if (entry.header.size > PACKAGE_LIMIT || total > 256 * 1024 * 1024)
      throw new Error("The unpacked extension is too large.");
  }
  const candidates = entries.filter((entry) =>
    /(^|\/)manifest\.json$/.test(entry.entryName),
  );
  const manifestEntry =
    entries.find((entry) => entry.entryName === "manifest.json") ||
    (candidates.length === 1 ? candidates[0] : undefined);
  if (!manifestEntry || manifestEntry.header.size > 1024 * 1024)
    throw new Error("The package must contain one extension manifest.json.");
  const manifest = JSON.parse(manifestEntry.getData().toString("utf8"));
  if (
    ![2, 3].includes(manifest.manifest_version) ||
    typeof manifest.name !== "string" ||
    typeof manifest.version !== "string"
  )
    throw new Error("This package has an invalid extension manifest.");
  const parent = join(profile, "imported-extensions");
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, "extension-"));
  try {
    zip.extractAllTo(directory, false);
    const prefix = manifestEntry.entryName.slice(0, -"manifest.json".length);
    const path = join(directory, prefix);
    const permissions = [
      ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
      ...(Array.isArray(manifest.host_permissions)
        ? manifest.host_permissions
        : []),
    ]
      .filter((item) => typeof item === "string")
      .slice(0, 40);
    return {
      path,
      directory,
      name: manifest.name.slice(0, 120),
      version: manifest.version.slice(0, 40),
      permissions: permissions.join(", ") || "None declared",
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
