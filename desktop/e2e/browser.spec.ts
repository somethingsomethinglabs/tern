import AdmZip from "adm-zip";
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import {
  mkdtemp,
  rm,
  mkdir,
  writeFile,
  readdir,
  readFile,
} from "node:fs/promises";
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
    if (/^\/tabs\/\d$/.test(req.url ?? "")) {
      res.end(`<title>Tab ${req.url!.slice(-1)}</title><input aria-label="Draft">`);
      return;
    }
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
      `<html><title>${req.url === "/second" ? "Second page" : "Expense claim"}</title><body><h1>${req.url === "/second" ? "Second page" : "Expense claim"}</h1><label>Amount <input aria-label="Amount" /></label><a href="/second">Next page</a><a href="/second" target="_blank">Open reference</a><a href="/download">Download receipt</a><button onclick="document.querySelector('output').textContent = typeof window.tern + '/' + typeof require">Check isolation</button><output></output></body></html>`,
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
    ...(process.env.TERN_EXECUTABLE
      ? { executablePath: process.env.TERN_EXECUTABLE }
      : {}),
    args: [".", "--use-fake-device-for-media-stream"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TERN_PROFILE: profile,
      ...(themeDirectory ? { TERN_THEME_DIR: themeDirectory } : {}),
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
  profile = await mkdtemp(join(tmpdir(), "tern-test-"));
  await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "", searchView: "external" }));
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
async function nativeShortcut(
  page: Page,
  keyCode: string,
  modifiers: string[] = ["control"],
) {
  await app.evaluate(
    ({ webContents }, { url, keyCode, modifiers }) => {
      const contents = webContents
        .getAllWebContents()
        .find((item) => item.getURL() === url)!;
      contents.focus();
      contents.sendInputEvent({
        type: "keyDown",
        keyCode,
        modifiers,
      });
      contents.sendInputEvent({
        type: "keyUp",
        keyCode,
        modifiers,
      });
    },
    { url: page.url(), keyCode, modifiers },
  );
}
async function newTask(name: string) {
  const input = shell.getByRole("textbox", { name: "New task", exact: true });
  if (!await input.isVisible()) await shell.getByRole("button", { name: "New task", exact: true }).click();
  await shell
    .getByRole("textbox", { name: "New task", exact: true })
    .fill(name);
  await shell
    .getByRole("textbox", { name: "New task", exact: true })
    .press("Enter");
  await expect(shell.getByRole("dialog")).not.toBeVisible();
  await expect(
    shell.getByRole("button", { name: `Select task ${name}`, exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue("");
}
test("tasks are created inline and travel from the input into the list", async () => {
  const input = shell.getByRole("textbox", { name: "New task", exact: true });
  await shell.getByRole("button", { name: "Create your first task" }).click();
  await expect(shell.getByRole("heading", { name: "What do you need to do?", exact: true })).toBeVisible();
  await shell.getByRole("button", { name: "Cancel", exact: true }).click();
  await shell.getByRole("button", { name: "New task", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(shell.locator("#new-task-hint")).toBeVisible();
  await expect(shell.getByRole("dialog")).not.toBeVisible();
  await input.fill("   ");
  await input.press("Enter");
  await expect(shell.locator("[data-task-id]")).toHaveCount(0);
  await input.fill("Cancelled draft");
  await input.press("Escape");
  await expect(input).toBeHidden();
  await expect(shell.getByRole("button", { name: "New task", exact: true })).toBeFocused();
  await expect(shell.locator("#new-task-hint")).not.toBeVisible();
  await shell.getByRole("button", { name: "New task", exact: true }).click();
  await expect(input).toHaveValue("");

  await newTask("First task");
  await expect(shell.locator(".task-arrival")).toHaveCount(0);
  await shell.getByLabel("Search tasks and pages").fill("No matching task");
  await input.fill("Second task");
  await shell.screenshot({ path: "../design/qa/desktop-new-task-input.png" });
  // Hold the real animation at its origin to inspect both ends without timing races.
  await shell.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector(".task-arrival")) return;
      for (const animation of document.getAnimations()) {
        animation.pause();
        animation.currentTime = 0;
      }
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true });
  });
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await input.press("Enter");
  await expect(shell.locator("[data-task-id]")).toHaveCount(2);
  await expect(shell.getByLabel("Search tasks and pages")).toHaveValue("");
  const origin = await shell.locator(".new-task").boundingBox();
  const flight = await shell.locator(".task-arrival").boundingBox();
  const destination = await shell
    .locator(".task.selected[data-task-id]")
    .boundingBox();
  expect(flight!.y).toBeCloseTo(origin!.y, 0);
  expect(destination!.y).toBeGreaterThan(origin!.y + origin!.height);
  await shell.evaluate(() => {
    for (const animation of document.getAnimations())
      animation.currentTime = 160;
  });
  const midway = await shell.locator(".task-arrival").boundingBox();
  expect(midway!.y).toBeGreaterThan(origin!.y);
  expect(midway!.y).toBeLessThan(destination!.y);
  await shell.screenshot({
    path: "../design/qa/desktop-new-task-arriving.png",
  });
  await shell.evaluate(() => {
    for (const animation of document.getAnimations()) animation.finish();
  });
  await expect(shell.locator(".task-arrival")).toHaveCount(0);
  await expect(
    shell.getByRole("button", { name: "Select task Second task" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(input).toBeFocused();

  await shell.emulateMedia({ reducedMotion: "reduce" });
  await newTask("Third task");
  await expect(shell.locator(".task-arrival")).toHaveCount(0);
  await shell.screenshot({ path: "../design/qa/desktop-new-task-created.png" });
});
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
  // Terminate only this isolated fixture renderer. forcefullyCrashRenderer()
  // did not terminate it under the current Electron/CDP test session.
  await app.evaluate(({ webContents }, url) => {
    const contents = webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === url)!;
    const pid = contents.getOSProcessId();
    if (pid <= 0 || pid === process.pid)
      throw new Error("Invalid fixture renderer process.");
    process.kill(pid, "SIGKILL");
  }, origin + "/");
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
test("canvas drawing and clipboard writing are enabled by default while clipboard reading requires consent", async () => {
  await newTask("Browser defaults");
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
  const website = await navigate(origin + "/permission");
  const defaults = await website.evaluate(async () => {
    const context = document.createElement("canvas").getContext("2d")!;
    const write = await navigator.permissions.query({ name: "clipboard-write" as PermissionName });
    const read = await navigator.permissions.query({ name: "clipboard-read" as PermissionName });
    let readResult = "allowed";
    try {
      await navigator.clipboard.readText();
    } catch (error) {
      readResult = (error as DOMException).name;
    }
    return {
      canvas: !!context,
      write: write.state,
      read: read.state,
      readResult,
    };
  });
  expect(defaults).toEqual({
    canvas: true,
    write: "granted",
    read: "denied",
    readResult: "NotAllowedError",
  });
});

test("notifications are denied and guest keyboard shortcuts reach the shell", async () => {
  await newTask("Review permissions");
  const website = await navigate(origin + "/permission");
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
  await website.getByRole("button", { name: "Request notifications" }).click();
  await expect(website.locator("output")).toHaveText("denied");
  await expect(shell.getByRole("alert")).toContainText(
    "Permission denied",
  );
  await nativeShortcut(website, "L");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toBeFocused();
});

test("notification approval uses an origin-labelled native prompt with deny defaults", async () => {
  await newTask("Approve a website permission");
  const website = await navigate(origin + "/permission");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = (_window, options) => {
      (globalThis as any).permissionPrompt = options;
      return 1;
    };
  });
  await website.getByRole("button", { name: "Request notifications" }).click();
  await expect(website.locator("output")).toHaveText("granted");
  const prompt = await app.evaluate(() => (globalThis as any).permissionPrompt);
  expect(prompt.message).toContain(origin);
  expect(prompt.buttons).toEqual(["Deny", "Allow once"]);
  expect(prompt.defaultId).toBe(0);
  expect(prompt.cancelId).toBe(0);
});

