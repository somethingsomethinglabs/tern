# Bitwarden integration

Tern now connects installed extensions to browser tabs, popup windows, navigation events, context menus and manifest keyboard commands. The first target is the user's imported Bitwarden 2026.8.0 package. Its files and existing profile registration are unchanged.

## Use it

Quit and reopen Tern after updating. The toolbar shows a **B** button for Bitwarden; the Extensions panel also has **Open Bitwarden Password Manager**. On Linux, **Ctrl+Shift+U** opens it and **Ctrl+Shift+L** invokes Bitwarden's autofill command for the selected live page. Escape closes the extension window. Browser Ctrl shortcuts and Alt task/page shortcuts keep their existing meanings.

Allow a few seconds for the first-run welcome screen to initialize, then choose Log in. Sign in inside Bitwarden. Its vault and account handling remain in the extension, outside the Tern shell.

## Diagnosis and changes

Plain Electron loaded the manifest and content scripts, but Bitwarden's background worker stopped on missing `webNavigation.onCommitted`, and its popup stopped on missing `tabs.getCurrent`. The host now initializes the pinned `electron-chrome-extensions` 4.9.0 adapter before loading extensions. Each retained website view is registered as a tab; switching tasks updates the extension's active-tab selection. The privileged Tern shell is never registered as a website tab.

Installed extensions with a default popup get an Open control. The host opens their own extension URL in a sandboxed window using the website session, with no Tern command bridge. HTTP(S) links opened by the extension become task pages. Extension-initiated page closure retains the user's confirmation and website unload handling. Optional native-messaging/privacy permissions are denied rather than granted automatically. Clipboard access is limited to an installed extension's own window and its declared clipboard permissions; website permission requests remain blocked.

Electron also misclassified these windows in `runtime.getContexts`. A small extension-only preload reports the caller's own popup and background contexts. The host derives the extension identity from the sender's frame or worker and checks its session and registration. This is a limited implementation for Tern's top-level extension windows, not a claim of full Chrome API compatibility.

The adapter supplies command listeners but does not dispatch keyboard commands itself. Tern matches manifest shortcuts and sends the event through the pinned adapter's channel, waking Manifest V3 workers first. The controlled UI test covers this dependency.

Extension-created popout windows also contain registered tabs and report `TAB` contexts. Bitwarden finds its single-action passkey prompts through `tabs.query` before closing their windows after completion. Previously, Tern created those windows without registering their tabs, leaving completed prompts open. Both `windows.remove` and `tabs.remove` now close these popouts. The regression tests follow Bitwarden's tab lookup and verify that closing the prompt leaves the ordinary vault popup open.

The build copies the adapter preload with its three development API argument/result logs removed. The host registers that copy before loading extensions. A build assertion requires review if the pinned dependency's logging changes.

## Verification and remaining limits

The real package reaches its welcome, email and master-password-entry screens in a fresh profile. The smoke check uses a fictional email and substitutes the prelogin response. It enters no password, submits no authentication, and does not access the user's vault.

Run it from `desktop/`:

```bash
node scripts/check-bitwarden.mjs /path/to/unpacked/bitwarden
```

Set `TERN_EXECUTABLE` to check a packaged executable. The script writes `design/qa/desktop-bitwarden-login.png`. The automated browser suite separately tests a controlled Manifest V3 extension through popup-to-worker-to-content-script messaging. It verifies active-task targeting, preservation of the other page's form, popup contexts, native autofill/open shortcuts, and website isolation.

Validation: type checks and production build pass; all 22 browser UI tests pass. The two extension tests also pass after the final preload logging change.

The packaged executable also passes the real-package login-screen check. Its [password-entry screenshot](../design/qa/desktop-bitwarden-login.png) was inspected for layout. The tested application archive replaces the local launcher's archive without restarting the user's browser.

An immediate Log in click during Bitwarden's first-run initialization sometimes leaves the carousel displayed. A paced check after initialization reaches login. This upstream UI/host timing interaction is not proven resolved; the smoke check explicitly allows three seconds for initialization. If encountered, wait and choose Log in again.

Actual account authentication, vault decryption, lock/unlock, saving real logins, Bitwarden autofill, passkeys, SSO, biometric/native-app integration and clipboard behavior still require compatibility testing. The sample-extension autofill check establishes the browser integration, not those Bitwarden account workflows. Store-installed extensions now have automatic updates. Existing developer imports remain manually managed, and full Chrome compatibility remains absent.

## Dependencies

[electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-extensions) adds browser APIs that Electron lacks. Version 4.9.0 is pinned, including its preload event-channel contract. The adapter offers GPL-3.0 or a separate proprietary license; this local prototype selects GPL-3.0. Its license files ship inside the application archive. Distribution must account for that dependency's terms.
