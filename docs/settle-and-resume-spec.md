# Trailrest: settle and resume

Status: draft for review, with the testing approach approved by the user on 21 September 2026. The design brief and selected mock-up establish the product direction. Details marked as proposed are implementation choices for the first experiment, not previously approved product decisions. Issue publication is pending tracker setup.

## Problem Statement

People leave pages open because those pages represent unfinished work. A travel claim might depend on a form, a receipt, and a policy page. The URLs alone do not explain what remains to be done, and reopening them does not necessarily restore the work.

Switching activities makes people choose between keeping everything visible and risking the loss of context. Unsaved forms make that choice harder. A browser can preserve a reference without preserving the application state behind it.

Trailrest should let someone put work aside and return knowing which task they were doing, which page needs attention, and what to do next. It must describe what it retained accurately.

## Solution

Organize browsing around tasks. Each task brings together its pages, references, and a short "Where I left off" note. The sidebar separates Active tasks, tasks put aside for Later, and Settled tasks that the person considers finished.

The first deliverable is a desktop interaction prototype using controlled sample websites. Demonstrate the complete travel-claim journey from the selected mock-up, alongside a second task that the person can switch to. Retain the live sample form while its task is paused. On return, show the same edits and the recorded next step.

Pausing preserves the prototype's live page and task context for the current session. It does not save or submit the website form. Settling is a separate, explicit user action. AI state is separate from both page state and task state, and the core journey works without AI.

The prototype answers whether this interaction makes unfinished work easier to resume. It does not establish support for arbitrary websites or recovery after closing the application.

## User Stories

All stories below belong to the proposed first prototype. AI stories use clearly identified sample results. Production capabilities appear separately under Further Notes.

1. As a person with several ongoing activities, I want to see tasks grouped into Active, Later, and Settled, so that I can distinguish work in progress from work I consider finished.
2. As a person switching activities, I want each task to have a recognizable name, so that I can find the work I mean to resume.
3. As a person using the prototype, I want two populated tasks, so that I can try a realistic interruption without setting up a workspace first.
4. As a person browsing a task, I want to expand its page and reference list, so that I can see the materials belonging to that activity.
5. As a person working across websites, I want related materials grouped by task, so that different domains do not split up my work.
6. As a person switching tasks, I want the selected task and page to be clear, so that I know which activity I am changing.
7. As a person returning to a task, I want its last selected page to reappear, so that I can continue where I was working.
8. As a person editing a form, I want switching tasks to retain my current edits, so that an interruption does not force me to retype them.
9. As a person consulting a reference, I want opening a receipt or policy to retain my form, so that checking evidence does not interrupt the claim.
10. As a person browsing normally, I want page addresses and links to remain recognizable, so that task organization does not hide the website I am using.
11. As a person editing a travel claim, I want to change the sample trip purpose, expense type, receipt selection, and additional details, so that the prototype exercises meaningful form state.
12. As a person editing that claim, I want the sample website to report unsaved changes, so that I know when edits exist only in the live page.
13. As a person scanning tasks, I want a task with an unsaved page to show "Needs attention", so that I can identify work that requires care.
14. As a person inspecting a task, I want each affected page identified, so that I know what the attention message refers to.
15. As a person interpreting status, I want text alongside status icons and colors, so that I do not have to infer what a symbol means.
16. As a person putting work aside, I want to open a pause drawer, so that I can review what will remain available before pausing.
17. As a person pausing an unfinished form, I want to see which page needs to stay open, so that I understand how my current edits will remain accessible.
18. As a person pausing that form, I want an explicit statement that keeping a page open does not save the form, so that I do not mistake retention for a website save.
19. As a person pausing a task, I want to record a short next step, so that I can remember what I intended to do.
20. As a person writing that note, I want to see its length limit and retain my text when validation fails, so that I can shorten it without losing it.
21. As a person who has no note to add, I want to pause without writing one, so that task management does not require unnecessary work.
22. As a person reconsidering a pause, I want to return to the form without changing the task's lifecycle, so that opening the drawer does not commit me to a decision.
23. As a person confirming a pause, I want the task to move to Later while its form remains live, so that I can put the activity out of the way.
24. As a person continuing another activity, I want its pages and notes to remain separate, so that one task does not overwrite another's context.
25. As a person resuming paused work, I want to see my recorded next step, so that I can understand the task before acting.
26. As a person resuming a form, I want my edited values and selected sample receipt still present, so that I can continue without reconstruction.
27. As a person resuming an unsaved form, I want its unsaved status to remain visible, so that pausing does not appear to have saved it.
28. As a person resuming a task, I want it returned to Active, so that the sidebar reflects the work I have chosen to continue.
29. As a person revising a next step, I want to edit the task note, so that it reflects my current intention.
30. As a person saving the sample form, I want a clear website acknowledgement, so that I can distinguish a successful sample save from a browser action.
31. As a person whose sample save fails, I want my edits retained with an error and unsaved status, so that I can retry without false reassurance.
32. As a person submitting the sample claim, I want submission to require my explicit action on the website, so that pausing, resuming, or AI review cannot submit it for me.
33. As a person submitting an incomplete sample claim, I want the website to identify missing required values, so that I can correct the form.
34. As a person finishing a task, I want an explicit Settle action, so that I decide when the activity is complete.
35. As a person settling a task with unsaved changes, I want guidance to finish and save on the website first, so that settling does not conceal unfinished edits.
36. As a person revisiting completed work, I want to expand Settled and inspect a task's notes and references, so that completing it does not erase its context.
37. As a person who settled a task too early, I want to reopen it as Active, so that I can continue the work.
38. As a person viewing an assistant result, I want "AI ready for review" and "AI stopped" to describe only the assistant, so that I do not confuse them with a saved page or a completed task.
39. As a person considering a sample recap, I want its selected source list and evidence links visible, so that I can check what it is based on.
40. As a person reviewing that recap, I want to edit, keep, or discard it, so that unreviewed suggestions do not become accepted task context.
41. As a person using no AI assistance, I want the entire pause and resume journey to work, so that the assistant is optional.
42. As a keyboard user, I want to select tasks, navigate their pages, operate the drawer, and resume work, so that the core interaction does not require a pointer.
43. As a person using a smaller desktop window, I want the form and drawer to remain reachable without clipped controls, so that the layout does not prevent me from continuing.
44. As a person evaluating the prototype, I want session limits and simulated results clearly identified, so that I understand what the demonstration proves.

