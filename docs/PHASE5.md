# Phase 5 — calls and notifications (v0.5.0)

**Read this first: none of this has been run on a phone.** What was verified here: 158 unit tests (the call state machine runs against a *fake* WebRTC), a browser smoke test of the Calls tab with a fake server, web/iOS/Android bundles, and `expo prebuild` (permission strings). What was NOT: a real call between two devices, a real push, a native compile.

## What you get
- Voice and video calls between two people, using the same tables and functions as the website, so phone <-> browser works.
  Rules come from the database: you can only call someone once you have both messaged each other, 10 calls per 10 minutes, busy detection.
- Calls tab (history, tap to call back, Clear), call buttons in the chat header (direct chats only), full-screen incoming/outgoing/in-call screen (mute, camera on/off, flip, voice -> video, hang up).
- Ringtone: 3 stock tones, chosen in Settings (this device only). Notifications switch + "show message text" in Settings.
- Calls need **internet on both sides**; behind strict networks a TURN relay is needed: set `EXPO_PUBLIC_TURN_URL` to the same Worker URL the website uses.

## NOT built (be aware)
Group calls, screen sharing *from* the phone, movable/mini call window, per-person and custom ringtones, a full-screen ring when the app is closed (that needs CallKit / ConnectionService + VoIP push).
A call only rings in-app while the app is open (or via the normal notification when closed).

## Calls need a development build (not Expo Go)
`react-native-webrtc` is native code. In your project folder:
```
npm ci
npx eas-cli build --profile development --platform android     # installable APK
npx eas-cli build --profile development --platform ios         # needs the paid Apple Developer account
```
(If you have no `eas.json` development profile yet, `npx eas-cli build:configure` creates one; set `"developmentClient": true`.)
On the **web build** calls use the browser's own WebRTC.

## Notifications: what you must do
1. Supabase SQL editor: run `backend-additions/mobile-push.sql` (adds one table and two functions; changes nothing else).
2. Replace your `push` Edge Function code with `backend-additions/functions/push/index.ts` and redeploy it (it is your existing function plus an Expo-push section; web push is unchanged).
3. `npx eas-cli init` (gives the project an id; the app reads it), then add Android FCM credentials and iOS APNs key as EAS asks (`npx eas-cli credentials`).
4. Rebuild the development/production build (new native modules and permissions).
5. Open the app on a real phone, Settings -> Turn on notifications.

## Honest risks to watch when you first test
1. Two real phones on different networks: does audio connect? (If not: TURN URL.)
2. Android: ringing while the screen is off / app closed is only a notification.
3. iOS: microphone stops if the app is backgrounded mid-call (no background-audio mode is enabled on purpose; adding it is a store-review decision).
4. Camera flip uses react-native-webrtc's `_switchCamera` (private-ish API).
