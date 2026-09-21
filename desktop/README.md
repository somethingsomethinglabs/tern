# Trailrest desktop

A Linux desktop browser built around tasks, with real Chromium pages. The first build supports task creation and renaming, live page retention, pause notes, resuming, settlement, navigation and search, find on page, new-window links, and downloads.

## Run

```bash
cd desktop
npm ci
npm run build
npm start
```

Build a standalone Linux directory with `npm run package`. From the repository root, `./start-trailrest` opens that packaged build when available, otherwise it starts the local development build. No Vite server is needed. The launcher clears `ELECTRON_RUN_AS_NODE`, which some development tools inherit.

Create a task, then enter an HTTP(S) address or search query. Searches use DuckDuckGo. Pages keep their in-memory state across task and page switches, including when a task is put aside or settled. Closing or reloading a page asks first. Quitting warns that live website state will end.

Task names, lifecycle, notes and page addresses are saved in `workspace.json` in Electron's Trailrest user data directory, normally `~/.config/Trailrest` on Linux. Website cookies and storage use the separate `persist:trailrest-web` session in that profile. Set `TRAILREST_PROFILE` to an absolute directory for an isolated profile. Only one application instance opens a given profile.

After restart, saved pages appear as references to reopen. Unsaved form values, file selections and JavaScript state are not restored. Task status never certifies website save or submission. All live pages remain in memory until closed or the app quits.

## Tasks, settings and appearance

Later and Settled start collapsed. Click either heading to show its tasks. Drag a task title onto either heading to move it there; drag back to the active task list to resume it. Moving a task preserves its note and live pages. The Task context panel also has a keyboard-accessible status selector.

Task context is an optional panel, closed initially. It shows the note you wrote when putting a task aside, its page count and download status. It does not read or summarize websites. Open it using the panel icon beside the address bar.

The shell reads Omarchy's current colors from `$XDG_STATE_HOME/omarchy/current/theme/colors.toml`, normally `~/.local/state/omarchy/current/theme/colors.toml`. The older `~/.config/omarchy/current` location is also supported. It picks up changes while running and falls back to a dark palette when no valid theme is available. The address bar always stays dark. `TRAILREST_THEME_DIR` overrides the current-theme directory for isolated checks.

The sidebar Settings button opens Trailrest settings and shortcut help. Electron does not include Chromium's native settings page. The top-right puzzle button opens Extensions. It can load and remove unpacked extension folders, remembering them in `extensions.json` in the profile. Extensions run only in the website session. Changes apply to newly loaded pages; reloading existing pages can lose unsaved edits. Some Chrome APIs, extension toolbar popups, and Chrome Web Store installation are unavailable. See [Electron's supported extension APIs](https://www.electronjs.org/docs/latest/api/extensions).

## Keyboard

| Shortcut             | Action                                |
| -------------------- | ------------------------------------- |
| Hold Alt             | Show task letters and tab numbers     |
| Alt+A–Z              | Select a task, in creation order      |
| Alt+1–9 / Alt+0      | Select tab 1–9 / tab 10 in that task  |
| Ctrl+L               | Focus and select the address          |
| Ctrl+T               | New page in the current task          |
| Ctrl+W               | Close current page, with confirmation |
| Ctrl+R or F5         | Reload, with confirmation             |
| Alt+Left / Alt+Right | Back / forward                        |
| Ctrl+F               | Find on page                          |
| Escape               | Cancel a task dialog or close find    |

Task letters remain stable when tasks move between groups. Open a group to see its hints. A task shortcut also opens its group and clears the search filter. Tasks beyond the first 26 and tabs beyond the first 10 remain available by clicking. Standard Ctrl shortcuts keep their usual meanings.

## Checks

```bash
npm run build
npm test
```

Tests launch the actual sandboxed Electron app against controlled HTTP sites and temporary profiles. A graphical Linux session must be available. Native dialog responses are automated at the Electron boundary; website and shell behavior are asserted through their UI. Screenshots go to `design/qa/desktop-*.png`.

After packaging, `node scripts/visual-check.mjs` performs the optional native screenshot check on this machine's Hyprland desktop. It uses a temporary profile and captures only its own test window. See the [implementation review](../docs/desktop-implementation-review.md) for findings and visual evidence.

## Current limits

This is a local alpha. It has no assistant service, full Chrome extension compatibility, sync, password manager, profile import, private browsing, or automatic engine updates. Website permission requests, including camera, microphone, location, notifications and clipboard permissions, are denied with a message. Unsupported external schemes are blocked. Some sign-in and payment flows may depend on capabilities this build does not provide. Downloading a file asks for a destination and never executes it.

Remote pages have no Node access or Trailrest preload. The shell uses a dedicated local protocol and session, and the main process validates command senders and arguments. Electron is pinned to 44.4.3. Before wider distribution, update Electron regularly and expand compatibility and security testing. The UI checks here establish the tested workflows, not a general security certification.

See the [desktop specification](../docs/desktop-browser-spec.md), [engine decision](../docs/adr/0001-desktop-browser-host.md), and [host research](../docs/browser-host-research.md).