test("operating system links open a new page and reject non-web schemes", async () => {
  await newTask("External links");
  const original = await navigate(origin + "/");
  await original.getByLabel("Amount").fill("Keep this form");
  await app.evaluate(({app}, url) => { app.emit("second-instance", {}, ["Tern", "javascript:alert(1)", url], "/tmp"); }, origin + "/second");
  await expect(shell.getByRole("button", {name:"Select page Second page",exact:true})).toBeVisible();
  expect(await original.getByLabel("Amount").inputValue()).toBe("Keep this form");
  const snapshot = await shell.evaluate(() => (window as any).tern.snapshot());
  expect(snapshot.pages).toHaveLength(2);
});

test("camera consent is visible and revocation closes a page that vetoes unloading", async () => {
  await newTask("Camera permissions");
  const website = await navigate(origin + "/permission");
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  const state = await website.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({video:true});
    (window as any).testStream = stream;
    window.addEventListener("beforeunload", event => { event.preventDefault(); event.returnValue = ""; });
    return stream.getVideoTracks()[0].readyState;
  });
  expect(state).toBe("live");
  await shell.getByRole("button", {name:"Camera or microphone allowed",exact:true}).click();
  await shell.getByRole("button", {name:"Revoke access and reload",exact:true}).click();
  await expect.poll(() => website.isClosed()).toBe(true);
  await expect(shell.getByRole("button", {name:"Camera or microphone allowed",exact:true})).toHaveCount(0);
});

test("site permissions can be blocked, survive restart and prevent repeat prompts", async () => {
  await newTask("Site permissions");
  const website = await navigate(origin + "/permission");
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await shell.getByRole("button", { name: "Site information", exact: true }).click();
  await shell.getByLabel("Notifications", { exact: true }).selectOption("block");
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  const current = app.context().pages().find(page => page.url() === origin + "/permission")!;
  await current.getByRole("button", { name: "Request notifications" }).click();
  await expect(current.locator("output")).toHaveText("denied");
  const state = await shell.evaluate(() => (window as any).tern.snapshot());
  expect(state.siteInfo.permissions.find((permission: any) => permission.name === "notifications").state).toBe("blocked");
  expect(JSON.parse(await readFile(join(profile, "site-permissions.json"), "utf8"))).toEqual([[origin, ["notifications"]]]);
});

test("automatic popups are blocked and can be reopened as ordinary pages", async () => {
  await newTask("Popup policy");
  const website = await navigate(origin + "/windows");
  await website.evaluate(() => window.open("/popup"));
  await expect(shell.getByRole("button", { name: "Popup blocked", exact: true })).toBeVisible();
  await shell.getByRole("button", { name: "Popup blocked", exact: true }).click();
  await shell.getByRole("button", { name: "Open blocked page", exact: true }).click();
  await expect(shell.getByRole("button", { name: "Select page Script popup" })).toBeVisible();
});

test("PDF saving uses a destination prompt and writes a real PDF", async () => {
  await newTask("Print tools");
  await navigate(origin + "/");
  const path = join(profile, "saved-page.pdf");
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialogSync = () => path; }, path);
  await shell.getByRole("button", { name: "Site information", exact: true }).click();
  await shell.getByRole("button", { name: "Save as PDF", exact: true }).click();
  await expect(shell.getByRole("alert")).toContainText("PDF saved");
  expect((await readFile(path)).subarray(0, 5).toString()).toBe("%PDF-");
});

