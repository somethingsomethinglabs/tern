import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

let app: ElectronApplication;
let shell: Page;
let profile: string;
test.beforeAll(() => {
  execFileSync(
    process.execPath,
    [
      resolve("node_modules/vite/bin/vite.js"),
      "build",
      "--config",
      "e2e/shared-ui.vite.config.ts",
    ],
    { stdio: "pipe" },
  );
});
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "tern-svelte-ui-"));
  app = await electron.launch({
    args: [
      resolve("e2e/fixtures/shared-ui/host.cjs"),
      resolve("test-results/shared-ui-build/index.html"),
      profile,
    ],
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "" },
    chromiumSandbox: true,
  });
  shell = await app.firstWindow();
  await shell.waitForFunction(
    () => (window as any).testUI?.counts().snapshots === 1,
  );
});
test.afterEach(async () => {
  await app?.close();
  await rm(profile, { recursive: true, force: true });
});

async function ready() {
  await shell.evaluate(() => (window as any).testUI.publish());
}

test("late initial state cannot overwrite an event and subscriptions are disposed on remount", async () => {
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({ tasks: [{ ...ui.state.tasks[0], title: "Latest title" }] });
    ui.initial();
  });
  await expect(
    shell.getByRole("button", {
      name: "Select task Latest title",
      exact: true,
    }),
  ).toBeVisible();
  await shell.evaluate(async () => {
    const ui = (window as any).testUI;
    await ui.unmount();
  });
  expect(await shell.evaluate(() => (window as any).testUI.counts())).toEqual({
    snapshots: 0,
    shortcuts: 0,
  });
  expect(
    await shell.evaluate(() => (window as any).testUI.layouts.at(-1).visible),
  ).toBe(false);
  await shell.evaluate(() => (window as any).testUI.mount());
  await ready();
  await shell.evaluate(() => (window as any).testUI.shortcut("t"));
  await expect
    .poll(() =>
      shell.evaluate(
        () =>
          (window as any).testUI.commands.filter(
            (command: any) => command.type === "newPage",
          ).length,
      ),
    )
    .toBe(1);
  expect(await shell.evaluate(() => (window as any).testUI.counts())).toEqual({
    snapshots: 1,
    shortcuts: 1,
  });
});

test("background snapshots preserve address draft and caret", async () => {
  await ready();
  const address = shell.getByRole("textbox", { name: "Address or search" });
  await address.fill("unfinished query");
  await address.evaluate((input: HTMLInputElement) =>
    input.setSelectionRange(4, 4),
  );
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({
      pages: ui.state.pages.map((page: any) => ({
        ...page,
        title: "New title",
        loading: true,
      })),
    });
  });
  await expect(address).toHaveValue("unfinished query");
  expect(
    await address.evaluate((input: HTMLInputElement) => input.selectionStart),
  ).toBe(4);
});

for (const field of ["Next step", "Goal"] as const) {
  test(`${field} save preserves a newer draft across task switches and panel closure`, async () => {
    await ready();
    await shell.getByRole("button", { name: "Toggle task notes" }).click();
    const input = shell.getByLabel(field, { exact: true });
    await input.fill("Submitted");
    await shell.evaluate(() => (window as any).testUI.defer());
    await shell
      .getByRole("button", {
        name: field === "Goal" ? "Save goal" : "Save note",
        exact: true,
      })
      .click();
    await input.fill("Newer draft");
    await shell.evaluate(() =>
      (window as any).testUI.publish({ selectedTaskId: "b" }),
    );
    await input.fill("Beta draft");
    await shell.evaluate(() => (window as any).testUI.settle(0));
    await shell.getByRole("button", { name: "Close task notes" }).click();
    await shell.getByRole("button", { name: "Toggle task notes" }).click();
    await expect(input).toHaveValue("Beta draft");
    await shell.evaluate(() =>
      (window as any).testUI.publish({ selectedTaskId: "a" }),
    );
    await expect(input).toHaveValue("Newer draft");
  });
}

test("an older settings failure cannot erase a newer identical choice", async () => {
  await ready();
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.evaluate(() => (window as any).testUI.defer());
  const engine = shell.getByLabel("Default search engine");
  await engine.selectOption("google");
  await engine.selectOption("bing");
  await engine.selectOption("google");
  await shell.evaluate(() => (window as any).testUI.settle(0, false));
  await expect(engine).toHaveValue("google");
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({
      preferences: { ...ui.state.preferences, searchEngine: "google" },
    });
    ui.settle(2);
  });
  await expect(engine).toHaveValue("google");
});

test("an unmounted application's pending read cannot update its replacement", async () => {
  await shell.evaluate(async () => {
    const ui = (window as any).testUI;
    await ui.unmount();
    ui.mount();
  });
  await shell.waitForFunction(
    () => (window as any).testUI.counts().snapshots === 1,
  );
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({ tasks: [{ ...ui.state.tasks[0], title: "Replacement" }] });
    ui.initial(0);
  });
  await expect(
    shell.getByRole("button", { name: "Select task Replacement", exact: true }),
  ).toBeVisible();
});

