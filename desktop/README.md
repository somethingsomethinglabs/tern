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

The repository installer updates this machine from the local working copy. Packaged Linux releases also support publisher-signed updates in Settings after installation. See the [Linux release process](../docs/linux-release.md) for signing, hosted distribution and access requirements.

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

Create a task, then enter an HTTP(S) address or search query. Searches use DuckDuckGo by default; Settings also offers Google, Bing and Brave Search. Pages keep their in-memory state across task and page switches, including when a task is put aside. When a task has live pages, Settle first asks you to confirm that unsaved website changes will be lost. You can cancel or choose Put aside instead. This warning also applies to the task menu, status selector and dragging into Settled. Confirming unloads every tab in that task and cancels pending tab loads. Titles and addresses remain as references to reopen; unsaved website state is lost. Closing or reloading a page asks first. Quitting warns that live website state will end.

Task names, lifecycle, notes and page addresses are saved in `workspace.json` in the browsing profile, normally `~/.config/Tern` on Linux. If that directory does not exist and the previous `~/.config/Trailrest` profile does, Tern reuses it in place. No live profile is copied or moved. The internal website partition remains `persist:trailrest-web` to retain cookies and extension storage. Set `TERN_PROFILE` to an absolute directory for an isolated profile; the old `TRAILREST_PROFILE` variable remains a fallback. Only one application instance opens a given profile.

After restart, saved pages appear as references to reopen. Unsaved form values, file selections and JavaScript state are not restored. Task status never certifies website save or submission. All live pages remain in memory until closed or the app quits.

## Tasks, settings and appearance

Tern opens to an overview of Active tasks, with recently opened tasks first. Each tile describes its saved pages, names the last selected page and shows your saved next-step note. Later tasks sit below active tasks and start collapsed. Settled tasks appear below Later and start expanded; settling a task opens that list automatically. The Overview icon beside Search returns to the tiles without closing live pages.

Click a tile, or focus it and press Enter, to reopen all saved sites in that task and return to its selected page. The selected document starts first; the remaining documents start one at a time after DOM readiness, while images and other assets can continue loading. Clicking a waiting tab opens it immediately. A stalled document releases the queue after five seconds. Other tasks remain unopened. Existing live pages are reused without reloading. The 100-live-page limit includes waiting tabs; larger tasks can be selected in the sidebar and reopened individually. A failed page displays its normal retry view while other tabs continue loading.

Descriptions use built-in **LFM2.5 1.2B Instruct**, running locally through `node-llama-cpp`. No Ollama installation, account or API key is needed. On the first overview with saved pages, Tern downloads the pinned 696 MB model from Liquid AI's Hugging Face repository. Progress appears in the overview and Settings. Downloads resume after interruption and must match the pinned size and SHA-256 before inference can start. Saved browsing details remain visible while the model is prepared. The downloaded model and its license live in the profile's `models` folder and are reused offline.

