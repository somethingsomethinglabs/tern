# React to Svelte migration plan

Proposed on 27 September 2026. This document records the migration plan. Implementation and verification results are recorded in [Svelte migration results](svelte-migration-results.md).

Migrate the production interface in `packages/app` to Svelte 5 with TypeScript and Vite. Preserve the current appearance, interactions, host bridge and saved-data formats. Keep one shared interface that future platform entry points can mount.

## Current starting point

The working tree already contains a substantial shared-package extraction. Use that state as the baseline, not the older committed layout under `desktop/src`. Preserve existing changes and record a reproducible baseline before implementing the migration. Do not reset or silently commit unrelated work.

- `packages/app/src/App.tsx` contains the shell and exports `mountApp(element, bridge)`, which returns a cleanup function. Nine other TSX files implement panels and controls; `motion.ts` wraps Anime.js in a React hook.
- `packages/core` owns shared contracts and extracted application rules. It remains independent of the UI framework.
- `desktop/src/main.ts` supplies `window.tern` to the shared mount function. Electron separately owns the website `WebContentsView` instances.
- `desktop/vite.config.ts` compiles the UI into `dist/ui`, with relative asset URLs and shared public assets.
- `prototype/` is a separate React interaction experiment. `website/` uses plain JavaScript.
- The shared Electron/Capacitor architecture is documented in `docs/adr/0002-shared-application-electron-capacitor.md`. Capacitor and capability reporting are still future work.

Scope the first migration to `packages/app` and the desktop build integration. Leave the historical prototype on React unless a separate follow-up requires a repository with no React dependencies. That means React may remain in the root lockfile after the production migration. Do not combine this with a redesign, a mobile implementation, or further extraction of application workflows.

## Implementation choices

Retain the exported `mountApp(element, bridge)` function in a new `packages/app/src/index.ts`, backed by Svelte's `mount` and `unmount`. Keep its cleanup callable and document how asynchronous unmount completion is observed in tests. The desktop entry point should require little or no change. No component reads `window.tern` directly. [Svelte imperative component API](https://svelte.dev/docs/svelte/imperative-component-api)

