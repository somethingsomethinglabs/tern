import AdmZip from "adm-zip";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server: Server;
let origin: string;
let app: ElectronApplication;
let shell: Page;
let profile: string;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/extension.crx") {
      const zip = new AdmZip();
      zip.addFile(
        "manifest.json",
        Buffer.from(
          JSON.stringify({
            manifest_version: 3,
            name: "Downloaded sample",
            version: "1.0",
          }),
        ),
      );
      const header = Buffer.alloc(12);
      header.write("Cr24");
      header.writeUInt32LE(3, 4);
      res.setHeader("Content-Type", "application/x-chrome-extension");
      res.end(Buffer.concat([header, zip.toBuffer()]));
      return;
    }
    if (req.url === "/scroll") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<title>Scroll sample</title><h1>Scroll sample</h1><button>Focus page</button><div style="height:4000px">Long document</div>',
      );
      return;
    }
    if (req.url === "/long-link") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<title>Long reference</title><a href="/second?reference=${"x".repeat(9000)}">Open long reference</a>`,
      );
      return;
    }
    if (req.url === "/unavailable") {
      req.socket.destroy();
      return;
    }
    if (req.url === "/download") {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="receipt.txt"',
      );
      res.end("Controlled receipt");
      return;
    }
    res.setHeader("Content-Type", "text/html");
    if (req.url === "/post") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () =>
        res.end(
          `<title>Posted receipt</title><h1>${body === "receipt=taxi" ? "Receipt received" : "Missing receipt"}</h1>`,
        ),
      );
      return;
    }
    if (req.url === "/popup") {
      res.end(
        `<title>Script popup</title><p id="opener"></p><script>document.querySelector('#opener').textContent=window.opener?'Opener retained':'No opener'</script>`,
      );
      return;
    }
    if (req.url === "/windows") {
      res.end(
        `<title>Window workflows</title><button onclick="window.open('/popup')">Open popup</button><form method="post" action="/post" target="_blank"><input type="hidden" name="receipt" value="taxi"/><button>Send receipt</button></form>`,
      );
      return;
    }
    if (req.url === "/guarded") {
      res.end(
        `<title>Unsaved draft</title><label>Draft <input aria-label="Draft" oninput="window.onbeforeunload=()=>true" /></label>`,
      );
      return;
    }
    if (req.url === "/permission") {
      res.end(
        `<title>Permission test</title><button onclick="Notification.requestPermission().then(value=>document.querySelector('output').textContent=value)">Request notifications</button><output></output>`,
      );
      return;
    }
    res.end(
      `<html><title>${req.url === "/second" ? "Second page" : "Expense claim"}</title><body><h1>${req.url === "/second" ? "Second page" : "Expense claim"}</h1><label>Amount <input aria-label="Amount" /></label><a href="/second">Next page</a><a href="/second" target="_blank">Open reference</a><a href="/download">Download receipt</a><button onclick="document.querySelector('output').textContent = typeof window.trailrest + '/' + typeof require">Check isolation</button><output></output></body></html>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test("a long website-generated reference survives restart with its task", async () => {
  await newTask("Keep a long reference");
  const website = await navigate(origin + "/long-link");
  await website.getByRole("link", { name: "Open long reference" }).click();
  const longURL = origin + "/second?reference=" + "x".repeat(9000);
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(longURL);
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  await launch();
  await expect(
    shell.getByRole("button", {
      name: "Select task Keep a long reference",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    shell.getByRole("heading", { name: "Reopen this reference" }),
  ).toBeVisible();
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(longURL);
});
test("failed page loads can be recovered and renamed tasks remain searchable", async () => {
  await newTask("Initial title");
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .fill(origin + "/unavailable");
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .press("Enter");
  await expect(
    shell.getByRole("heading", { name: "Couldn’t open this page" }),
  ).toBeVisible();
  await navigate(origin + "/");
  await shell.getByRole("button", { name: "Rename task" }).click();
  await shell.getByLabel("Task name", { exact: true }).fill("Expense review");
  await shell.getByRole("button", { name: "Save name" }).click();
  await shell.getByLabel("Search tasks and pages").fill("Expense");
  await expect(
    shell.getByRole("button", { name: "Select task Expense review" }),
  ).toBeVisible();
  await shell.getByLabel("Search tasks and pages").fill("Nothing matches");
  await expect(
    shell.getByRole("button", { name: "Select task Expense review" }),
  ).not.toBeVisible();
});
test("storage failures are visible and an unreadable workspace is preserved", async () => {
  await mkdir(join(profile, "workspace.json.tmp"));
  await newTask("Keep this work");
  await expect(shell.getByRole("alert")).toContainText(
    "Could not save task changes",
  );
  await rm(join(profile, "workspace.json.tmp"), { recursive: true });
  await shell.getByRole("button", { name: "Rename task" }).click();
  await shell.getByLabel("Task name", { exact: true }).fill("Saved work");
  await shell.getByRole("button", { name: "Save name" }).click();
  await expect(shell.getByRole("alert")).not.toBeVisible();
  await app.close();
  await writeFile(join(profile, "workspace.json"), "unreadable input");
  await launch();
  await expect(shell.getByRole("alert")).toContainText("preserved");
  await newTask("Fresh work");
  await expect(
    shell.getByRole("button", { name: "Select task Fresh work", exact: true }),
  ).toBeVisible();
});
test("script popups retain their opener and target forms keep POST data", async () => {
  await newTask("Window workflows");
  const website = await navigate(origin + "/windows");
  await website.getByRole("button", { name: "Open popup" }).click();
  await expect(
    shell.getByRole("button", { name: "Select page Script popup" }),
  ).toBeVisible();
  const popup = app
    .context()
    .pages()
    .find((page) => page.url() === origin + "/popup")!;
  await expect(popup.getByText("Opener retained")).toBeVisible();
  await shell
    .getByRole("button", { name: "Select page Window workflows" })
    .click();
  await website.getByRole("button", { name: "Send receipt" }).click();
  await expect(
    shell.getByRole("button", { name: "Select page Posted receipt" }),
  ).toBeVisible();
  const posted = app
    .context()
    .pages()
    .find((page) => page.url() === origin + "/post")!;
  await expect(
    posted.getByRole("heading", { name: "Receipt received" }),
  ).toBeVisible();
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
async function launch(themeDirectory?: string) {
  app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TRAILREST_PROFILE: profile,
      ...(themeDirectory ? { TRAILREST_THEME_DIR: themeDirectory } : {}),
    },
    chromiumSandbox: true,
  });
  app.process().stderr?.on("data", (chunk) => {
    if (String(chunk).includes("Error")) console.error(String(chunk));
  });
  shell = await app.firstWindow();
  await shell.waitForLoadState();
  // The desktop may tile a fresh window narrowly while another browser is open.
  // Give UI tests a consistent viewport and explicitly open task notes.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(true),
  );
  await expect
    .poll(() => shell.evaluate(() => window.innerWidth))
    .toBeGreaterThan(800);
  if (
    !(await shell
      .getByRole("heading", { name: "Task notes", exact: true })
      .isVisible())
  ) {
    await shell
      .getByRole("button", { name: "Toggle task notes", exact: true })
      .click();
  }
}
test.beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "trailrest-test-"));
  await launch();
});
test.afterEach(async () => {
  if (app) {
    await app
      .evaluate(({ dialog }) => {
        dialog.showMessageBoxSync = () => 1;
      })
      .catch(() => {});
    await app.close().catch(() => {});
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
});
// CDP keyboard events bypass Electron's native before-input-event hook.
// Send native input at the window boundary to exercise browser accelerators.
async function nativeShortcut(page: Page, keyCode: string) {
  await app.evaluate(
    ({ webContents }, { url, keyCode }) => {
      const contents = webContents
        .getAllWebContents()
        .find((item) => item.getURL() === url)!;
      contents.focus();
      contents.sendInputEvent({
        type: "keyDown",
        keyCode,
        modifiers: ["control"],
      });
      contents.sendInputEvent({
        type: "keyUp",
        keyCode,
        modifiers: ["control"],
      });
    },
    { url: page.url(), keyCode },
  );
}
async function newTask(name: string) {
  await shell.getByRole("button", { name: "New task", exact: true }).click();
  await shell.getByLabel("Task name", { exact: true }).fill(name);
  await shell.getByRole("button", { name: "Create task", exact: true }).click();
}
async function navigate(url: string) {
  await shell.getByRole("textbox", { name: "Address or search" }).fill(url);
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .press("Enter");
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((page) => page.url() === url),
    )
    .toBe(true);
  return app
    .context()
    .pages()
    .find((page) => page.url() === url)!;
}
test("a real website form stays live when switching tasks", async () => {
  await newTask("Submit expenses");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("138.50");
  await newTask("Plan a trip");
  await shell
    .getByRole("button", { name: "Select task Submit expenses", exact: true })
    .click();
  await expect(website.getByLabel("Amount")).toHaveValue("138.50");
  await website.getByRole("button", { name: "Check isolation" }).click();
  await expect(website.locator("output")).toHaveText("undefined/undefined");
});
test("a renderer crash becomes a reference to reopen, not a live page", async () => {
  await newTask("Recover a page");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("Unsaved value");
  await app.evaluate(
    ({ webContents }, url) =>
      webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === url)!
        .forcefullyCrashRenderer(),
    origin + "/",
  );
  await expect(
    shell.getByText("This page stopped unexpectedly. Reopen it to continue.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    shell
      .getByRole("button", { name: "Select page Expense claim" })
      .getByTitle("Live page"),
  ).toHaveCount(0);
  await shell.getByRole("button", { name: "Reopen page", exact: true }).click();
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((page) => page.url() === origin + "/" && !page.isClosed()),
    )
    .toBe(true);
  const reopened = app
    .context()
    .pages()
    .find((page) => page.url() === origin + "/" && !page.isClosed())!;
  await expect(reopened.getByLabel("Amount")).toHaveValue("");
  await expect(
    shell
      .getByRole("button", { name: "Select page Expense claim" })
      .getByTitle("Live page"),
  ).toBeVisible();
});
test("pause keeps a live form and restart offers its saved reference and note", async () => {
  await newTask("Claim travel");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("204");
  await shell.getByRole("button", { name: "Put aside", exact: true }).click();
  await shell
    .getByLabel("Where I left off")
    .fill("Check the taxi receipt before submitting.");
  await shell
    .getByRole("button", { name: "Put aside task", exact: true })
    .click();
  await expect(shell.getByLabel("Next step", { exact: true })).toHaveValue(
    "Check the taxi receipt before submitting.",
  );
  await shell.getByRole("button", { name: "Later tasks", exact: true }).click();
  await shell.getByRole("button", { name: "Resume task", exact: true }).click();
  await expect(website.getByLabel("Amount")).toHaveValue("204");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  await launch();
  await expect(shell.getByLabel("Next step", { exact: true })).toHaveValue(
    "Check the taxi receipt before submitting.",
  );
  await expect(
    shell.getByRole("heading", { name: "Reopen this reference" }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Reopen page", exact: true }).click();
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((page) => page.url() === origin + "/"),
    )
    .toBe(true);
  const reopened = app
    .context()
    .pages()
    .find((page) => page.url() === origin + "/")!;
  await expect(reopened.getByLabel("Amount")).toHaveValue("");
});
test("history, new-window links and canceled reload or close preserve user control", async () => {
  await newTask("Research");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("91");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 0;
  });
  await shell.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(website.getByLabel("Amount")).toHaveValue("91");
  await shell
    .getByRole("button", { name: "Close current page", exact: true })
    .click();
  await expect(website.getByLabel("Amount")).toHaveValue("91");
  await website.getByRole("link", { name: "Next page", exact: true }).click();
  await expect(
    website.getByRole("heading", { name: "Second page" }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    website.getByRole("heading", { name: "Expense claim" }),
  ).toBeVisible();
  await website
    .getByRole("link", { name: "Open reference", exact: true })
    .click();
  await expect(
    shell.getByRole("button", { name: "Select page Second page", exact: true }),
  ).toBeVisible();
  await expect(
    shell.locator('.pages button[aria-label^="Select page "]'),
  ).toHaveCount(2);
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .fill("file:///etc/passwd");
  await shell
    .getByRole("textbox", { name: "Address or search" })
    .press("Enter");
  await expect(shell.getByRole("alert")).toContainText("Only HTTP and HTTPS");
});
test("website unload veto can cancel closing after the browser confirmation", async () => {
  await newTask("Guarded work");
  const website = await navigate(origin + "/guarded");
  website.on("dialog", () => {}); // Let the app's native unload decision handle the dialog.
  await website.getByLabel("Draft").fill("Keep this draft");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = (_window, options) =>
      options.message === "Close this page?" ? 1 : 0;
  });
  await shell
    .getByRole("button", { name: "Close current page", exact: true })
    .click();
  await expect(website.getByLabel("Draft")).toHaveValue("Keep this draft");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await shell
    .getByRole("button", { name: "Close current page", exact: true })
    .click();
  await expect(
    shell.locator('.pages button[aria-label^="Select page "]'),
  ).toHaveCount(0);
});
test("settling keeps live pages, permissions are denied, and guest keyboard shortcuts reach the shell", async () => {
  await newTask("Review permissions");
  const website = await navigate(origin + "/permission");
  await website.getByRole("button", { name: "Request notifications" }).click();
  await expect(website.locator("output")).toHaveText("denied");
  await expect(shell.getByRole("alert")).toContainText(
    "permissions are disabled",
  );
  await nativeShortcut(website, "L");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toBeFocused();
  await shell.getByRole("button", { name: "Settle", exact: true }).click();
  await shell.getByRole("button", { name: "Settle task", exact: true }).click();
  await shell
    .getByRole("button", { name: "Settled tasks", exact: true })
    .click();
  await expect(
    shell.getByRole("button", { name: "Resume task", exact: true }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Resume task", exact: true }).click();
  await expect(website.locator("output")).toHaveText("denied");
});

test("downloads show cancellation and completion without opening files", async () => {
  await newTask("Download a receipt");
  const website = await navigate(origin + "/");
  await app.evaluate(({ dialog }) => {
    dialog.showSaveDialogSync = () => undefined;
  });
  await website.getByRole("link", { name: "Download receipt" }).click();
  await shell.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(shell.getByText("Canceled", { exact: true })).toBeVisible();
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  await app.evaluate(
    ({ dialog }, path) => {
      dialog.showSaveDialogSync = () => path;
    },
    join(profile, "receipt.txt"),
  );
  await website.getByRole("link", { name: "Download receipt" }).click();
  await shell.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(shell.getByText("Completed", { exact: true })).toBeVisible();
});
test("keyboard dialogs, find, resizing and canceled quit keep the live page usable", async () => {
  await newTask("Check the travel claim");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("318.20");
  await nativeShortcut(website, "F");
  await expect(
    shell.getByRole("textbox", { name: "Find on page" }),
  ).toBeFocused();
  await shell.getByRole("textbox", { name: "Find on page" }).fill("Expense");
  await shell.getByRole("button", { name: "Close find" }).click();
  await shell.getByRole("button", { name: "Put aside", exact: true }).click();
  await shell
    .getByLabel("Where I left off")
    .fill("Confirm the final amount with the receipt.");
  await shell.getByLabel("Where I left off").press("Escape");
  await expect(shell.getByRole("dialog")).not.toBeVisible();
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
  await app.evaluate(({ BrowserWindow, dialog }) => {
    dialog.showMessageBoxSync = () => 0;
    BrowserWindow.getAllWindows()[0].close();
  });
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
  await shell.setViewportSize({ width: 1488, height: 900 });
  await shell.screenshot({ path: "../design/qa/desktop-shell-wide.png" });
  const capture = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage())
      .toPNG()
      .toString("base64"),
  );
  await writeFile(
    "../design/qa/desktop-window-wide.png",
    Buffer.from(capture, "base64"),
  );
  await shell.getByRole("button", { name: "Put aside", exact: true }).click();
  await shell
    .getByLabel("Where I left off")
    .fill("Confirm the final amount with the receipt.");
  await shell.screenshot({ path: "../design/qa/desktop-pause.png" });
  await shell
    .getByRole("button", { name: "Put aside task", exact: true })
    .click();
  await shell.setViewportSize({ width: 900, height: 700 });
  await expect(shell.locator(".sidebar")).toHaveCSS("width", "230px");
  await shell.screenshot({ path: "../design/qa/desktop-shell-narrow.png" });
  await shell.getByRole("button", { name: "Close task notes" }).click();
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
});

