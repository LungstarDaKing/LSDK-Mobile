# Phase 2: messaging depth (iOS, Android, web from one codebase)

## Built
- Start a direct chat (username search) and create groups (name 1-60, up to 49 others).
- Group info: rename, add / remove members, make / remove admin, leave (server rules enforced by the database).
- Message actions (long-press): react (6 quick + all 108 server-allowed), reply, copy, edit own text, delete (own, or any if admin), report.
- Reply quotes with tap-to-jump, reaction chips (tap to toggle), day separators, grouped bubbles, older-message paging.
- Optimistic sending with Sending / Not sent + Retry / Discard; duplicate-proof against the realtime echo.
- "Seen" receipts (both-sides opt-in, server enforced), online / last seen, typing bubbles, heartbeat.
- Settings: show online, show last seen, read receipts, typing bubbles (this device).
- One shared realtime channel; refetch on reconnect and when the app returns to the foreground.

## Bugs fixed from Phase 1
1. Marking a chat read wrote to `room_reads` directly, which the database forbids. It now calls `mark_room_read`.
2. Two screens subscribed to the same realtime channel name, which Supabase refuses. Replaced by one shared channel.
3. Error messages hid useful server messages (e.g. "Only room admins can do that"); known safe ones now pass through.
4. Direct-chat bubbles were announced to screen readers as "Message:" instead of the sender's name.

## Verification actually run
- TypeScript: clean.
- Jest: 66 tests (backend contract, API calls, list logic, receipts, presence, validation).
- Backend contract test parses the real SQL and fails on any wrong function name, argument name, table, or direct write to `room_reads`. It was proven to catch deliberate mistakes.
- Browser smoke test: 33/33 against a fake Supabase (see e2e/README.md).
- Android and iOS Hermes bundles compile; `expo prebuild` generates both native projects.

## NOT verified
- Real Supabase data, real devices, real push, and live realtime events end to end.
- Xcode / Gradle compile of the generated native projects (needs a Mac / Android toolchain / EAS).
- Screen readers (VoiceOver / TalkBack) beyond label review.

## Known gaps (planned)
- No attachments yet (shown as a placeholder), no voice notes (Phase 3).
- No swipe-to-reply (use long-press > Reply). Jump-to-quote only works for messages already loaded.
- Notes-to-self, nicknames, message search, scheduled send, reminders (Phase 4-6).
- Emoji glyph icons stand in for the real icon set.
