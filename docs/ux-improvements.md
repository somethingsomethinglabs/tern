# UX review improvements

Implemented after the two hands-on reviews of desktop build `b38e710` on 27 September 2026. The original findings and screenshots remain in [first-use review](ux-review-first-use.md) and [pause/resume review](ux-review-resume.md).

- Starting a task at widths up to 800 CSS pixels, or on Android, leaves Task notes closed so the website remains visible. The notes toggle still opens the complete context.
- Task setup shows an editable name. Without AI, a short name is prefilled from up to six words of the request, capped at 40 characters. A chosen name can use up to 60 characters and overrides an AI-generated name. The full original request remains attached to the task.
- Set up local AI opens Settings at the Local AI selector. Back to task setup restores both the request and name. Opening Settings does not enable AI or start a download.
- Settle asks for confirmation whenever the target task has live pages. The warning covers its toolbar button, context menu, status selector and drag destination. Cancel leaves the task and pages intact. Put aside instead opens the note dialog and retains live website state. Tasks containing only saved references can still settle immediately.
- Resume task and Return to active now activate the task and reopen its selected reference. Desktop also restores the task's other saved pages through the existing queue, reusing pages already live. Android retains its existing selected-page-only restoration policy.
- A persistent sidebar hint explains holding Alt and opens the keyboard map. The existing task letters and tab numbers remain visible while Alt is held. The task search references the hint for assistive technology.

The pause dialog now also explains that pages stay live only while Tern is open and that pausing does not save website changes.

## Evidence

- [Task setup with editable name](../design/qa/ux-improvements-task-setup.png)
- [Settle warning](../design/qa/ux-improvements-settle-warning.png)
- [Narrow shell with notes closed](../design/qa/ux-improvements-first-result.png)
- [The selected website](../design/qa/ux-improvements-first-result-website.png)

The shell and website use separate native Electron views, so they are captured separately.

## Verification

Automated checks use isolated profiles and controlled websites. They cover every Settle entry point, cancellation, putting aside instead, resuming saved references, retaining live form values, preserving task-setup drafts through Settings, explicit task names, narrow layout, shortcut discovery, native Alt input, existing overview behavior, and existing task creation behavior. Shared-core checks cover Android's task activation and task-name validation. Desktop and Android web builds check the shared Svelte UI and TypeScript contracts.

The Android APK was not rebuilt or installed during this change. Native Android device interaction and actual AI inference are outside this validation.
