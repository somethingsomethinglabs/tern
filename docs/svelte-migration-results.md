# Svelte migration results

Completed on 27 September 2026. The production interface in `packages/app` now uses Svelte 5. Both Electron and Capacitor consume the same `mountApp(element, bridge)` entry point. The historical prototype retains React.

## What changed

- Converted all ten React components to Svelte, preserving the global CSS, application structure and injected host bridge.
- Replaced React icons with matching Phosphor Svelte components and retained Anime.js entrance animations. Decorative icons are hidden from the accessibility tree.
- Added Svelte compilation and checking to both hosts. Direct desktop and mobile builds check the shared UI as well as their own TypeScript.
- Extended the shared-package boundary guard to `.svelte` files. A temporary prohibited Electron import was rejected, then removed.
- Removed production React imports and dependencies. React remains in the root lockfile for `prototype/`.
- Kept the existing core, native adapters and saved-data formats. The packaged application was built and checked without updating the user's installed application.

The UI package uses Svelte 5.57.1, `svelte-check` 4.7.6 and TypeScript 6.0.3. The checker currently declares support for TypeScript 5/6; the core and hosts retain their existing TypeScript 7 compiler. Both hosts retain Vite 6 and use Svelte's Vite plugin 5.1.1.

## Edge cases covered

The implementation guards initial snapshot ordering, disposes subscriptions and scheduled UI work on unmount, and preserves address input during unrelated host updates. Native-view measurements run after UI updates and respond to window and visual-viewport resizing; unchanged bounds are not resent.

Note and goal saves capture the submitted task, text and edit revision. Finding saves capture the submitted draft object. Late completions cannot clear a newer draft or a different task's input. Preference updates use per-field request generations so an older failure cannot roll back a newer identical choice.

Dialog submissions capture their opening generation. A late save cannot close a newly reopened dialog. Menu actions capture their anchor and callback before dismissal, since Svelte updates parent state immediately. The notes toggle preserves the original cancellation behavior under that same timing difference.

Twelve deterministic tests in `desktop/e2e/shared-ui.spec.ts` cover these races, menu dismissal, error display, IME submission, mobile visibility and Back handling. Their fixture uses the real compiled shared UI in sandboxed Electron with a controllable bridge and disposable profile. Existing desktop tests still exercise actual IPC, website views, retained forms, extensions, downloads and task workflows.

## Verification

| Check | Result |
| --- | --- |
| Workspace type checking | Passed, including zero Svelte errors or warnings |
| Core tests | Passed |
| Desktop unit tests | Passed |
| Full desktop integration suite | 116 passed, 7 skipped |
| Desktop production build | Passed |
| Mobile web bundle | Passed |
| Prototype and website builds | Passed |
| Prototype Sites worker checks | Passed |
| Linux standalone packaging | Passed |
| Standalone package smoke test | Passed |

The seven skipped integration tests require the pinned local AI model fixture. They were not counted as passes. Android device/APK testing was not performed for this migration; the mobile build and shared mobile UI behavior were checked.

The React baseline produced 100 passes, seven model-dependent skips and four timing failures in navigation setup or an initialization hook. All four failed baseline cases pass in the final Svelte suite. Intermediate migration failures in error display and menu actions were corrected and covered by regression tests. Tab-selection assertions now ignore whitespace around the status icon, since React and Svelte produce different whitespace text nodes.

The standalone smoke test copies the release outside the repository and uses a disposable profile. It creates a task through the UI, loads a local website, retains a live form while visiting Settings, changes the search engine, saves a pause note, and verifies the saved references and preferences after restart. It also checks that the packaged application does not ship the shared UI source or depend on a React runtime.

The desktop renderer JavaScript bundle changed from 335.75 kB to 220.87 kB, or 103.39 kB to 70.61 kB compressed, according to Vite's production build output. These are bundle-size measurements, not browsing-speed or Chromium memory measurements.

## Visual verification

The existing desktop screenshot tests cover the overview, notes, pause dialog and narrow layout. Window-manager sizing varied between runs, so wide captures from those runs are not suitable for direct pixel comparisons. A separate comparison renders the saved React source and final Svelte source with identical fixture data, fixed viewport sizes and reduced motion. The overview, notes and dialog captures at 1280×900 were pixel-identical. The 760×850 narrow capture had a negligible raster difference, with normalized ImageMagick AE of 0.00000436. See `design/qa/svelte-migration/` for the captures and comparison values.

## Build artifacts and rollback

The verified Linux build is in `desktop/release/Tern-linux-x64`. The previous release and the pre-migration shared UI were retained under `/tmp/tern-svelte-baseline` for this session. No saved-profile migration is required. Switching application files cannot restore live website memory, so installation remains a separate action.
