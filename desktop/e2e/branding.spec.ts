import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Tern reuses a legacy profile, including task context and website cookies", async () => {
  const root = await mkdtemp(join(tmpdir(), "tern-rebrand-"));
  const config = join(root, "config");
  const legacyProfile = join(config, "Trailrest");
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "",
    XDG_CONFIG_HOME: config,
    TERN_PROFILE: "",
    TRAILREST_PROFILE: "",
  };
  let running: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    await mkdir(legacyProfile, { recursive: true });
    await writeFile(join(legacyProfile, "workspace.json"), JSON.stringify({
      version: 1,
      tasks: [{
        id: "existing", title: "Existing work", lifecycle: "Active",
        note: "Continue the saved task", selectedPageId: null,
      }],
      pages: [], selectedTaskId: "existing",
    }));
    const seed = join(root, "legacy.cjs");
    await writeFile(seed, `
      const { app, BrowserWindow } = require("electron");
      app.setName("Trailrest");
      app.setPath("userData", ${JSON.stringify(legacyProfile)});
      app.whenReady().then(() => {
        const window = new BrowserWindow({ show: false });
        window.loadURL("about:blank");
      });
    `);
    running = await electron.launch({ args: [seed], env, chromiumSandbox: true });
    await running.firstWindow();
    await running.evaluate(async ({ session }) => {
      const web = session.fromPartition("persist:trailrest-web");
      await web.cookies.set({
        url: "https://profile.example.invalid", name: "retained", value: "yes",
        expirationDate: Math.floor(Date.now() / 1000) + 3600,
      });
      await web.cookies.flushStore();
    });
    await running.close();
    running = undefined;

    running = await electron.launch({
      ...(process.env.TERN_EXECUTABLE ? { executablePath: process.env.TERN_EXECUTABLE } : {}),
      args: ["."], cwd: process.cwd(), env, chromiumSandbox: true,
    });
    const shell = await running.firstWindow();
    await expect(shell).toHaveTitle("Tern");
    await expect(shell.getByRole("button", { name: "Resume Existing work", exact: true })).toBeVisible();
    const identity = await running.evaluate(async ({ app, session }) => ({
      name: app.getName(), profile: app.getPath("userData"),
      cookies: await session.fromPartition("persist:trailrest-web").cookies.get({ name: "retained" }),
    }));
    expect(identity.name).toBe("Tern");
    expect(identity.profile).toBe(legacyProfile);
    expect(identity.cookies.map((cookie) => cookie.value)).toEqual(["yes"]);
    expect(shell.url()).toBe("tern://app/index.html");
    expect(await shell.evaluate(() => typeof window.tern.command)).toBe("function");
  } finally {
    if (running) {
      await running.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await running.close().catch(() => {});
    }
    await rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
});
