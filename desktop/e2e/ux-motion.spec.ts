import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Exercise the native shell with a disposable profile, never a user's workspace.
test("task feedback stays usable with keyboard, rapid toggles and reduced motion", async () => {
  const profile = await mkdtemp(join(tmpdir(), "tern-ux-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "" }));
  await writeFile(join(profile, "workspace.json"), JSON.stringify({
    version: 1, selectedTaskId: "trip", tasks: [
      { id: "trip", title: "Plan a walking trip", lifecycle: "Active", note: "Check train times before booking.", selectedPageId: null },
      { id: "laptop", title: "Choose a Linux laptop", lifecycle: "Active", note: "Compare battery life and suspend support.", selectedPageId: null },
      { id: "later", title: "Organize the reading list", lifecycle: "Later", note: "Pick a book for the weekend.", selectedPageId: null },
    ], pages: [],
  }));
  const app = await electron.launch({ args: ["."], cwd: process.cwd(), env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile }, chromiumSandbox: true });
  try {
    const shell = await app.firstWindow();
    await shell.waitForLoadState();
    await app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows()[0]; win.setFullScreen(false); win.setSize(1280, 900); });
    const errors: string[] = [];
    shell.on("pageerror", error => errors.push(error.message));
    const phase = process.env.TERN_UX_BASELINE ? "before" : "after";
    const capture = async (name: string) => {
      await expect.poll(() => shell.locator(".task-tile, .task-notes:not([hidden]), .dialog[open]").evaluateAll(elements =>
        elements.every(element => getComputedStyle(element).opacity === "1"),
      )).toBe(true);
      await expect.poll(() => shell.evaluate(() => document.getAnimations().filter(a => a.playState === "running" && a.effect?.getTiming().iterations !== Infinity).length)).toBe(0);
      await shell.screenshot({ path: `../design/ux/2026-09-26/${name}-${phase}.png` });
    };
    await expect(shell.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
    await capture("01-desktop-overview");
    await shell.getByRole("button", { name: "Resume Plan a walking trip", exact: true }).press("Enter");
    const toggle = shell.getByRole("button", { name: "Toggle task notes" });
    await toggle.click();
    await shell.getByLabel("Next step", { exact: true }).fill("Book the morning train.");
    await shell.getByRole("button", { name: "Save note", exact: true }).click();
    await expect(shell.getByRole("status").filter({ hasText: "Note saved" })).toBeVisible();
    await capture("02-desktop-notes");
    await shell.getByRole("button", { name: "Put aside", exact: true }).click();
    await expect(shell.getByRole("dialog")).toBeVisible();
    await capture("03-desktop-pause");
    await shell.getByRole("dialog").press("Escape");
    await expect(shell.getByRole("dialog")).toBeHidden();
    if (!process.env.TERN_UX_BASELINE) {
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await shell.getByRole("button", { name: "Close task notes" }).click();
      await expect(toggle).toBeFocused();
      for (let i = 0; i < 4; i++) await toggle.click();
      await expect(shell.getByRole("complementary", { name: "Task notes" })).toBeHidden();
      await shell.getByRole("textbox", { name: "Search tasks and pages" }).fill("no-such-task");
      await expect(shell.getByText("No tasks or pages match")).toBeVisible();
      await shell.getByRole("button", { name: "Clear search", exact: true }).click();
      await expect(shell.getByRole("button", { name: "Select task Plan a walking trip", exact: true })).toBeVisible();
      await shell.getByRole("textbox", { name: "Search tasks and pages" }).fill("reading");
      await expect(shell.getByRole("button", { name: "Select task Organize the reading list", exact: true })).toBeVisible();
      await expect(shell.getByRole("button", { name: "Later tasks", exact: true })).toHaveAttribute("aria-expanded", "true");
      await shell.getByRole("button", { name: "Clear search", exact: true }).click();
      await toggle.click();
      // Changing the OS preference during an entrance must restore final styles.
      await shell.emulateMedia({ reducedMotion: "reduce" });
      const notes = shell.getByRole("complementary", { name: "Task notes" });
      await expect(notes).toHaveCSS("opacity", "1");
      await expect(notes).toHaveCSS("transform", "none");
      await toggle.click();
      await toggle.click();
      await expect(notes).toHaveCSS("transform", "none");
      await expect(shell.getByLabel("Next step", { exact: true })).toHaveValue("Book the morning train.");
      await shell.getByRole("button", { name: "Put aside", exact: true }).click();
      await expect(shell.getByRole("dialog")).toHaveCSS("opacity", "1");
      await expect(shell.getByRole("dialog")).toHaveCSS("transform", "none");
      expect(await shell.evaluate(() => document.getAnimations().filter(a => a.playState === "running").length)).toBe(0);
      await shell.getByRole("dialog").press("Escape");
      await shell.getByRole("button", { name: "Task overview", exact: true }).click();
      await expect(shell.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
      expect(await shell.locator(".task-tile").first().evaluate(el => getComputedStyle(el).opacity)).toBe("1");
      await shell.setViewportSize({ width: 760, height: 850 });
      const selected = shell.locator('[data-task-id="trip"]');
      const titleBounds = await selected.locator(".task-title").boundingBox();
      const actionBounds = await selected.locator(".task-actions").boundingBox();
      expect(actionBounds!.y).toBeGreaterThanOrEqual(titleBounds!.y + titleBounds!.height - 1);
      await capture("09-desktop-narrow");
      expect(errors).toEqual([]);
    }
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