for (const action of ["button", "menu", "status", "drag"] as const) {
  test(`settling via ${action} unloads every owned tab and keeps references`, async () => {
    await newTask("Other work");
    const other = await navigate(origin + "/other");
    await other.getByLabel("Amount").fill("Keep this draft");
    await newTask("Finished work");
    const first = await navigate(origin + "/");
    await first.getByRole("link", { name: "Open reference", exact: true }).click();
    await expect.poll(() => app.context().pages().some(page => page.url() === origin + "/second")).toBe(true);
    const second = app.context().pages().find(page => page.url() === origin + "/second")!;
    await expect(second.getByRole("heading", { name: "Second page" })).toBeVisible();
    const task = shell.getByRole("button", { name: "Select task Finished work", exact: true });
    if (action === "button") {
      await shell.getByRole("button", { name: "Settle", exact: true }).click();
    } else if (action === "menu") {
      await shell.getByRole("button", { name: "Select task Other work", exact: true }).click();
      await task.click({ button: "right" });
      await shell.getByRole("menuitem", { name: "Settle task", exact: true }).click();
    } else if (action === "status") {
      await shell.getByLabel("Task status", { exact: true }).selectOption("Settled");
    } else {
      await task.dragTo(shell.getByRole("button", { name: "Settled tasks", exact: true }));
    }
    await expect(shell.getByRole("dialog")).toContainText("Unsaved website changes cannot be restored");
    expect(first.isClosed()).toBe(false);
    expect(second.isClosed()).toBe(false);
    await shell.getByRole("button", { name: "Settle anyway", exact: true }).click();
    await expect.poll(() => [first.isClosed(), second.isClosed()]).toEqual([true, true]);
    await expect(other.getByLabel("Amount")).toHaveValue("Keep this draft");
    await expect(shell.getByRole("button", { name: "Settled tasks", exact: true })).toHaveAttribute("aria-expanded", "true");
    await task.click();
    await expect(shell.getByRole("button", { name: "Select page Expense claim", exact: true })).toBeVisible();
    await expect(shell.getByRole("button", { name: "Select page Second page", exact: true })).toBeVisible();
    await expect(shell.getByRole("heading", { name: "Reopen this reference" })).toBeVisible();
    await shell.getByRole("button", { name: "Resume task", exact: true }).click();
    await expect.poll(() => app.context().pages().some(page => page.url() === origin + "/second")).toBe(true);
    const reopened = app.context().pages().find(page => page.url() === origin + "/second")!;
    await expect(reopened.getByRole("heading", { name: "Second page" })).toBeVisible();
    expect(first.isClosed()).toBe(true);
  });
}

async function snapshotFolder() {
  const destination = join(profile, "snapshots");
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await app.evaluate(({ dialog }, destination) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [destination],
    });
    dialog.showSaveDialogSync = () => {
      throw new Error("Snapshots should save directly");
    };
  }, destination);
  await shell.getByRole("button", { name: "Change download folder" }).click();
  await expect(shell.getByText(destination, { exact: true })).toBeVisible();
  await shell.getByLabel("Hide the address bar while scrolling down").uncheck();
  await shell.getByRole("button", { name: "Back to browsing" }).click();
  return destination;
}

test("snapshot captures the visible website as a PNG and confirms the saved file", async () => {
  const camera = shell.getByRole("button", {
    name: "Take snapshot",
    exact: true,
  });
  await expect(camera).toBeDisabled();
  const destination = await snapshotFolder();
  await newTask("Snapshot check");
  const website = await navigate(origin + "/scroll");
  await website.getByRole("heading", { name: "Scroll sample" }).waitFor();
  await website.evaluate(() => {
    document.body.style.background = "rgb(12, 34, 56)";
    window.scrollTo(0, 500);
  });
  // Chromium may round a requested scroll to a fractional CSS pixel at desktop scaling.
  await expect
    .poll(() => website.evaluate(() => window.scrollY))
    .toBeCloseTo(500, 0);
  const scrollBeforeCapture = await website.evaluate(() => window.scrollY);
  const viewport = await website.evaluate(() => ({
    width: innerWidth * devicePixelRatio,
    height: innerHeight * devicePixelRatio,
  }));
  await camera.click();
  await expect(shell.getByRole("alert")).toContainText(
    `Snapshot saved to ${destination}`,
  );
  await expect(camera).toHaveClass(/snapshot-saved/);
  const files = await readdir(destination);
  expect(files).toHaveLength(1);
  expect(files[0]).toMatch(/^Snapshot-.*\.png$/);
  const path = join(destination, files[0]);
  const png = await readFile(path);
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  // Physical image bounds round to whole pixels; CSS viewport bounds may not.
  expect(Math.abs(png.readUInt32BE(16) - viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(png.readUInt32BE(20) - viewport.height)).toBeLessThanOrEqual(1);
  const pixel = await app.evaluate(({ nativeImage }, path) => {
    const image = nativeImage.createFromPath(path);
    return [...image.toBitmap().subarray(0, 4)];
  }, path);
  expect(pixel).toEqual([56, 34, 12, 255]);
  await expect
    .poll(() => website.evaluate(() => window.scrollY))
    .toBe(scrollBeforeCapture);
  const evidence = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage())
      .toPNG()
      .toString("base64"),
  );
  await writeFile(
    "../design/qa/desktop-snapshot.png",
    Buffer.from(evidence, "base64"),
  );
  await expect(camera).toHaveClass(/snapshot-idle/);
  await camera.click();
  await expect.poll(async () => (await readdir(destination)).length).toBe(2);
  expect(await readFile(path)).toEqual(png);
  await shell.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(shell.getByText(files[0], { exact: true })).toBeVisible();
  await expect(shell.getByText("Completed", { exact: true })).toHaveCount(2);
});

