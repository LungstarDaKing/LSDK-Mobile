# How to make calls on the phone app

**Calls do NOT work in Expo Go.** WebRTC is native code that Expo Go does not contain. The app opens fine in Expo Go but hides/disables calling. You need a **development build** (a real installable app that contains the native code).

## Fastest route: Android (free)
1. One-time: `npm install`, then `npx eas-cli login` and `npx eas-cli init`.
2. `npx eas-cli build --profile development --platform android` (cloud build, ~15-25 min; free tier has a queue and a monthly limit).
3. When done EAS prints a link/QR: open it on the phone, install the APK (allow "install unknown apps").
4. On your PC run `npx expo start --dev-client`, open the installed LSDK Chat app, scan/enter the URL it shows.
5. Sign in on two devices (phone + the website, or two phones) that have already messaged each other, press the phone/camera icon in the chat header.

## iOS
Needs the **paid Apple Developer account** (USD 99/year); there is no free route for a native-code build on a physical iPhone. Then: `npx eas-cli build --profile development --platform ios`, register the iPhone when EAS asks (`eas device:create`), install from the link. A Mac is not required for the cloud build.

## Phone <-> website calls
Work with no extra setup because both use the same `calls` / `call_signals` tables and the same signalling.

## If the call rings but there is no audio/video
That is almost always a network (NAT) problem. Set `EXPO_PUBLIC_TURN_URL` to the same TURN worker URL the website uses (in `.env` for local, and as an EAS environment variable for builds: `npx eas-cli env:create`), then rebuild.

## Limits (unchanged)
Rings in-app only while the app is open (closed app = ordinary notification). No group calls, no screen share from the phone, no mini window.
## Not verified
No call has ever been placed with this code on real devices. If the dev build fails to compile, the first suspect is `react-native-webrtc` 124.0.8 against React Native 0.88: try the newest 155.x release of `react-native-webrtc` and tell me the error.

## Quick fix list if calls "don't work"
| Symptom | Cause | Fix |
|---|---|---|
| No call button / says calling is unavailable | You are in Expo Go | Install the development build (steps above) |
| Build fails in `react-native-webrtc` | Version vs React Native 0.88 | Send me the first red error; try the newest `react-native-webrtc` |
| "You can only call someone you have messaged" | Server rule | Both people send each other one message first |
| Rings but silent / black video | NAT/firewall | Set `EXPO_PUBLIC_TURN_URL` (same Worker URL as the website), rebuild |
| Phone does not ring when app is closed | No full-screen ring on closed app (needs CallKit/ConnectionService, not built) | Open the app, or rely on the notification |
| iPhone: no mic/camera prompt | Permission denied once | iPhone Settings > LSDK Chat > turn on Camera/Microphone |
| Works phone->web but not phone->phone on cellular | Carrier NAT | TURN, as above |
