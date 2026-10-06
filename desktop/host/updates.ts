import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, writeFile, mkdir, mkdtemp, rename, rm, readlink, cp, access, symlink } from "node:fs/promises";
import { join, dirname, basename, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { verifyManifest, compareVersions, type ReleaseManifest } from "./update-manifest.js";

type Config = { manifestURL: string; publicKey: string };
export class ReleaseUpdater {
  state = { configured: false, busy: false, status: "Updates are not configured for this build.", version: "", ready: false, progress: 0 };
  private config?: Config;
  private release?: ReleaseManifest;
  private sequence = 0;
  private root = "";
  constructor(private executable: string, private version: string, private resources: string, private changed: () => void) {}
  async initialize() {
    try {
      const config = JSON.parse(await readFile(join(this.resources, "update-config.json"), "utf8")) as Config;
      const url = new URL(config.manifestURL);
      if (url.protocol !== "https:" || url.username || url.password || typeof config.publicKey !== "string") throw new Error("Invalid update configuration.");
      const directory = dirname(this.executable);
      if (basename(dirname(directory)) !== "releases") {
        this.state.status = "Install this release with the Tern installer to enable updates."; return;
      }
      this.root = dirname(dirname(directory));
      this.config = config;
      try {
        const stored = JSON.parse(await readFile(join(this.root, "update-state.json"), "utf8"));
        if (!Number.isSafeInteger(stored.sequence) || stored.sequence < 0) throw new Error();
        this.sequence = stored.sequence;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new Error("Saved update state is invalid. Updates are disabled.");
      }
      this.state.configured = true;
      this.state.status = "Ready to check for signed updates.";
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") this.state.status = (error as Error).message;
    }
    this.changed();
  }
  get restartExecutable() { return this.state.ready ? join(this.root, "current", "Tern") : undefined; }
  async check() {
    if (!this.config || !this.state.configured || this.state.busy || this.state.ready) return;
    this.state.busy = true; this.state.status = "Checking for updates…"; this.changed();
    try {
      const response = await secureFetch(this.config.manifestURL, 15000);
      if (!response.ok) throw new Error(`Update server returned HTTP ${response.status}. Private GitHub releases require authenticated distribution.`);
      const text = await boundedText(response, 32768);
      const release = verifyManifest(JSON.parse(text), this.config.publicKey, Math.max(-1, this.sequence - 1));
      if (release.sequence < this.sequence || compareVersions(release.version, this.version) <= 0) {
        this.release = undefined; this.state.version = ""; this.state.status = "Tern is up to date.";
      } else {
        this.release = release; this.state.version = release.version;
        this.state.status = `Tern ${release.version} is available. Installation takes effect after you quit and reopen.`;
      }
    } catch (error) { this.release = undefined; this.state.version = ""; this.state.status = `Could not check for updates: ${(error as Error).message}`; }
    finally { this.state.busy = false; this.changed(); }
  }
  async install() {
    if (!this.config || !this.release || this.state.busy) return;
    const release = this.release;
    if (release.expires <= Date.now() || release.sequence <= this.sequence || compareVersions(release.version, this.version) <= 0)
      throw new Error("Check for a current release before installing.");
    this.state.progress = 0; this.state.busy = true; this.state.status = "Downloading and verifying update…"; this.changed();
    let temporary = "", locked = false;
    const lock = join(this.root, ".install-lock");
    try {
      await mkdir(lock); locked = true;
      await rm(join(this.root, ".previous-update"), { force: true });
      await rm(join(this.root, ".current-update"), { force: true });
      const current = await readlink(join(this.root, "current"));
      if (!/^releases\/[a-zA-Z0-9._-]+$/.test(current) || resolve(this.root, current) !== dirname(this.executable))
        throw new Error("The installation changed. Restart Tern before updating.");
      temporary = await mkdtemp(join(this.root, ".update-"));
      const archive = join(temporary, "release.tar.gz");
      const response = await secureFetch(release.url, 300000);
      if (!response.ok || !response.body) throw new Error("Update download failed.");
      let received = 0;
      const reportProgress = (bytes: number) => {
        const percent = Math.min(100, Math.floor(bytes / release.bytes * 100));
        if (percent !== this.state.progress) { this.state.progress = percent; this.changed(); }
      };
      await pipeline(Readable.fromWeb(response.body as import("node:stream/web").ReadableStream), new Transform({
        transform(chunk, _encoding, callback) {
          received += chunk.length;
          reportProgress(received);
          callback(received > release.bytes ? new Error("Update exceeds its signed size.") : null, chunk);
        },
      }), createWriteStream(archive, { flags: "wx", mode: 0o600 }));
      if (received !== release.bytes) throw new Error("Update size does not match its signed manifest.");
      const hash = createHash("sha256"); for await (const chunk of createReadStream(archive)) hash.update(chunk);
      if (hash.digest("hex") !== release.sha256) throw new Error("Update checksum does not match its signed manifest.");
      const extracted = join(temporary, "extracted"); await mkdir(extracted);
      await runTar(["-xzf", archive, "--no-same-owner", "--no-same-permissions", "--strip-components=1", "-C", extracted]);
      const security = JSON.parse(await readFile(join(extracted, "resources/security.json"), "utf8"));
      if (security.format !== 1 || !security.cookieEncryption || !security.hardened) throw new Error("Update does not meet release security requirements.");
      // Keep the trusted update key and feed stable across application updates.
      const nextConfig = JSON.parse(await readFile(join(extracted, "resources/update-config.json"), "utf8"));
      if (nextConfig.publicKey !== this.config.publicKey || nextConfig.manifestURL !== this.config.manifestURL) throw new Error("Update changes the trusted publisher. Manual key rotation is required.");
      await access(join(extracted, "Tern"), 1);
      const id = `${release.version}-signed-${release.sequence}`;
      const destination = join(this.root, "releases", id);
      await cp(extracted, destination, { recursive: true, errorOnExist: true, force: false });
      await writeFile(join(this.root, "update-state.json.tmp"), JSON.stringify({ sequence: release.sequence }), { mode: 0o600 });
      // Record the high-water mark before switching. A failure can prevent a
      // same-sequence retry, but must never permit installing an older release.
      await rename(join(this.root, "update-state.json.tmp"), join(this.root, "update-state.json"));
      this.sequence = release.sequence;
      const previous = join(this.root, ".previous-update"); await symlink(current, previous); await rename(previous, join(this.root, "previous"));
      const next = join(this.root, ".current-update"); await symlink(`releases/${id}`, next); await rename(next, join(this.root, "current"));
      this.state.status = "Update installed. Quit and reopen Tern when your website work is saved.";
      this.state.ready = true; this.state.version = ""; this.release = undefined;
    } catch (error) { this.state.status = `Update was not installed: ${(error as Error).message}`; }
    finally { if (temporary) await rm(temporary, { recursive: true, force: true }); if (locked) await rm(lock, { recursive: true, force: true }); this.state.busy = false; this.changed(); }
  }
}
async function boundedText(response: Response, maximum: number) {
  if (!response.body) throw new Error("Empty update metadata.");
  const parts = []; let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length; if (size > maximum) throw new Error("Update metadata is too large."); parts.push(Buffer.from(chunk));
  }
  return Buffer.concat(parts).toString("utf8");
}
async function runTar(args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("tar", args, { stdio: ["ignore", "ignore", "pipe"] });
    child.once("error", reject); child.stderr.resume();
    child.once("exit", code => code === 0 ? resolve() : reject(new Error("Could not extract signed update.")));
  });
}

async function secureFetch(value: string, timeout: number) {
  const signal = AbortSignal.timeout(timeout);
  let url = new URL(value);
  for (let count = 0; count < 6; count++) {
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Update redirect is not secure.");
    const response = await fetch(url, { redirect: "manual", signal, headers: { Accept: "application/json, application/octet-stream" } });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location"); await response.body?.cancel();
    if (!location) throw new Error("Invalid update redirect.");
    url = new URL(location, url);
  }
  throw new Error("Too many update redirects.");
}
