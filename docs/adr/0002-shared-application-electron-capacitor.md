# Share the application between Electron and Capacitor

Use Electron for desktop apps and Capacitor for Android, with one shared Svelte interface and one shared TypeScript implementation of application behavior. The user's requirement is to avoid duplicate product code across platforms. This replaces the proposed separate native Android interface; the existing Electron browser host remains the desktop implementation.

The target structure is:

```text
packages/
  app/       Shared Svelte interface, responsive layouts, styles and assets
  core/      Application state, commands, validation and platform interfaces
desktop/     Electron entry points, platform adapters and packaging
mobile/      Capacitor entry points, platform adapters and Android project
website/     Product website
prototype/   Historical interaction experiment
```

This structure is implemented as npm workspaces using the root lockfile. Move implementations into shared packages and update callers; do not copy implementations into a second app.

The core owns tasks, lifecycle transitions, notes, goals, findings, page records, search construction, workspace validation and migrations, and AI prompts and result validation. Application workflows and their tests have one implementation. The shared UI adapts its layout and input handling for screen size, touch and available capabilities. Platform entry points supply dependencies; product modules do not select a platform themselves.

Platform adapters implement browser sessions and views, durable storage, downloads, permissions, clipboard, OS integration and inference. Native code translates these operations and events; it does not reimplement task workflows. Prefer maintained Capacitor plugins where they meet the requirements. Custom Android browser integration can use a local [Capacitor plugin](https://capacitorjs.com/docs/android/custom-code). Some platform code is unavoidable, and its implementation may be substantial even when its interface is small.

The shared core must run without Electron, Node built-ins, Capacitor, DOM globals or native inference dependencies. Storage and inference interfaces are asynchronous so Android does not have to emulate Node's synchronous filesystem. Shared validation and serialization stay above the storage adapter. Each running app has one authoritative core instance: in Electron's main process on desktop, and in the trusted Capacitor app JavaScript runtime on Android. The shared interface accesses that instance through the same application interface, transported through validated IPC on desktop and called locally on Android. Native events return to that instance, which owns state changes and persistence ordering.

The `Bridge` in `packages/core/src/contracts.ts` is the UI interface. It is not the browser adapter: its commands include product operations such as putting a task aside. The shared `WorkspaceModel` now owns those task operations, and the runtime's `Platform` interface describes native browser and storage operations. Platform adapters report capabilities so shared controls can represent unsupported facilities without pretending they succeeded.

Website views remain isolated from the trusted application UI and its privileged bridge. Capacitor hosts the UI; separate Android WebViews host retained website tabs without exposing a native JavaScript interface. Device checks cover switching, placement and isolation; keep testing keyboard and lifecycle behavior as this adapter expands. Desktop Chrome extension support and desktop inference are marked unavailable through capabilities in the first Android build.

Keep task lifecycle separate from page liveness and website save state. Persist task context as it changes. Android process death can end live page state; recovery must identify reopened references honestly. Sharing code does not imply cross-device data sync, which remains a separate feature.

Migrate incrementally: extract shared contracts and application rules while keeping desktop behavior working; move the UI and assets into the shared app; connect the Capacitor entry point to those same packages; then implement and verify the Android adapters. Port existing rule tests with their implementation, retain desktop integration coverage, and add Android checks for native behavior and restoration after process death. Build checks should enforce the core's platform independence and prevent either host from owning a second implementation of shared workflows.

The extraction on 27 September 2026 moved the React UI and assets into `@tern/app`, with an injected bridge. `@tern/core` owns contracts, task edits and lifecycle commands, workspace parsing, address/search policy, page selection, recaps, model metadata, and AI prompts, schemas and response validation. Both hosts consume these packages directly. The Android host uses the core's `BrowserApplication`, an asynchronous runtime with ordered commands, storage and native events. Electron continues to orchestrate its richer browser and AI facilities around the same shared model, task-plan construction and preference validation. Consolidating the remaining Electron orchestration behind the asynchronous platform interface is still follow-up work; there is no separate Android implementation of task rules.

The first APK uses Android's native download manager and file picker, atomic app-private storage, Android Back handling and a touch layout in the shared UI. Local AI and advanced desktop capabilities are deliberately unavailable. Process death restores task context and references, not live website state. See `mobile/README.md` for build commands, device checks and current limitations.

The shared UI subsequently moved to Svelte 5 at the user's request. Both Vite hosts still call `mountApp(element, bridge)` from `@tern/app`; the framework change leaves shared rules, native adapters and saved-data formats in place. The historical prototype remains on React. The UI package uses TypeScript 6 because its Svelte checker does not yet support the hosts' TypeScript 7 toolchain.
