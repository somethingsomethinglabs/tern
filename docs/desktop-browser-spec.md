# Desktop browser, first build

Continue the approved Settle & Resume design as a Linux desktop browser. The prototype remains a separate reference. This first build uses real websites and retains their live pages across task switches.

## Required behavior

- Create and rename tasks. Group them under Active, Later, and Settled. Search task names and page titles.
- Collapse Later and Settled behind expandable headings by default. Drag tasks between the active list and either heading without replacing live pages or notes. Offer a keyboard-accessible status selector in Task notes.
- Hold Alt to show task letters and page numbers. Alt+A–Z selects the first 26 tasks in creation order across groups and reveals the selected task; Alt+1–9 and Alt+0 select the first ten pages of the current task. Keep standard Ctrl shortcuts.
- Provide a browser settings page with persisted search-engine selection, page zoom, download directory/location prompting and address-bar auto-hide preference. Allow explicit cache clearing while retaining website cookies and task metadata.
- Add a top-left sidebar collapse control, preserving that choice across launches. Hide the URL toolbar on downward page scrolling; reveal it on upward scrolling, the top reveal strip or Ctrl+L. Keep native page state through both layout changes.
- Replace the static Task context panel with an optional Task notes editor. Save notes independently of lifecycle, retain oversized drafts for correction, and keep a keyboard-accessible task status selector. Downloads have a dedicated toolbar view.
- Provide a top-right extensions manager. Accept a Chrome Web Store link/ID to download a CRX package, import local ZIP/CRX packages after validation and a manifest/permission confirmation, or load an explicitly selected unpacked folder. Use the website session, remember registrations, and allow removal. Explain partial compatibility, unverified imported publisher signatures, unsupported extension toolbar popups, and the lack of native Add to Chrome integration.
- Open HTTP and HTTPS pages, enter addresses or search queries, use back, forward, reload, stop, and open or close pages within a task. Show the actual current address, title, loading failures, and renderer crashes.
- Keep each page alive when selecting another page or task. Pausing records an optional note up to 500 characters and moves the task to Later. Resuming returns it to Active. Settling is explicit and keeps its pages available.
- Never claim that pausing or settling saves or submits a website. Website save state is unknown. Confirm reload and close because the browser cannot universally detect unsaved work. Honor website unload vetoes with a separate Stay or Leave decision for page navigation, reload, and close. Quitting uses one explicit all-pages warning; canceling it leaves every live page intact.
- Save task names, lifecycle, page addresses, selection, and notes locally. After restart, show pages as references to reopen. Do not claim to recover unsaved forms. Keep website cookies in a separate persistent browser session.
- Follow the active Omarchy theme, including changes while running. Keep the URL toolbar dark. Remove the lifecycle/title strip below it so the website begins immediately beneath the toolbar. Task notes starts closed and contains an editable reminder. Keep native website views out of shell dialogs and drawers. Support keyboard address focus, new page, close page, reload, history, and find on page.
- Isolate website content from Node and the shell bridge. Validate all privileged commands. Restrict guest top-level navigation to HTTP(S). Deny unsupported device/notification permissions with an explanation. Handle normal HTTP(S) new-window links within their task while retaining popup opener and POST behavior. Deny other schemes. Downloads prompt for a destination and expose status without executing files.
- Provide a repeatable build and a local Linux executable. On quit, explain that live page state ends; allow cancellation. Report persistence failures rather than silently claiming success.

## Boundaries

This is a local desktop alpha. No AI service, full Chrome extension compatibility, native Chromium settings, sync, password manager, profile import, automatic engine updates, private browsing, OS default-browser registration, or broad compatibility claim is included. Existing prototype assistant behavior remains illustrative. Unsupported website permissions stay denied. Live pages consume memory until closed or the app quits.

## Validation

Keep the user's approved seam: automated tests through the running app UI using controlled sample sites, plus visual and keyboard checks. The tests launch the actual Electron browser with sandboxing enabled and isolated temporary profiles. They cover retained form edits, pause/resume and settlement, history and popup behavior, close/reload cancellation, restart references, URL restrictions, permission denial, downloads, guest isolation, drag/drop, collapsed task groups, native Alt shortcuts, live theme changes, unpacked and package extension loading/removal/restoration, browser settings persistence, note editing, sidebar collapse and scrolling toolbar behavior. Native dialog responses can be automated; assertions observe the resulting UI and website behavior.