## Implementation Decisions

### Existing constraints

- The repository contains a brief, research notes, and one selected mock-up. It has no application code, test suite, domain glossary, or architecture decision records. Use the brief's vocabulary below.
- The first implementation uses controlled sample sites. Browser-engine selection, application framework, real AI integration, restart persistence, and production permissions remain undecided.
- Preserve ordinary website content and interactions inside the task-oriented browser shell. Do not restyle each website as Trailrest cards.
- Keep task lifecycle, website state, and assistant state independent. Assistant completion cannot save a form, submit it, pause a task, or settle a task.
- Retain the graphite chrome and sidebar, light task drawer, amber attention indicators, teal primary actions, compact rows, and clear dividers shown in the mock-up.

### Domain and module boundaries

These are proposed responsibilities, not a requirement for separate packages or services.

| Concept | Meaning and responsibility |
| --- | --- |
| Task | A named activity with an ID, lifecycle, ordered page references, selected page, references, a next-step note, and any accepted recap. |
| Task lifecycle | Active, Later, or Settled. Later means paused and resumable. Settled means the person considers the work finished. |
| Selected task | The task currently displayed. Selection is separate from lifecycle, so switching away from an Active task does not pause it. |
| Page | An individual live page instance with an ID, owning task, title, address, and reported website state. A URL is not a page instance. |
| Reference | A link or sample document associated with a task. Keeping it does not preserve the state of a live website. |
| Website state | The controlled site's report of unchanged, unsaved, saving, saved, save failed, submitting, submission failed, or submitted. Unsupported state is unknown. |
| Attention | An indication derived from pages needing attention, displayed alongside task lifecycle and assistant status. |
| Next-step note | User-written task context titled "Where I left off". It is separate from website form values. |
| Assistant state | Optional task-bound status, including ready for review and stopped. Prototype results are scripted and labeled as examples. |
| Recap | Editable draft text with the sources selected for that example. It becomes accepted task context only after the user keeps it. |

