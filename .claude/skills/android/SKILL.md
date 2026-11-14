---
name: android
description: The Android app, a Tauri 2 mobile shell in src-tauri that opens the self-hosted server in its webview. Toolchain, the connect page, link handling, capabilities, building and running on a phone over USB. Use when touching src-tauri, the Android build, or anything the app does natively.
---

# Android

## Shape

- The web app renders on the server and talks through remote functions, so the APK carries no copy of the UI. It is a shell: Tauri 2 mobile in `src-tauri/`, its webview opens the server.
- `src-tauri/connect/index.html` is the only bundled page (`frontendDist`), plain HTML with tokens copied from Platinum and Charcoal since no server hands them out yet. It asks for the server address on first start, then doubles as the splash: a saved server is probed (`fetch` with `no-cors`, an opaque answer is enough) and opened, the form only shows when there is none or it doesn't answer. Bare hosts get `https://`.
- The address lives in `server.txt` in the app config folder (`saved_server`, `connect` commands in `lib.rs`). Settings > Account changes it (`changeServer` in the bridge): the service stops, the process restarts, and the connect page shows the form prefilled once instead of opening the saved address. Leaving without a new address keeps the old one.
- The window is built in `setup`, not in `tauri.conf.json`, so it can take `on_navigation`: the local page and the server's origin stay in the webview, other http, mailto and tel links go to the system through `tauri-plugin-opener`, anything else is dropped. Markdown links carry `target="_blank"`, Android's webview loads those in place, so the same check catches them.
- Back first asks the page to close an overlay (`window.closeOverlay`, see the decision in AGENTS.md), then walks the webview history in `MainActivity` (Tauri's own handling is off) and hides the app instead of stepping onto the connect page: Tauri still files that page under the server's URL, refuses its calls and the splash hung.
- Edge to edge: the web UI pads its top with `env(safe-area-inset-top)` (page, side rail, phone menu, settings height, progress bar) and the root layout lays a canvas strip under the status bar, zero high in a browser.
- Status bar icons follow the theme, not the phone's dark mode: `MainActivity` exposes `window.NotificaAndroid.statusBar(light)`, `syncStatusBar()` in `#lib/android.ts` calls it on load and on every theme switch.
- Overlays with a dark backdrop of their own pass `syncStatusBar('dark')` while open (image viewer). Fixed bars at the top of an overlay pad with the inset too, the strip sits at z 35, below dialogs and the viewer.
- Launcher icon is adaptive: foreground and background PNGs in `res/mipmap-*` (rendered by `bun tauri icon` from `static/favicon-tile.svg` through a manifest, the foreground is `static/favicon.svg`, which has no tile, at `viewBox="-11 -13 86 86"`, PNGs so the inks can multiply) plus a one ink vector `res/drawable/ic_launcher_monochrome.xml` for themed icons. Notifications show the same one ink logo cropped to its edges (`res/drawable/ic_notification.xml`). The start window takes the canvas colour of Platinum or Charcoal in `res/values*/themes.xml`.
- Share target: `ShareActivity` (translucent, no window, out of recents) posts what another app sent to `/api/app-share/<user>` with the stream key, then each image as raw bytes to `/api/app-share/<user>/<note>`, JSON and bytes since SvelteKit rejects form posts without an Origin. Images shrink to WebP on Android 11 and up. Nothing shows unless images were lost. Without a stream key, against an older server or offline it hands the intent to `MainActivity`, which keeps it until a page takes it through the bridge (`hasShare`, `takeShare`, `sharedImage`), the notes page then opens a new note with it (`openShared` in `note_opening`).
- Identifier `ex.notifica.app`. Changing it later means a new app on the phone, not an update.

## Notifications

- **Alarms by default**: the web calls `setSchedule(url)` before `listen(url)`. The app keeps the schedule from `/api/app-schedule/<user>?key=...` (same key as the stream, next 48 h, 20 per reminder, 200 in all) in `ReminderPrefs` and arms one exact alarm (`setExactAndAllowWhileIdle`) for the soonest entry. `AlarmReceiver` shows what is due, re-arms and asks for a sync. `ScheduleSync` (WorkManager) fetches it every 15 min online, and at once after an alarm, a boot, a switch and each time the app comes up or goes away. 404 means a server without schedules: the address is dropped and the stream takes over. `ReminderDelivery.apply()` decides what runs, see `docs/state-machines.md` (Phone delivery).
- Exact alarm permissions: `USE_EXACT_ALARM` (granted on 13 and up, fine outside the Play Store), `SCHEDULE_EXACT_ALARM` up to 12. If the user takes it back the alarm goes inexact, a few minutes late.
- **Instant updates** (`setInstant`, per phone in `ReminderPrefs.instant`, off by default) also runs `ReminderService` so edits from a browser land at once. Alarms keep running beside it.
- `ReminderService` is a foreground service with a small silent notification, only with Instant updates on or against an older server. It holds `/api/app-stream/<user>?key=...` open (newline separated JSON, signed key, with a heartbeat), retries with backoff from 2 s to 60 s, and resumes with `since` so pushes from a gap are replayed. A 401 means the account is gone or its password changed (`streamEpoch` is part of the signed key, `setPassword` raises it and hangs up): it forgets the address and stops, the next app open registers a new key.
- `ReminderNotifier` shows the pushes, the title alone when the note has no text. A tap opens the note through `MainActivity` (`EXTRA_LINK`), Done posts the signed link from `ActionReceiver`, no login needed. Reschedule opens the note's `reschedule` link, the page shows `RescheduleDialog` for that occurrence. Against an older server without `reschedule` the app shows its two fixed snooze buttons. The notification id and the seen list key on `slot` (`pushKey()`), so alarm and stream never show one time twice. Done before the server logged the occurrence answers 409, the notification stays and `ActionRetry` tries again every minute. 410 means the reminder moved on since the phone's schedule, the notification goes. Schedule syncs drop entries already shown, else a time the server still lists would fire again until dispatch moves on. All plain requests go through `request()` in `Http.kt`, only the stream keeps its own connection. `StartReceiver` re-arms and syncs after a reboot or an app update.
- `ReminderPrefs` keeps the address, the on switch (default on), the replay cursor and whether permissions were asked.
- Bridge in `window.NotificaAndroid`: `setSchedule`, `listen`, `stopListening`, `notificationsOn`, `notificationsAllowed`, `setNotifications`, `instantOn`, `setInstant`, `testNotification`, `openNotificationSettings`, `pendingLink`. A JavascriptInterface can't overload, so new arguments come as new methods. `#lib/device_notifications.ts` and `NotificationSettings.svelte` use them. Optional in the types, an older app lacks them. `MainActivity` sends a `notifica-android` window event when permissions may have changed, pages follow it through `onAndroidEvent()`, which returns its cleanup. `src/lib/native_contract.test.ts` checks every bridge method the pages call exists as a `@JavascriptInterface`, and the push fields, snooze choices and stream timeouts the app reads.
- The switch in settings is stored on the account (`appPaused`), the same row in a browser and in the app. `followAppPause()` in the `(app)` layout brings the phone's own `ReminderPrefs` switch in line on every page load. So turning on from a browser only starts a stopped service once the app next opens, and turning off silences at once on the server while the silent service notification stays until then.
- The first `listen` asks for the notification permission, once. The battery exemption is only asked for in live mode, turning on Instant updates asks again.
- Send a test in the app shows a local notification (`testNotification`), the server's test only reaches a live stream.
- To test: `adb shell dumpsys alarm | grep ex.notifica.app` shows the armed alarm, `adb shell dumpsys deviceidle force-idle` puts the phone in doze, `adb shell dumpsys activity services ex.notifica.app` shows the service in live mode.

## Capabilities

- `capabilities/connect.json` is `local` only: the connect page may call `saved_server` and `connect`. Remote pages get no Tauri IPC, only the JS bridge above.
- App commands are listed in `build.rs` (`AppManifest::commands`), which makes them deny by default and grantable as `allow-<name>`. A new command needs both lines, else the call rejects silently.
- When the web UI needs native calls, grant them through a capability with `remote.urls` for the saved server, added at runtime (`app.add_capability`) since the address is only known then.

## Toolchain (Windows)

- No Android Studio. JDK 17 is Microsoft's OpenJDK MSI in `C:\Program Files\Microsoft\jdk-17`, machine wide `JAVA_HOME`. winget timed out on it, curl with `--retry` fetched the MSI. The Java 8 on PATH is too old for Gradle.
- SDK at `%LOCALAPPDATA%\Android\Sdk`: command line tools unpacked by hand to `cmdline-tools\latest`, then `sdkmanager` for platform tools, platform, build tools and NDK 29.0.14206865. `ANDROID_HOME`, `NDK_HOME` and platform tools on PATH as user variables.
- Rust targets: `aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`.
- `src-tauri/gen/android` is created by `bun tauri android init` and checked in, Tauri expects edits to it (manifest, icons).

## Release builds and F-Droid

- Phones get the app from an F-Droid repo at `https://telefonsquid.github.io/notifica-ex/repo`, fingerprint `447BC75EE4E4E98F1AE78A96C5D8AC35632ACADDA58C610FF84911D56D794888`. The source repo is public for it.
- `.github/workflows/android.yml` runs on every `v*` tag (and by hand): signed universal APK for arm64 and armv7, `fdroid update` on `fdroid/`, Pages deploy, GitHub release with the APK. Only the newest APK is in the repo. The release's CHANGELOG section becomes the client's changelog.
- `fdroid/metadata/ex.notifica.app.yml` holds the listing text. `config.yml` is written in CI and never committed.
- Signing: one keystore with alias `app` (the APK) and `repo` (the index), same password for both. The original is in `%USERPROFILE%\.keys
otifica-ex` (`release.jks`, `password.txt`), CI has it as the secrets `ANDROID_KEYSTORE` (base64) and `ANDROID_KEYSTORE_PASSWORD`. Losing it means phones can't update, only reinstall.
- Gradle reads `src-tauri/gen/android/keystore.properties` (gitignored) for release signing, without it release builds come out unsigned. Locally it points at the keystore above.
- `versionCode` is `major * 1000000 + minor * 1000 + patch`, Tauri derives it from the version. It must rise, so every release bumps the version.
- Release builds run R8 in full mode, debug builds don't shrink, so a class built by reflection can work in debug and crash in release. `app/proguard-rules.pro` keeps what library rules miss (Room's `WorkDatabase_Impl` constructor took 0.4.0 down at launch). Test a new dependency in a release build, `adb logcat -b crash` shows the stack.
- A debug build and the release are signed differently: switching between them needs an uninstall, which drops the saved server and settings.

