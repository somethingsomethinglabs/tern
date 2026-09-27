# Tern

![Tern](design/brand/tern-wordmark.svg)

A browser organized around unfinished work: put a task aside, keep its context, and pick up where you left off.

Tern was previously called Trailrest. The project started with the "Settle & Resume" concept selected on 21 September 2026.

In the desktop browser, **Start from a goal** turns a description of what you need to do into a named task, an editable goal and two or three tabs opened to the first web result of focused searches using the built-in local AI. The original request stays with the task.

Status: the local interaction prototype, Linux desktop browser and first Android APK are implemented. This is a separate project from Quicktabs.

## Repository layout

This is a private npm-workspaces monorepo. Each application has its own package, dependencies, and build configuration, with one lockfile at the repository root.

```text
packages/app/   Shared Svelte UI, styles, assets and injected host bridge
packages/core/  Shared contracts, task commands, validation and AI prompts
desktop/        Electron host, native integrations, packaging and browser tests
mobile/         Capacitor Android host, native website views and APK build
website/        Product landing page and interactive pause/resume demo
prototype/      Original controlled interaction experiment
docs/           Product specifications, research, and architecture decisions
design/         Design references and QA screenshots
```

The desktop app consumes `@tern/app` and `@tern/core` directly. Shared code owns the UI, task edits and lifecycle transitions, workspace parsing, address/search policy, tab selection, recaps, and AI prompts and response validation. Electron still owns browser orchestration, filesystem persistence, native inference and OS integration. Shared UI receives its host bridge through `mountApp`; it does not access Electron globals.

The Android app uses Capacitor and consumes those same packages. Its asynchronous application runtime is in `@tern/core`; Java implements the native browser and storage adapter. Build an installable test APK with `npm run apk:android`. See [Android setup and scope](mobile/README.md) and the [shared application decision](docs/adr/0002-shared-application-electron-capacitor.md). Move shared behavior into these packages rather than copying it into another host. Keep the landing page in `website/`. The prototype is an independent experiment, not the website.

## Development

Use Node.js 22.18 or newer and npm 11 or newer. Install dependencies once from the repository root:

```bash
npm ci
npm run dev:desktop
```

`npm run dev` also starts the desktop workflow. `npm run build` builds the core before its consumers. Desktop builds and type checks also build the core automatically. `npm run typecheck` checks each workspace and enforces shared-package import restrictions. `npm run test:core` runs the platform-independent behavior tests. `npm run package:desktop` builds a standalone Linux application. Run `npm run dev:website` for the landing page or `npm run build:website` for its production build.

Add dependencies to the package that uses them, for example `npm install <package> --workspace=@tern/app` or `npm install <package> --workspace=@tern/desktop`. Commit the root `package-lock.json`; do not create per-app lockfiles. Dependencies use npm's nested install strategy. Desktop packaging temporarily links the shared workspaces locally for Electron Packager, which includes the compiled core in the release and removes development dependencies. The release does not depend on repository symlinks.

Run `./install-tern` to build and install the desktop browser in your app launcher. After making changes, run `./update-tern`, then quit and reopen to use the new build. See the [desktop setup and controls](desktop/README.md). The desktop browser opens real websites; the original webpage prototype remains available separately. `./start-tern` still opens a build from this repository.

- [Selected design image](design/settle-and-resume.png)
- [Logo assets and usage](design/brand/README.md)
- [Design brief](docs/design-brief.md)
- [Settle and resume specification](docs/settle-and-resume-spec.md)
- [Design QA and screenshots](design-qa.md)
- [Implementation review](docs/implementation-review.md)
- [Original-spec gap review](docs/original-spec-gap-review.md)
- [Browser research](docs/browser-rethinking-research.md)
- [Historical and academic research](docs/browser-history-research.md)
- [Practical AI direction](docs/practical-ai-direction.md)
- [AI browser precedents](docs/ai-browser-precedents.md)

The prototype exercises switching tasks, pausing an unfinished form, and resuming it with context. Its success measure is how easily a person resumes work, rather than how few tabs remain open.

The prototype uses React and TypeScript in Vite. The desktop browser adds Electron and separate Chromium views for live pages. The mockup illustrates an interaction model; it does not establish which website state can be detected or preserved.

## Run the interaction prototype

```bash
npm run dev:prototype -- --host 127.0.0.1 --port 4174
```

Open the local address printed by Vite. The app seeds two tasks and a fictional expense claim with unsaved edits. Try editing the claim, choosing Put aside, recording a next step, switching tasks, and resuming. Save draft and Submit claim only affect the sample website in memory. Settle is a separate action.

All data lasts for the current page session. Refreshing or closing the application resets it. The prototype does not browse arbitrary websites, preserve data across restarts, contact an AI service, upload receipts, or submit real claims.

## Checks

```bash
npm run typecheck
npm run build
npm test
npm run test:sites
```

`npm test` runs desktop unit checks, shared core tests and both applications' UI suites. Use `npm run test:core`, `npm run test:desktop` or `npm run test:prototype` for a single workspace. Desktop checks need a graphical Linux session. After packaging, `npm run test:package:desktop` copies the release outside the repository and verifies startup and task restoration with a temporary profile. Prototype UI tests use an isolated Chromium process, defaulting to `/usr/bin/chromium`; set `CHROMIUM_PATH` to override it. The prototype test runner starts its server on port 4173. Tests use temporary profiles rather than your browsing data. Run the build before the UI suites and Sites output checks.

The tests exercise the agreed running-UI boundary. They cover retention, lifecycle, note cancellation and limits, website validation, delayed and failed saves, submission, recap review, keyboard operation, and desktop layouts. Screenshot evidence is written to `design/qa`.

For deterministic website examples, open the app with these query strings:

| Query               | Example behavior                                                   |
| ------------------- | ------------------------------------------------------------------ |
| `?save=fail-once`   | First draft save fails; a retry can succeed.                       |
| `?submit=fail-once` | First valid submission fails; a retry can succeed.                 |
| `?delay=1500`       | Website operations take 1.5 seconds, allowing edits during a save. |
| `?status=unknown`   | The shell cannot verify website state and never labels it saved.   |

Combine queries with `&`. Prototype controls in the sidebar switch the selected task's scripted assistant between ready, stopped, and off. Recaps refer only to the visible sample sources. Keeping one requires a separate review action.

Human resumption evaluation remains to be done. Automated tests demonstrate the controlled interaction, not improved productivity or compatibility with other websites.
