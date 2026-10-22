# NVS on Apple Watch — setup

## What this actually is, and isn't

No Apple Watch model has a camera. The Watch app here is a **remote
display + remote control**, not a standalone night-vision app: the iPhone
does all the capture and GPU processing (unchanged — the same web app),
and the Watch shows a low-rate still-frame mirror (~2.5 fps, by design —
see `src/watchBridge.js`) plus buttons that control the phone.

NVS has no native iOS app today — it's a PWA. Getting anything onto a
Watch requires a native iOS host app that embeds the existing web build in
a `WKWebView`, plus a WatchKit extension. That's what the files in this
folder are. **None of this has been compiled or run** — Xcode is Mac-only
and unavailable in the environment that wrote these files. Treat this as a
correct-by-review starting point, not a tested build.

## Prerequisites

- A Mac with Xcode 15+.
- An Apple ID (a free one is fine for installing on your own devices —
  no paid Developer Program needed, just a 7-day certificate you
  re-sign occasionally instead of yearly).
- A physical iPhone and a physical Apple Watch, paired to each other, both
  signed into that Apple ID. **Use real devices, not simulators** —
  `WCSession.isReachable` and `sendMessage` between a simulated iPhone and
  simulated Watch are unreliable for exactly the kind of live messaging
  this feature depends on.

## 1. Build the web app

In the `night-vision` repo root:

```
npm install
npm run build
```

This produces `dist/`. `vite.config.js` now sets `base: './'` so the build
uses relative asset paths — required for step 5 below, and already
committed.

## 2. Create the Xcode project

File → New → Project → iOS → **App**.
- Product Name: `NVSHost`
- Interface: SwiftUI · Language: Swift
- Uncheck "Include Tests" if you don't want them (not needed here)

## 3. Add the Watch App target

File → New → Target → watchOS → **Watch App**.
- Product Name: `NVSWatch`
- "Embed in Companion Application": `NVSHost`
- Interface: SwiftUI
- Uncheck "Include Notification Scene"

Xcode wires up matching bundle IDs (`NVSHost`'s + `NVSHost.watchkitapp`-style
for the Watch target) automatically — don't hand-edit these unless you know
you need to.

## 4. Replace the generated Swift files

Xcode's templates create placeholder `App.swift`/`ContentView.swift` files
in each target. Delete those and drag in the files from this folder,
matching targets:

| This folder | → Xcode target |
|---|---|
| `native/ios/NVSHost/*.swift` | `NVSHost` (the iOS app) |
| `native/watchOS/NVSWatch Watch App/*.swift` | `NVSWatch Watch App` (the Watch target) |

When dragging in, make sure "Copy items if needed" is checked and each
file's target membership (the checkboxes in the File Inspector, right
sidebar) matches the table above — a file added to the wrong target won't
compile.

## 5. Bundle the web build

Drag the night-vision repo's `dist` folder into the **NVSHost** target in
Xcode's file list.

- Choose **"Create folder references"** (blue folder icon), not "Create
  groups" (yellow) — a folder reference keeps `dist/` as one real directory
  inside the app bundle, which is what `Bundle.main.url(forResource:
  "dist", withExtension: nil)` in `LocalSchemeHandler.swift` expects. A
  group flattens/renames on copy and breaks that lookup.
- Confirm target membership: `NVSHost` checked, `NVSWatch Watch App`
  unchecked (the Watch target never needs the web build).

Optional, so you don't have to re-drag after every `npm run build`: add a
Build Phase → New Run Script Phase on the `NVSHost` target, before
"Copy Bundle Resources":

```sh
rsync -a --delete "$SRCROOT/../../dist/" "$SRCROOT/dist/"
```

Adjust the relative path to wherever you actually cloned `night-vision`
relative to the Xcode project, and keep the folder reference pointed at
that same `$SRCROOT/dist` path.

## 6. Camera permission string

NVS calls `getUserMedia()` for the camera. Add to the **NVSHost** target's
`Info.plist`:

- `NSCameraUsageDescription` — e.g. "NVS needs the camera for night-vision
  capture."

`WebViewContainer.swift`'s `WKUIDelegate.requestMediaCapturePermissionFor`
auto-grants the in-page permission prompt (WKWebView doesn't show Safari's
usual camera-permission chrome), but the Info.plist string is still
required by iOS itself or the app will crash on first camera access.

## 7. Build and run

- Run the `NVSHost` scheme on your paired iPhone (not the simulator).
- The Watch app installs automatically once the phone app does, if "Install
  on paired Watch" is on in the Watch app on the iPhone (default: on). You
  can also run the `NVSWatch Watch App` scheme directly onto the paired
  Watch from Xcode.
- Grant the camera permission prompt on first launch.

## Known limits (by design, not bugs)

- **~2.5 fps, not video.** `FRAME_W`/`FRAME_INTERVAL_MS` in
  `src/watchBridge.js` control this — WatchConnectivity is not a video
  transport, and pushing it harder costs battery on both devices for
  little visible gain at Watch screen size.
- **Both apps need to be reachable.** `sendMessage` (both directions) only
  delivers while `WCSession.isReachable` is true, which in practice means
  the phone app is foregrounded. Frames aren't queued while unreachable —
  the Watch just shows the most recent state once reachability returns,
  rather than replaying a backlog.
- **Keep the phone unlocked on the NVS screen** while glancing at the
  Watch. A backgrounded `WKWebView` can suspend rendering/rAF, same as any
  backgrounded tab — the mirror will freeze until the phone app is
  foregrounded again.
- **Controls exposed on the Watch today:** mode cycle (prev/next), start/stop
  recording, sentry toggle. Zoom and the low-light-enhance slider
  (`setZoom`/`setDce`) are already wired on both ends of the bridge
  (`watchBridge.js` ↔ `PhoneConnectivity.swift`) but have no Watch UI yet —
  add a `Slider`/digital crown binding in the Watch `ContentView.swift` and
  call `connectivity.send(command: "setZoom", value: v)` to surface them.
