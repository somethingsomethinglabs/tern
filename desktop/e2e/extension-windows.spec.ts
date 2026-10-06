import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const closeWith of ["windows", "tabs"] as const) {
  test(`a completed passkey popout closes through ${closeWith} without closing the vault`, async () => {
    const profile = await mkdtemp(join(tmpdir(), "tern-extension-windows-"));
    const extension = join(profile, "vault");
    await mkdir(extension);
    await writeFile(join(extension, "manifest.json"), JSON.stringify({
      manifest_version: 3, name: "Passkey fixture", version: "1.0",
      permissions: ["tabs"], action: { default_popup: "vault.html" },
      background: { service_worker: "background.js" },
    }));
    await writeFile(join(extension, "vault.html"), '<h1>Vault</h1><button>Start passkey</button><script src="vault.js"></script>');
    await writeFile(join(extension, "vault.js"), `document.querySelector('button').onclick = () => chrome.runtime.sendMessage({start:true});`);
    await writeFile(join(extension, "prompt.html"), '<h1>Choose passkey</h1><button>Use passkey</button><p id="context"></p><output></output><script src="prompt.js"></script>');
    await writeFile(join(extension, "prompt.js"), `chrome.runtime.getContexts({documentUrls:[location.href]}).then(([context]) => document.querySelector('#context').textContent = context.contextType + '/' + (context.tabId > 0));
      document.querySelector('button').onclick = () => chrome.runtime.sendMessage({complete:true}).then(result => document.querySelector('output').textContent = result);`);
    await writeFile(join(extension, "background.js"), `
      chrome.runtime.onMessage.addListener((message, sender, respond) => {
        if (message.start) {
          chrome.windows.create({url:chrome.runtime.getURL('prompt.html?singleActionPopout=passkey'),type:'popup'}).then(() => respond(true));
          return true;
        }
        if (message.complete) {
          // Bitwarden closes its single-action prompts by querying their tabs.
          chrome.tabs.query({url:chrome.runtime.getURL('prompt.html')+'*'}).then(async tabs => {
            const prompt = tabs.find(tab => tab.url.includes('singleActionPopout=passkey'));
            if (!prompt) { respond('Missing popout tab'); return; }
            await chrome.${closeWith}.remove(prompt.${closeWith === "windows" ? "windowId" : "id"});
            respond('Closed');
          });
          return true;
        }
      });
    `);
    await writeFile(join(profile, "extensions.json"), JSON.stringify([extension]));
    await writeFile(join(profile, "preferences.json"), JSON.stringify({ summaryModel: "" }));
    const app = await electron.launch({
      ...(process.env.TERN_EXECUTABLE
        ? { executablePath: process.env.TERN_EXECUTABLE }
        : {}),
      args: ["."], cwd: process.cwd(), chromiumSandbox: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "", TERN_PROFILE: profile },
    });
    try {
      const shell = await app.firstWindow();
      await shell.getByRole("button", { name: "Open Passkey fixture", exact: true }).click();
      await expect.poll(() => app.context().pages().some(page => page.url().endsWith("/vault.html"))).toBe(true);
      const vault = app.context().pages().find(page => page.url().endsWith("/vault.html"))!;
      await vault.getByRole("button", { name: "Start passkey" }).click();
      await expect.poll(() => app.context().pages().some(page => page.url().includes("/prompt.html"))).toBe(true);
      const prompt = app.context().pages().find(page => page.url().includes("/prompt.html"))!;
      await expect(prompt.locator("#context")).toHaveText("TAB/true");
      await prompt.getByRole("button", { name: "Use passkey" }).click();
      await expect.poll(() => prompt.isClosed()).toBe(true);
      await expect(vault.getByRole("heading", { name: "Vault", exact: true })).toBeVisible();
      await expect(shell.getByRole("alert")).not.toBeVisible();
    } finally {
      await app.evaluate(({ dialog }) => { dialog.showMessageBoxSync = () => 1; }).catch(() => {});
      await app.close();
      await rm(profile, { recursive: true, force: true });
    }
  });

}
