# Tern desktop

![Tern](../design/brand/tern-wordmark.svg)

A Linux desktop browser built around tasks, with real Chromium pages. The first build supports task creation and renaming, live page retention, pause notes, resuming, settlement, navigation and search, find on page, new-window links, and downloads.

The Svelte UI and assets live in `packages/app`; shared task rules, workspace parsing and AI prompts live in `packages/core`. This workspace supplies the Electron bridge, browser views, persistence and native integrations. `src/main.ts` mounts the shared UI with that bridge. Desktop builds compile the core and run the shared Svelte type checker automatically; packaging includes it in the standalone app.

## Install and update

From the repository root, install Tern for your Linux user:

```bash
./install-tern
```

The installer builds the current working copy, including uncommitted changes, and adds Tern to your desktop app launcher. You can also run `~/.local/bin/tern`. The installed app includes Electron and runs without Node, npm, a development server, or this repository. Building updates requires the repository, Node and the dependencies installed by `npm ci` at the repository root.

After changing the application, push that build into the local installation:

```bash
./update-tern
```

Quit and reopen Tern when ready to use the update. Updating does not close the running browser. Quitting still ends live website state, so save website edits first. Tasks, cookies, preferences and extensions stay in the existing profile.

Each build gets a separate directory under `$XDG_DATA_HOME/tern/releases`, normally `~/.local/share/tern/releases`. The launcher switches to it only after the copy completes. Previous builds remain on disk so running copies keep their files. To switch back to the previous build, run `./update-tern --rollback`, then quit and reopen. Rollback switches application files only; it does not restore older profile data. Older releases are not automatically deleted and each currently occupies about 285 MB.

This updates this machine from the local working copy. It does not fetch Git changes or check an internet release service. Hosted updates need a release location and a Linux update mechanism; Electron's [built-in updater does not support Linux](https://www.electronjs.org/docs/latest/api/auto-updater).

Use `./install-tern --from desktop/release/Tern-linux-x64` to install an already packaged build. `--prefix /absolute/directory` installs into an isolated directory for checks, overriding the usual executable and data locations. Installation and updates use your own account and do not require root.

To uninstall, remove `~/.local/bin/tern`, `$XDG_DATA_HOME/applications/tern.desktop` and `$XDG_DATA_HOME/tern`, substituting `~/.local/share` when `XDG_DATA_HOME` is unset. Keep your browsing profile, normally `~/.config/Tern` for new users or `~/.config/Trailrest` for existing users.

The former `install-trailrest`, `update-trailrest`, and `start-trailrest` repository scripts forward to their Tern equivalents. Installing Tern redirects an old launcher and removes an old menu entry only when they carry the Trailrest installer's ownership marker. Old release directories remain intact so a running copy keeps its files. Rollback under Tern covers Tern releases; it does not switch to a pre-rename Trailrest release.

## Run from the repository

```bash
npm ci
npm run build:desktop
npm start
```

Run those commands at the repository root. Build a standalone Linux directory with `npm run package:desktop`. Workspace scripts also work from `desktop/`, for example `npm run build` and `npm run package`. From the root, `./start-tern` opens the packaged Tern build when available, otherwise it starts the local development build. No Vite server is needed. The launcher clears `ELECTRON_RUN_AS_NODE`, which some development tools inherit.

Create a task, then enter an HTTP(S) address or search query. Searches use DuckDuckGo by default; Settings also offers Google, Bing and Brave Search. Pages keep their in-memory state across task and page switches, including when a task is put aside. Settling unloads every tab in that task and cancels pending tab loads. Titles and addresses remain as references to reopen; unsaved website state is lost. Closing or reloading a page asks first. Quitting warns that live website state will end.

Task names, lifecycle, notes and page addresses are saved in `workspace.json` in the browsing profile, normally `~/.config/Tern` on Linux. If that directory does not exist and the previous `~/.config/Trailrest` profile does, Tern reuses it in place. No live profile is copied or moved. The internal website partition remains `persist:trailrest-web` to retain cookies and extension storage. Set `TERN_PROFILE` to an absolute directory for an isolated profile; the old `TRAILREST_PROFILE` variable remains a fallback. Only one application instance opens a given profile.

After restart, saved pages appear as references to reopen. Unsaved form values, file selections and JavaScript state are not restored. Task status never certifies website save or submission. All live pages remain in memory until closed or the app quits.

## Tasks, settings and appearance

Tern opens to an overview of Active tasks, with recently opened tasks first. Each tile describes its saved pages, names the last selected page and shows your saved next-step note. Later and Settled tasks remain in the sidebar. The Overview button returns to the tiles without closing live pages.

