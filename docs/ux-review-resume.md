# Computer-use UX review: put aside, resume, and settle

Date: 2026-09-27
Build: `b38e710`
Surface: Tern Electron desktop
Flow: open a task, edit a live form, save task context, put the task aside, resume it, settle it, restart, and find it again
Profile: isolated temporary `TERN_PROFILE`; local synthetic HTTP pages only; local AI disabled
Capture: Playwright Electron launch and page screenshots at 1440 × 900 CSS pixels (device scale factor 1.5667)

## Audit scope

This review follows a realistic procurement task with two local pages: a supplier intake form and a procurement brief. The form contained a contact name, budget, and unsaved call notes. The task also had a saved goal, a saved next-step note, and a saved finding. I exercised the visible task menu, the Later and Settled groups, a full app restart, and the Alt shortcut hint path.

The form page is captured separately because the website is hosted in its own native Electron web contents. Shell screenshots show Tern's task and notes UI; form screenshots show the actual website state.

## User goal

Put unfinished research aside without losing the place, return to the same task quickly, and understand which context survives when the work is settled or the app is restarted.

## What works well

- The overview is a strong re-entry screen. It names the task, shows the last selected page, next-step note, saved sites, tab count, and a clear `Resume task` action ([01 overview](../design/qa/ux-review-resume-01-overview.png)).
- Put aside has useful language and a prefilled handoff note. The `A place to pick up again` dialog makes the next small step explicit, and the live pages remained available in the same session ([06 pause dialog](../design/qa/ux-review-resume-06-put-aside-dialog.png)). The filled contact, budget, and call notes were still present after resume ([02 filled form](../design/qa/ux-review-resume-02-live-form-filled.png), [09 resumed form](../design/qa/ux-review-resume-09-resumed-form-retained.png)).
- Task notes separate durable context into goal, next step, and finding. Each has a visible save action and count, and the saved state is easy to verify ([04 saved context](../design/qa/ux-review-resume-04-saved-context.png)). The same goal, note, and finding were restored after settling and restarting ([13 context after restart](../design/qa/ux-review-resume-13-saved-context-after-restart.png)).
- The Settled reference screen is honest about the destructive boundary: it says reopening starts a new page and that unsaved form state is not restored ([10 after settle](../design/qa/ux-review-resume-10-after-settle.png)).

## Notable risks

- `Put aside` keeps live website state, while `Settle` unloads it. That distinction is real and useful, but the actions are adjacent in the same task menu ([05 task menu](../design/qa/ux-review-resume-05-put-aside-menu.png)). In the run, settling immediately cleared all three form values on reopen. A user can read both actions as a way to stop for now and lose work by choosing the wrong one.
- The task is absent from the main overview after restart when settled ([11 relaunch overview](../design/qa/ux-review-resume-11-relaunch-overview.png)). The expanded Settled row does expose a play button labeled `Resume task` ([12 settled task found](../design/qa/ux-review-resume-12-settled-task-found.png)), so this is not a missing control. The title path shows a reference screen rather than reopening it, and the status-only return path is more indirect than the active-task path.
- Keyboard navigation is not discoverable from the default view. The sidebar title is truncated, and the review's actual Alt hold produced no visible task-letter badges in the renderer; the only visible `kbd` text remained the unrelated Enter hint in the New task control ([08 keyboard attempt](../design/qa/ux-review-resume-08-keyboard-hints.png)). Native Playwright key injection may not reproduce the OS-level Alt event, so the final visibility of the hints still needs a manual desktop check.

## Step-by-step findings

1. **Start at the task overview. Healthy.** The overview gives a clear resume action and enough saved metadata to choose between two tasks ([01](../design/qa/ux-review-resume-01-overview.png)).
2. **Edit the live website form. Healthy within a session.** The synthetic form accepted realistic values and the captured page visibly showed all three values ([02](../design/qa/ux-review-resume-02-live-form-filled.png)).
3. **Save durable context. Healthy.** Goal, next step, and finding have separate controls and persisted after restart ([04](../design/qa/ux-review-resume-04-saved-context.png), [13](../design/qa/ux-review-resume-13-saved-context-after-restart.png)).
4. **Put aside and resume. Healthy with a status distinction.** The pause dialog is understandable, Later is countable, and the live form values survived the same-session resume ([06](../design/qa/ux-review-resume-06-put-aside-dialog.png), [07](../design/qa/ux-review-resume-07-after-put-aside.png), [09](../design/qa/ux-review-resume-09-resumed-form-retained.png)).
5. **Settle and reopen. Needs a guardrail.** Settling unloaded both website pages and reopening showed empty form fields, while the saved task context remained. The reference screen communicates this only after the destructive action ([10](../design/qa/ux-review-resume-10-after-settle.png)).
6. **Find a settled task after restart. Needs a shorter route.** The task is hidden under a collapsed Settled group. The expanded row has a Resume task button, but the title and status-only paths do not reopen the page directly ([11](../design/qa/ux-review-resume-11-relaunch-overview.png), [12](../design/qa/ux-review-resume-12-settled-task-found.png)).
7. **Discover keyboard shortcuts. Needs verification and stronger teaching.** The attempted Alt hold did not show the promised letters in the captured UI. This check is limited by Playwright's native keyboard event path. The task title tooltip includes an Alt letter, but the default sidebar has no persistent shortcut cue ([08](../design/qa/ux-review-resume-08-keyboard-hints.png)).

## Accessibility and evidence limits

Visible labels are strong on the task notes fields, status selector, task menu, and website form. Focus is visible on the active textarea in the form and pause dialog. The screenshot review cannot establish screen-reader announcement order, native Alt behavior outside Playwright, contrast ratios, or whether every collapsed group and menu is operable with a physical keyboard. The synthetic pages also do not represent a real site's save/session behavior.

## Prioritized recommendations (exactly three)

1. **Warn before Settle unloads live pages.** When the task owns live pages, make the Settle action say that settling unloads them and unsaved website state cannot be restored. Offer `Put aside instead`, `Settle anyway`, and `Cancel`. Show this before unloading so the user can choose while the data still exists. This addresses the observed loss of `Mira Chen`, `$18,000`, and the call notes after Settle.

2. **Make the existing Resume task action reopen the selected reference.** The expanded Settled row already exposes the play button, so keep that control and make it return the task to Active and open its selected page in one operation. If the page needs a separate reopen step, move focus directly to `Reopen page` and explain why. This removes the restart path of expanding the group, selecting a reference, changing status, opening Overview, and resuming.

3. **Teach and expose the keyboard map in the task list.** Add a small persistent cue such as `Alt to show shortcuts` beside the task search, render the task letter and tab number in a stable badge when space permits, and include the same map in the task-list accessible description. Verify the real OS-level Alt hold manually because the automated run did not surface the hints. Keep the existing Alt letter in the task title tooltip as a secondary cue.
