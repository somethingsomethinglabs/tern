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
import { mkdir } from "node:fs/promises";

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

test("search return and task actions fit without wrapping", async () => {
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({
      preferences: { ...ui.state.preferences, autoHideToolbar: false },
      pages: [
        { ...ui.state.pages[0], sourceSearchId: "search-a" },
        { ...ui.state.pages[0], id: "search-a", search: { query: "Squarespace", status: "ready", results: [] } },
      ],
    });
  });
  for (const width of [1440, 1024]) {
    await shell.setViewportSize({ width, height: 900 });
    const back = shell.getByRole("button", { name: "Return to results", exact: true });
    await expect(back).toBeVisible();
    expect(await back.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return range.getBoundingClientRect().height;
    })).toBeLessThan(25);
    const boxes = await shell.locator(".task-actions button").evaluateAll(elements => elements.map(element => {
      const { y, width, right } = element.getBoundingClientRect();
      return { y, width, right };
    }));
    expect(new Set(boxes.map(box => box.y)).size).toBe(1);
    expect(Math.max(...boxes.map(box => box.width)) - Math.min(...boxes.map(box => box.width))).toBeLessThan(1);
    const group = await shell.locator(".task-actions").boundingBox();
    expect(boxes.at(-1)!.right).toBeLessThanOrEqual(group!.x + group!.width);
  }
});

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
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({ preferences: { ...ui.state.preferences, searchView: "external" } });
  });
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
  await shell.getByRole("button", { name: "New task", exact: true }).click();
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

test("Later starts closed and all settled tasks are shown, including newly settled work", async () => {
  await ready();
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({ tasks: [
      ...ui.state.tasks,
      { id: "later", title: "Read later", lifecycle: "Later", note: "", selectedPageId: null },
      ...Array.from({ length: 14 }, (_, index) => ({ id: `done-${index}`, title: `Finished ${index}`, lifecycle: "Settled", note: "", selectedPageId: null })),
    ] });
  });
  const later = shell.getByRole("button", { name: "Later tasks", exact: true });
  const settled = shell.getByRole("button", { name: "Settled tasks", exact: true });
  await expect(later).toHaveAttribute("aria-expanded", "false");
  await expect(shell.getByRole("button", { name: "Select task Read later", exact: true })).toBeHidden();
  await expect(settled).toHaveAttribute("aria-expanded", "true");
  await expect(shell.getByRole("region", { name: "Settled tasks", exact: true }).getByRole("button", { name: /^Select task/ })).toHaveCount(14);
  await expect(shell.getByRole("button", { name: "Select task Finished 13", exact: true })).toBeVisible();
  await settled.click();
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({ tasks: ui.state.tasks.map((task: any) => task.id === "b" ? { ...task, lifecycle: "Settled" } : task) });
  });
  await expect(settled).toHaveAttribute("aria-expanded", "true");
  await expect(shell.getByRole("region", { name: "Settled tasks", exact: true }).getByRole("button", { name: "Select task Beta", exact: true })).toBeVisible();
  await shell.getByLabel("Search tasks and pages").fill("Read later");
  await expect(later).toHaveAttribute("aria-expanded", "true");
  await expect(shell.getByRole("button", { name: "Select task Read later", exact: true })).toBeVisible();
  await shell.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(later).toHaveAttribute("aria-expanded", "false");
});

test("shortcut hints work on hover, click and keyboard without covering a native page", async () => {
  await ready();
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({ pages: [{ ...ui.state.pages[0], live: true }] });
  });
  const visiblePage = () => shell.evaluate(() => (window as any).testUI.layouts.at(-1).visible);
  const button = shell.getByRole("button", { name: "Keyboard shortcuts", exact: true });
  const hints = shell.getByRole("region", { name: "Keyboard shortcut hints", exact: true });
  await expect.poll(visiblePage).toBe(true);
  await button.hover();
  await expect(hints).toBeVisible();
  await expect.poll(visiblePage).toBe(false);
  await shell.getByLabel("Search tasks and pages").hover();
  await expect(hints).toBeHidden();
  await expect.poll(visiblePage).toBe(true);
  await button.click();
  await shell.getByLabel("Search tasks and pages").hover();
  await expect(hints).toBeVisible();
  await shell.screenshot({ path: "../design/qa/sidebar-review/05-shortcut-help.png" });
  await button.press("Escape");
  await expect(hints).toBeHidden();
  await expect(button).toBeFocused();
  await expect.poll(visiblePage).toBe(true);
  await button.press("Enter");
  await expect(hints).toBeVisible();
  await shell.getByLabel("Search tasks and pages").click();
  await expect(hints).toBeHidden();
  await expect.poll(visiblePage).toBe(true);
});

test("Android settings retain engine selection and omit desktop metasearch controls", async () => {
  await ready();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(390, 844));
  await shell.evaluate(() => {
    const ui = (window as any).testUI;
    ui.publish({ capabilities: { mobile: true, extensions: false, snapshots: false }, preferences: { ...ui.state.preferences, searchView: "external", searchEngine: "duckduckgo" } });
  });
  await shell.getByRole("button", { name: "Tasks and tabs", exact: true }).click();
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(shell.getByLabel("Default search engine")).toHaveValue("duckduckgo");
  await expect(shell.getByLabel("Search view")).toHaveCount(0);
  await expect(shell.getByRole("group", { name: "Search providers" })).toHaveCount(0);
  await shell.getByLabel("Default search engine").selectOption("brave");
  await expect(shell.getByLabel("Default search engine")).toHaveValue("brave");
  await mkdir(resolve("../design/qa/search"), { recursive: true });
  await shell.screenshot({ path: resolve("../design/qa/search/android-search-settings.png") });
});

test("update prompt installs in place, reports failure and offers restart without repeating dismissed versions", async () => {
  const publish = async (patch: Record<string, unknown>) => shell.evaluate(patch => (window as any).testUI.publish({ updates: { configured: true, busy: false, status: "Available", version: "0.1.2", ...patch } }), patch);
  await publish({});
  const prompt = shell.getByRole("region", { name: "Application update" });
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Later", exact: true }).click();
  await publish({});
  await expect(prompt).toHaveCount(0);
  await publish({ version: "0.1.3" });
  await prompt.getByRole("button", { name: "Update now", exact: true }).click();
  expect(await shell.evaluate(() => (window as any).testUI.commands.at(-1))).toEqual({ type: "installUpdate" });
  await publish({ version: "0.1.3", busy: true, progress: 42, status: "Downloading and verifying update…" });
  await expect(prompt.getByRole("progressbar")).toHaveAttribute("value", "42");
  await expect(prompt.getByRole("button")).toHaveCount(0);
  await publish({ version: "0.1.3", status: "Update was not installed: Update checksum does not match its signed manifest." });
  await expect(prompt).toContainText("checksum");
  await expect(prompt.getByRole("button", { name: "Update now", exact: true })).toBeEnabled();
  await publish({ version: "", ready: true });
  await prompt.getByRole("button", { name: "Restart Tern", exact: true }).click();
  expect(await shell.evaluate(() => (window as any).testUI.commands.at(-1))).toEqual({ type: "restartForUpdate" });
  await expect(prompt).toContainText("when your website work is saved");
});