test("snapshot tool visibility persists across restart", async () => {
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(shell.getByLabel("Show snapshot button")).toBeChecked();
  await shell.getByLabel("Show snapshot button").uncheck();
  await expect(
    shell.getByRole("button", { name: "Take snapshot" }),
  ).toHaveCount(0);
  await app.close();
  await launch();
  await expect(
    shell.getByRole("button", { name: "Take snapshot" }),
  ).toHaveCount(0);
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(shell.getByLabel("Show snapshot button")).not.toBeChecked();
  await shell.getByLabel("Show snapshot button").check();
  await expect(
    shell.getByRole("button", { name: "Take snapshot" }),
  ).toBeVisible();
  await expect(
    shell.getByRole("button", { name: "Take snapshot" }),
  ).toBeDisabled();
});

test("snapshot save failures show an error and allow retry", async () => {
  const destination = await snapshotFolder();
  await writeFile(destination, "A file is blocking this folder");
  await newTask("Snapshot retry");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("318.20");
  const camera = shell.getByRole("button", { name: "Take snapshot" });
  await camera.click();
  await expect(shell.getByRole("alert")).toContainText(
    "Could not save the snapshot",
  );
  await expect(camera).toHaveClass(/snapshot-idle/);
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
  await shell.getByRole("button", { name: "Downloads", exact: true }).click();
  await expect(shell.getByText("No downloads in this session.")).toBeVisible();
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  await rm(destination);
  await camera.click();
  await expect(shell.getByRole("alert")).toContainText("Snapshot saved to");
  await expect.poll(async () => (await readdir(destination)).length).toBe(1);
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
  await expect
    .poll(async () =>
      Math.abs(
        parseFloat(
          await shell
            .locator(".sidebar")
            .evaluate((element) => getComputedStyle(element).width),
        ) - 230,
      ),
    )
    .toBeLessThan(0.1);
  await shell.screenshot({ path: "../design/qa/desktop-shell-narrow.png" });
  await shell.getByRole("button", { name: "Close task notes" }).click();
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
});

