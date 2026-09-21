import { _electron as electron } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

// Optional Hyprland visual check. Capture only this isolated browser window.
const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "text/html");
  response.end(
    `<!doctype html><title>Travel expenses</title><style>body{margin:0;background:#faf9f5;color:#263c38;font:16px Georgia,serif}header{padding:24px 36px;border-bottom:1px solid #ddd9d0;font-size:18px}main{padding:40px;max-width:650px}small{font:12px Arial;letter-spacing:2px;color:#768c80}h1{font-weight:400;font-size:34px}p{line-height:1.7;color:#68796f}label{display:block;margin:30px 0;font:14px Arial}input,textarea{display:block;margin-top:10px;width:90%;padding:13px;border:1px solid #b7c5bb;border-radius:5px;background:white;font:16px Arial}button{padding:12px 22px;background:#386851;border:0;border-radius:4px;color:white}aside{padding:15px;background:#edf2e7;font:12px Arial;color:#556c5a}</style><header>Fieldwork / Expenses</header><main><small>CONTROLLED SAMPLE WEBSITE</small><h1>Your travel claim</h1><p>Add the details from your recent trip. This form is a local test page inside the real browser.</p><label>Amount<input aria-label="Amount" value="318.20"/></label><label>Claim details<textarea aria-label="Claim details" rows="4">Train and taxi to the workshop. Check the receipt before submitting.</textarea></label><button>Save draft</button><p><aside>No real claim is submitted by this sample website.</aside></p></main>`,
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const profile = await mkdtemp(join(tmpdir(), "trailrest-visual-"));
const env = { ...process.env, TRAILREST_PROFILE: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({
  executablePath:
    process.env.TRAILREST_EXECUTABLE ||
    join(process.cwd(), "release/Trailrest-linux-x64/Trailrest"),
  env,
  chromiumSandbox: true,
});
try {
  const shell = await app.firstWindow();
  await shell.getByRole("button", { name: "New task", exact: true }).click();
  await shell
    .getByLabel("Task name", { exact: true })
    .fill("Finish the travel claim");
  await shell.getByRole("button", { name: "Create task", exact: true }).click();
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .fill(`http://127.0.0.1:${server.address().port}/`);
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .press("Enter");
  await shell
    .getByRole("button", { name: "Select page Travel expenses", exact: true })
    .waitFor();
  async function capture(filename) {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].focus(),
    );
    execFileSync("hyprctl", [
      "dispatch",
      `hl.dsp.focus({ window = "pid:${app.process().pid}" })`,
    ]);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const active = JSON.parse(
      execFileSync("hyprctl", ["activewindow", "-j"], { encoding: "utf8" }),
    );
    if (active.pid !== app.process().pid)
      throw new Error("Browser is not the active window; capture canceled.");
    const geometry = `${active.at[0]},${active.at[1]} ${active.size[0]}x${active.size[1]}`;
    execFileSync("grim", [
      "-g",
      geometry,
      join("..", "design", "qa", filename),
    ]);
  }
  await capture("desktop-native-page.png");
  await shell.getByRole("button", { name: "Put aside", exact: true }).click();
  await shell
    .getByLabel("Where I left off")
    .fill("Check the taxi receipt, then submit the claim.");
  await capture("desktop-native-pause.png");
  await shell
    .getByRole("button", { name: "Put aside task", exact: true })
    .click();
  await capture("desktop-native-later.png");
  await shell.getByRole("button", { name: "Later tasks", exact: true }).click();
  await shell
    .getByRole("button", { name: "Toggle task context", exact: true })
    .click();
  await capture("desktop-native-context.png");
  await shell
    .getByRole("button", { name: "Close task context", exact: true })
    .click();
  await app.evaluate(({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents;
    contents.focus();
    contents.sendInputEvent({
      type: "keyDown",
      keyCode: "Alt",
      modifiers: ["alt"],
    });
  });
  await capture("desktop-native-shortcuts.png");
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.sendInputEvent({
      type: "keyUp",
      keyCode: "Alt",
    });
  });
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await capture("desktop-settings.png");
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  await shell.getByRole("button", { name: "Extensions", exact: true }).click();
  await capture("desktop-extensions.png");
  await shell.getByRole("button", { name: "Done", exact: true }).click();
} finally {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  await new Promise((resolve) => server.close(resolve));
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
