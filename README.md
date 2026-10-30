# LSDK Mobile

Expo SDK 58 + React Native + TypeScript + Expo Router. Shares the Supabase backend with LSDKChat web.

## Setup (Windows, in C:\Users\mthet\LSDKMobile)
```
npm install
copy .env.example .env      # then edit .env with your Supabase URL + publishable key
npm run typecheck
npm test
npm run web                  # browser
npx expo start               # scan QR in Expo Go (SDK 58): everything except calls and phone push, which need a development build
```
Phase 1 runs in Expo Go. Calls, voice notes, push and speech need an EAS development build (see docs/PARITY.md).

## EAS
```
npm i -g eas-cli
eas login
eas init
eas build --profile preview --platform android      # installable APK
eas build --profile development --platform android  # dev client APK (needed from Phase 3/5)
eas build --profile production --platform android   # AAB for Play Store
```
iOS builds require an Apple Developer account: `eas build --profile production --platform ios`.

Mac / Xcode: see docs/MAC-IOS.md. Plan: docs/PARITY.md, docs/MIGRATION.md.