Settings → Task overview and assistance → Local AI offers Built-in LFM2.5 AI, Custom Ollama model and Off. Retry built-in AI restarts setup after a download or runtime failure. Turning local AI off cancels work and clears generated descriptions and suggestions, while keeping downloaded model files for later use. The previous `lfm2.5-thinking` default migrates to built-in inference; explicit opt-outs and other custom Ollama model choices are preserved. Custom Ollama connections remain restricted to `127.0.0.1:11434`, reject cloud-backed aliases and have no cloud fallback. [Ollama local-only configuration](https://docs.ollama.com/faq#how-do-i-disable-ollama-cloud-features)

AI descriptions use task names, saved notes and up to 12 recent page titles and hostnames, with the selected page identified. They do not read page bodies, forms, URL paths or query strings. Browsing metadata stays on this device. Descriptions are labelled as inferred, and saved browsing details remain the fallback for invalid responses or unavailable inference.

The built-in model runs in a separate Electron utility process with up to four CPU threads, a 4,096-token context and a 256-token output limit. The built-in model uses the sampling settings evaluated for this caption task: temperature 0.1, top-k 50 and repetition penalty 1.05. Requests run sequentially with a fresh chat sequence for each task. Generation times out after 30 seconds; model startup has a 60-second limit. Opening a task, turning AI off or quitting stops the utility process immediately. The process also exits after the batch finishes, releasing its model memory. No runtime source compilation or cloud inference fallback occurs.

Generated descriptions are cached in `task-summaries.json` while the prompt, source metadata and configured model match. The built-in model ID includes the quantization and pinned revision, so a future model update invalidates older descriptions. See [model research and measured results](../docs/embedded-ai-model-research.md) and the bundled [LFM model license](resources/licenses/lfm-open-license-1.0.txt).

Click the New task icon beside Search, type a name and press Enter or click Add. The field shows an Enter hint while focused, and the new card moves down into the task list. Escape clears the draft and closes the field. Reduced-motion preferences skip the animation.

To start with an intention, choose **Start from a goal** and describe what you need to do. The same form opens from **Create your first task** on the overview. **Start task** uses your configured local AI to create a short task name, an editable goal, and two or three distinct search queries. Tern opens a reading list for each query. The first list is selected. Choose a result or use Open first result. Existing live pages stay open. The optional search-engine website view retains the previous first-result navigation behavior.

The complete request is saved under **Original request** in Task notes, including any details the generated goal omits. Task setup sends only that request to the local model, and sends the resulting queries to your chosen search engine. It does not use other tasks, infer completed work or open AI-invented website addresses. Names, goals and queries can still be too broad; edit the goal or refine a search as needed.

Cancel setup or Escape stops generation and keeps the request in the form for this session. A failed model or workspace save leaves the request available for retry and creates no partial task. **Create without AI**, also the default behavior when AI is off, uses your request as the name and goal, shortened to the field limits, and opens one search reading list. The full request is retained in either mode.

Later and Settled start collapsed. Click either heading to show its tasks. Drag a task title onto either heading to move it there; drag back to the active task list to resume it. Moving a task preserves its note and page references. Moving to Settled unloads its live pages, just like the Settle action. Task notes also has a keyboard-accessible status selector.

Ctrl-click tabs to add or remove them from a selection. Shift-click selects a range from the last clicked tab; Ctrl+Shift-click adds that range to the current selection. A plain click selects one tab, and switching tasks clears the group. The visible tab has an accent marker when several tabs are selected. Right-click a selected tab to duplicate, reload or reopen, copy addresses, or close the group. Ctrl+W and the toolbar close button also close the selected group, with one browser confirmation for live tabs and any website unload decisions. Right-clicking an unselected tab or middle-clicking a tab still targets that individual tab.

The Resume task button and Return to active menu action activate the task and reopen its saved pages, starting with the selected page. Existing live pages are reused.

Right-click a task for New tab, Rename, Put aside, Settle, or Return to active. Right-click a tab for New tab, Duplicate, Reload/Reopen, Copy address, or Close. These actions target the clicked item without first selecting it. Duplicate opens a fresh copy of the address; it does not copy unsaved form state. Close and reload retain their confirmations.

Middle-click a tab to close it, or a website link to open a background tab in the same task. Middle-clicking a task does nothing. Hovering a task or tab explains its mouse controls. With a row focused, Shift+F10 opens its menu; arrow keys move through actions, Enter activates one, and Escape closes the menu and returns focus. Menus also dismiss on outside clicks or scrolling.

Task notes is an optional panel, closed initially. Use it to edit and save a next-step reminder without changing task status. Drafts remain in the panel when switching tasks or closing it; only saved notes survive quitting. Open it using the note icon beside the address bar. Downloads have their own toolbar button.

Task notes also keeps an editable goal and saved findings. Save the goal in your own words, then choose **Generate suggestions** for a draft goal when none is saved and up to two suggested searches. Edit a suggested goal before saving it. Clicking a search opens a new reading list in that task, leaving the current page and its live form state intact. A saved goal always takes priority over an AI draft.

Findings are things you choose to keep, with no inferred completion percentage. Add or edit one in Task notes, or select up to 1,000 characters of ordinary page text and right-click → **Keep selection as a finding**. The selection action stores the text and source address; it is unavailable in editable fields. Source buttons reopen the address in a new tab. Each task can keep 50 findings. Goals and findings persist with the workspace and remain available with AI off.

Task suggestions use the saved goal, next-step note, up to eight recent page titles, and the last six findings, shortened to 280 characters each. Source addresses, URL paths and query strings are excluded from model input; they remain in the local workspace when explicitly saved with a finding. Tern does not automatically read page bodies or form fields. Suggestions may be incomplete or wrong, especially with vague titles or notes. A basic topic-word check filters unrelated output; generic tasks with no specific topic skip inference. This check does not verify facts.

Suggestions run only when requested, through the same configured local model as overview descriptions. The model unloads after generation; Stop generating, closing Task notes, switching tasks and turning AI off cancel pending work. Results are cached separately in `task-context.json` while the model, prompt and input match. Changed input hides old suggestions, and late results are discarded. Turning local AI off clears both generated caches without removing your saved goal, notes or findings.

The camera button saves the visible part of the current website as a PNG in your configured download folder. It saves immediately, even when other downloads ask for a location. A brief camera animation and checkmark confirm success, and a notification shows the saved path. Snapshots also appear in Downloads. Settings → Tools → Show snapshot button hides or shows the camera and remembers your choice. Capture uses Electron's [page capture API](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts).

The shell reads Omarchy's current colors from `$XDG_STATE_HOME/omarchy/current/theme/colors.toml`, normally `~/.local/state/omarchy/current/theme/colors.toml`. The older `~/.config/omarchy/current` location is also supported. It picks up changes while running and falls back to a dark palette when no valid theme is available. The address bar always stays dark. `TERN_THEME_DIR` overrides the current-theme directory for isolated checks.

The top-left sidebar button collapses tasks into a narrow rail. The choice survives restarting. Scrolling down a website hides the address bar; scrolling up, using the top reveal strip or pressing Ctrl+L restores it. Settings can disable this behavior.

Settings is a full browser page with persisted search-engine selection, default zoom, download folder and location prompting, toolbar behavior and explicit cache clearing. Preferences live in `preferences.json` in the profile. Clearing cache retains cookies, logins and task metadata.

The cookie-and-bin button in the address bar deletes cookies for the open website after confirmation. It uses the loaded page, even if you have typed a different address. This clears cookies across the site's subdomains and cookies partitioned for embedded content on that site. Other sites' cookies, task notes and other website storage stay. Cookies are shared across tabs, so clearing them can sign you out in other tabs using the same site. The page stays open to preserve unfinished forms; reload it afterwards. The button is disabled on the overview, settings and empty tabs. Site scope follows Electron's [cookie clearing rules](https://www.electronjs.org/docs/latest/api/session#sescleardataoptions).

Settings → Privacy and storage → Manage cookies opens the desktop cookie manager. Search by site, cookie name, path or partition site; expand a site to inspect domains, paths, expiry, size, Secure, HttpOnly and SameSite attributes. Add cookies or edit their values, expiry and flags. Values stay hidden until you select Show cookie value. A cookie's name, domain, path and partition identify it, so editing preserves those fields. A leading dot in a new cookie's domain includes subdomains.

Delete one cookie, all cookies for an exact hostname, or every cookie in the website profile. Each deletion requires confirmation. Site deletion includes cookies hidden by the current search. Tasks, notes, cached files and other website storage remain. Open sites can set cookies again; use Refresh cookies to see changes. Cookies are shared across tasks. Cookie edits and deletions are flushed to disk. Partitioned cookies keep their partition during edits and individual deletion; cookies with an opaque partition can only be cleared with Delete all cookies. Cookie values are read on demand by this manager and are excluded from workspace snapshots. Cookie blocking rules, site exceptions and automatic clearing on exit are not implemented yet. The Android host does not expose this manager.

Settings → Page loading → Preload likely pages when hovering over links is enabled by default. Chromium can fetch an eligible same-origin page after roughly 200 ms of hover, or on pointer-down, and reuse it when clicked. External links warm one connection without fetching the destination. The policy skips query strings, fragments, downloads, new-window links, common action/account paths and site opt-outs. It pauses on hidden pages, unfocused windows, offline or slow connections and Data Saver. This uses extra data and the path exclusions are heuristic; turn it off for sites whose links perform actions. Site CSP remains in force. Details and measured limits are in [hover preloading](../docs/hover-preloading.md).

The top-right puzzle button opens Extensions. Paste a Chrome Web Store link or ID and choose Download package to save its CRX from Google's service. Then use Import package to review and load a ZIP/CRX. A developer-supplied package works through the same flow, and Load unpacked remains available for folders. Imports validate archive paths and size limits, show manifest details and ask before loading. Publisher signatures are not verified; an imported package is treated as unpacked code. Imported files are kept under the profile's `imported-extensions` directory. Removing an extension unloads it and removes its registration; its imported files remain on disk.

Registrations are remembered in `extensions.json`. Extensions run only in the website session. Changes apply to newly loaded pages; reloading existing pages can lose unsaved edits. Installed extensions with a popup have an Open button and a toolbar initial. Browser API support now includes tab tracking, popup windows, navigation events and manifest shortcuts; some Chrome APIs remain unsupported. Chrome's Add to Chrome button is not connected to Tern, and downloading a package does not guarantee compatibility. See [Electron's supported extension APIs](https://www.electronjs.org/docs/latest/api/extensions).

For Bitwarden, use the **B** toolbar button or **Ctrl+Shift+U**, then sign in inside the extension. **Ctrl+Shift+L** requests autofill on the selected page. See [Bitwarden compatibility and verification limits](../docs/bitwarden-compatibility.md).

Start from a goal offers an editable short task name while retaining the full request in Task notes. With AI off, the name starts with up to six words of the request, capped at 40 characters. Set up local AI jumps directly to its setting and Back to task setup restores the draft. At widths of 800 CSS pixels or less, the created task opens with notes closed so the website stays visible.

## Keyboard

Hover over, focus or click the keyboard icon in the sidebar footer to see shortcut hints. Click to keep the hints open; click again, click outside or press Escape to close. Hold Alt to reveal task letters and tab numbers.

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

This is a local alpha. It has no hosted assistant service, full Chrome extension compatibility, sync, a built-in password manager, profile import, or private browsing. Signed application updates include the browser engine; publishing those updates remains the distributor’s responsibility. Website requests for file access, camera, microphone, location, notifications and clipboard reading use native consent prompts with Deny selected by default. Requests require the selected visible page and HTTPS or a loopback development origin. Sensitive permissions require a focused window; native file choosers can temporarily take focus from their owning window. File grants cover only approved paths and expire when the granting page navigates or closes. Restricted directories, screen sharing, device access and unknown permissions remain denied. Actual device and OS service availability still depends on the platform. Installed extensions may use declared clipboard permissions in their own windows. Unsupported external schemes are blocked. Some sign-in and payment flows may depend on capabilities this build does not provide. Downloads use your location preference and never execute the saved file.

Remote pages have no Node access or exposed Tern bridge. A sandboxed, isolated preload observes scroll direction and eligible hovered links. It sends scroll direction and, for connection warming, only an external destination origin to the host; no page text or form values are sent. The shell uses a dedicated local protocol and session, and the main process validates command senders and arguments. Electron is pinned to 44.5.1. Before wider distribution, update Electron regularly and expand compatibility and security testing. The UI checks here establish the tested workflows, not a general security certification.

See the [original-spec gap review](../docs/original-spec-gap-review.md), [desktop specification](../docs/desktop-browser-spec.md), [engine decision](../docs/adr/0001-desktop-browser-host.md), and [host research](../docs/browser-host-research.md).

## Search reading list

Address-bar queries and task searches open an internal reading list. Titles wrap in full. Docs, Articles, Applications and Videos filter the current result page using site, URL, title and description rules. Docs covers reference material; Articles covers editorial pages and blogs; Applications covers usable web tools, including ChatGPT and Gemini; Videos covers playable video pages. Legacy Projects and Discussions filters reopen as All results. Classification runs locally without a model download or page fetch. Results with insufficient evidence stay in All. Open first result respects those filters and hidden domains. Ctrl+click opens a result in the background. Keep saves its destination with the task. Return to results restores the list position.

Desktop search runs inside Tern. It requests DuckDuckGo's HTML results and Bing's search results directly, parses them in the main process, removes provider redirect links and tracking parameters, and merges duplicate destinations. Reciprocal rank fusion rewards destinations found by both providers. Settings → Search lets you select either or both providers, or use a search-engine website instead. No server, Python runtime, Docker, API key or search index is required.

Requests omit browser cookies and never execute provider HTML or JavaScript. Only parsed text and validated HTTP/S destinations reach the trusted UI. Requests have a 15-second deadline and a 4 MB response limit. At most four requests run concurrently. A successful result page is cached in memory for 60 seconds, with at most 32 cached pages. Cache clearing also removes search results from this request cache. Queries and results are not written to a search log. The selected providers receive your query and IP address.

DuckDuckGo pagination uses its returned cursor fields on a fixed provider origin. Bing uses page offsets. Reopening a saved DuckDuckGo search can reconstruct the first five pages; deeper saved pages report an expired cursor while Bing can still return results. Provider verification pages, changed HTML layouts, timeouts and HTTP failures appear as warnings when another provider succeeds. On longer English queries, a provider batch with at least three results and no matching query terms in any title, description or domain is rejected with a warning. Short, multilingual and sparse result sets are exempt. This catches obvious mismatches, not general relevance or synonym matching. If all providers fail, the list offers Retry and Search settings. Public search pages can block automated requests or change their format. Tern does not solve or bypass CAPTCHAs. In live checks, DuckDuckGo sometimes required verification and Bing continued returning results. Bing also returned broad matches for some detailed queries, so combined results do not guarantee that every provider honours every query qualifier.

The former optional SearXNG connection remains readable for existing profiles with a custom server address. The old default loopback address now selects built-in metasearch. The new default endpoint is a saved identifier, `https://search.tern.invalid/`, and is never requested over the network. This implementation follows the adapter approach described in [SearXNG's engine documentation](https://docs.searxng.org/dev/engines/engines.html); it does not bundle or copy SearXNG code.

Search definitions, filters and kept destination links survive restarts. Result bodies stay in memory and searches rerun on reopening. Unavailable upstream engines appear below the filters without discarding other results. Settings also offers the previous search-engine website view. `!gh query` and `!w query` open GitHub and Wikipedia searches directly.

Android uses search-engine websites, defaulting to DuckDuckGo. Settings preserves the existing choice of DuckDuckGo, Google, Bing or Brave. Desktop metasearch controls are hidden on Android. Previously saved Android reading lists migrate to website searches using the selected engine.

The reading-list decision came from `prototype/search-experience` at `827a46572d15`. The selected layout removes the prototype's decorative headings and labels. Prototype code remains on that branch.


Run `npm run test:search --workspace=@tern/desktop` after the desktop build for parser, ranking, failure, pagination, cache and cancellation checks. Desktop integration tests are in `desktop/e2e/metasearch.spec.ts` and `desktop/e2e/search.spec.ts`. Set `TERN_LIVE_SEARCH=1` when running the metasearch integration tests to include the real-provider smoke test. It is opt-in because upstream blocking must not make deterministic tests flaky.

See the [security and release review](../docs/security-review-2026-10-06.md) and [Linux release process](../docs/linux-release.md) for validation and remaining distribution requirements.

## License

The desktop application and shared browser source (`packages/core` and `packages/app`) are licensed under GPL-3.0-only. See [LICENSE](LICENSE). Bundled dependencies, fonts and model assets retain their own notices and licenses.