The task coordinator owns lifecycle transitions and task context. A page host retains live sample pages and selects which one is visible. A controlled-site adapter reports website state to the shell. The shell renders task navigation, status, and the pause drawer. A sample assistant provider supplies deterministic recap examples without a remote model or background job.

The page host must retain each form's live state across page selection, task switches, drawer interactions, pause, and resume. Whether the implementation uses retained documents or another local host is open. Reopening the form's URL with initial values does not meet this requirement.

Each sample page belongs to one task in this experiment. Source references may be reused without sharing a live form instance. Do not build automatic task inference or a general navigation-history model for this slice.

### Lifecycle and interactions

| Current state | User action | Result |
| --- | --- | --- |
| Active | Select another task | Keep the task Active and retain its page state. |
| Active | Open pause drawer | Keep the task Active; show the proposed note and affected pages. |
| Active with drawer open | Cancel, close, or choose Back to form | Make no lifecycle change; discard unconfirmed drawer edits and return focus to the invoking control. |
| Active with drawer open | Confirm pause | Commit the next-step note, retain live pages, and move the task to Later. |
| Later | Select task | Show its context and a Resume action without changing lifecycle. |
| Later | Resume | Move to Active and display the last selected page with retained state. |
| Active or Later | Settle with no unsaved or pending website operation | Move to Settled after the user's explicit action. Retain task context. |
| Active or Later | Settle with unsaved changes, failed save, or pending save/submission | Keep the current lifecycle and direct the user to the affected page. |
| Settled | Inspect | Show retained notes and references without reopening the task as Active. |
| Settled | Reopen | Move to Active. |

Blocking settlement while the controlled form has unsaved changes is a proposed interpretation of the mock-up's instruction to finish and save first. A successfully saved draft may be settled by the user; settlement does not certify that a claim was submitted.

After pausing, display another Active task if one is available. Otherwise show a simple view with the paused task and a Resume action. Switching views must not unload retained pages. For this small experiment, settling also does not automatically unload pages; production resource management remains open.

### Pause drawer

- Show the task name, affected page count, page titles, and a clear keep-open indication. Use "Keeping the page open does not save the form" beside the warning.
- The primary action for the unfinished sample form is "Keep page open & pause". For a task with no unsaved page, use "Pause task" without claiming its website data was saved.
- Propose a 500-character maximum for the optional next-step note, matching the mock-up. Display the counter, explain excess length, and retain the entered text until it is corrected or the user cancels. Do not silently truncate.
- Treat note edits as provisional until pause confirmation. Cancel leaves the previously committed note unchanged.
- Show "Retained for this session" near the note or confirmation. Do not promise recovery after reload, application closure, or a crash.
- Show an optional sample recap as a draft with selected sources. Keeping the recap requires a separate explicit review action; confirming pause alone does not accept it. Preserve accepted edits with the task and discard unaccepted draft edits on cancellation.
- Evidence links open the relevant sample reference without replacing the live form or losing an in-progress drawer note.

### Sample websites and their contract