test("dragging tasks between collapsed groups retains live edits and persists the move", async () => {
  await newTask("Move this work");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("712");
  const taskButton = () =>
    shell.getByRole("button", {
      name: "Select task Move this work",
      exact: true,
    });
  const later = () =>
    shell.getByRole("button", { name: "Later tasks", exact: true });
  const settled = shell.getByRole("button", {
    name: "Settled tasks",
    exact: true,
  });
  await expect(later()).toHaveAttribute("aria-expanded", "false");
  await taskButton().dragTo(later());
  await expect(taskButton()).not.toBeVisible();
  await later().click();
  await expect(
    shell
      .getByRole("region", { name: "Later tasks", exact: true })
      .getByRole("button", { name: "Select task Move this work" }),
  ).toBeVisible();
  await taskButton().dragTo(settled);
  await settled.click();
  await expect(website.getByLabel("Amount")).toHaveValue("712");
  await taskButton().dragTo(
    shell.getByRole("region", { name: "Active tasks", exact: true }),
  );
  await expect(
    shell
      .getByRole("region", { name: "Active tasks", exact: true })
      .getByRole("button", { name: "Select task Move this work" }),
  ).toBeVisible();
  await expect(website.getByLabel("Amount")).toHaveValue("712");
  await taskButton().dragTo(later());
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  await launch();
  await expect(later()).toHaveAttribute("aria-expanded", "false");
  await later().click();
  await expect(
    shell
      .getByRole("region", { name: "Later tasks", exact: true })
      .getByRole("button", { name: "Select task Move this work" }),
  ).toBeVisible();
});

