# Tern for Android

The Android app uses Capacitor 8, the shared `@tern/app` Svelte interface and `@tern/core` application rules. Websites run in separate Android WebViews with no Capacitor bridge. The Java adapter provides views, storage, downloads, the file picker, clipboard and Android Back handling.

## Build and install

From the repository root, with Node.js 22.18+ and npm 11+:

```bash
npm ci
npm run apk:android
adb install -r mobile/artifacts/tern-android-debug.apk
```

The native build requires JDK 21 and Android SDK platform 36, build tools 35.0.0 and 36.0.0, and platform tools. Set `JAVA_HOME` and `ANDROID_HOME` to their installation directories, and accept the SDK licenses with `sdkmanager --licenses`. The build script also recognizes this checkout's local `.tools/jdk` and `.tools/android-sdk`. Gradle downloads its pinned distribution and dependencies on the first build. No Android Studio session is required.

The build compiles the shared packages, bundles the UI, synchronizes Capacitor and runs Gradle. It writes the APK and a SHA-256 file into `mobile/artifacts/`. This is a debug-signed test build, not a Play Store release. Public releases include `tern-android.apk`, signed with the stable Android publisher key. Android versions follow `desktop/package.json`; the version code is major × 1,000,000 + minor × 1,000 + patch. A release APK cannot replace a debug-signed installation without uninstalling it first, which removes its app data. The Android package is `app.tern.browser`; minimum Android version is 7.0 (API 24), with an up-to-date Android System WebView required.

For UI-only compilation use `npm run build:mobile`. To regenerate launcher icons from the shared brand SVG, install `rsvg-convert` and run `npm run brand:generate --workspace=@tern/mobile`.

## Device checks

Start an Android emulator and run:

```bash
npm run test:android --workspace=@tern/mobile
```

Set `ANDROID_SERIAL` if its serial differs from `emulator-5554`. This suite installs the APK and **clears Tern's data on that emulator**. It refuses physical-device serials. It uses a local HTTP fixture through `adb reverse` and Playwright's WebView debugging connection. Results and native screenshots are written to `mobile/test-results/`.

The checks cover startup, real website navigation, native touch typing and keyboard resizing, bridge isolation, live forms across task switches, Android Back, downloads, popup tabs and saved context after force-stop. They have passed on the Android 15 (API 35) emulator. Shared behavior tests run with `npm run test:core`; desktop UI regressions remain in the Electron suite.

## First build scope

Tasks, goals, notes, findings, search, tabs, pause and settle use the same UI and model as desktop. Android keeps up to 16 live website views. Task context and page references are stored atomically in app-private storage. Live website forms can survive task switches but cannot survive Android terminating the process; restored pages are presented as references to reopen.

Local AI, desktop extensions, page snapshots, link preloading and cross-device sync are not included. Goal entry opens a search without AI. Camera, microphone and location requests are declined. HTTP/S downloads use Android's download manager: the public Downloads folder on Android 10+, and app-specific storage on older releases. Simple user-initiated popup links open new tabs; popup POST flows and opener-dependent windows are not fully supported. There is no default-browser registration or external-app link handoff yet.

The shared UI and product rules live in `packages/`. Keep platform differences in the adapters and capability flags; do not create a separate Android task model or UI.

## Public release builds

The Android release workflow builds and attaches `tern-android.apk` and its SHA-256 file whenever a GitHub release is published. The Linux candidate workflow also runs this build, so both platforms must build before a candidate is accepted. A manual Android workflow run produces downloadable candidate artifacts without publishing them.

Publisher credentials are repository Actions secrets `TERN_ANDROID_KEYSTORE_BASE64`, `TERN_ANDROID_STORE_PASSWORD` and `TERN_ANDROID_KEY_PASSWORD`. The stable signing key and password are backed up locally under ignored `.tools/android-signing/` with owner-only permissions. Keep a secure backup; Android requires the same signing identity for future updates. Never commit these credentials.

For a local signed build, set `TERN_ANDROID_KEYSTORE` to the absolute keystore path and supply `TERN_ANDROID_STORE_PASSWORD` and `TERN_ANDROID_KEY_PASSWORD`, then run `npm run apk:release --workspace=@tern/mobile`. The alias is `tern`. Missing signing credentials stop the release build. Device checks remain a separate acceptance step; CI compiles and signs the APK.
