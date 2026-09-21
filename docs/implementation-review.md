# Prototype implementation review

The code-review skill ran independent Standards and Spec reviews against `git diff a05817d...d97f898`. Baseline `a05817d` contains the brief, mock-up, and approved testing approach. Implementation commit `d97f898` adds the prototype. Both reviewers then inspected the corrections in the working tree.

## Standards

No documented-standard violations were found. UI code lives in the required source directory, and the starter's hosting files remain intact.

Two nonblocking baseline smells were reported as judgment calls:

1. Primitive Obsession. Settlement used `report.label.startsWith("Page state unknown")` to choose behavior. A copy edit could change that behavior. The fix adds typed `knowledge` to the page report and branches on it.
2. Duplicated Code. Unconditional CSS overrides repeated earlier rules after visual adjustments. The fix folds final values into the original rules while retaining the distinct open-drawer selectors.

The Standards reviewer verified both corrections and reported no outstanding findings.

## Spec

Three findings were reported:

1. P1: Unknown page state could bypass the cancelable reload warning and discard edits. Reload now warns whenever the current report does not establish that it is safe to settle, including unknown state. A UI regression test verifies cancellation retains edits.
2. P2: Clearing the initial form to its empty baseline could claim a saved draft without a website acknowledgement. The site now tracks whether a successful acknowledgement exists and otherwise reports no unsaved changes. A UI regression test verifies it never invents a save.
3. P2: Confirming the final pause tried to restore focus to the now-disabled Put aside control. Focus restoration now runs after rendering and falls back to Resume when the trigger is unavailable. Tests cover that case and each cancellation exit.

The Spec reviewer verified the corrections and reported no remaining findings. The final suite also verifies the collapsible Settled section and inspection of its retained references.

## Validation

- 24 UI tests passed at the approved running-prototype boundary.
- Typechecking and the production build passed.
- Four bundled hosting tests passed. No deployment was performed.
- The final clean-load Chrome console had no errors or warnings during the checked journey.
- Visual comparison passed at desktop and narrower desktop sizes. See [design QA](../design-qa.md).

One earlier isolated Chromium process crashed during a six-worker test run. The test configuration now uses two workers; the affected test and final full suite passed. Earlier Chrome console errors occurred during hot replacement while source files were being edited and did not recur on a clean load.

Standards: 2 initial judgment-call findings, 0 outstanding. Spec: 3 initial findings, worst P1, 0 outstanding.
