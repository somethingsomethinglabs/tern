# Trailrest

A browser organized around unfinished work: put a task aside, keep its context, and pick up where you left off.

Trailrest is a working project name. The project starts with the user's selected "Settle & Resume" concept, option three from the browser design exploration on 21 September 2026. The name suggests somewhere to rest along a browsing trail. It is provisional, not a cleared public brand.

Status: the local interaction prototype and the first Linux desktop browser are implemented. This is a separate project from Quicktabs.

Run `./start-trailrest` to open the desktop browser after building or packaging it. See the [desktop setup and controls](desktop/README.md). The desktop browser opens real websites; the original webpage prototype remains available separately.

- [Selected design image](design/settle-and-resume.png)
- [Design brief](docs/design-brief.md)
- [Settle and resume specification](docs/settle-and-resume-spec.md)
- [Design QA and screenshots](design-qa.md)
- [Implementation review](docs/implementation-review.md)
- [Original-spec gap review](docs/original-spec-gap-review.md)
- [Browser research](docs/browser-rethinking-research.md)
- [Historical and academic research](docs/browser-history-research.md)

The prototype exercises switching tasks, pausing an unfinished form, and resuming it with context. Its success measure is how easily a person resumes work, rather than how few tabs remain open.

The prototype uses React and TypeScript in Vite. The desktop browser adds Electron and separate Chromium views for live pages. The mockup illustrates an interaction model; it does not establish which website state can be detected or preserved.

## Run locally

```bash
cd prototype
npm ci
npm run dev -- --host 127.0.0.1 --port 4174
```

Open the local address printed by Vite. The app seeds two tasks and a fictional expense claim with unsaved edits. Try editing the claim, choosing Put aside, recording a next step, switching tasks, and resuming. Save draft and Submit claim only affect the sample website in memory. Settle is a separate action.

All data lasts for the current page session. Refreshing or closing the application resets it. The prototype does not browse arbitrary websites, preserve data across restarts, contact an AI service, upload receipts, or submit real claims.

## Checks

```bash
cd prototype
npm run typecheck
npm test
npm run build
npm run test:sites
```

UI tests use an isolated Chromium process, defaulting to `/usr/bin/chromium`. Set `CHROMIUM_PATH` to another installed Chromium executable if needed. The test runner starts its own local server on port 4173. It does not use your browsing profile.

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