## Run on the phone

- USB debugging on, `adb devices` lists it. Docker Desktop running, PocketBase and ntfy live in its containers.
- Against the dev server, forward the ports so the phone's `localhost` is this machine's: `adb reverse tcp:55560 tcp:55560` and `tcp:8091` for PocketBase realtime. Enter `http://localhost:55560` on the connect page, the same host as `ORIGIN` in `.env`, else remote functions reject the origin. `localhost` also counts as secure, so the `Secure` session cookie sticks over http.
- Build and install: `bun tauri android build --debug --apk --target aarch64`, then `adb install -r` on `gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`. Plain http to other hosts only works in debug builds (cleartext traffic is off in release).
- Inspect the webview: debug builds expose devtools on `localabstract:webview_devtools_remote_<pid>`, `adb forward` it and talk CDP, or open `chrome://inspect`.
- Measure smoothness with `adb shell dumpsys gfxinfo ex.notifica.app` (`reset` before each interaction, janky share and percentiles after), the phone runs at 120 Hz so 8 ms is the budget. The debug APK and the dev server cost little: the production build measured about the same.

## Performance on phones

- Blur was what hurt, so the whole app has none (decision in AGENTS.md).
- `glide()` skips cells that stay off screen, else every reorder animates the whole grid.
- Overlays over the grid skip bits-ui's scroll lock (`preventScroll={false}`, `overscroll-contain` on the overlay): restyling the body lays out every card on the first frame.
- A touch outside an open note closes it only on lift, a drag that turns into a scroll cancels it (`pointercancel`).
- Still heavy: the first note open, which loads Tiptap since touch has no hover to preload it. The phone menu loses 2 to 5 frames to mounting.
