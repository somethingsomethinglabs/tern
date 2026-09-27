import assert from "node:assert/strict";
import { constants } from "node:fs";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";
import { listPackage } from "@electron/asar";

const source = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL("../release/Tern-linux-x64/", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "tern-package-check-"));
let app;
const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(
    '<!doctype html><title>Packaged fixture</title><label>Draft<input aria-label="Draft"></label>',
  );
});
try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  await mkdir(join(temporary, "profile"));
  await writeFile(
    join(temporary, "profile/preferences.json"),
    JSON.stringify({ summaryModel: "" }),
  );
  const distribution = join(temporary, "Tern");
  await cp(source, distribution, {
    recursive: true,
    mode: constants.COPYFILE_FICLONE,
  });
  const contents = listPackage(join(distribution, "resources/app.asar"));
  assert.ok(
    contents.includes("/node_modules/@tern/core/dist/workspace-model.js"),
  );
  assert.ok(
    !contents.some((path) => path.startsWith("/node_modules/@tern/app/")),
    "Shared UI must be bundled, not shipped as development source",
  );
  assert.ok(
    !contents.some((path) =>
      /^\/node_modules\/(react|react-dom)(\/|$)/.test(path),
    ),
    "The production package must not depend on the React runtime",
  );
  assert.ok(
    !contents.includes("/dist/host/contracts.js"),
    "Moved modules must not leave stale host output",
  );
  const launch = () =>
    electron.launch({
      executablePath: join(distribution, "Tern"),
      args: [],
      cwd: temporary,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "",
        TERN_PROFILE: join(temporary, "profile"),
      },
      chromiumSandbox: true,
    });
  app = await launch();
  const shell = await app.firstWindow();
  await shell.getByRole("img", { name: "Tern", exact: true }).waitFor();
  await shell
    .getByRole("textbox", { name: "New task", exact: true })
    .fill("Packaged shared core");
  await shell
    .getByRole("textbox", { name: "New task", exact: true })
    .press("Enter");
  await shell
    .getByRole("button", {
      name: "Select task Packaged shared core",
      exact: true,
    })
    .waitFor();
  await shell.getByRole("textbox", { name: "Address or search" }).fill(origin);
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .press("Enter");
  await shell
    .getByRole("button", { name: "Select page Packaged fixture", exact: true })
    .waitFor();
  const website = app
    .context()
    .pages()
    .find((page) => page.url() === origin);
  assert.ok(website, "Packaged app must own a real website view");
  await website.getByLabel("Draft").fill("Keep this live form");
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.getByLabel("Default search engine").selectOption("brave");
  await shell.getByRole("button", { name: "Back to browsing" }).click();
  assert.equal(
    await website.getByLabel("Draft").inputValue(),
    "Keep this live form",
  );
  await shell.getByRole("button", { name: "Put aside", exact: true }).click();
  await shell
    .getByLabel("Where I left off")
    .fill("Resume outside the repository");
  await shell
    .getByRole("button", { name: "Put aside task", exact: true })
    .click();
  await shell.getByRole("dialog").waitFor({ state: "hidden" });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  app = await launch();
  const restored = await app.firstWindow();
  await restored.getByRole("img", { name: "Tern", exact: true }).waitFor();
  const state = await restored.evaluate(() => window.tern.snapshot());
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0].title, "Packaged shared core");
  assert.equal(state.tasks[0].lifecycle, "Later");
  assert.equal(state.tasks[0].note, "Resume outside the repository");
  assert.equal(state.preferences.searchEngine, "brave");
  assert.equal(state.pages[0].url, origin);
  assert.equal(state.pages[0].live, false);
  console.log(
    "Standalone release loads the shared UI and core and restores saved work outside the repository.",
  );
} finally {
  await app?.close().catch(() => {});
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
