import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, mkdir, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_MODEL } from "@tern/core/local-ai-config";

let app: ElectronApplication;
let shell: Page;
let profile: string;
let server: Server;
let origin: string;
let hits: string[];

test.beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? "");
    if (req.url === "/broken") {
      req.socket.destroy();
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<title>${req.url === "/api" ? "Extension API reference" : "Popup behavior"}</title><label>Draft <input aria-label="Draft" /></label>`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function launch() {
  app = await electron.launch({
    ...(process.env.TERN_EXECUTABLE
      ? { executablePath: process.env.TERN_EXECUTABLE }
      : {}),
    args: ["."],
    cwd: process.cwd(),
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "",
      TERN_PROFILE: profile,
    },
    chromiumSandbox: true,
  });
  shell = await app.firstWindow();
  await shell.waitForLoadState();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setFullScreen(true),
  );
}
async function close() {
  await app.evaluate(({ dialog }) => {
    dialog.showMessageBoxSync = () => 1;
  });
  await app.close();
}
async function website(path: string) {
  await expect
    .poll(() =>
      app
        .context()
        .pages()
        .some((page) => page.url() === origin + path),
    )
    .toBe(true);
  return app
    .context()
    .pages()
    .find((page) => page.url() === origin + path)!;
}
test.beforeEach(async () => {
  hits = [];
  profile = await mkdtemp(join(tmpdir(), "tern-overview-"));
  // These scenarios enable a mocked model explicitly after launch.
  await writeFile(
    join(profile, "preferences.json"),
    JSON.stringify({ summaryModel: "" }),
  );
  await writeFile(
    join(profile, "workspace.json"),
    JSON.stringify({
      version: 1,
      tasks: [
        {
          id: "extensions",
          title: "Build extension support",
          lifecycle: "Active",
          note: "Check popup behavior before packaging.",
          selectedPageId: "popup",
          lastOpenedAt: 1789992000000,
        },
        {
          id: "trip",
          title: "Plan a walking trip",
          lifecycle: "Active",
          note: "",
          selectedPageId: null,
        },
        {
          id: "later",
          title: "Paused work",
          lifecycle: "Later",
          note: "",
          selectedPageId: "later-page",
        },
        {
          id: "done",
          title: "Completed work",
          lifecycle: "Settled",
          note: "",
          selectedPageId: null,
        },
      ],
      pages: [
        {
          id: "api",
          taskId: "extensions",
          title: "Extension API reference",
          url: origin + "/api",
          lastViewedAt: 1789991990000,
        },
        {
          id: "popup",
          taskId: "extensions",
          title: "Popup behavior",
          url: origin + "/popup",
          lastViewedAt: 1789992000000,
        },
        {
          id: "later-page",
          taskId: "later",
          title: "Paused reference",
          url: origin + "/later",
        },
      ],
      selectedTaskId: "extensions",
    }),
  );
  await launch();
});
test.afterEach(async () => {
  await close().catch(() => {});
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
});

test("startup shows active task recaps and one click reopens the whole task", async () => {
  const overview = shell.getByRole("region", { name: "Task overview" });
  await expect(
    overview.getByRole("heading", { name: "Pick up where you left off" }),
  ).toBeVisible();
  await expect(overview.locator("article")).toHaveCount(2);
  const card = overview.getByRole("button", {
    name: "Resume Build extension support",
    exact: true,
  });
  await expect(card).toContainText("Popup behavior");
  await expect(card).toContainText("Check popup behavior before packaging.");
  await expect(card).toContainText("2 tabs");
  await expect(overview).not.toContainText("Paused work");
  await expect(overview).not.toContainText("Completed work");
  expect(hits).toEqual([]);
  await shell.screenshot({ path: "../design/qa/desktop-task-overview.png" });
  await card.focus();
  await shell.keyboard.press("Enter");
  await expect(overview).toBeHidden();
  await expect
    .poll(() => hits.includes("/api") && hits.includes("/popup"))
    .toBe(true);
  expect(hits).not.toContain("/later");
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(origin + "/popup");
  const popup = await website("/popup");
  await popup.getByLabel("Draft").fill("Still writing this");
  const before = hits.length;
  await shell
    .getByRole("button", { name: "Task overview", exact: true })
    .click();
  await expect(overview).toBeVisible();
  await card.click();
  await expect(popup.getByLabel("Draft")).toHaveValue("Still writing this");
  expect(hits.length).toBe(before);
  await close();
  hits = [];
  await launch();
  await expect(
    shell.getByRole("region", { name: "Task overview" }),
  ).toBeVisible();
  expect(hits).toEqual([]);
  await shell
    .getByRole("button", {
      name: "Resume Build extension support",
      exact: true,
    })
    .click();
  await expect
    .poll(() => hits.includes("/api") && hits.includes("/popup"))
    .toBe(true);
  const reopened = await website("/popup");
  await expect(reopened.getByLabel("Draft")).toHaveValue("");
  const saved = JSON.parse(
    await readFile(join(profile, "workspace.json"), "utf8"),
  );
  expect(saved.tasks[0].lastOpenedAt).toBeGreaterThan(1789992000000);
});

test("empty tasks and a narrow overview remain usable", async () => {
  await shell
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  await shell.setViewportSize({ width: 620, height: 800 });
  await expect(
    shell.getByRole("button", {
      name: "Resume Plan a walking trip",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await shell.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await shell.screenshot({
    path: "../design/qa/desktop-task-overview-narrow.png",
  });
  await shell
    .getByRole("button", { name: "Resume Plan a walking trip", exact: true })
    .click();
  await expect(
    shell.getByRole("heading", { name: "Where will this task take you?" }),
  ).toBeVisible();
  expect(hits).toEqual([]);
});

test("a failed restored tab does not prevent other tabs from opening", async () => {
  await close();
  const workspace = JSON.parse(
    await readFile(join(profile, "workspace.json"), "utf8"),
  );
  workspace.pages.find((page: { id: string }) => page.id === "popup").url =
    origin + "/broken";
  await writeFile(join(profile, "workspace.json"), JSON.stringify(workspace));
  await launch();
  await shell
    .getByRole("button", {
      name: "Resume Build extension support",
      exact: true,
    })
    .click();
  await expect(
    shell.getByRole("heading", { name: "Couldn’t open this page" }),
  ).toBeVisible();
  await expect.poll(() => hits.includes("/api")).toBe(true);
  await shell
    .getByRole("button", {
      name: "Select page Extension API reference",
      exact: true,
    })
    .click();
  await expect(
    shell.getByRole("textbox", { name: "Address or search" }),
  ).toHaveValue(origin + "/api");
});

async function mockLocalModel(remote = false, malformed = false, hold = false) {
  await app.evaluate(
    (_electron, { remote, malformed, hold }) => {
      const original = globalThis.fetch;
      (
        globalThis as typeof globalThis & { summaryRequests: unknown[] }
      ).summaryRequests = [];
      globalThis.fetch = async (url, options) => {
        if (!String(url).startsWith("http://127.0.0.1:11434/api/"))
          return original(url, options);
        if (String(url).endsWith("/show"))
          return new Response(
            JSON.stringify(
              remote
                ? { remote_model: "cloud-model", model_info: {} }
                : { model_info: { "general.architecture": "test" } },
            ),
          );
        (
          globalThis as typeof globalThis & { summaryRequests: unknown[] }
        ).summaryRequests.push(JSON.parse(String(options?.body)));
        if (hold) {
          await new Promise<void>((resolve, reject) => {
            (
              globalThis as typeof globalThis & { releaseSummary: () => void }
            ).releaseSummary = resolve;
            options?.signal?.addEventListener(
              "abort",
              () => reject(new Error("Aborted")),
              { once: true },
            );
          });
        }
        return new Response(
          JSON.stringify({
            message: {
              content: malformed
                ? "invalid"
                : JSON.stringify({
                    summary:
                      "You appear to have been reviewing extension APIs and popup behavior. Your next step is to check popups before packaging.",
                  }),
            },
          }),
        );
      };
    },
    { remote, malformed, hold },
  );
}
async function enableModel() {
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.getByRole("combobox", { name: "Local AI" }).selectOption("ollama");
  await shell
    .getByRole("textbox", { name: "Local summary model" })
    .fill("test-local");
  await shell
    .getByRole("button", { name: "Use local model", exact: true })
    .click();
  await shell
    .getByRole("button", { name: "Back to browsing", exact: true })
    .click();
}

for (const outcome of ["success", "failure", "cancel"] as const) {
  test(`description placeholders clear on ${outcome}`, async () => {
    await mockLocalModel(false, outcome === "failure", true);
    await enableModel();
    const card = shell.getByRole("button", {
      name: "Resume Build extension support",
      exact: true,
    });
    const loading = card.getByRole("status");
    await expect(loading).toHaveText("Writing description...");
    await expect(card.locator(".tile-description")).toHaveAttribute(
      "aria-busy", "true",
    );
    await expect(card).toContainText("Check popup behavior before packaging.");
    await expect(card).toContainText("Popup behavior");
    await expect(shell.locator(".tile-topline svg")).toHaveCount(0);
    await expect(
      shell.getByRole("button", {
        name: "Resume Plan a walking trip", exact: true,
      }).getByRole("status"),
    ).toHaveCount(0);
    const skeleton = card.locator(".tile-description-skeleton");
    await shell.emulateMedia({ reducedMotion: "no-preference" });
    await expect(skeleton).toHaveCSS("animation-name", "description-pulse");
    await shell.screenshot({
      path: `/tmp/tern-description-loading-${outcome}.png`,
    });
    await shell.emulateMedia({ reducedMotion: "reduce" });
    await expect(skeleton).toHaveCSS("animation-name", "none");

    if (outcome === "cancel") {
      await card.click();
      await expect(
        shell.getByRole("region", { name: "Task overview" }),
      ).toBeHidden();
      return;
    }
    await app.evaluate(() => {
      (
        globalThis as typeof globalThis & { releaseSummary: () => void }
      ).releaseSummary();
    });
    await expect(loading).toHaveCount(0);
    await expect(card.locator(".tile-description")).toHaveAttribute(
      "aria-busy", "false",
    );
    await expect(card).toContainText(
      outcome === "success"
        ? "You appear to have been reviewing extension APIs"
        : "You had Popup behavior",
    );
  });
}

test("optional local descriptions use metadata, cache across restart and can be disabled", async () => {
  await mockLocalModel();
  await enableModel();
  await expect(
    shell.getByRole("region", { name: "Task overview" }),
  ).toContainText("You appear to have been reviewing extension APIs");
  const requests = await app.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          summaryRequests: { messages: { content: string }[] }[];
        }
      ).summaryRequests,
  );
  expect(requests).toHaveLength(1);
  const input = JSON.parse(requests[0].messages[1].content);
  expect(input.lastSelectedPage).toBe("popup");
  expect(input.recentPages[0].title).toBe("Popup behavior");
  expect(JSON.stringify(input)).not.toContain(origin);
  expect(hits).toEqual([]);
  await close();
  await launch();
  await expect(
    shell.getByRole("region", { name: "Task overview" }),
  ).toContainText("You appear to have been reviewing extension APIs");
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell
    .getByRole("button", { name: "Turn off local AI", exact: true })
    .click();
  await shell
    .getByRole("button", { name: "Back to browsing", exact: true })
    .click();
  await expect(
    shell.getByRole("region", { name: "Task overview" }),
  ).not.toContainText("AI description");
  await expect(
    shell.getByRole("region", { name: "Task overview" }),
  ).toContainText("You had Popup behavior");
});

for (const mode of ["remote", "malformed"] as const) {
  test(`${mode} model response falls back without blocking task restoration`, async () => {
    await mockLocalModel(mode === "remote", mode === "malformed");
    await enableModel();
    await expect(
      shell.getByRole("region", { name: "Task overview" }),
    ).toContainText("Local AI unavailable");
    const count = await app.evaluate(
      () =>
        (globalThis as typeof globalThis & { summaryRequests: unknown[] })
          .summaryRequests.length,
    );
    expect(count).toBe(mode === "remote" ? 0 : 1);
    await shell
      .getByRole("button", {
        name: "Resume Build extension support",
        exact: true,
      })
      .click();
    await expect
      .poll(() => hits.includes("/api") && hits.includes("/popup"))
      .toBe(true);
  });
}

test("built-in AI generates offline, caches across restart and can be turned off", async () => {
  test.skip(!process.env.TERN_AI_BUILTIN_MODEL, "Set TERN_AI_BUILTIN_MODEL to the pinned built-in GGUF.");
  test.setTimeout(90_000);
  await mkdir(join(profile, "models"));
  await symlink(process.env.TERN_AI_BUILTIN_MODEL!, join(profile, "models", BUILTIN_MODEL.filename));
  await app.evaluate(() => {
    globalThis.fetch = async () => { throw new Error("Offline test: no HTTP requests allowed"); };
  });
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.getByRole("combobox", { name: "Local AI" }).selectOption("builtin");
  await expect(shell.getByText(`Using built-in ${BUILTIN_MODEL.name}.`, { exact: true })).toBeVisible();
  await shell.locator(".settings-page section").filter({
    has: shell.getByRole("heading", { name: "Task overview and assistance", exact: true }),
  }).screenshot({ path: "/tmp/tern-built-in-ai-settings.png" });
  await shell.getByRole("button", { name: "Back to browsing", exact: true }).click();
  const card = shell.getByRole("button", { name: "Resume Build extension support", exact: true });
  await expect(card).toContainText("AI description", { timeout: 60_000 });
  const description = await card.locator(".tile-description").innerText();
  expect(description).toMatch(/popup|extension/i);
  expect(await readFile(join(profile, "models", "LFM-LICENSE.txt"), "utf8"))
    .toContain("LFM Open License");
  await expect.poll(() => app.evaluate(({ app }) =>
    app.getAppMetrics().some((entry) => entry.name === "Tern local AI"),
  )).toBe(false);
  await close();
  await launch();
  await expect(shell.getByRole("button", {
    name: "Resume Build extension support", exact: true,
  }).locator(".tile-description")).toHaveText(description);
  await shell.getByRole("button", { name: "Settings", exact: true }).click();
  await shell.getByRole("button", { name: "Turn off local AI", exact: true }).click();
  await shell.getByRole("button", { name: "Back to browsing", exact: true }).click();
  await expect(shell.getByRole("region", { name: "Task overview" })).not.toContainText("AI description");
});
