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
    shell.getByRole("heading", { name: "Keep a long reference", exact: true }),
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
    shell.getByRole("heading", { name: "Fresh work", exact: true }),
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
async function launch() {
  app = await electron.launch({
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TRAILREST_PROFILE: profile,
    },
    chromiumSandbox: true,
  });
  app.process().stderr?.on("data", (chunk) => {
    if (String(chunk).includes("Error")) console.error(String(chunk));
  });
  shell = await app.firstWindow();
  await shell.waitForLoadState();
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
  await expect(
    shell.getByText("Check the taxi receipt before submitting.", {
      exact: true,
    }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Resume task", exact: true }).click();
  await expect(website.getByLabel("Amount")).toHaveValue("204");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
  await launch();
  await expect(
    shell.getByText("Check the taxi receipt before submitting.", {
      exact: true,
    }),
  ).toBeVisible();
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
    shell.getByRole("heading", { name: "2 pages in this task" }),
  ).toBeVisible();
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
    shell.getByRole("heading", { name: "0 pages in this task" }),
  ).toBeVisible();
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
  await expect(shell.getByText("Canceled", { exact: true })).toBeVisible();
  await app.evaluate(
    ({ dialog }, path) => {
      dialog.showSaveDialogSync = () => path;
    },
    join(profile, "receipt.txt"),
  );
  await website.getByRole("link", { name: "Download receipt" }).click();
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
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(1488, 900),
  );
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
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setContentSize(900, 700),
  );
  await shell.screenshot({ path: "../design/qa/desktop-shell-narrow.png" });
  await shell.getByRole("button", { name: "Close task context" }).click();
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
});
