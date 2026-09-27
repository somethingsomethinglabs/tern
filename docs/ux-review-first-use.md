# Tern desktop UX review: first use, navigation, notes, and settings

Reviewer: Luna max, hands-on first-use pass
Build reviewed: `b38e710`
Surface: native Electron desktop app
Viewport reported by the shell: `701 × 910` CSS px at `1.5667` device pixel ratio. The managed desktop occasionally changed the available height during other runs, so this review does not treat the outer window size as a product defect.

I launched the latest desktop build through Playwright Electron with a fresh disposable `TERN_PROFILE`. The profile seeded `preferences.json` with `summaryModel: ""` to keep local AI off and avoid a model download. No existing user profile or task data was opened. The exact captured states used below are saved in `design/qa/` with the `ux-review-first-use-` prefix.

## Flow and evidence

1. **Fresh startup. Healthy.** The empty workspace makes the state legible: `0 active tasks`, a clear `Create your first task` call to action, and a persistent `Start from a goal` control. Evidence: [startup](../design/qa/ux-review-first-use-01-startup.png).
2. **Open first-task creation. Mostly healthy.** The dialog has a focused `Your request` textarea, a visible `0/1000` counter, a disabled `Start task` state before input, and an explicit AI-off explanation. Evidence: [create dialog](../design/qa/ux-review-first-use-02-create-dialog.png).
3. **Enter a request and start. Mixed at this width.** The request was accepted, a task was created, and a real web result opened. At the observed `701` CSS px shell width, Task notes immediately occupied the browsing area, so the selected result was not visible without closing the notes drawer. Evidence: [filled request](../design/qa/ux-review-first-use-03-create-filled.png), [task started](../design/qa/ux-review-first-use-04-task-started.png).
4. **Save a next-step note. Healthy.** The note saved with a visible `Note saved` confirmation and the counter updated to `51/500`. Evidence: [note saved](../design/qa/ux-review-first-use-04b-note-saved.png).
5. **Close notes and open a new page. Mixed.** `Close task notes`, `New page`, and the focused address bar were discoverable. The new-page empty state explains what to do next. Evidence: [page open](../design/qa/ux-review-first-use-05-page-open.png), [new page](../design/qa/ux-review-first-use-06-new-page.png).
6. **Navigate to a typed address. Blocked in this environment.** Typing `https://example.com` produced a clear `Couldn't open this page / ERR_NAME_NOT_RESOLVED / Reopen page` state, but the test environment could not resolve that host. Evidence: [error state](../design/qa/ux-review-first-use-07-example-page.png). I did not treat the DNS failure itself as a product finding.
7. **Open Settings. Healthy but dense.** The page groups Search, Appearance, Page loading, Task overview and assistance, Local AI, Tools, Downloads, Privacy and storage, and Keyboard shortcuts. The descriptions are plain and useful, but the long page makes the AI control easy to miss after the first-use prompt. Evidence: [settings](../design/qa/ux-review-first-use-08-settings.png).

## Three prioritized changes

1. **Keep the first result visible at narrow widths.** In the observed `701` CSS px run, Task notes occupied the browsing region immediately after the Amble Outdoors result opened ([task started](../design/qa/ux-review-first-use-04-task-started.png)). Closing the drawer left the result area visually empty in this external-site run ([page open](../design/qa/ux-review-first-use-05-page-open.png)). The screenshot does not establish whether that blank state came from the site or the network, so the product finding is limited to the narrow layout. At that width, default Task notes to a compact drawer or let the first-result view take priority, with the existing notes toggle kept visible.

2. **Give request-created tasks a distinct short identity.** With local AI off, the task title is the full request. In the live sidebar it renders as `Plan a weekend hi...`, while the selected page is also shortened to `Best Day Hikes...` ([task started](../design/qa/ux-review-first-use-04-task-started.png)). The task control does expose the full title and its Alt shortcut through the native title tooltip, but that requires hover or focus. Two similar requests would still be difficult to distinguish at a glance. Generate or request a short editable title during creation and keep the original request in Task notes.

3. **Add an inline path from the AI-off prompt to the AI setting.** The first-use dialog tells the user to enable local AI in Settings, but the only visible actions are `Cancel` and `Start task` ([create dialog](../design/qa/ux-review-first-use-02-create-dialog.png)). The user must dismiss the dialog, find Settings in the persistent rail, scan a long page, and then return. Add an `Enable local AI` action that opens Settings directly at the Local AI section, or a focused setting row in the dialog. Preserve the typed request when the user returns.

## Things that worked well

- The empty state explains the product in user terms and offers one obvious first action.
- The request form provides a meaningful placeholder, count, disabled-submit state, and a clear explanation of the no-AI fallback.
- The notes flow has useful `Goal`, `Next step`, and `Saved findings` sections, explicit counters, and an immediate `Note saved` confirmation.
- The sidebar and toolbar make the main navigation model visible: Overview, task, page, New page, Later, Settled, address bar, back/forward, notes, downloads, snapshot, and extensions.
- Settings includes readable rationale for controls such as search engine, page zoom, preloading, storage, and keyboard shortcuts. The AI-off state also clearly says that saved goals, notes, and findings remain available.

## Limits

This was one fresh profile, one task request, one external result, and one managed desktop viewport. Local AI was intentionally disabled, so AI-generated names and suggested searches were not evaluated. DNS could not resolve `example.com` in the review environment; the error screen is documented as observed behavior, while network reachability is left unresolved. Accessibility semantics were inspected through Playwright roles and labels for the exercised controls, but this review did not include a full keyboard-only, screen-reader, contrast, or assistive-technology audit.