- Seed "Submit travel claim" with an expense form, a sample receipt, and a travel policy. Seed "Choose a team browser" with reference pages and its own note. These are fictional local examples with no real claim submission or external service dependency.
- Use recognizable website layouts. The expense form exposes trip purpose, expense type, receipt selection, additional details, Save draft, and Submit claim. Use a bundled receipt fixture; arbitrary file upload is not required.
- Make trip purpose, expense type, and sample receipt required for submission. Additional details are optional. These are proposed fixture rules, not requirements for real expense systems.
- Initialize the form from a known sample baseline. Changes to any editable field or receipt selection report unsaved state. Returning all values to the acknowledged baseline clears that state.
- The controlled site reports its page ID and current state when edits, save requests, save acknowledgements, failures, or submission occur. A save acknowledgement applies only to the values included in that save. Newer edits remain unsaved.
- Save draft updates the sample site's baseline only on success. A failed save retains the fields and reports the error. Submit claim validates the form and shows a sample receipt of submission only on success. A failed submission retains the fields and prior unsaved state with an error; it never marks the task complete.
- Include deterministic ways for the evaluation fixture to exercise save failure and delayed acknowledgement. These are testing controls, not browser product settings.
- The browser shell does not call Save draft or Submit claim when pausing, resuming, keeping a recap, or settling. Only explicit actions inside the sample website trigger those operations.
- Use explicit fixture state reports for unsaved status. Do not infer universal form safety from navigation warnings, DOM inspection, time on a page, or a missing dirty signal. An unknown report must never render as "Saved".
- Keep the visible address consistent with the selected sample page. Sample links and back/forward navigation work within the controlled environment. A navigation or reload that would destroy unsaved fixture state must offer a cancelable warning before proceeding.
- Label the environment as a prototype. Any browser toolbar controls included in the layout must work within the fixture or be visibly unavailable. Fake addresses must not imply a real security or authentication guarantee.

### Assistant examples and accessibility

- Provide a way to evaluate the shell with no assistant and with sample ready-for-review or stopped states. A stopped assistant leaves the form, next-step note, and task lifecycle unchanged.
- Make selected sources explicit. A scripted recap may refer only to those fixture sources. Its links must open inspectable sample evidence. No real source upload or model request occurs in this prototype.
- A task can show both "Needs attention" and "AI ready for review". Neither status replaces the other. A successful website save changes page status without completing the assistant or task.
- Use labeled controls, visible keyboard focus, and text status. Announce lifecycle changes, unsaved status, and save errors to assistive technology without repeatedly interrupting form editing.
- On drawer opening, move focus into it; on closure, return focus to its trigger. Keep the active drawer's controls keyboard reachable. At narrower desktop widths, use an overlay or reflow rather than clipping actions. Phone layouts are outside this experiment.
- Task creation, task search, settings, and help shown in the concept image are deferred. Omit or visibly disable those controls in the prototype; do not add nonfunctional interactive elements just to match the picture.

## Testing Decisions

### Approved test seam

Use one primary automated seam: the running prototype through its public user interface, with controlled sample websites behind it. Drive task and form controls and assert visible outcomes. There are no existing test seams or prior tests in this repository to reuse.

The test runner and framework remain open until the application host is chosen. Prefer the host's browser automation support. Fixture setup may choose a save response or assistant example, but assertions should observe the same page, statuses, notes, and transitions that a person sees. Avoid tests tied to component structure, internal stores, or function calls.

The user approved this approach on 21 September 2026: automated tests through the running prototype's UI using controlled sample sites, plus manual visual and keyboard checks. This satisfies the testing-seam check required by the to-spec workflow. Manual resumption evaluation also supplements the automated tests; these checks do not require another production interface.

### Required behavior checks

1. Edit the claim, consult a reference, switch to the second task, and return. Verify exact field values, receipt selection, selected page, and unsaved status.
2. Pause with a next-step note, verify the move to Later and updated counts, use the second task, then resume. Verify the same form state and note, with no claim-save or submission confirmation.
3. Open the drawer, change the note, then cancel using each offered exit. Verify the task stays Active, the committed note is unchanged, form edits remain, and keyboard focus returns.
4. Pause with an empty note, with exactly 500 characters, and with an attempted value beyond the limit. Verify the documented validation behavior without silent loss of text.
5. Save the sample form successfully, then make another edit. Verify that only a successful acknowledgement clears the relevant unsaved state. A delayed acknowledgement for older values must leave newer edits unsaved.
6. Fail a sample save and retry. Verify the error, retained values, continued attention status, and eventual successful acknowledgement.
7. Attempt submission with missing required values, then correct them and explicitly submit. Verify validation and the sample confirmation. Pausing or accepting a recap never submits.
8. Attempt settlement with unsaved changes and while a save is pending. Verify settlement is blocked. Save or submit successfully, settle, inspect the retained context, and reopen the task.
9. Show an assistant result alongside an unsaved page, stop the assistant, and run the core journey with assistant examples off. Verify page state and task lifecycle remain independent in every case.
10. Inspect recap sources, edit and keep the draft, and separately discard it. Verify that only accepted text appears as kept context and that opening sources preserves the form and note.
11. Exercise a navigation that would discard unsaved state, cancel it, and verify edits remain. Show unknown website state and verify there is no saved claim.
12. Repeat pause and resume cycles, including when there is no other Active task. Verify counts, task ownership, and notes remain consistent without duplicate pages or tasks.

