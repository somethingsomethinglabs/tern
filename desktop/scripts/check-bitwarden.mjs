import { _electron as electron, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const extensionPath = process.argv[2] && resolve(process.argv[2]);
if (!extensionPath)
  throw new Error("Pass the path to an unpacked Bitwarden extension.");
const manifest = JSON.parse(
  await readFile(join(extensionPath, "manifest.json"), "utf8"),
);
if (manifest.short_name !== "Bitwarden")
  throw new Error("Expected a Bitwarden package.");
const profile = await mkdtemp(join(tmpdir(), "tern-bitwarden-check-"));
await writeFile(
  join(profile, "extensions.json"),
  JSON.stringify([extensionPath]),
);
const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(
    '<title>Sample login</title><form><label>Email<input autocomplete="username"></label><label>Password<input type="password" autocomplete="current-password"></label></form>',
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const env = { ...process.env, TERN_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({
    ...(process.env.TERN_EXECUTABLE
      ? { executablePath: process.env.TERN_EXECUTABLE }
      : { args: ["."], cwd: process.cwd() }),
    env,
    chromiumSandbox: true,
  });
  const shell = await app.firstWindow();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(true),
  );
  await shell
    .getByRole("textbox", { name: "New task", exact: true })
    .fill("Bitwarden compatibility");
  await shell.getByRole("textbox", { name: "New task", exact: true }).press("Enter");
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .fill(`http://127.0.0.1:${server.address().port}/`);
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .press("Enter");
  await shell
    .getByRole("button", { name: "Select page Sample login", exact: true })
    .waitFor();
  const opened = app.waitForEvent("window");
  await shell
    .getByRole("button", {
      name: "Open Bitwarden Password Manager",
      exact: true,
    })
    .click();
  const popup = await opened;
  const login = popup.getByRole("button", { name: "Log in", exact: true });
  await expect(login).toBeVisible({ timeout: 15000 });
  // Bitwarden initializes first-run state after rendering the carousel. This
  // paced smoke check does not establish that an immediate first click works.
  await popup.waitForTimeout(3000);
  await login.click();
  await expect(
    popup.getByRole("textbox", { name: /Email address/ }),
  ).toBeVisible({ timeout: 15000 });
  // Fictional identity; no password is entered or authentication submitted.
  await app.context().route("**/accounts/prelogin", (route) =>
    route.fulfill({
      json: {
        kdf: 0,
        kdfIterations: 600000,
        kdfMemory: null,
        kdfParallelism: null,
      },
    }),
  );
  await popup
    .getByRole("textbox", { name: /Email address/ })
    .fill("tern-check@example.invalid");
  await popup.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(popup.getByLabel(/Master password/)).toBeVisible({
    timeout: 15000,
  });
  await popup.screenshot({ path: "../design/qa/desktop-bitwarden-login.png" });
  console.log(
    `Bitwarden ${manifest.version}: toolbar, welcome, email and password-entry UI passed. Authenticated vault flows remain a manual check.`,
  );
} finally {
  if (app) {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