async function altInput(
  page: Page,
  keyCode: string,
  type: "keyDown" | "keyUp" = "keyDown",
) {
  await app.evaluate(
    ({ webContents }, { url, keyCode, type }) => {
      const contents = webContents
        .getAllWebContents()
        .find((item) => item.getURL() === url)!;
      contents.focus();
      contents.sendInputEvent({
        type,
        keyCode,
        modifiers: type === "keyUp" && keyCode === "Alt" ? [] : ["alt"],
      });
    },
    { url: page.url(), keyCode, type },
  );
}

test("Alt hints switch tasks and tabs from websites and reveal a collapsed task", async () => {
  await newTask("First task");
  const first = await navigate(origin + "/");
  await first.getByLabel("Amount").fill("42");
  await shell.getByRole("button", { name: "New page", exact: true }).click();
  const second = await navigate(origin + "/second");
  await altInput(second, "Alt");
  await expect(shell.locator("kbd")).toHaveText(["A", "1", "2"]);
  await altInput(second, "1");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(origin + "/");
  await altInput(shell, "Alt", "keyUp");
  await expect(shell.locator("kbd")).toHaveCount(0);
  await expect(first.getByLabel("Amount")).toHaveValue("42");
  await newTask("Second task");
  await shell.getByLabel("Task status", { exact: true }).selectOption("Later");
  await expect(
    shell.getByRole("button", { name: "Select task Second task" }),
  ).not.toBeVisible();
  await altInput(shell, "A");
  await expect(
    shell.getByRole("button", { name: "Select task First task" }),
  ).toHaveAttribute("aria-current", "true");
  await altInput(first, "B");
  await expect(
    shell.getByRole("button", { name: "Later tasks", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(
    shell.getByRole("button", { name: "Select task Second task" }),
  ).toHaveAttribute("aria-current", "true");
  await altInput(shell, "Alt", "keyUp");
  await shell.getByRole("button", { name: "Rename task" }).click();
  await altInput(shell, "A");
  await expect(shell.getByLabel("Task name", { exact: true })).toHaveValue(
    "Second task",
  );
  await shell.getByRole("button", { name: "Cancel", exact: true }).click();
  await altInput(shell, "Alt", "keyUp");
});

test("the shell follows theme changes while the address bar stays dark and context starts closed", async () => {
  await app.close();
  const themeDirectory = join(profile, "system-theme");
  await mkdir(join(themeDirectory, "theme"), { recursive: true });
  const palette = (background: string) =>
    `background = "${background}"\nforeground = "#e0e4e7"\naccent = "#a4c4b5"\n`;
  await writeFile(
    join(themeDirectory, "theme/colors.toml"),
    palette("#181b1e"),
  );
  await writeFile(join(themeDirectory, "theme.name"), "Sample theme");
  // Launch directly to observe the default state before the common harness opens context.
  app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TRAILREST_PROFILE: profile,
      TRAILREST_THEME_DIR: themeDirectory,
    },
    chromiumSandbox: true,
  });
  shell = await app.firstWindow();
  await expect(
    shell.getByRole("heading", { name: "Task notes", exact: true }),
  ).not.toBeVisible();
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(shell.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(shell.getByText(/Theme: Sample theme/)).toBeVisible();
  await shell
    .getByRole("button", { name: "Back to browsing", exact: true })
    .click();
  await expect(shell.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(24, 27, 30)",
  );
  await writeFile(
    join(themeDirectory, "theme/colors.toml"),
    palette("#eeeedd"),
  );
  await expect(shell.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(238, 238, 221)",
  );
  await expect(shell.locator(".toolbar form")).toHaveCSS(
    "background-color",
    "rgb(16, 19, 21)",
  );
  const top = await shell.locator(".website").boundingBox();
  expect(top?.y).toBeCloseTo(56, 1);
  await writeFile(
    join(themeDirectory, "theme/colors.toml"),
    'background = "url(file:///bad)"',
  );
  await expect(shell.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(24, 27, 30)",
  );
});

test("the extensions button loads, remembers and removes an unpacked content script", async () => {
  const extensionPath = join(profile, "sample-extension");
  await mkdir(extensionPath);
  await writeFile(
    join(extensionPath, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Sample extension",
      version: "1.0",
      content_scripts: [
        { matches: ["http://127.0.0.1/*"], js: ["content.js"] },
      ],
    }),
  );
  await writeFile(
    join(extensionPath, "content.js"),
    'const p = document.createElement("p"); p.textContent = "Extension active"; document.body.append(p);',
  );
  await newTask("Extension check");
  await shell.getByRole("button", { name: "Extensions", exact: true }).click();
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await shell
    .getByRole("button", { name: "Load unpacked", exact: true })
    .click();
  await expect(shell.getByText("No extensions loaded.")).toBeVisible();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, profile);
  await shell
    .getByRole("button", { name: "Load unpacked", exact: true })
    .click();
  await expect(shell.getByRole("dialog").getByRole("alert")).toContainText(
    /manifest/i,
  );
  await expect(shell.getByText("No extensions loaded.")).toBeVisible();
  await app.evaluate(({ dialog }, extensionPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [extensionPath],
    });
  }, extensionPath);
  await shell
    .getByRole("button", { name: "Load unpacked", exact: true })
    .click();
  await expect(
    shell.getByRole("button", { name: "Remove Sample extension" }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  const website = await navigate(origin + "/");
  await expect(
    website.getByText("Extension active", { exact: true }),
  ).toBeVisible();
  await website.getByRole("button", { name: "Check isolation" }).click();
  await expect(website.locator("output")).toHaveText("undefined/undefined");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  await launch();
  await shell.getByRole("button", { name: "Reopen page", exact: true }).click();
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((page) => page.url() === origin + "/"),
    )
    .toBe(true);
  const restored = app
    .context()
    .pages()
    .find((page) => page.url() === origin + "/")!;
  await expect(
    restored.getByText("Extension active", { exact: true }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Extensions", exact: true }).click();
  await shell.getByRole("button", { name: "Remove Sample extension" }).click();
  await expect(shell.getByText("No extensions loaded.")).toBeVisible();
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await shell.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(
    restored.getByText("Extension active", { exact: true }),
  ).not.toBeVisible();
});

test("browser settings persist and change search, zoom, downloads and sidebar", async () => {
  await newTask("Settings check");
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.getByLabel("Default search engine").selectOption("google");
  await shell.getByLabel("Default page zoom").selectOption("1.25");
  await shell.getByLabel("Hide the address bar while scrolling down").uncheck();
  const destination = join(profile, "saved-downloads");
  await mkdir(destination);
  await app.evaluate(({ dialog }, destination) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [destination],
    });
  }, destination);
  await shell.getByRole("button", { name: "Change download folder" }).click();
  await expect(shell.getByText(destination, { exact: true })).toBeVisible();
  await shell.getByLabel("Ask where to save each file").uncheck();
  await shell.getByRole("button", { name: "Back to browsing" }).click();
  await shell.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(shell.locator(".sidebar")).toHaveCSS("width", "52px");
  await app.close();
  await launch();
  await expect(
    shell.getByRole("button", { name: "Expand sidebar" }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(shell.getByLabel("Default search engine")).toHaveValue("google");
  await expect(shell.getByLabel("Default page zoom")).toHaveValue("1.25");
  await expect(
    shell.getByLabel("Hide the address bar while scrolling down"),
  ).not.toBeChecked();
  await expect(
    shell.getByLabel("Ask where to save each file"),
  ).not.toBeChecked();
  await shell.getByRole("button", { name: "Back to browsing" }).click();
  await app.context().route("https://www.google.com/search?*", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Controlled Google search</title><h1>Search fixture</h1>",
    }),
  );
  const address = shell.getByRole("textbox", { name: "Address or search" });
  await address.fill("trailrest sample query");
  await address.press("Enter");
  await expect(address).toHaveValue(
    "https://www.google.com/search?q=trailrest%20sample%20query",
  );
  const website = await navigate(origin + "/");
  await website.getByRole("link", { name: "Download receipt" }).click();
  await shell.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(shell.getByText("Completed", { exact: true })).toBeVisible();
});

