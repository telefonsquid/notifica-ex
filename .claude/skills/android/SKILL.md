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
- Launcher icon is an adaptive vector (`res/drawable*/ic_launcher_*.xml`), the start window takes the canvas colour of Platinum or Charcoal in `res/values*/themes.xml`.
- Share target: `MainActivity` keeps what another app sent until a page takes it through the bridge (`hasShare`, `takeShare`, `sharedImage`, images as data addresses up to 30 MB). The `(app)` layout walks to the notes page, which opens a new note with it (`incoming` on `Note`). It saves without a keystroke.
- Identifier `ex.notifica.app`. Changing it later means a new app on the phone, not an update.

## Notifications

- `ReminderService` is a foreground service with a small silent notification. It holds `/api/app-stream/<user>?key=...` open (newline separated JSON, signed key, with a heartbeat), retries with backoff from 2 s to 60 s, and resumes with `since` so pushes from a gap are replayed. A 401 means the account is gone or its password changed (`streamEpoch` is part of the signed key, `setPassword` raises it and hangs up): it forgets the address and stops, the next app open registers a new key.
- `ReminderNotifier` shows the pushes. A tap opens the note through `MainActivity` (`EXTRA_LINK`), Done posts the signed link from `ActionReceiver`, no login needed. `StartReceiver` restarts the service after a reboot or an app update.
- `ReminderPrefs` keeps the address, the on switch (default on), the replay cursor and whether permissions were asked.
- Bridge in `window.NotificaAndroid`: `listen`, `stopListening`, `notificationsOn`, `notificationsAllowed`, `setNotifications`, `openNotificationSettings`, `pendingLink`. `#lib/device_notifications.ts` and `NotificationSettings.svelte` use them. Optional in the types, an older app lacks them. `MainActivity` sends a `notifica-android` window event when permissions may have changed.
- The first `listen` asks for the notification permission, then for the battery exemption, once.
- To test: `adb shell dumpsys activity services ex.notifica.app` shows the service, Send a test in settings should show a notification.

## Capabilities

- `capabilities/connect.json` is `local` only: the connect page may call `saved_server` and `connect`. Remote pages get no Tauri IPC, only the JS bridge above.
- App commands are listed in `build.rs` (`AppManifest::commands`), which makes them deny by default and grantable as `allow-<name>`. A new command needs both lines, else the call rejects silently.
- When the web UI needs native calls, grant them through a capability with `remote.urls` for the saved server, added at runtime (`app.add_capability`) since the address is only known then.

## Toolchain (Windows)

- No Android Studio. JDK 17 is Microsoft's OpenJDK MSI in `C:\Program Files\Microsoft\jdk-17`, machine wide `JAVA_HOME`. winget timed out on it, curl with `--retry` fetched the MSI. The Java 8 on PATH is too old for Gradle.
- SDK at `%LOCALAPPDATA%\Android\Sdk`: command line tools unpacked by hand to `cmdline-tools\latest`, then `sdkmanager` for platform tools, platform, build tools and NDK 29.0.14206865. `ANDROID_HOME`, `NDK_HOME` and platform tools on PATH as user variables.
- Rust targets: `aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`.
- `src-tauri/gen/android` is created by `bun tauri android init` and checked in, Tauri expects edits to it (manifest, icons).

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
