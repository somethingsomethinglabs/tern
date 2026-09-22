# Original spec compared with the browser

Reviewed on 22 September 2026. The initial comparison uses desktop commit `18a0374`, against the completed prototype baseline `aca3144`. Sources are the [design brief](design-brief.md), [original prototype spec](settle-and-resume-spec.md), and the later [desktop spec](desktop-browser-spec.md). The original spec remains unchanged so the differences are visible.

The project has two runnable products: the controlled interaction prototype in `prototype/`, and the real browser in `desktop/`. A feature implemented in the prototype is not automatically implemented in the browser.

## Coverage

| Original requirement | Prototype | Desktop browser | Assessment |
| --- | --- | --- | --- |
| Tasks with Active, Later and Settled states | Implemented | Implemented, with dragging and collapsed groups | Core behavior retained; later controls were authorized additions. |
| Keep forms live across task/page switches and pause/resume | Implemented for sample form | Implemented and tested with real Chromium pages | Core behavior retained for the running session. |
| Remember the selected page and a next-step note | Implemented for the session | Persisted across restart; URLs become references to reopen | Browser adds durable metadata, not unsaved-form recovery. |
| Edit a note without pausing | Implemented | Missing at review baseline; added in this update | The old context panel was read-only. The new Task notes panel has an editor and Save note. |
| Keep overlong note text and explain validation | Implemented | Baseline used maxlength, clipping pasted text; fixed in this update | Both note editing and pausing retain excess text and disable saving until shortened. |
| Report affected pages, unsaved/saving/saved state and save failures | Controlled sample reports explicit state | Arbitrary websites have unknown save state | Intentional platform limit. The browser must not invent a reliable saved/unsaved signal. |
| Block settlement of an unsaved sample form | Implemented | Explicit settlement allowed; it does not certify website completion | Authorized change for sites whose save state is unknown. |
| Automatically select another Active task after pausing | Implemented | Paused task remains selected | Still a workflow difference. Decide whether the browser should switch automatically; selection and lifecycle are currently separate. |
| Selected sources, evidence links, editable recaps, ready/stopped assistant states | Scripted, labeled examples | No assistant or recap workflow | Deliberately omitted from the desktop scope. Real AI remains future work. |
| Seed two realistic tasks and fictional reference documents | Implemented | New profiles start empty | Appropriate difference between a demo and a personal browser. |
| Keyboard controls and usable smaller windows | Implemented | Implemented, with native shortcuts and compact panels | UI checks cover representative flows, not a full accessibility audit. |
| Human evaluation of resuming work without coaching | Not recorded | Not recorded | Still missing. Automated retention tests do not establish whether the product helps people resume. |

## Additions beyond the original experiment

The user subsequently authorized a real browser. That added HTTP(S) browsing, navigation/history, task creation/renaming/search, downloads, popup and POST handling, local metadata persistence, persistent website cookies, Linux packaging, unload warnings, crash recovery to references, Omarchy colors, task dragging, collapsed lifecycle groups and Alt shortcuts. These are scope changes, not accidental extras.

This update adds a proper settings page with persisted search-engine selection, page zoom, download folder/location prompting and scrolling-toolbar behavior. It adds sidebar collapse, a toolbar that hides on downward scroll and returns on upward scroll or Ctrl+L, and a dedicated downloads view. Editable task notes restore an original requirement while replacing the generic context text.

Extension package downloading and ZIP/CRX import are newly authorized scope. They do not mean full Chrome compatibility.

## Chrome extensions

Electron supports only a subset of Chrome extension APIs and loads unpacked directories. Chrome's Store installation button and extension toolbar popups are not implemented by this browser. [Electron extension support](https://www.electronjs.org/docs/latest/api/extensions).

