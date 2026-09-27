# Desktop implementation review

Reviewed against `aca314401b195e301f8ad26a0adc23974e4570e6`, the completed webpage prototype. Implementation commit: `623da09`. The two review axes ran independently against the desktop specification, domain glossary and engine ADR.

## Standards

The reviewer found one P2 behavior mismatch: crashed renderers still had the sidebar's Live page label because view ownership alone determined availability. The glossary defines a live page as a running page whose in-memory state remains available. The fix tracks renderer loss separately, preserves the saved reference, and offers reopening. A regression test first reproduced the incorrect label, then passed after the fix.

The reviewer also flagged duplicated guest security preferences as a nonblocking maintenance concern. Normal pages and popup creation now use the same preferences function. No other documented-standard violations were found.

## Spec

The reviewer found one P2 persistence bug: guest navigation could save a URL longer than the workspace reader's 8192-character limit. The next launch then treated the whole workspace as unreadable. Restoration now accepts the same validated HTTP(S) URLs as guest navigation. A regression follows a website-generated link containing a 9000-character query, quits, and verifies that both task and reference return.

The review clarified quit behavior. Page navigation, reload and close honor individual website unload vetoes. Quitting uses one explicit warning about all live pages. Canceling that warning leaves every page intact; confirming it ends them. Sequentially closing pages before a later website veto would make cancellation lose earlier pages, so this build uses the aggregate decision.

Review totals: Standards had one P2 mismatch and one maintenance finding; Spec had one P2 persistence finding. All were addressed.

## Validation and visual evidence

Final checks: TypeScript checking and the production build passed; all 12 desktop UI tests passed; Linux packaging and the packaged-app native screenshot check passed.

The running Electron UI tests cover live form retention, pause/resume, task naming and search, settlement, normal and popup navigation, POST and opener behavior, native keyboard shortcuts, cancelable reload/close/quit, website unload vetoes, denied permissions, downloads, failed loads, renderer loss, storage failures, restart references and long URLs. Tests use isolated profiles and controlled HTTP websites with Chromium sandboxing enabled.

The packaged Linux app also ran against a controlled sample site. Desktop captures include the native website view; ordinary shell screenshots do not. Inspection caught clipping when the tiling window manager allocated less than the original minimum width. The browser now opens maximized and supports a compact layout with a task-context overlay that hides the native page while open.

- [Native website inside the browser](../design/qa/desktop-native-page.png)
- [Pause dialog, with the native page hidden](../design/qa/desktop-native-pause.png)
- [Paused task with retained page](../design/qa/desktop-native-later.png)
- [Narrow shell layout](../design/qa/desktop-shell-narrow.png)

The native capture helper is optional and uses this machine's Hyprland Lua API. It captures only its own isolated browser window. These checks establish the exercised workflows, not compatibility with every website or a general security certification.

## Sidebar and browser controls update, 22 September 2026

The follow-up removes the task title/status strip below the address bar, collapses Later and Settled, and adds task dragging. Pointer capture handles internal drags without handing the gesture to Chromium's native drag loop. The task-context status selector provides a keyboard alternative. Context now starts closed and explains the manual note.

The shell follows Omarchy's active palette, including changes during a session; the address toolbar remains dark. Alt reveals task letters and page numbers. Task letters follow creation order across lifecycle groups; selecting a hidden task opens its group. Standard Ctrl shortcuts remain available.

The user chose to keep the Electron host for this iteration. Settings are labeled Tern settings. The top-right extensions manager loads explicitly selected unpacked folders into the website session, restores registrations on launch, reports invalid manifests, and removes registrations. The shell's separate session never loads them. Permission and download handlers are installed before remembered extensions start. Native Chromium settings, Web Store installation and extension toolbar popups remain unavailable.

TypeScript and the production build passed. All 16 UI scenarios passed against the final code across the suite and a targeted rerun. The shared desktop produced intermittent viewport/window failures; the last suite run passed 15 scenarios, and the remaining download scenario passed alone. New checks cover dragging through all three groups with retained form edits and restart persistence, native Alt hints and switching, automatic theme updates and invalid-palette fallback, and extension loading, invalid manifests, restart restoration and removal.

The packaged app was staged and its archive atomically copied into the local release. The running user browser was left open. Updated native captures cover the expanded website area, collapsed groups, context, shortcut hints, settings and extensions. Test-induced desktop crash notifications can appear over compositor screenshots; they are outside the browser UI. The final installed-app capture stopped when desktop focus moved away, as intended by its window-capture safeguard; the preceding staged-package captures remain the visual evidence.

- [Task context](../design/qa/desktop-native-context.png)
- [Alt shortcut hints](../design/qa/desktop-native-shortcuts.png)
- [Tern settings](../design/qa/desktop-settings.png)
- [Extensions manager](../design/qa/desktop-extensions.png)
