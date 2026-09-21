# Browser host research

Researched 21 September 2026. This note recommends the next implementation after the approved interaction prototype. Recommendations below are engineering decisions inferred from the cited APIs, not claims that Electron supplies a complete browser product.

## Host choice

Use Electron with a separate `WebContentsView` for each live page. The official release listing currently identifies Electron **44.4.3**, released 18 September 2026, with Chromium 152.0.7977.130 and Node.js 24.21.0. Pin the installed version and keep security updates part of browser maintenance. [Electron releases](https://releases.electronjs.org/?channel=stable)

`WebContentsView` gives the main process ownership of an independent page and its presentation. It can adopt an existing `WebContents`, which may appear in only one view at a time. That matches Trailrest's distinction between a page instance and a URL. Keep the existing React shell in a trusted `BrowserWindow`, with guest views attached to its content view. [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)

Tauri uses the system webview rather than bundling one. Linux uses WebKitGTK, so this would change the browser engine and tie behavior to the installed system version. For this Chromium-oriented desktop browser, Electron is the more direct continuation of the prototype. [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/)

A Chromium fork offers control below Electron's APIs but requires a separate browser build and maintenance workflow. Chromium's Linux guide documents its substantial checkout, build dependencies, and build process. That cost is unnecessary for validating task organization and retained pages. [Chromium Linux build guide](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md)

## Trust boundary

Remote pages receive no Trailrest preload. Explicitly set `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, and retain `webSecurity`. Do not enable insecure content or experimental features. The shell alone receives a narrow bridge with named operations and validated arguments. [WebPreferences](https://www.electronjs.org/docs/latest/api/structures/web-preferences)

Require each privileged IPC call to come from the actual shell `WebContents`, its main frame, and the trusted shell origin. Reject absent frames. Comparing a requested URL alone does not identify the caller. Do not expose raw IPC, Electron objects, or IPC event arguments through the bridge. Lock shell navigation to its own content. Guests may navigate HTTP and HTTPS; unsupported protocols need an explicit policy and must never flow directly into `shell.openExternal`. [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)

Serve the built shell from a dedicated standard, secure custom protocol. Register scheme privileges before readiness, and the handler after readiness. Protocol handlers belong to sessions, so register the shell handler only in the shell session. Resolve assets inside the build directory and reject path traversal. Do not register an arbitrary filesystem proxy. [Protocol API](https://www.electronjs.org/docs/latest/api/protocol)

## Live pages and presentation

The main process should map page IDs to retained views and owning task IDs. Selecting a task or reference changes visibility; pausing does not reload, close, or recreate its views. Settling remains a task transition and does not certify website submission. These are Trailrest responsibilities built around the view ownership API. [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view)

Have the shell measure the page rectangle and report it through the validated bridge. Clamp finite integer bounds to the window content area. Refresh them after resize and layout changes. Native views are separate from the shell DOM, so do not assume CSS stacking will place a drawer above them. Hide the guest while a modal covers it, or reserve a nonoverlapping rectangle. Use `setVisible` and `setBounds`; restore page focus when returning. Test the actual composite window visually. [View API](https://www.electronjs.org/docs/latest/api/view)

Retaining a page consumes resources. Keep all views alive for this first browser slice and disclose that retained forms depend on the running process. Explicitly close owned web contents during final teardown. Electron documents that closing a `BaseWindow` does not destroy child views' web contents automatically. [BaseWindow resource management](https://www.electronjs.org/docs/latest/api/base-window#resource-management)

## Navigation and leaving pages

Use `webContents.navigationHistory` for back and forward. Its `restore` method offers best-effort restoration of history and some page state. It does not promise a complete application snapshot. [NavigationHistory](https://www.electronjs.org/docs/latest/api/navigation-history)

Use `webContents.close({ waitForBeforeUnload: true })` when a user closes a page. The default skips the unload veto. On `will-prevent-unload`, present Leave and Stay. Calling `event.preventDefault()` means ignore the site's veto and leave. Handle failed loads and renderer crashes visibly. Keep address and title synchronized with navigation, including same-document navigation. Validate destinations before programmatic loads as well as page-initiated navigation. [webContents](https://www.electronjs.org/docs/latest/api/web-contents)

Unknown website state must remain unknown. A missing unload warning does not establish that a form is saved. Do not claim universal dirty-form detection or inject a general form scraper. Controlled fixtures may report their known state independently.

## Permissions, popups, and downloads

Install both permission request and permission check handlers on the guest session. Start with denial for unsupported capabilities and make denied requests understandable. Future grants should identify the requesting origin and permission, including subframes. The check handler can receive a null `WebContents`, for example from a service worker, so it must handle that case. Use a persistent guest partition separate from the shell to retain website storage. [Session API](https://www.electronjs.org/docs/latest/api/session)

Intercept popup creation. A simple initial policy may deny it and offer an ordinary HTTP or HTTPS link as another page, but that does not preserve popup workflows. Supporting authentication windows or forms targeting a new window requires preserving opener and POST behavior. `setWindowOpenHandler` can supply `createWindow`, which returns the host-owned `WebContents`; apply the guest preferences to that creation path too. [WindowOpenHandlerResponse](https://www.electronjs.org/docs/latest/api/structures/window-open-handler-response)

Downloads need a visible destination decision and terminal status. Use the session download event and `DownloadItem` progress, cancellation, and completion events. Avoid automatically executing downloaded files. The default save routine normally opens a save dialog; `setSavePath` suppresses it. Treat cancellation and interruption separately from completion. [DownloadItem](https://www.electronjs.org/docs/latest/api/download-item)

## Persistence and tests

Persist task IDs, names, lifecycle, notes, page order, selected page, and URLs separately from website storage. Reloading those URLs after restart recreates pages; it cannot guarantee unsaved JavaScript state or selected file inputs. Phrase restart behavior as reopening pages. In-process pause/resume retains the actual page instance. History restoration should remain optional until tested against its best-effort contract. [NavigationHistory restoration](https://www.electronjs.org/docs/latest/api/navigation-history#navigationhistoryrestoreoptions)

Keep the approved UI test seam. Launch the real app with Playwright's experimental Electron support, then drive the shell and controlled HTTP fixture pages. Give each test a temporary profile. Native dialogs can use deterministic replacements through `electronApplication.evaluate` while assertions still inspect visible outcomes. [Playwright Electron](https://playwright.dev/docs/api/class-electron)

Guest views are separate browser pages. Discover them through the application browser context and select by fixture URL; do not assume they are shell frames. Avoid `browserWindow(page)` for guests because its implementation resolves through `BrowserWindow.fromWebContents`. On Linux, Playwright's launcher adds `--no-sandbox` unless `chromiumSandbox: true`; enable that option for sandbox verification. [Playwright Electron implementation](https://raw.githubusercontent.com/microsoft/playwright/main/packages/playwright-core/src/server/electron/electron.ts)

Cover retained edits through task switch and pause/resume, canceled reload and close, normal history, unsupported schemes, popup policy, permission denial, download cancellation, restart metadata, and guest isolation from the shell bridge. Continue manual keyboard and visual checks for focus across native views, drawer overlap, window resize, and the actual Linux desktop.