Click a tile, or focus it and press Enter, to reopen all saved sites in that task and return to its selected page. The selected document starts first; the remaining documents start one at a time after DOM readiness, while images and other assets can continue loading. Clicking a waiting tab opens it immediately. A stalled document releases the queue after five seconds. Other tasks remain unopened. Existing live pages are reused without reloading. The 100-live-page limit includes waiting tabs; larger tasks can be selected in the sidebar and reopened individually. A failed page displays its normal retry view while other tabs continue loading.

Descriptions use built-in **LFM2.5 1.2B Instruct**, running locally through `node-llama-cpp`. No Ollama installation, account or API key is needed. On the first overview with saved pages, Tern downloads the pinned 696 MB model from Liquid AI's Hugging Face repository. Progress appears in the overview and Settings. Downloads resume after interruption and must match the pinned size and SHA-256 before inference can start. Saved browsing details remain visible while the model is prepared. The downloaded model and its license live in the profile's `models` folder and are reused offline.

Settings → Task overview and assistance → Local AI offers Built-in LFM2.5 AI, Custom Ollama model and Off. Retry built-in AI restarts setup after a download or runtime failure. Turning local AI off cancels work and clears generated descriptions and suggestions, while keeping downloaded model files for later use. The previous `lfm2.5-thinking` default migrates to built-in inference; explicit opt-outs and other custom Ollama model choices are preserved. Custom Ollama connections remain restricted to `127.0.0.1:11434`, reject cloud-backed aliases and have no cloud fallback. [Ollama local-only configuration](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features)

AI descriptions use task names, saved notes and up to 12 recent page titles and hostnames, with the selected page identified. They do not read page bodies, forms, URL paths or query strings. Browsing metadata stays on this device. Descriptions are labelled as inferred, and saved browsing details remain the fallback for invalid responses or unavailable inference.

The built-in model runs in a separate Electron utility process with up to four CPU threads, a 4,096-token context and a 256-token output limit. The built-in model uses the sampling settings evaluated for this caption task: temperature 0.1, top-k 50 and repetition penalty 1.05. Requests run sequentially with a fresh chat sequence for each task. Generation times out after 30 seconds; model startup has a 60-second limit. Opening a task, turning AI off or quitting stops the utility process immediately. The process also exits after the batch finishes, releasing its model memory. No runtime source compilation or cloud inference fallback occurs.

Generated descriptions are cached in `task-summaries.json` while the prompt, source metadata and configured model match. The built-in model ID includes the quantization and pinned revision, so a future model update invalidates older descriptions. See [model research and measured results](../docs/embedded-ai-model-research.md) and the bundled [LFM model license](resources/licenses/lfm-open-license-1.0.txt).

Type a name into New task in the sidebar and press Enter. The field shows an Enter hint while focused, and the new card moves down into the task list. Escape clears the draft. Reduced-motion preferences skip the animation.

To start with an intention, choose **Start from a goal** and describe what you need to do. The same form opens from **Create your first task** on the overview. **Start task** uses your configured local AI to create a short task name, an editable goal, and two or three distinct search queries. Tern runs those searches using your chosen search engine and opens the first organic web result from each in a tab. The first tab is selected and the others load in the background. Back returns to the search results. If no recognizable result appears within 12 seconds, including verification or consent screens, the search page stays open. Typing, clicking or scrolling inside a page cancels its automatic navigation, as do the address bar and navigation controls. Existing live pages stay open.

The complete request is saved under **Original request** in Task notes, including any details the generated goal omits. Task setup sends only that request to the local model, and sends the resulting queries to your chosen search engine. It does not use other tasks, infer completed work or open AI-invented website addresses. Names, goals and queries can still be too broad; edit the goal or refine a search as needed.

Cancel setup or Escape stops generation and keeps the request in the form for this session. A failed model or workspace save leaves the request available for retry and creates no partial task. **Create without AI**, also the default behavior when AI is off, uses your request as the name and goal, shortened to the field limits, and opens the first web result of one search, with the same search-page fallback. The full request is retained in either mode.

Later and Settled start collapsed. Click either heading to show its tasks. Drag a task title onto either heading to move it there; drag back to the active task list to resume it. Moving a task preserves its note and page references. Moving to Settled unloads its live pages, just like the Settle action. Task notes also has a keyboard-accessible status selector.