test("dragging to Later retains edits, settling unloads pages, and moves persist", async () => {
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
  await expect(website.getByLabel("Amount")).toHaveValue("712");
  await taskButton().dragTo(settled);
  await shell.getByRole("button", { name: "Settle anyway", exact: true }).click();
  await expect(settled).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => website.isClosed()).toBe(true);
  await taskButton().dragTo(
    shell.getByRole("region", { name: "Active tasks", exact: true }),
  );
  await expect(
    shell
      .getByRole("region", { name: "Active tasks", exact: true })
      .getByRole("button", { name: "Select task Move this work" }),
  ).toBeVisible();
  await expect(shell.getByRole("heading", { name: "Reopen this reference" })).toBeVisible();
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
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue("");
  const second = await navigate(origin + "/second");
  await altInput(second, "Alt");
  await expect(shell.locator(".task kbd")).toHaveText(["A", "1", "2"]);
  await altInput(second, "1");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(origin + "/");
  await altInput(shell, "Alt", "keyUp");
  await expect(shell.locator(".task kbd")).toHaveCount(0);
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
    args: [".", "--use-fake-device-for-media-stream"],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TERN_PROFILE: profile,
      TERN_THEME_DIR: themeDirectory,
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
  const top = await shell
    .getByRole("region", { name: "Task overview" })
    .boundingBox();
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
  await shell.getByText("Developer options", { exact: true }).click();
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
  });
  await shell
    .getByRole("button", { name: "Load unpacked", exact: true })
    .click();
  await expect(shell.getByText("No extensions installed.")).toBeVisible();
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
  await expect(shell.getByText("No extensions installed.")).toBeVisible();
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
  await shell.getByText("Developer options", { exact: true }).click();
  await shell.getByRole("button", { name: "Remove Sample extension" }).click();
  await expect(shell.getByText("No extensions installed.")).toBeVisible();
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
  await expect
    .poll(async () =>
      Math.abs(
        parseFloat(
          await shell
            .locator(".sidebar")
            .evaluate((element) => getComputedStyle(element).width),
        ) - 52,
      ),
    )
    .toBeLessThan(0.1);
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
  await address.fill("tern sample query");
  await address.press("Enter");
  await expect(address).toHaveValue(
    "https://www.google.com/search?q=tern%20sample%20query",
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
  await shell.getByText("Developer options", { exact: true }).click();
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
  await shell.getByText("Developer options", { exact: true }).click();
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
  await expect(shell.getByText("No extensions installed.")).toBeVisible();
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
  await shell.getByText("Developer options", { exact: true }).click();
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

test("extension popups and worker shortcuts fill only the selected live page", async () => {
  const extensionPath = join(profile, "vault-fixture");
  await mkdir(extensionPath);
  await writeFile(
    join(extensionPath, "manifest.json"),
    JSON.stringify({
      manifest_version: 3,
      name: "Vault fixture",
      version: "1.0",
      permissions: ["tabs", "storage", "webNavigation"],
      host_permissions: ["http://127.0.0.1/*"],
      action: { default_popup: "popup.html" },
      background: { service_worker: "background.js" },
      commands: {
        _execute_action: { suggested_key: { linux: "Ctrl+Shift+U" } },
        autofill_login: {
          suggested_key: { default: "Ctrl+Shift+L" },
          description: "Fill sample",
        },
      },
      content_scripts: [
        { matches: ["http://127.0.0.1/*"], js: ["content.js"] },
      ],
    }),
  );
  await writeFile(
    join(extensionPath, "background.js"),
    `
    chrome.webNavigation.onCommitted.addListener(() => {});
    async function fill() {
      const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
      await chrome.tabs.sendMessage(tab.id,{fill:true});
    }
    chrome.runtime.onMessage.addListener((message,sender,respond) => {
      if(message.fill) { fill().then(()=>respond('Filled')); return true; }
    });
    chrome.commands.onCommand.addListener(name => { if(name==='autofill_login') void fill(); });
  `,
  );
  await writeFile(
    join(extensionPath, "content.js"),
    `
    chrome.runtime.onMessage.addListener((message,sender,respond) => {
      if(message.fill) { document.querySelector('input').value='42.50'; respond(true); }
    });
  `,
  );
  await writeFile(
    join(extensionPath, "popup.html"),
    '<title>Vault fixture</title><h1>Vault fixture</h1><p id="page"></p><p id="context"></p><button>Fill current page</button><output></output><script src="popup.js"></script>',
  );
  await writeFile(
    join(extensionPath, "popup.js"),
    `
    chrome.tabs.query({active:true,currentWindow:true}).then(([tab])=>document.querySelector('#page').textContent=tab.url);
    chrome.runtime.getContexts({contextTypes:['POPUP']}).then(contexts=>document.querySelector('#context').textContent=contexts.length===1 && contexts[0].documentUrl.startsWith(chrome.runtime.getURL('/'))?'Own popup found':'Wrong context');
    document.querySelector('button').onclick=()=>chrome.runtime.sendMessage({fill:true}).then(result=>document.querySelector('output').textContent=result);
  `,
  );
  await newTask("First login");
  await shell.getByRole("button", { name: "Extensions", exact: true }).click();
  await shell.getByText("Developer options", { exact: true }).click();
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [path],
    });
  }, extensionPath);
  await shell
    .getByRole("button", { name: "Load unpacked", exact: true })
    .click();
  await expect(
    shell.getByRole("button", { name: "Remove Vault fixture" }),
  ).toBeVisible();
  await shell.getByRole("button", { name: "Done", exact: true }).click();
  const first = await navigate(origin + "/");
  await first.getByLabel("Amount").fill("Untouched");
  await newTask("Second login");
  const second = await navigate(origin + "/second");
  await expect(
    second.getByRole("heading", { name: "Second page" }),
  ).toBeVisible();
  let opened = app.waitForEvent("window");
  await shell
    .getByRole("button", { name: "Open Vault fixture", exact: true })
    .click();
  let popup = await opened;
  await expect(popup.locator("#page")).toHaveText(origin + "/second");
  await expect(popup.locator("#context")).toHaveText("Own popup found");
  await popup.getByRole("button", { name: "Fill current page" }).click();
  await expect(popup.locator("output")).toHaveText("Filled");
  await expect(second.getByLabel("Amount")).toHaveValue("42.50");
  await expect(first.getByLabel("Amount")).toHaveValue("Untouched");
  await nativeShortcut(popup, "Escape", []);
  await shell
    .getByRole("button", { name: "Select task First login", exact: true })
    .click();
  await app.evaluate(({ webContents }, url) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getURL() === url)!;
    contents.focus();
    contents.sendInputEvent({
      type: "keyDown",
      keyCode: "L",
      modifiers: ["control", "shift"],
    });
    contents.sendInputEvent({
      type: "keyUp",
      keyCode: "L",
      modifiers: ["control", "shift"],
    });
  }, origin + "/");
  await expect(first.getByLabel("Amount")).toHaveValue("42.50");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).not.toBeFocused();
  opened = app.waitForEvent("window");
  await app.evaluate(({ webContents }, url) => {
    const contents = webContents
      .getAllWebContents()
      .find((item) => item.getURL() === url)!;
    contents.sendInputEvent({
      type: "keyDown",
      keyCode: "U",
      modifiers: ["control", "shift"],
    });
    contents.sendInputEvent({
      type: "keyUp",
      keyCode: "U",
      modifiers: ["control", "shift"],
    });
  }, origin + "/");
  popup = await opened;
  await expect(popup.locator("#page")).toHaveText(origin + "/");
  await nativeShortcut(popup, "Escape", []);
  await first.getByRole("button", { name: "Check isolation" }).click();
  await expect(first.locator("output")).toHaveText("undefined/undefined");
});

async function multiTabs() {
  await newTask("Tab selection");
  const websites: Page[] = [];
  for (let number = 1; number <= 4; number++) {
    if (number > 1) await shell.getByRole("button", { name: "New page", exact: true }).click();
    const website = await navigate(`${origin}/tabs/${number}`);
    await website.getByLabel("Draft").fill(`Draft ${number}`);
    websites.push(website);
  }
  return {
    websites,
    tab: (number: number) => shell.getByRole("button", { name: `Select page Tab ${number}`, exact: true }),
    // Compare selection content without depending on framework whitespace nodes.
    selected: async () => (await shell.locator('.pages button[aria-pressed="true"]').allTextContents())
      .map(text => text.trim().replace(/\s+([●○])/g, "$1")),
  };
}