### Visual and human evaluation

- Compare the prototype to the selected mock-up for layout, hierarchy, website readability, and status clarity. Check the pause drawer with long task names, long notes, and narrower desktop windows.
- Complete the core journey using only the keyboard. Check focus movement, accessible labels, text status, and readable contrast in the implemented interface.
- Ask a participant to interrupt the travel claim, work on the second task, then resume without coaching. Record time to the first correct continuation, whether they can identify the next step, whether edits survive, and whether they understand that the form remains unsaved.
- Treat lost edits, accidental save or submission, and any claim that pausing saved the form as failures. Use observed resumption effort to decide whether to continue. Do not invent a numerical productivity target before a baseline exists.
- Tests pass against controlled examples only. They provide no evidence of arbitrary-site compatibility or crash recovery.

## Out of Scope

- A production browser, browser engine or framework commitment, extension packaging, distribution, or a security update process.
- Integration with Quicktabs or assumptions about its permissions or release status.
- Detecting, saving, restoring, or submitting arbitrary website forms.
- Recovery across application restarts, reloads, crashes, expired sessions, or discarded pages.
- Cloud accounts, synchronization, collaboration, cross-device continuation, or durable backup.
- Real model integration, autonomous browsing, background agents, external actions, or a production permission model.
- Automatic task grouping, full-text history search, navigation trails, nested tasks, scheduling, a temporary collection shelf, or automatic archiving.
- Complete task management, including creation, deletion, bulk actions, and task search. Two seeded tasks are sufficient for this experiment.
- Real uploads, receipt extraction, payment or reimbursement integrations, or real form submissions.
- Automatic tab suspension or memory optimization. Retaining live pages has a resource cost that this prototype does not solve.
- A phone interface, polished settings and help systems, telemetry infrastructure, branding clearance, or a claim of product novelty.

## Further Notes

The brief is the authority for scope. The mock-up supplies visual and interaction details; its illustrative task counts and every visible toolbar control are not requirements to build a full browser. The proposed settlement rule, note limit, sample validation rules, and cancellation behavior remain choices for review in this draft. The testing approach is approved.

Deliver the experiment in three usable increments. First, build the shell, two tasks, and sample pages with reliable switching. Second, add explicit website state, the pause drawer, and the complete resume and settle journey. Third, add sample assistant review states and complete accessibility and human evaluation. Each increment should leave the core browsing journey usable.

Before expanding into a daily browser, resolve these questions through separate investigations:

| Decision | Evidence needed |
| --- | --- |
| Application host and engine | A candidate host that supports ordinary website navigation and retained page instances on the intended desktop platform. Compare integration effort and engine maintenance responsibilities. |
| Trustworthy page status | Evidence of what candidate hosts and representative sites can report, and an honest user experience when state is unknown. |
| Retention and recovery | Measured behavior during reloads, crashes, authentication expiry, and resource pressure; a clear distinction between saved context and recoverable website state. |
| Privacy and permissions | A defined policy for page access, selected sources, excluded sensitive content, storage lifetime, deletion, and any transmission to an assistant. |
| Real assistant behavior | Evidence-grounded output with review, cancellation, and explicit authorization for external actions. |
| Product value | Observed improvement in resuming realistic work compared with an existing browsing workflow. The current research motivates an experiment and does not establish demand. |

Trailrest remains a working name. This spec does not choose a permanent brand.

Publishing is pending. No project issue tracker, repository remote, or project-specific triage configuration is present. Run `/setup-matt-pocock-skills` to configure the destination; the requested publication label is `ready-for-agent`. Do not infer a destination from another project.
