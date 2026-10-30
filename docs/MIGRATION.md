# Migration plan

## Decision
Full React Native rebuild (Expo SDK 58, Expo Router, TypeScript). Same Supabase backend, so web and mobile users share data.

## Why SDK 58
Apple only allows the newest Expo Go on iPhones, and the App Store version moved to SDK 58 (Oct 2026), so the project was moved from 57 to 58 in v0.6.1. Versions come from `expo/bundledNativeModules.json` (expo 58.0.19, react-native 0.88.0, react 19.3.0). Upgrading again later: bump `expo`, then align every package to that file.

## Backend rules (do not break the live web app)
1. NEVER run `supabase/schema.sql` on the live project. It begins with `drop table ... cascade`.
2. New SQL goes in new additive `update-*.sql` files only, reviewed first.
3. Client uses the publishable key only. `service_role` stays in Supabase edge functions.
4. Verify RLS is enabled on every table before shipping (checked so far: core tables; still to verify: calls, group_calls, group_call_members, group_call_signals).

## Phases
1. Foundation: auth, consent, chat list, text chat, design tokens (this commit).
2. Messaging depth: create chats/groups, edit/delete/report, replies, reactions, receipts, presence.
3. Media: attachments, voice notes, avatars, profile, account deletion/export.
4. Status/stories, image editing, nicknames/ringtones/backgrounds.
5. Realtime calls (WebRTC dev build), push notifications, incoming-call handling.
6. Tools, settings, games, watch-together, LUNEX, accessibility pass.
7. Hardening: security review, dependency audit, store assets, privacy labels, legal text.
8. EAS release builds and handover.

## Rollback
Original web repo is untouched. This project is a separate folder. Commit per phase.

## Known blockers needing the owner
- Apple Developer account for iOS builds.
- Android + iOS push credentials (FCM / APNs) for Phase 5.
- Decision on iOS screen sharing (requires a native broadcast extension).