Ctrl-click tabs to add or remove them from a selection. Shift-click selects a range from the last clicked tab; Ctrl+Shift-click adds that range to the current selection. A plain click selects one tab, and switching tasks clears the group. The visible tab has an accent marker when several tabs are selected. Right-click a selected tab to duplicate, reload or reopen, copy addresses, or close the group. Ctrl+W and the toolbar close button also close the selected group, with one browser confirmation for live tabs and any website unload decisions. Right-clicking an unselected tab or middle-clicking a tab still targets that individual tab.

Right-click a task for New tab, Rename, Put aside, Settle, or Return to active. Right-click a tab for New tab, Duplicate, Reload/Reopen, Copy address, or Close. These actions target the clicked item without first selecting it. Duplicate opens a fresh copy of the address; it does not copy unsaved form state. Close and reload retain their confirmations.

Middle-click a tab to close it, or a website link to open a background tab in the same task. Middle-clicking a task does nothing. Hovering a task or tab explains its mouse controls. With a row focused, Shift+F10 opens its menu; arrow keys move through actions, Enter activates one, and Escape closes the menu and returns focus. Menus also dismiss on outside clicks or scrolling.

Task notes is an optional panel, closed initially. Use it to edit and save a next-step reminder without changing task status. Drafts remain in the panel when switching tasks or closing it; only saved notes survive quitting. Open it using the note icon beside the address bar. Downloads have their own toolbar button.

Task notes also keeps an editable goal and saved findings. Save the goal in your own words, then choose **Generate suggestions** for a draft goal when none is saved and up to two suggested searches. Edit a suggested goal before saving it. Clicking a search opens a new tab in that task using your chosen search engine, leaving the current page and its live form state intact. A saved goal always takes priority over an AI draft.

Findings are things you choose to keep, with no inferred completion percentage. Add or edit one in Task notes, or select up to 1,000 characters of ordinary page text and right-click → **Keep selection as a finding**. The selection action stores the text and source address; it is unavailable in editable fields. Source buttons reopen the address in a new tab. Each task can keep 50 findings. Goals and findings persist with the workspace and remain available with AI off.

Task suggestions use the saved goal, next-step note, up to eight recent page titles, and the last six findings, shortened to 280 characters each. Source addresses, URL paths and query strings are excluded from model input; they remain in the local workspace when explicitly saved with a finding. Tern does not automatically read page bodies or form fields. Suggestions may be incomplete or wrong, especially with vague titles or notes. A basic topic-word check filters unrelated output; generic tasks with no specific topic skip inference. This check does not verify facts.

Suggestions run only when requested, through the same configured local model as overview descriptions. The model unloads after generation; Stop generating, closing Task notes, switching tasks and turning AI off cancel pending work. Results are cached separately in `task-context.json` while the model, prompt and input match. Changed input hides old suggestions, and late results are discarded. Turning local AI off clears both generated caches without removing your saved goal, notes or findings.

The camera button saves the visible part of the current website as a PNG in your configured download folder. It saves immediately, even when other downloads ask for a location. A brief camera animation and checkmark confirm success, and a notification shows the saved path. Snapshots also appear in Downloads. Settings → Tools → Show snapshot button hides or shows the camera and remembers your choice. Capture uses Electron's [page capture API](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts).

The shell reads Omarchy's current colors from `$XDG_STATE_HOME/omarchy/current/theme/colors.toml`, normally `~/.local/state/omarchy/current/theme/colors.toml`. The older `~/.config/omarchy/current` location is also supported. It picks up changes while running and falls back to a dark palette when no valid theme is available. The address bar always stays dark. `TERN_THEME_DIR` overrides the current-theme directory for isolated checks.

The top-left sidebar button collapses tasks into a narrow rail. The choice survives restarting. Scrolling down a website hides the address bar; scrolling up, using the top reveal strip or pressing Ctrl+L restores it. Settings can disable this behavior.

Settings is a full browser page with persisted search-engine selection, default zoom, download folder and location prompting, toolbar behavior and explicit cache clearing. Preferences live in `preferences.json` in the profile. Clearing cache retains cookies, logins and task metadata.

Settings → Page loading → Preload likely pages when hovering over links is enabled by default. Chromium can fetch an eligible same-origin page after roughly 200 ms of hover, or on pointer-down, and reuse it when clicked. External links warm one connection without fetching the destination. The policy skips query strings, fragments, downloads, new-window links, common action/account paths and site opt-outs. It pauses on hidden pages, unfocused windows, offline or slow connections and Data Saver. This uses extra data and the path exclusions are heuristic; turn it off for sites whose links perform actions. Site CSP remains in force. Details and measured limits are in [hover preloading](../docs/hover-preloading.md).

