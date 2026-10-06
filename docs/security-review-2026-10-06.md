# Browser security review and Linux release changes

Reviewed 6 October 2026. Scope: the shared browser application, Electron desktop host, Linux packaging/install/update path, and Android file chooser ownership. The initial review found release blockers in engine maintenance, production fuses, cookie encryption, website permissions, native extension messaging and distribution. Those findings drove the changes below.

The Linux 0.1.1 candidate is prepared in the existing [somethingsomethinglabs/tern repository](https://github.com/somethingsomethinglabs/tern) as a draft. The owner approved public repository visibility and the repository is now public. Source history and staged release changes passed secret scanning. The owner selected GPL-3.0-only for the desktop and shared browser source. Published artifacts must be rebuilt and signed from the committed release source. See [Linux release process](linux-release.md) for the concrete publication steps and supported capabilities. This is a release candidate, not a claim of full Chrome compatibility or protection against every browser exploit.

## Implemented changes

| Finding | Result |
| --- | --- |
| Engine security fixes need an explicit release path | Electron updated from 44.4.3 to 44.5.1, the latest stable checked on 6 October. Signed Linux application updates include the engine. CI packages and validates release candidates; publishing remains explicit. |
| Production Electron defaults expose unnecessary Node/debug/file privileges | Packaging disables RunAsNode, NodeOptions, Node CLI inspection and extra file-protocol privileges, enables cookie encryption and requires ASAR loading. The package smoke test uses Chromium CDP without enabling the main-process inspector. |
| Persistent cookie storage was unencrypted | Production uses OS-keyring encryption; without a usable keyring it uses a memory-only website session and explains that in Settings. Existing plaintext cookies are rewritten before opening websites. An isolated GNOME keyring test verifies encrypted rows and persistence after restart. Install and rollback paths reject unencrypted builds against the same managed profile. |
| Blanket permission denial prevented ordinary browser features | Origin-labelled native consent supports file access, camera/microphone, location, notifications and clipboard reading, with Deny selected by default. HTTPS or literal loopback origins and the selected visible document are required. Media, location, notification and clipboard requests also require a focused window and main-frame attribution. The real native file picker needs an exception for focus and Electron's null WebContents attribution; it still requires origin/path-specific consent. |
| Permission grants needed management and lifetime controls | Grants expire on main-frame navigation and destruction; origin blocks persist. Repeated denials and prompt floods cannot reopen unlimited dialogs. Camera and microphone grants cover only the approved device types. Revocation recreates affected documents to stop existing capture, even if a page vetoes unloading. A toolbar indicator shows media permission approval. |
| Extension native messaging could launch local programs | Declared nativeMessaging permissions are rejected before loadExtension can start a worker, checked again after loading, and denied through optional permission requests. Imports are explicitly labelled developer imports without publisher verification. |
| Browser controls were incomplete | Added print, page save, PDF export and shortcuts; download progress, cancel/resume and show-folder controls; HTTP “Not secure” and site information UI; blocked-popup controls; trusted-input popup throttling; and HTTP/HTTPS links from OS applications without overwriting an existing page. Removed the experimental CanvasDrawElement startup flag. |
| No authenticated Linux update path | Ed25519 signatures, bounded HTTPS downloads and redirects, expiration, monotonically increasing sequence/version, exact size and SHA-256 validation precede install. Updates preserve the running directory and switch launcher symlinks after copying. The publisher key and feed cannot silently change through updates. There is no embedded GitHub credential. |
| Native AI failed when RunAsNode was disabled | A checksum-guarded patch confines direct native binding load to Tern's already disposable AI utility process. Incompatible bindings terminate that utility; the host reports failure. The hardened production binary successfully generates a task without enabling RunAsNode. |
| Android chooser results could outlive their initiating page | Requests now belong to a specific attached WebView and URL, are cancelled on navigation/close/renderer loss, cannot overlap an outstanding picker, and reject inappropriate URI schemes or the app's own file provider. The Android build succeeds; Linux is the release target here. |
| Known dependency advisories | The local-AI Git dependency and Capacitor xcode/uuid chain are overridden to patched versions. Full npm audit, including build tools, reports zero known vulnerabilities. |

The engine update includes upstream Chromium, ANGLE, Dawn and V8 fixes. [Electron 44.5.1 release notes](https://releases.electronjs.org/release/v44.5.1). Fuse choices follow [Electron's fuse documentation](https://www.electronjs.org/docs/latest/tutorial/fuses); Linux archive signatures authenticate distribution, while filesystem permissions protect installed files. Linux does not provide Electron's platform-supported ASAR integrity verification.

## Boundaries retained

Website views use nodeIntegration false, contextIsolation true, sandbox true and webSecurity true. The shell has a separate denied-permission session, local protocol, restrictive CSP and trusted-main-frame IPC validation. Websites receive no Tern command bridge. TLS validation and Chromium's restricted-directory protections remain enabled. Screen sharing, USB, HID, serial and unknown permissions remain denied. Downloads never run automatically.

Extension ZIP/CRX path, duplicate, link and size checks remain in place. Developer imports still grant substantial website access; publisher identity, store compatibility and extension updates are not fully implemented. The browser has no built-in password manager, sync, profile import or private browsing. Location consent does not create an OS location provider. A media approval indicator is not a live-capture indicator. OS printing, notification delivery, physical device selection and non-GNOME keyring combinations still need distribution-specific acceptance testing.

## Validation

The shared-core suite passes 74 tests. Desktop unit checks pass 26 tests, including permission lifetime/persistence/device scoping, pre-load extension rejection, installer ownership and downgrade protection, signature/tamper/expiry rejection, and signed updater installation without replacing the running release.

Desktop integration validation passes 151 tests, with one optional live-network test skipped. The metasearch backend passes 12 unit tests. Browser validation covers normal navigation, forms, POST popups, task restoration, downloads, extension windows/imports, native permissions, camera revocation against an unload veto, PDF creation, OS link handling and renderer isolation. The Linux file-saving test accepts the real native chooser and verifies written bytes in an isolated directory. The hardened package check installs outside the repository without Node/npm, validates the desktop entry, restores saved tasks, verifies website isolation and generates a task through native AI. Cookie checks cover both the no-keyring fallback and plaintext-to-encrypted migration followed by restart in an isolated GNOME keyring.

The Android debug APK compiles after the chooser changes. These tests establish the exercised workflows. They do not certify every desktop distribution, website, extension or browser exploit class.

Repeatable commands and publisher instructions are in [Linux release process](linux-release.md). The collaborative web preview cannot inspect native Electron WebContentsViews or OS choosers; those checks use the repository's native integration tests.

## Publication gates

1. Public repository visibility is approved and configured. Publish the completed draft before advertising anonymous downloads or the public update feed.
2. Commit the intended source, rebuild from a clean checkout, and sign that package. Verify resources/build.json against the release tag before publication.
3. Securely back up the ignored local publisher key. The matching CI signing secret is configured. Refresh signed metadata before its fourteen-day expiry.
4. Publish the final assets with the documented stable names and verify anonymous release/download/feed access. Continue prompt Electron security updates and distribution acceptance testing.