test("scrolling hides the toolbar, scrolling up and Ctrl+L reveal it", async () => {
  await newTask("Read a long page");
  const website = await navigate(origin + "/scroll");
  await website.getByRole("button", { name: "Focus page" }).click();
  await website.mouse.wheel(0, 700);
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).not.toBeVisible();
  await expect(
    shell.getByRole("button", { name: "Show address bar" }),
  ).toBeVisible();
  await website.mouse.wheel(0, -250);
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toBeVisible();
  await website.mouse.wheel(0, 400);
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).not.toBeVisible();
  await nativeShortcut(website, "L");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toBeFocused();
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.getByLabel("Hide the address bar while scrolling down").uncheck();
  await shell.getByRole("button", { name: "Back to browsing" }).click();
  await website.getByRole("button", { name: "Focus page" }).click();
  await website.mouse.wheel(0, 700);
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toBeVisible();
});

test("task notes edit independently, keep oversized drafts and restore after restart", async () => {
  await newTask("Editable notes");
  await shell.getByLabel("Next step", { exact: true }).fill("x".repeat(550));
  await expect(shell.getByRole("button", { name: "Save note" })).toBeDisabled();
  await expect(shell.getByLabel("Next step", { exact: true })).toHaveValue(
    "x".repeat(550),
  );
  await shell
    .getByLabel("Next step", { exact: true })
    .fill("Call the supplier, then compare quotes.");
  await shell.getByRole("button", { name: "Save note" }).click();
  await expect(shell.getByRole("status")).toHaveText("Note saved");
  await expect(shell.getByLabel("Task status", { exact: true })).toHaveValue(
    "Active",
  );
  await shell.getByRole("button", { name: "Close task notes" }).click();
  await shell.getByRole("button", { name: "Toggle task notes" }).click();
  await expect(shell.getByLabel("Next step", { exact: true })).toHaveValue(
    "Call the supplier, then compare quotes.",
  );
  await app.close();
  await launch();
  await expect(shell.getByLabel("Next step", { exact: true })).toHaveValue(
    "Call the supplier, then compare quotes.",
  );
});