test("Ctrl toggles tabs and Shift selects anchored ranges within a task", async () => {
  const { tab, selected } = await multiTabs();
  await tab(1).click();
  await tab(3).click({ modifiers: ["Control"] });
  await expect.poll(selected).toEqual(["Tab 1●", "Tab 3●"]);
  await tab(3).click({ modifiers: ["Control"] });
  await expect.poll(selected).toEqual(["Tab 1●"]);
  await tab(1).click();
  await tab(4).click({ modifiers: ["Shift"] });
  await expect.poll(selected).toEqual(["Tab 1●", "Tab 2●", "Tab 3●", "Tab 4●"]);
  await tab(2).click({ modifiers: ["Shift"] });
  await expect.poll(selected).toEqual(["Tab 1●", "Tab 2●"]);
  await tab(4).click();
  await tab(2).click({ modifiers: ["Shift"] });
  await expect.poll(selected).toEqual(["Tab 2●", "Tab 3●", "Tab 4●"]);
  await tab(2).click();
  await tab(4).click({ modifiers: ["Control"] });
  await tab(3).click({ modifiers: ["Control", "Shift"] });
  await expect.poll(selected).toEqual(["Tab 2●", "Tab 3●", "Tab 4●"]);
  await shell.screenshot({ path: "/tmp/tern-multiselect.png" });
  await tab(1).click();
  await expect.poll(selected).toEqual(["Tab 1●"]);
  await tab(3).click({ modifiers: ["Control"] });
  await newTask("Separate selection");
  await shell.getByRole("button", { name: "Select task Tab selection", exact: true }).click();
  await expect.poll(selected).toEqual(["Tab 3●"]);
});

test("selected tab menus copy, reload and duplicate the group", async () => {
  const { tab, websites, selected } = await multiTabs();
  await tab(1).click();
  await tab(3).click({ modifiers: ["Control"] });
  // An unselected tab keeps its individual menu without changing the group.
  await tab(2).click({ button: "right" });
  await expect(shell.getByRole("menuitem", { name: "Close tab", exact: true })).toBeVisible();
  await shell.keyboard.press("Escape");
  await expect.poll(selected).toEqual(["Tab 1●", "Tab 3●"]);
  await app.evaluate(({ clipboard, dialog }) => {
    clipboard.writeText = text => { (globalThis as any).copiedPageAddress = text; };
    dialog.showMessageBoxSync = () => 0;
  });
  await tab(1).focus();
  await tab(1).press("Shift+F10");
  await expect(shell.getByRole("menu", { name: "2 tabs selected", exact: true })).toBeVisible();
  await shell.getByRole("menuitem", { name: "Copy addresses", exact: true }).click();
  expect(await app.evaluate(() => (globalThis as any).copiedPageAddress)).toBe(`${origin}/tabs/1\n${origin}/tabs/3`);
  await tab(1).click({ button: "right" });
  await shell.getByRole("menuitem", { name: "Reload tabs", exact: true }).click();
  await expect(websites[0].getByLabel("Draft")).toHaveValue("Draft 1");
  await expect(websites[2].getByLabel("Draft")).toHaveValue("Draft 3");
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await tab(1).click({ button: "right" });
  await shell.getByRole("menuitem", { name: "Reload tabs", exact: true }).click();
  await expect(websites[0].getByLabel("Draft")).toHaveValue("");
  await expect(websites[2].getByLabel("Draft")).toHaveValue("");
  await expect(websites[1].getByLabel("Draft")).toHaveValue("Draft 2");
  await shell.getByRole("button", { name: "Task overview", exact: true }).click();
  await tab(1).click({ button: "right" });
  await shell.getByRole("menuitem", { name: "Duplicate tabs", exact: true }).click();
  await expect(shell.getByRole("region", { name: "Task overview", exact: true })).not.toBeVisible();
  await expect(tab(1)).toHaveCount(2);
  await expect(tab(3)).toHaveCount(2);
  await expect.poll(selected).toEqual(["Tab 1●", "Tab 3●"]);
  await expect(tab(1).nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(tab(3).nth(1)).toHaveAttribute("aria-current", "page");
});

for (const source of ["shell", "website"] as const) {
  test(`Ctrl+W from the ${source} closes only selected tabs after one confirmation`, async () => {
    const { tab, websites, selected } = await multiTabs();
    await tab(1).click();
    await tab(3).click({ modifiers: ["Control"] });
    await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 0; });
    await shell.getByRole("button", { name: "Close selected tabs", exact: true }).click();
    await expect.poll(selected).toEqual(["Tab 1●", "Tab 3●"]);
    await expect(websites[0].getByLabel("Draft")).toHaveValue("Draft 1");
    await app.evaluate(({ dialog }) => {
      (globalThis as any).closeConfirmations = [];
      dialog.showMessageBoxSync = (_window, options) => {
        (globalThis as any).closeConfirmations.push(options.message);
        return 1;
      };
    });
    await nativeShortcut(source === "shell" ? shell : websites[2], "W");
    await expect.poll(() => [websites[0].isClosed(), websites[2].isClosed()]).toEqual([true, true]);
    expect(await app.evaluate(() => (globalThis as any).closeConfirmations)).toEqual(["Close 2 tabs?"]);
    await expect(tab(1)).toHaveCount(0);
    await expect(tab(3)).toHaveCount(0);
    await expect(websites[1].getByLabel("Draft")).toHaveValue("Draft 2");
    await expect(websites[3].getByLabel("Draft")).toHaveValue("Draft 4");
    await expect.poll(selected).toEqual(["Tab 2●"]);
  });
}

