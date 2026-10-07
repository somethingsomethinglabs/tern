# Linux release process

Release artifacts and the update feed use [somethingsomethinglabs/tern](https://github.com/somethingsomethinglabs/tern). The owner approved public visibility, and the repository is now public. The initial [Linux 0.1.1 release](https://github.com/somethingsomethinglabs/tern/releases/tag/linux-v0.1.1) is published. Anonymous archive downloads and the signed update feed have been verified. A secret scan of repository history and the proposed release changes found no leaks.

The owner selected GPL-3.0-only for the desktop application and shared browser source. Their license files ship with the corresponding source. Fonts and other dependencies keep their original notices. The release also includes the source and build scripts for electron-chrome-extensions 4.9.0 at upstream release commit `927ac340c3c6cc462f636a50ccd9991df0cd2e12`.

## Chrome Web Store installation in 0.1.4

[Linux 0.1.4](https://github.com/somethingsomethinglabs/tern/releases/tag/linux-v0.1.4) is published from clean source commit `4ac9ed8717a7de5b05212078022b3058276ccf6b`, with signed update sequence 4. [Release CI](https://github.com/somethingsomethinglabs/tern/actions/runs/37702884564) passed 74 core tests, 44 desktop unit checks and 54 native desktop tests. The anonymous public updater verified the feed and archive and installed 0.1.4 in an isolated installation. The hardened binary also passed the live Dark Reader store flow with real native consent, popup, restart and disabled-state checks without an OS keyring.

This release adds direct installation from Chrome Web Store listings. The store's Add to Tern action downloads and verifies CRX3 developer and pinned store publisher signatures, then requests consent against the verified manifest. Store extensions keep stable identity, versioned installation files and a separate registry. Existing developer imports are preserved.

Store extensions update after startup and every five hours. New permissions and content-script website matches require approval through the Extensions panel. Failed replacements restore the previous version. Disable state persists, including across update checks and restarts. Store installation supports Manifest V3 browser extensions; native messaging and file access remain restricted. When the Linux keyring is unavailable, an extension-capable browsing session uses a fresh private profile on verified `/dev/shm` tmpfs. Website and extension account data stay in RAM and expire at exit. Installed code and its registration remain in the normal profile. If shared memory is unavailable, temporary browsing remains available but store installation reports that a keyring or Linux shared memory is needed.

The pinned `electron-chrome-web-store` 0.13.0 dependency supplies only the renderer bridge. Tern never initializes its installer or IPC handlers. Its copied preload has an exact-origin/top-frame guard, correct management event arguments and argument logging disabled. A build checksum forces review on dependency changes. Its MIT notice ships with the package. The unused upstream archive dependency is overridden to the audited adm-zip 0.6.1 release.

The extension lifecycle tests cover signature rejection, cancellation, added access, restart/disable persistence and failed-update rollback. The native bridge test exercises the real preload at the store origin and verifies isolation from lookalike origins and child frames. The optional live-store smoke check uses a disposable profile and installs Dark Reader, opens its popup, restarts, disables/enables and removes it. Run `node desktop/scripts/check-extension-store.mjs` from the repository root; set `TERN_EXECUTABLE` for the packaged binary.

## Published release

The Linux 0.1.1 binary was built from clean commit `8515d02538243b9c24f889e3e63a40ca96598862`, tagged `linux-v0.1.1`, with Electron 44.5.1. [Release CI](https://github.com/somethingsomethinglabs/tern/actions/runs/37410603501) passed on that commit. The archive SHA-256 is `b196a40493310c56fc85d980b09cddeb07607c3a6ec109cd23ee37ce572fd888`. An anonymous download matched that digest, and the application's updater accepted the live signed feed.

The first manifest expires on 20 October 2026 at 03:47 UTC. Renew its signed metadata before then or publish a newer application release. Keep the original package directory when renewing the same archive, and check that the regenerated archive digest is unchanged before replacing only the manifest asset.

## Build and validate

Use a checkout of the release commit for published releases. The release source includes the existing browser work and the security changes; website experiments and research drafts are outside the Linux release source.

```bash
npm ci
npm audit --audit-level=moderate
npm run build:desktop
npm run test:core
npm run test:unit
npm test --workspace=@tern/desktop -- e2e/browser.spec.ts e2e/extension-windows.spec.ts e2e/file-saving.spec.ts
node desktop/scripts/package.mjs
npm run test:package:desktop
```

Native tests need a graphical session; CI uses Xvfb. The file-saving test also needs xdotool. To validate native AI in the actual hardened binary, supply a previously downloaded model matching the pinned built-in checksum:

```bash
TERN_AI_BUILTIN_MODEL=/absolute/path/LFM2.5-1.2B-Instruct-QAD-Q4_0.gguf npm run test:package:desktop
```

To check encrypted-cookie migration separately from the no-keyring fallback, install `gnome-keyring`, `libsecret` tools and `dbus`, then run:

```bash
bash desktop/scripts/check-cookie-encryption.sh
```

It uses a private D-Bus session and temporary keyring. It never opens or changes the normal desktop keyring.

The GitHub Actions `Linux and Android release candidate` workflow runs these checks and uploads signed Linux and Android candidate artifacts. It does not publish a GitHub Release. Publishing a release triggers the Android workflow, which attaches the signed APK and checksum to that release. See `mobile/README.md` for Android signing and device checks. The `TERN_RELEASE_SIGNING_KEY_PEM` repository secret is configured and matches the public key in `desktop/resources/update-config.json`. Native AI verification remains a local release check because CI has no pinned model fixture.

## Publisher key and signing

The private publisher key is stored locally at `.tools/release-signing/private.pem`, outside version control, with owner-only permissions. Back it up securely before distributing this first release. Losing it requires an explicit trusted-key migration. Do not include it in an archive, issue, log or source commit. Only the public key ships in the application.

```bash
TERN_RELEASE_SIGNING_KEY=.tools/release-signing/private.pem node desktop/scripts/sign-release.mjs \
  desktop/release/Tern-linux-x64 \
  https://github.com/somethingsomethinglabs/tern/releases/download/linux-v0.1.1/tern-linux-x64.tar.gz \
  1
```

Upload `Tern-linux-x64.tar.gz` as `tern-linux-x64.tar.gz`, and `Tern-linux-x64.manifest.json` as `tern-linux-x64.manifest.json`, to the `linux-v0.1.1` release. Keep the manifest asset name stable: installed applications read `/releases/latest/download/tern-linux-x64.manifest.json`. Every application release needs a larger sequence and version. The signer rejects keys that do not match the packaged trust root, binaries with incorrect security fuses and dirty builds. `resources/build.json` records the source commit, application version and Electron version. Source cleanliness covers the desktop/shared-browser inputs; generated QA screenshots do not invalidate it.

Manifests expire after fourteen days. Refresh and re-sign the current manifest before expiry, keeping its version, archive and sequence unchanged, or publish a newer version. If metadata expires, the client rejects it and explains the failure; it does not install an unverifiable update. GitHub's “latest” selection and anonymous asset access must be verified after publishing.

## Website storage access

[Linux 0.1.3](https://github.com/somethingsomethinglabs/tern/releases/tag/linux-v0.1.3) is published from clean commit `d1c8f55f4c5fe45a26fc6a60541ea94f4c49d104`. [Release CI](https://github.com/somethingsomethinglabs/tern/actions/runs/37414827875) passed, including the real-server native storage-access test. All 30 desktop unit checks passed. The public signed updater verified and installed the release on the development machine.

From 0.1.3, Storage Access API requests use native consent rather than blanket denial. The prompt names the embedded origin and its hosting origin and explains access to existing cookies/sign-in data and possible cross-site tracking. Grants belong to the requesting origin in the current hosting document and expire on main-frame navigation. Requests need a secure origin and a selected, visible, focused page. Site information can block embedded sign-in/cookie access for the hosting site; revocation recreates that page to stop existing access. Unknown permissions and the separate top-level-storage-access extension remain denied.

## In-app updates

[Linux 0.1.2](https://github.com/somethingsomethinglabs/tern/releases/tag/linux-v0.1.2) is published from clean commit `e9a18cc701c27d03dc08b9c9b5fdcf011412fe7c`. [Release CI](https://github.com/somethingsomethinglabs/tern/actions/runs/37413568351) passed. The public signed updater installed it on the development machine, verified its archive and switched the launcher to `0.1.2-signed-2`. A subsequent check accepted the public feed and reported up to date.

Starting with 0.1.2, the main browser window prompts when a signed update is available. Choose **Update now** to download, verify and install it without leaving the application. Progress appears during download, and failures leave the current release active with a retry option. **Later** hides that version's prompt for the current session; Settings retains the update controls.

After installation, choose **Restart Tern** when website work is saved. The existing quit confirmation lets you cancel. Accepted restarts launch the newly installed executable. Tasks, notes and page addresses persist; unsaved website forms do not survive a restart. Startup and four-hour checks continue automatically. Portable runs still require the installer to enable managed updates.

## User installation

Extract the publisher's archive, then run `./install.sh`. It installs to `~/.local`, adds the app-menu entry and accepts `--prefix /absolute/directory` for an isolated installation. Node/npm and this repository are not required. Alternatively, run `./Tern` directly; portable runs do not enable managed updates. The desktop entry accepts HTTP/HTTPS links from other applications without replacing an existing page or its unsaved form. The OS can select Tern as the default browser; the installer does not change that preference automatically.

Updates verify the Ed25519 signature, HTTPS transport, expiration, sequence, version, archive size and SHA-256 before extracting. They preserve the current running release and switch the launcher only after copying completes. Installation takes effect after quitting and reopening. The updater never embeds a GitHub access token. A recorded high-water mark rejects older signed sequences; interrupted installation may require a newer sequence rather than retrying an already recorded one.

## Release behavior and limits

Production binaries disable RunAsNode, Node options, the main-process CLI inspector and extra file-protocol privileges, and require the ASAR application. Linux does not supply Electron's platform-supported ASAR integrity verification; the signed release archive authenticates distribution, while local filesystem permissions protect installed files.

Cookie encryption uses the OS keyring. When Linux has no usable keyring, website sessions use memory-only storage and Settings explains that sign-ins end on exit. Tasks and notes still persist. Encryption migration rewrites existing cookies before creating website views. The isolated GNOME keyring check verifies plaintext cookie migration, encrypted database rows and persistence after restart. Other desktop/keyring combinations still need distribution testing. Install/rollback commands block downgrades to unencrypted builds sharing that profile.

Supported flows include native uploads and downloads, website file-saving consent, camera/microphone consent, per-origin blocking and revocation, notification/clipboard/location consent, print, page save and PDF export. Approvals expire on navigation; blocks persist. File chooser consent accepts the selected visible page while its native chooser takes focus. Other sensitive approvals require a focused window. The media toolbar indicator reports permission approval; it does not claim that capture is currently active. Revocation destroys and recreates the document, stopping existing capture even if the site vetoes unloading.

Screen sharing, USB, HID and serial remain denied. Native extension messaging is disabled, and unpacked/ZIP/CRX extension imports are developer imports without publisher verification. This release has no built-in password manager, sync or private browsing. Location approval requires a working OS/provider service. Native notification delivery, printing, camera hardware and keyring behavior vary by desktop and need distribution testing. Android changes compile but this document covers the desktop Linux release only.

The pinned native AI dependency has a checksum-guarded compatibility patch: when already inside Tern’s disposable AI utility, it loads the native binding there rather than trying a nested Node fork. An incompatible binding terminates the AI utility and reports an error; RunAsNode remains disabled. Dependency upgrades must review this patch.

Electron security updates require rebuilding and publishing a signed application release. Check upstream Electron advisories before each release and ship engine fixes promptly. Dependency audit results alone cannot establish browser security.