The new flow accepts a Store link or extension ID, downloads its CRX from Google's extension-update service to a location the user chooses, and lets the user import that package. ZIP/CRX files supplied by a developer can also be imported. Packages are inspected for unsafe paths, symlinks, duplicate entries and size limits, then presented with their manifest name/version/declared permissions before loading. Import treats the result as unpacked code; it does not verify the publisher signature or establish Chrome Web Store trust. Loaded extensions use the website session, never the shell session. Some extensions will still fail because they require unsupported APIs, actions, or browser integration.

The download URL format was checked against the maintained MIT-licensed [electron-chrome-web-store installer](https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-web-store). A temporary download from Google's service returned a valid React Developer Tools 8.0.0 CRX; its manifest was read without installing or executing it. This verifies package delivery, not that the extension's features work in Trailrest.

## Standards review

The independent review of `aca3144...18a0374` found no confirmed documented-standard violations. It found two maintenance heuristics:

- Possible Divergent Change: the 917-line renderer App owned task dragging, shortcuts, native-view layout, notes, settings and extensions. This update moves settings, task notes and extension controls into dedicated components.
- Possible Duplicated Code: HTTP(S)/credential validation appears in both navigation and workspace restoration. Sharing that predicate remains a small maintenance opportunity; parsing and persisted-data validation have different responsibilities.

Totals: 0 confirmed standard violations; 2 maintenance findings, one reduced by this update.

## Spec review

The independent review found two original note-handling gaps, now addressed: independent editing and overlong-text handling. Automatic selection of another Active task after pausing still differs from the original. Human resumption evaluation remains outstanding. Website-state reporting and assistant/source review exist only in the controlled prototype and were intentionally excluded from the desktop scope. Real browsing, persistence, packaging and subsequent UI controls were authorized additions.

Totals at review baseline: 2 note gaps, 1 remaining workflow difference, 1 missing human evaluation, and 2 deliberate prototype-only capability groups. There is no evidence that keeping a page live guarantees website saves or restores unsaved forms after restart.

## Remaining product work

A general-purpose daily browser still needs decisions and implementation for site permissions, extension actions/API compatibility, an engine update process, password management, bookmarks/history UI, browser/profile import and OS default-browser integration. These were outside the original experiment, rather than forgotten original requirements. Prioritize the user's actual extension list before choosing between more Electron integration and a different browser host.

## Verification of this update

The desktop build and TypeScript checks pass. All 21 automated Electron UI tests pass against controlled local websites and temporary profiles. They cover live-form retention, lifecycle and restart references, navigation/popups, unload cancellation, downloads, permissions, keyboard controls, themes, task dragging, saved settings, scrolling toolbar behavior, independent notes, ZIP/CRX imports and Store-link downloads. Store-download UI tests substitute a controlled package at the network boundary; the separate Google-service check above verifies actual delivery.

A repeated UI failure exposed a window-resize race: a cached narrow-window value could hide the native website behind the notes panel after the window expanded. Layout now reads the current window width. The previously failing flow passed six consecutive runs, followed by the complete 21-test suite. Temporary diagnostics were removed.

The packaged Linux app was launched with a fresh profile and checked visually. Its archive includes the guest scroll observer and the runtime ZIP dependency. See [settings](../design/qa/desktop-settings-shell.png), [editable notes](../design/qa/desktop-notes-shell.png), [collapsed sidebar](../design/qa/desktop-sidebar-collapsed.png), [collapsed toolbar](../design/qa/desktop-toolbar-collapsed.png), and [extension controls](../design/qa/desktop-extensions.png). Shell captures omit native website pixels; native captures include the website but have desktop notifications from the intentional renderer-crash test over part of their upper-right corner.

The existing launcher package was updated without closing the user's running browser. Quit and reopen Trailrest to use the changes. Human resumption evaluation and compatibility testing with the user's preferred extensions remain outstanding.

## Bitwarden follow-up

The subsequent [Bitwarden integration](bitwarden-compatibility.md) adds popup windows, tab/navigation APIs, extension commands and context reporting. The earlier statement that toolbar popups are absent describes the review baseline. Full Chrome compatibility and authenticated Bitwarden workflows remain unverified; see the follow-up for the exact checks and first-run timing limitation.