test("selected references reopen together after settlement", async () => {
  const { tab, selected } = await multiTabs();
  await shell.getByRole("button", { name: "Settle", exact: true }).click();
  await shell.getByRole("button", { name: "Settle anyway", exact: true }).click();
  await expect(shell.getByRole("button", { name: "Settled tasks", exact: true })).toHaveAttribute("aria-expanded", "true");
  await tab(1).click();
  await tab(3).click({ modifiers: ["Control"] });
  await expect.poll(selected).toEqual(["Tab 1○", "Tab 3○"]);
  await tab(1).click({ button: "right" });
  await shell.getByRole("menuitem", { name: "Reopen tabs", exact: true }).click();
  await expect.poll(selected).toEqual(["Tab 1●", "Tab 3●"]);
  await expect(tab(2)).toContainText("○");
  await expect(tab(4)).toContainText("○");
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  await tab(1).click({ button: "right" });
  await shell.getByRole("menuitem", { name: "Close tabs", exact: true }).click();
  await expect(tab(1)).toHaveCount(0);
  await expect(tab(3)).toHaveCount(0);
  await expect(tab(2)).toBeVisible();
});

test("closing selected tabs respects a website unload veto", async () => {
  await newTask("Guarded selection");
  const guarded = await navigate(origin + "/guarded");
  guarded.on("dialog", () => {});
  await guarded.getByLabel("Draft").fill("Keep this draft");
  await shell.getByRole("button", { name: "New page", exact: true }).click();
  const other = await navigate(origin + "/tabs/1");
  await shell.getByRole("button", { name: "Select page Unsaved draft", exact: true }).click({ modifiers: ["Control"] });
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = (_window, options) => options.message === "Close 2 tabs?" ? 1 : 0;
  });
  await shell.getByRole("button", { name: "Close selected tabs", exact: true }).click();
  await expect.poll(() => other.isClosed()).toBe(true);
  await expect(guarded.getByLabel("Draft")).toHaveValue("Keep this draft");
  await expect(shell.getByRole("button", { name: "Select page Unsaved draft", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("tab mouse actions target the clicked page and preserve unsaved work", async () => {
  await newTask("Mouse controls");
  const first = await navigate(origin + "/");
  await first.getByLabel("Amount").fill("Keep this draft");
  const firstTab = shell.getByRole("button", {
    name: "Select page Expense claim",
    exact: true,
  });
  await firstTab.click({ button: "right" });
  await expect(
    shell.getByRole("menu", { name: "Expense claim" }),
  ).toBeVisible();
  const menuEvidence = await app.evaluate(async ({ BrowserWindow }) =>
    (await BrowserWindow.getAllWindows()[0].capturePage())
      .toPNG()
      .toString("base64"),
  );
  await writeFile(
    "../design/qa/desktop-tab-menu.png",
    Buffer.from(menuEvidence, "base64"),
  );
  await shell
    .getByRole("menuitem", { name: "Duplicate tab", exact: true })
    .click();
  await expect(firstTab).toHaveCount(2);
  await expect
    .poll(
      () =>
        app
          .context()
          .pages()
          .filter((p) => p.url() === origin + "/").length,
    )
    .toBe(2);
  const copy = app
    .context()
    .pages()
    .find((p) => p !== first && p.url() === origin + "/")!;
  await expect(copy.getByLabel("Amount")).toHaveValue("");
  await expect(first.getByLabel("Amount")).toHaveValue("Keep this draft");
  await expect(firstTab.nth(1)).toHaveClass("chosen");
  await firstTab.nth(0).click({ button: "right" });
  await expect(firstTab.nth(1)).toHaveClass("chosen");
  // Observe only this explicit copy operation; don't read or overwrite the user's clipboard.
  await app.evaluate(({ clipboard }) => {
    clipboard.writeText = (text) => {
      (globalThis as any).copiedPageAddress = text;
    };
  });
  await shell
    .getByRole("menuitem", { name: "Copy address", exact: true })
    .click();
  expect(await app.evaluate(() => (globalThis as any).copiedPageAddress)).toBe(
    origin + "/",
  );
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 0;
  });
  await firstTab.nth(0).click({ button: "middle" });
  await expect(firstTab).toHaveCount(2);
  await expect(first.getByLabel("Amount")).toHaveValue("Keep this draft");
  await firstTab.nth(0).click({ button: "right" });
  await shell
    .getByRole("menuitem", { name: "Reload tab", exact: true })
    .click();
  await expect(first.getByLabel("Amount")).toHaveValue("Keep this draft");
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await firstTab.nth(0).click({ button: "middle" });
  await expect(firstTab).toHaveCount(1);
  await expect(firstTab).toHaveClass("chosen");
  await firstTab.click({ button: "right" });
  await shell.getByRole("menuitem", { name: "Close tab", exact: true }).click();
  await expect(firstTab).toHaveCount(0);
});

test("task menus target inactive tasks and support keyboard dismissal", async () => {
  await newTask("First mouse task");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("Still live");
  await newTask("Current mouse task");
  const current = shell.getByRole("button", {
    name: "Select task Current mouse task",
    exact: true,
  });
  const first = shell.getByRole("button", {
    name: "Select task First mouse task",
    exact: true,
  });
  await first.click({ button: "middle" });
  await expect(current).toHaveAttribute("aria-current", "true");
  await first.click({ button: "right" });
  await expect(current).toHaveAttribute("aria-current", "true");
  await shell
    .getByRole("menuitem", { name: "Rename task…", exact: true })
    .click();
  await shell
    .getByLabel("Task name", { exact: true })
    .fill("Renamed mouse task");
  await shell.getByRole("button", { name: "Save name", exact: true }).click();
  const renamed = shell.getByRole("button", {
    name: "Select task Renamed mouse task",
    exact: true,
  });
  await expect(renamed).toBeVisible();
  await expect(current).toHaveAttribute("aria-current", "true");
  await renamed.focus();
  await renamed.press("Shift+F10");
  await expect(
    shell.getByRole("menuitem", { name: "New tab", exact: true }),
  ).toBeFocused();
  await shell.keyboard.press("ArrowDown");
  await expect(
    shell.getByRole("menuitem", { name: "Rename task…", exact: true }),
  ).toBeFocused();
  await shell.keyboard.press("Escape");
  await expect(shell.getByRole("menu")).toHaveCount(0);
  await expect(renamed).toBeFocused();
  await renamed.click({ button: "right" });
  await shell
    .getByRole("menuitem", { name: "Put aside…", exact: true })
    .click();
  await shell.getByLabel("Where I left off").fill("Continue this draft");
  await shell
    .getByRole("button", { name: "Put aside task", exact: true })
    .click();
  await expect(renamed).not.toBeVisible();
  await shell.getByRole("button", { name: "Later tasks", exact: true }).click();
  await renamed.click({ button: "right" });
  await shell
    .getByRole("menuitem", { name: "Return to active", exact: true })
    .click();
  await expect(
    shell
      .getByRole("region", { name: "Active tasks", exact: true })
      .getByRole("button", { name: "Select task Renamed mouse task" }),
  ).toBeVisible();
  await renamed.click();
  await expect(website.getByLabel("Amount")).toHaveValue("Still live");
  await renamed.click({ button: "right" });
  await shell.getByRole("textbox", { name: "Search tasks and pages" }).click();
  await expect(shell.getByRole("menu")).toHaveCount(0);
});

test("middle-clicking a website link opens a background tab in its task", async () => {
  await newTask("Read without switching");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("Keep reading");
  await website
    .getByRole("link", { name: "Next page", exact: true })
    .click({ button: "middle" });
  const next = shell.getByRole("button", {
    name: "Select page Second page",
    exact: true,
  });
  await expect(next).toBeVisible();
  await expect(
    shell.getByRole("button", {
      name: "Select page Expense claim",
      exact: true,
    }),
  ).toHaveClass("chosen");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(origin + "/");
  await expect(website.getByLabel("Amount")).toHaveValue("Keep reading");
  await next.click();
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(origin + "/second");
  await next.click({ button: "right" });
  const second = app
    .context()
    .pages()
    .find((p) => p.url() === origin + "/second")!;
  const field = (await second.getByLabel("Amount").boundingBox())!;
  // Native mouse input exercises the view boundary; CDP clicks do not transfer
  // focus between Electron WebContents or run its native mouse hooks.
  await app.evaluate(
    ({ webContents }, { url, x, y }) => {
      const contents = webContents
        .getAllWebContents()
        .find((item) => item.getURL() === url)!;
      contents.sendInputEvent({
        type: "mouseDown",
        button: "left",
        clickCount: 1,
        x,
        y,
      });
      contents.sendInputEvent({
        type: "mouseUp",
        button: "left",
        clickCount: 1,
        x,
        y,
      });
    },
    {
      url: second.url(),
      x: Math.round(field.x + field.width / 2),
      y: Math.round(field.y + field.height / 2),
    },
  );
  await expect(shell.getByRole("menu")).toHaveCount(0);
});


test("canceling settlement and putting aside instead preserve the live form", async () => {
  await newTask("Unfinished claim");
  const website = await navigate(origin + "/");
  await website.getByLabel("Amount").fill("318.20");
  await shell.getByLabel("Task status", { exact: true }).selectOption("Settled");
  await expect(shell.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await shell.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(shell.getByLabel("Task status", { exact: true })).toHaveValue("Active");
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
  await shell.getByRole("button", { name: "Settle", exact: true }).click();
  await shell.screenshot({ path: "../design/qa/ux-improvements-settle-warning.png" });
  await shell.getByRole("button", { name: "Put aside instead", exact: true }).click();
  await shell.getByLabel("Where I left off").fill("Check the receipt");
  await shell.getByRole("button", { name: "Put aside task", exact: true }).click();
  await shell.getByRole("button", { name: "Later tasks", exact: true }).click();
  await shell.getByRole("button", { name: "Resume task", exact: true }).click();
  await expect(website.getByLabel("Amount")).toHaveValue("318.20");
  await expect(shell.getByLabel("Task status", { exact: true })).toHaveValue("Active");
  await expect(shell.getByLabel("Next step", { exact: true })).toHaveValue("Check the receipt");
});

test("update restart respects cancellation and launches the installed release after confirmation", async () => {
  await newTask("Keep website work");
  await navigate(origin + "/");
  await app.evaluate(({ app, dialog }, { modulePath, marker }) => {
    const { ReleaseUpdater } = process.getBuiltinModule("module").createRequire(modulePath)(modulePath);
    ReleaseUpdater.prototype.install = async function () { this.state.ready = true; };
    Object.defineProperty(ReleaseUpdater.prototype, "restartExecutable", { get() { return this.state.ready ? "/installed/current/Tern" : undefined; } });
    const fs = process.getBuiltinModule("fs");
    app.relaunch = options => { fs.writeFileSync(marker, JSON.stringify(options)); };
    dialog.showMessageBoxSync = () => 0;
  }, { modulePath: new URL("../dist/host/updates.js", import.meta.url).pathname, marker: join(profile, "relaunch.json") });
  await shell.evaluate(() => window.tern.command({ type: "installUpdate" }));
  await shell.evaluate(() => window.tern.command({ type: "restartForUpdate" }));
  await expect(shell.getByRole("textbox", { name: "Address or search" })).toBeVisible();
  await expect(readFile(join(profile, "relaunch.json"))).rejects.toThrow();
  await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; });
  const closed = app.waitForEvent("close");
  await shell.evaluate(() => window.tern.command({ type: "restartForUpdate" })).catch(() => {});
  await closed;
  expect(JSON.parse(await readFile(join(profile, "relaunch.json"), "utf8"))).toEqual({ execPath: "/installed/current/Tern", args: [] });
});