The top-right puzzle button opens Extensions. Paste a Chrome Web Store link or ID and choose Download package to save its CRX from Google's service. Then use Import package to review and load a ZIP/CRX. A developer-supplied package works through the same flow, and Load unpacked remains available for folders. Imports validate archive paths and size limits, show manifest details and ask before loading. Publisher signatures are not verified; an imported package is treated as unpacked code. Imported files are kept under the profile's `imported-extensions` directory. Removing an extension unloads it and removes its registration; its imported files remain on disk.

Registrations are remembered in `extensions.json`. Extensions run only in the website session. Changes apply to newly loaded pages; reloading existing pages can lose unsaved edits. Installed extensions with a popup have an Open button and a toolbar initial. Browser API support now includes tab tracking, popup windows, navigation events and manifest shortcuts; some Chrome APIs remain unsupported. Chrome's Add to Chrome button is not connected to Tern, and downloading a package does not guarantee compatibility. See [Electron's supported extension APIs](https://www.electronjs.org/docs/latest/api/extensions).

For Bitwarden, use the **B** toolbar button or **Ctrl+Shift+U**, then sign in inside the extension. **Ctrl+Shift+L** requests autofill on the selected page. See [Bitwarden compatibility and verification limits](../docs/bitwarden-compatibility.md).

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
| F12 / Ctrl+Shift+I   | Toggle the selected website's DevTools |
| Escape               | Cancel a task dialog or close find    |

Task letters remain stable when tasks move between groups. Open a group to see its hints. A task shortcut also opens its group and clears the search filter. Tasks beyond the first 26 and tabs beyond the first 10 remain available by clicking. Standard Ctrl shortcuts keep their usual meanings.

## Checks

For a website's loading timeline, open it and press F12 or Ctrl+Shift+I. DevTools opens in a separate window for that website. Use Performance to record a reload and interactions, or Network to inspect requests. These shortcuts do nothing when the website is hidden behind the overview or settings.

Run `npm run measure:loading` from `desktop/` for an opt-in check of 4WD Supacentre, Supercheap Auto and MakerWorld. It uses temporary profiles, checks whether search accepts input without submitting, and checks scrolling. It measures usability without waiting for the full load event. Cold and repeat visits use the same site profile; profiles are removed afterwards. Results go to `/tmp/tern-loading.json`; set `TERN_PERF_OUTPUT` for another path. Pass URLs after `--` to test different sites. Set `TERN_PERF_RESTORE=1` to compare restoring a task containing all supplied URLs, selecting each site in turn. Challenge pages and missing controls are reported separately from successful interactions. These are local observations, not field Core Web Vitals or a universal time-to-interactive score. See the [loading report](../docs/loading-performance.md).

From `desktop/`:

```bash
npm run build
npm test
npm run test:unit
```

Tests launch the actual sandboxed Electron app against controlled HTTP sites and temporary profiles. A graphical Linux session must be available. Native dialog responses are automated at the Electron boundary; website and shell behavior are asserted through their UI. Screenshots go to `design/qa/desktop-*.png`.

After packaging, `node scripts/visual-check.mjs` performs the optional native screenshot check on this machine's Hyprland desktop. It uses a temporary profile and captures only its own test window. See the [implementation review](../docs/desktop-implementation-review.md) for findings and visual evidence.

## Current limits

Chromium's `CanvasDrawElement` feature is enabled at startup, equivalent to enabling `chrome://flags/#canvas-draw-element`. Websites can copy text and images to the clipboard by default.

This is a local alpha. It has no hosted assistant service, full Chrome extension compatibility, sync, built-in password manager, profile import, private browsing, or automatic engine updates. Website permission requests for camera, microphone, location, notifications and clipboard reading are denied with a message. Installed extensions may use declared clipboard permissions in their own windows. Unsupported external schemes are blocked. Some sign-in and payment flows may depend on capabilities this build does not provide. Downloads use your location preference and never execute the saved file.

Remote pages have no Node access or exposed Tern bridge. A sandboxed, isolated preload observes scroll direction and eligible hovered links. It sends scroll direction and, for connection warming, only an external destination origin to the host; no page text or form values are sent. The shell uses a dedicated local protocol and session, and the main process validates command senders and arguments. Electron is pinned to 44.4.3. Before wider distribution, update Electron regularly and expand compatibility and security testing. The UI checks here establish the tested workflows, not a general security certification.

See the [original-spec gap review](../docs/original-spec-gap-review.md), [desktop specification](../docs/desktop-browser-spec.md), [engine decision](../docs/adr/0001-desktop-browser-host.md), and [host research](../docs/browser-host-research.md).
