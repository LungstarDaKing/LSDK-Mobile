# Phase 8: release and handover

## Build profiles (eas.json)
| Profile | Use |
|---|---|
| development | dev-client APK / iPhone build; needed for calls and push |
| development-simulator | iOS simulator (Mac only) |
| preview | installable APK/IPA for testers, no dev server |
| production | Play Store AAB / App Store build, version auto-increments |

## Before the first store build
1. Environment variables on EAS (never commit them): `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY` (publishable key only), optional `EXPO_PUBLIC_TURN_URL`, `EXPO_PUBLIC_LUNEX_URL`, `EXPO_PUBLIC_WEB_URL`.
2. Run `backend-additions/mobile-push.sql`, redeploy the `push` Edge Function (see PHASE5.md).
3. Android: Play Console account (USD 25 once), FCM credentials via `eas credentials`. iOS: Apple Developer (USD 99/year), APNs key.
4. Store listings need: privacy policy URL, data-safety/privacy answers (accounts, messages, photos, mic/camera, push token), screenshots, age rating. `ITSAppUsesNonExemptEncryption` is already false; confirm that is still true for you.
5. Account deletion exists in-app (Apple requires it).

## Release commands
```
npx eas-cli build --profile preview --platform android     # test with friends
npx eas-cli build --profile production --platform all
npx eas-cli submit --profile production --platform android
```

## Pre-release checklist (all must be done by a human on devices)
- [ ] Sign up / sign in / sign out on iPhone and Android
- [ ] Send text, photo, voice note, reaction; receive in real time
- [ ] Call phone<->phone and phone<->web, with TURN if networks differ
- [ ] Push arrives with app closed; tapping opens the right chat
- [ ] VoiceOver and TalkBack walk through chat list, chat, settings; text size at largest
- [ ] Watch together, games, LUNEX against real services
- [ ] Delete account works

## Handover
Repo layout is in README.md; feature status in docs/PARITY.md; rules live in the database (`backend-reference`), the app never holds secrets.
