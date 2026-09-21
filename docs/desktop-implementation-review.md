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