test("ZIP and CRX package imports load a sample extension and reject unsafe paths", async () => {
  const zip = new AdmZip();
  zip.addFile(
    "manifest.json",
    Buffer.from(
      JSON.stringify({
        manifest_version: 3,
        name: "Packaged sample",
        version: "1.0",
        content_scripts: [
          { matches: ["http://127.0.0.1/*"], js: ["content.js"] },
        ],
      }),
    ),
  );
  zip.addFile(
    "content.js",
    Buffer.from(
      'const p = document.createElement("p"); p.textContent = "Package extension active"; document.body.append(p);',
    ),
  );
  const zipPath = join(profile, "sample.zip");
  await writeFile(zipPath, zip.toBuffer());
  await newTask("Package check");
  await shell.getByRole("button", { name: "Extensions", exact: true }).click();
  const choose = async (path: string) =>
    app.evaluate(({ dialog }, path) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [path],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    }, path);
  await choose(zipPath);
  await shell
    .getByRole("button", { name: "Import package", exact: true })
    .click();
  await expect(
    shell.getByRole("button", { name: "Remove Packaged sample" }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  const website = await navigate(origin + "/");
  await expect(
    website.getByText("Package extension active", { exact: true }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Extensions", exact: true }).click();
  await shell.getByRole("button", { name: "Remove Packaged sample" }).click();
  const crxHeader = Buffer.alloc(12);
  crxHeader.write("Cr24");
  crxHeader.writeUInt32LE(3, 4);
  const crxPath = join(profile, "sample.crx");
  await writeFile(crxPath, Buffer.concat([crxHeader, zip.toBuffer()]));
  await choose(crxPath);
  await shell
    .getByRole("button", { name: "Import package", exact: true })
    .click();
  await expect(
    shell.getByRole("button", { name: "Remove Packaged sample" }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Remove Packaged sample" }).click();
  zip.getEntry("content.js")!.entryName = "../escaped.js";
  const unsafe = join(profile, "unsafe.zip");
  await writeFile(unsafe, zip.toBuffer());
  await choose(unsafe);
  await shell
    .getByRole("button", { name: "Import package", exact: true })
    .click();
  await expect(shell.getByRole("dialog").getByRole("alert")).toContainText(
    "unsafe",
  );
  await expect(shell.getByText("No extensions loaded.")).toBeVisible();
});

test("Store links download a package through the UI and invalid links are rejected", async () => {
  const destination = join(profile, "downloaded.crx");
  await app.evaluate(
    ({ session, dialog }, { destination, origin }) => {
      session.defaultSession.webRequest.onBeforeRequest(
        { urls: ["https://clients2.google.com/service/update2/crx*"] },
        (_details, callback) =>
          callback({ redirectURL: origin + "/extension.crx" }),
      );
      dialog.showSaveDialog = async () => ({
        canceled: false,
        filePath: destination,
      });
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [destination],
      });
      dialog.showMessageBox = async () => ({
        response: 1,
        checkboxChecked: false,
      });
    },
    { destination, origin },
  );
  await shell.getByRole("button", { name: "Extensions", exact: true }).click();
  const input = shell.getByLabel("Chrome Web Store link or extension ID");
  await input.fill("https://example.com/not-an-extension");
  await shell
    .getByRole("button", { name: "Download package", exact: true })
    .click();
  await expect(shell.getByRole("dialog").getByRole("alert")).toContainText(
    "Chrome Web Store",
  );
  await input.fill(
    "https://chromewebstore.google.com/detail/sample/" + "a".repeat(32),
  );
  await shell
    .getByRole("button", { name: "Download package", exact: true })
    .click();
  await expect(shell.getByRole("dialog").getByRole("status")).toContainText(
    "Extension package downloaded",
  );
  await shell
    .getByRole("button", { name: "Import package", exact: true })
    .click();
  await expect(
    shell.getByRole("button", {
      name: "Remove Downloaded sample",
      exact: true,
    }),
  ).toBeVisible();
});