Treat host snapshots as immutable input, using `$state.raw<Snapshot | null>` and replacing the whole snapshot on delivery. Compute selected task, selected page, filters and visibility using `$derived`. Keep editable drafts separate from host state. Svelte deeply proxies ordinary `$state` objects, and destructuring reactive values can capture stale values; review both cases explicitly. [Svelte state documentation](https://svelte.dev/docs/svelte/$state)

Construct commands as plain serializable objects before calling the bridge. Do not send a Svelte proxy, DOM node, callback or reactive collection across Electron IPC. Copy array selections into ordinary arrays. Test an actual bridge round trip, since a fake bridge does not exercise serialization.

Use event handlers for commands, derived state for calculations, and lifecycle/effects for subscriptions and DOM work. Avoid translating each React effect mechanically: Svelte tracks synchronous reads automatically and runs effects after DOM updates. Use `tick()` when code needs the newly rendered DOM; `$effect.pre` alone is not a replacement for React's post-mutation layout effect. Mount cleanup must be registered synchronously. [Svelte effects](https://svelte.dev/docs/svelte/$effect), [Svelte lifecycle hooks](https://svelte.dev/docs/svelte/lifecycle-hooks)

Keep `styles.css` global initially, retaining DOM structure, classes, labels and `data-*` attributes used by tests. Keep Anime.js and the current Web Animations code while replacing their React lifecycle wrappers. This makes visual and timing regressions easier to attribute.

Use stable IDs for task, page, finding, extension and download list keys. Do not key the entire application or draft-owning panels by the current snapshot or selected task. Keyed lists preserve item identity across insertion and movement within a list; movement between separate lifecycle groups can still recreate nodes. [Svelte keyed each blocks](https://svelte.dev/docs/svelte/each)

## Delivery sequence and gates

### 1. Establish the behavioral baseline

Record the current working-tree state and dependency versions. Run the existing type checks, shared-boundary check, core tests, desktop unit tests and desktop integration suite against the React implementation. Record existing failures and environment-dependent skips separately.

Capture the overview, browser shell, task notes, settings, context menu and dialogs at wide and narrow widths, plus reduced-motion behavior. Use disposable profiles and local fixture websites. Keep generated screenshots in a dedicated artifact directory so baseline collection does not overwrite existing design work.

Review the tests listed below before adding coverage. Add missing high-risk behavioral checks while React is still active, especially deferred saves, snapshot initialization, draft ownership and mount cleanup. If a check exposes an existing bug, record that fact and address it as a distinct fix rather than blaming the conversion.

Gate: a reproducible baseline with failures and coverage gaps identified.

### 2. Prove build integration and the native view boundary

Choose and pin compatible versions of Svelte, its Vite plugin, `svelte-check` and the icon implementation. The desktop currently uses Vite 6.4.3 and TypeScript 7.0.2; verify package peer requirements and the type-checker's support before installing. If a Vite upgrade is necessary, verify it independently with the existing UI first. Do not copy the website's Vite version without checking compatibility.

Add Svelte compilation for shared workspace source and a Svelte-aware typecheck. Plain `tsc` cannot provide the required checks inside `.svelte` templates. Update package exports and ensure direct desktop build/package commands check the shared UI, not just the root aggregate command. [Svelte TypeScript documentation](https://svelte.dev/docs/svelte/typescript)

Extend `scripts/check-shared.mjs` to inspect `.svelte` imports and scripts as well as TypeScript. Confirm with a temporary fixture that an Electron import inside a Svelte script fails the boundary check, then remove the fixture.

Build a temporary Svelte entry using the real bridge and a minimal shell with a live page, notes region and modal. Exercise view bounds, visibility, focus and teardown before converting every control. Use an explicit temporary build entry if needed; keep one mounted application and one snapshot owner at a time. Avoid React/Svelte component wrappers and any shipped runtime framework toggle.

Gate: a production build loads through Electron's file URL, mounts shared Svelte code, sends serializable commands and positions/hides the native website view correctly.

### 3. Convert components and preserve state ownership

Convert the small controls first: `StartTaskForm`, `SnapshotButton`, then `TaskOverview` and `ExtensionsPanel`. Follow with `TaskContextPanel`, `TaskNotes`, `SettingsPage`, `NewTask` and `ContextMenu`. Translate `ReactNode` composition to typed Svelte snippets and React refs to explicit element bindings or focus callbacks. Replace React event types with DOM event types. Verify snippet changes do not introduce nested forms or unexpected submit buttons. [Svelte 5 event and snippet conventions](https://svelte.dev/docs/svelte/v5-migration-guide)

Choose a maintained Svelte icon package only after confirming the icons, sizes, weights, licensing and accessibility match. Otherwise use the existing icon artwork as SVG assets. Preserve decorative `aria-hidden` behavior and accessible button names.

Keep note, goal and finding drafts keyed by task ID at an owner that survives closing the panel and switching tasks. The current notes panel uses `hidden`; replacing it with an unmounting conditional would lose local drafts unless ownership moves above that conditional.

Port the shell last, including shortcuts, drag handling, tab selection, menus, dialogs, bridge subscriptions and view measurement. Extract focused helpers where they make cleanup and ownership explicit, without moving product rules back out of `packages/core`.

Gate: all controls are reachable in a single Svelte application, and targeted tests pass for each converted behavior.

### 4. Switch the production entry and verify parity

Switch `mountApp` to the complete Svelte shell and remove the temporary entry. Run the full desktop regression suite once, then rerun affected tests after any fixes. Inspect screenshots and native view bounds; a DOM screenshot alone does not establish that a separate Electron view is correctly positioned or hidden.

Validate the standalone packaged build outside the repository with a disposable profile. Exercise at least task creation, a live fixture website, settings, restart and restored references. Confirm assets and fonts load and the bundle does not require source workspace paths or a Vite development server.

Gate: behavioral, visual and packaged-build parity, with all unexplained failures resolved and skips reported.

### 5. Remove migration scaffolding and update documentation

Remove production React components, React-only types and the desktop React plugin. Remove dependencies from `@tern/app` that no longer have consumers. Preserve prototype dependencies and regenerate the root lockfile through npm.

Update the application package export, TypeScript settings, build documentation and architecture wording to describe a shared Svelte interface. The existing architecture decision remains about sharing one application across hosts. Follow the repository's ADR workflow when updating it.

Check production imports and the generated desktop bundle for React leftovers; do not require a React-free root dependency tree while the prototype still uses it. Remove the temporary test/build entry and confirm the shared-boundary guard includes all new source extensions.

Gate: a single production implementation, no temporary framework switch, and documentation that matches the delivered build.

## Edge cases and required checks

The prevention column describes intended implementation behavior. It does not assert that a suspected race currently reproduces.

| Risk | Prevention and acceptance check | Existing coverage to retain or extend |
| --- | --- | --- |
| Initial snapshot arrives after a newer subscription event | Subscribe before reading, then prevent a late initial read from overwriting an event already accepted. A per-mount event counter can guard initialization without changing the bridge. Defer the read in a fake bridge, publish a newer event, resolve the old read and verify the UI stays current. Handle a rejected initial read visibly. | Add a focused shared UI test. |
| Unmount or remount leaks subscriptions | Keep exactly one snapshot listener and one shortcut listener per mounted app. On disposal, remove listeners, observers, animations, timers and scheduled frames; invalidate outstanding callbacks. Remount and verify one action causes one command. Late promises must not update a replacement app. | Add a fake-bridge mount/cleanup test; retain desktop shortcut checks. |
| Fine-grained reactivity causes loops or stale selections | Derive selected task/page from current snapshot IDs. Do not capture them once during setup or write commands from rendering effects. Rapidly switch tasks while title, load and AI updates arrive. Verify no command loops, stale controls or focus resets. | `browser.spec.ts`, `overview.spec.ts`; add burst-update check. |
| Electron receives an uncloneable command | Build plain payloads at the bridge boundary. Test nested preference patches and selected-page arrays through the real preload, not only a mock. Host snapshots remain read-only UI input. | Settings and multi-selection cases in `browser.spec.ts`. |
| Website overlays a dialog or intercepts its input | Preserve the current visibility conditions for modal, settings, overview, narrow notes panel, page error and page liveness. Hide the native view promptly; do not wait for animation. Check both native visibility/bounds and actual clicks/focus through rapid open/close cycles. Context menus remain clamped to the sidebar rather than relying on CSS z-index. | `browser.spec.ts`, `ux-motion.spec.ts`; extend native-view assertions. |
| Native bounds become stale | Measure after DOM changes and observe actual size changes. Also handle position changes, selection changes and window resizing; `ResizeObserver` alone does not report every position-only move. Test 799/800/801px widths, sidebar collapse, notes, toolbar reveal, fractional scaling, minimize/restore and zero-size regions. Cancel deferred old measurements and avoid duplicate unchanged IPC updates. | Resize and toolbar cases in `browser.spec.ts`; manual display-scale check. |
| Async save clears a newer draft or affects the wrong task | Capture task ID, submitted text and an edit/request generation before awaiting. Clear only the submitted draft if it has not changed. Test edit during save, task switch during save, save rejection and edit A → B → A. Avoid relying on proxy object identity for draft comparison. | `task-context-ui.spec.ts`, note cases in `browser.spec.ts`; add deferred-save cases. |
| Reordering or hiding loses input state | Keep stable item IDs and draft ownership outside remounted list rows. Test duplicate task names, lifecycle movement, filtering, overview reordering, panel close/reopen and empty selection. Preserve unsaved text and use a connected fallback when a focus target disappears. | `task-context-ui.spec.ts`, `overview.spec.ts`, task menu cases. |
| Address text is overwritten while typing | Reset the address draft on selected page identity or actual URL change, preserving current behavior. Unrelated loading/title/download/AI snapshots must not replace typed text or move its caret. Check Ctrl+L during toolbar hiding and a navigation failure. | Toolbar and navigation tests; add unrelated-snapshot typing check. |
| Cancelled work updates a reopened form | Retain the task-start attempt token and host cancellation command. Escape preserves the request. Late success/failure from an older attempt must not close the new dialog, clear its text or replace its error state. Verify cancel → reopen → submit with responses arriving late. | `task-start-ui.spec.ts`; extend cancellation sequence. |
| Rapid preference changes revert newer input | Keep optimistic patches until the host confirms them; associate pending writes/failures with per-field generations. Test repeated on/off changes, overlapping failures and a snapshot arriving before the command promise resolves. An old failure must not roll back a newer choice. | Settings cases in `browser.spec.ts`; add controlled out-of-order UI responses. |
| React event semantics change during conversion | Use `oninput` where React `onChange` updated on every keystroke. Preserve `preventDefault`, propagation, capture listeners and button types explicitly. Test checkbox/select behavior, middle-click and Ctrl/Shift click without accidentally selecting or submitting twice. | Multi-selection, mouse action and task-creation cases in `browser.spec.ts`. |
| IME Enter submits unfinished input | Read the DOM event's composition state rather than React's `nativeEvent`. Test composition start/update/Enter/end for task creation and other submission fields. Verify an ordinary Enter submits once afterwards. | Extend inline task creation checks. |
| Shell and guest shortcuts run twice or use stale state | Keep one host shortcut subscription reading current state. Preserve modal gating, Alt hints, task ordering, Alt+0, Ctrl+L/T/F/W and focus across shell, guest and extension popup. Test held keys, window blur and invalid shortcut targets. | Shortcut, extension and selection cases in `browser.spec.ts`. |
| Dialog or menu focus breaks | Guard `showModal()` with current dialog state; coordinate native `cancel`/`close` events with application state. Avoid old close callbacks clearing a newly opened dialog. Test Escape, Tab, arrows, Home/End, disabled menu items, outside pointer capture, sidebar scrolling, window blur and a deleted/detached anchor. | Keyboard dialogs, task menus and `ux-motion.spec.ts`. |
| Drag completion also activates a task | Preserve movement threshold, pointer capture, click suppression and pointer-cancel cleanup. Test Escape, focus loss, release outside a group, duplicate names and filtering during drag. Settling still unloads pages; moving to Later keeps forms alive. | Drag and lifecycle cases in `browser.spec.ts`. |
| Animation keeps hidden controls alive or leaves invisible cards | Preserve entrance-only behavior; closing must remove/hide controls immediately. Cancel and restore styles on unmount, rapid toggles and reduced-motion changes mid-animation. Remove cloned task-arrival nodes and keep them inert. Match newly created tasks using reliable identity where available, including same-title creation. | `ux-motion.spec.ts`, inline creation and snapshot cases. |
| Live website state is lost during UI changes | Keep website views owned by the existing Electron host. Task switching, overview, notes and UI remount must not recreate guest views. Preserve form values and website identity. Settling, cancelled close/reload and unload veto retain their existing meanings. | `browser.spec.ts`, `overview.spec.ts`, `task-start-ui.spec.ts`. |
| UI displays stale AI state or hides failures | Preserve loading, unavailable, retry and off states; suggestions remain tied to the task/input version and require the existing user action. Invalid or unavailable AI must not block manual editing or restoration. A save error must keep drafts and offer retry. | `overview.spec.ts`, `task-context-ui.spec.ts`, `task-start-ui.spec.ts`. |
| Accessibility or appearance changes silently | Preserve labels, roles, `aria-expanded`, status announcements, keyboard order, inert clones and hidden content. Fix Svelte accessibility warnings case by case rather than globally suppressing them. Compare wide/narrow screens, long titles, empty lists, theme changes, scrolling and reduced motion. Keep user/AI content escaped rather than converting it to raw HTML. | Existing role-based locators, `branding.spec.ts`, `ux-motion.spec.ts`, visual comparison. |
| Packaging succeeds but the installed app fails | Preserve relative URLs, public asset paths, host outputs and shared-core packaging. Launch a copied release from outside the repository; verify icons/fonts, live browsing and restart using a disposable profile. Keep the bridge isolation settings and trusted IPC checks. | `desktop/scripts/check-package.mjs`, branding/profile tests; add live-page smoke check. |

## Validation commands and completion criteria

During implementation, use targeted test files and cases for the affected controls. At the completed migration, run:

```bash
npm run typecheck
npm run test:core
npm run test:unit
npm run build:desktop
npm run test:desktop
npm run package:desktop
npm run test:package:desktop
```

Add the shared UI test command introduced for fake-bridge lifecycle/race coverage to the aggregate checks. Run the prototype and website builds after root dependency changes to catch workspace regressions. If the prototype is later migrated, treat its Sites packaging and `test:sites` as a separate acceptance gate.

The real-model AI cases require `TERN_AI_BUILTIN_MODEL`; record those as skipped if the fixture is unavailable. Passing other tests does not establish those cases passed. Actual desktop/display access is required to validate native views; mocks alone are insufficient.

Completion requires all baseline behavior preserved, the new race/cleanup checks passing, visual differences reviewed, and a standalone Svelte release working outside the repository. Saved profile formats must remain compatible. No migration of user data is planned.

Keep the pre-migration application build available for rollback. Validate the new build with disposable profiles before using a real profile. Rollback restores application files, not live website memory or later user-data edits. This planning task does not install or activate a new release.