test("a late finding save preserves edits made for both tasks", async () => {
  await ready();
  await shell.getByRole("button", { name: "Toggle task notes" }).click();
  const input = shell.getByLabel("New finding", { exact: true });
  await input.fill("Submitted finding");
  await shell.evaluate(() => (window as any).testUI.defer());
  await shell
    .getByRole("button", { name: "Keep finding", exact: true })
    .click();
  await input.fill("Newer finding");
  await shell.evaluate(() =>
    (window as any).testUI.publish({ selectedTaskId: "b" }),
  );
  await input.fill("Beta finding");
  await shell.evaluate(() => (window as any).testUI.settle(0));
  await expect(input).toHaveValue("Beta finding");
  await shell.evaluate(() =>
    (window as any).testUI.publish({ selectedTaskId: "a" }),
  );
  await expect(input).toHaveValue("Newer finding");
});

test("an old rename save cannot close a reopened dialog", async () => {
  await ready();
  await shell.getByRole("button", { name: "Rename task", exact: true }).click();
  await shell.getByLabel("Task name", { exact: true }).fill("First rename");
  await shell.evaluate(() => (window as any).testUI.defer());
  await shell.getByRole("button", { name: "Save name", exact: true }).click();
  await shell.getByRole("dialog").press("Escape");
  await shell.getByRole("button", { name: "Rename task", exact: true }).click();
  await shell.getByLabel("Task name", { exact: true }).fill("Newer rename");
  await shell.evaluate(() => (window as any).testUI.settle(0));
  await expect(shell.getByRole("dialog")).toBeVisible();
  await expect(shell.getByLabel("Task name", { exact: true })).toHaveValue(
    "Newer rename",
  );
});

test("mobile navigation hides the page for tasks and notes and Back restores it", async () => {
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({
      capabilities: { mobile: true, extensions: false, localAI: false },
      pages: ui.state.pages.map((page: any) => ({ ...page, live: true })),
    });
  });
  await expect
    .poll(() =>
      shell.evaluate(() => (window as any).testUI.layouts.at(-1)?.visible),
    )
    .toBe(true);
  await expect(
    shell.getByRole("button", { name: "Extensions", exact: true }),
  ).toHaveCount(0);
  await shell
    .getByRole("button", { name: "Tasks and tabs", exact: true })
    .click();
  await expect
    .poll(() =>
      shell.evaluate(() => (window as any).testUI.layouts.at(-1)?.visible),
    )
    .toBe(false);
  await shell.evaluate(() => (window as any).testUI.shortcut("back"));
  await expect
    .poll(() =>
      shell.evaluate(() => (window as any).testUI.layouts.at(-1)?.visible),
    )
    .toBe(true);
  await shell.getByRole("button", { name: "Toggle task notes" }).click();
  await expect
    .poll(() =>
      shell.evaluate(() => (window as any).testUI.layouts.at(-1)?.visible),
    )
    .toBe(false);
  expect(
    await shell.evaluate(
      () =>
        (window as any).testUI.commands.filter(
          (c: any) => c.type === "cancelTaskContext",
        ).length,
    ),
  ).toBe(0);
  await shell.getByRole("button", { name: "Close task notes" }).click();
  await expect
    .poll(() =>
      shell.evaluate(() => (window as any).testUI.layouts.at(-1)?.visible),
    )
    .toBe(true);
});

test("a menu action runs after dismissal and restores focus without a stale anchor", async () => {
  await ready();
  const task = shell.getByRole("button", {
    name: "Select task Alpha",
    exact: true,
  });
  await task.click({ button: "right" });
  await shell
    .getByRole("menuitem", { name: "Settle task", exact: true })
    .click();
  await expect(shell.getByRole("menu")).toHaveCount(0);
  await expect
    .poll(() => shell.evaluate(() => (window as any).testUI.commands))
    .toContainEqual({ type: "settle", id: "a" });
  await expect(task).toBeFocused();
});

test("a rejected command appears in the UI and keeps the address draft", async () => {
  await ready();
  await shell.evaluate(() => (window as any).testUI.defer());
  const address = shell.getByRole("textbox", { name: "Address or search" });
  await address.fill("file:///not-allowed");
  await address.press("Enter");
  await shell.evaluate(() => (window as any).testUI.settle(0, false));
  await expect(shell.getByRole("alert")).toContainText("Save failed");
  await expect(address).toHaveValue("file:///not-allowed");
});

test("IME confirmation does not submit a task and ordinary Enter submits once", async () => {
  await ready();
  const input = shell.getByRole("textbox", { name: "New task", exact: true });
  await input.fill("旅行");
  const prevented = await input.evaluate((element) => {
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented).toBe(true);
  expect(await shell.evaluate(() => (window as any).testUI.commands)).toEqual(
    [],
  );
  await input.press("Enter");
  await expect
    .poll(() => shell.evaluate(() => (window as any).testUI.commands))
    .toEqual([{ type: "createTask", title: "旅行" }]);
});
