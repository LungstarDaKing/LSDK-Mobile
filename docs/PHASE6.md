# Phase 6 (part 1) — smart tools and two-player games (v0.6.0)

**Verified here:** 180 unit tests (rules, exact backend argument names, game logic incl. chess checkmate/stalemate/promotion), browser smoke test 86/86 against a fake server, web/iOS/Android bundles. **Not verified:** a real Supabase project, two real players, a real device.

## Needs no new SQL
Everything uses functions you already have (`update-v0.7.sql` for tools, `update-v0.11/0.12.sql` for games). No new native modules, so **no new build needed if you already have the v0.5.0 development build**: the update is JavaScript only (`npm ci` for the chess library, then restart).

## Tools (chats menu -> "Tools", press-and-hold a message, ⏰ next to the message box)
- **Notes to myself**: chats menu.
- **Save** a message into a collection; **Remind me** (quick times or "in N hours"); **send later** (quick times, in N hours, or when they come online in a direct chat).
- Tools screen: Saved (grouped), Reminders, Scheduled (cancel, see failures), Search (messages / files / links).
- Reminders show in the app when due; they are also scheduled as a phone notification (needs notifications turned on in Settings; unverified on a device).

## Games (🎮 in a direct chat)
Tic-tac-toe, chess (move hints, promotion, check), hangman, 20 questions. Moves sync through the existing `games` table and realtime.

## Not built yet
Darts, solo games, watch-together, LUNEX assistant, translation/dictation, group calls, screen sharing from the phone, mini call window, per-person/custom ringtones, picking an exact date and time.

## v0.6.1 — moved to Expo SDK 58
Why: iPhone Expo Go can only be the latest version, which became SDK 58. Changes: all Expo packages aligned to SDK 58 (React Native 0.88, React 19.3), 3 small code fixes, and **calls / phone push / reminder notifications now switch themselves off in Expo Go** instead of crashing (they need the development build). Verified here: tsc, 180 tests, browser smoke 86/86, web + iOS + Android bundles, native prebuild permissions. NOT verified: opening in Expo Go on your iPhone, any native compile, and `react-native-webrtc` 124.0.8 compiling against React Native 0.88 (if the development build fails on it, tell me; the newer 155.x is the next thing to try).

## Addendum (v0.7.0): LUNEX, darts, solo games, watch together
- **LUNEX** (`app/lunex.tsx`, `src/features/lunex`): streaming chat over `expo/fetch`; needs `EXPO_PUBLIC_LUNEX_URL`. Hidden when unset. History is stored on the phone only and wiped on sign-out.
- **Darts** in the game screen; **solo games** (`app/solo.tsx`): emoji song, word puzzle, stickman.
- **Watch together** (`app/chat/[roomId]/watch.tsx`, 🎬 in direct chats): YouTube is synced; Spotify, Apple Music and TikTok use a 3-2-1 countdown.
- Adds native modules `react-native-svg` and `react-native-webview`: Expo Go has both, but a development build needs a rebuild.
- NOT verified: anything on a real device, YouTube sync, LUNEX against the real service.
- Still not built: dictation/translation, group calls, screen share from the phone, mini call window, custom ringtones per person, mark-unread, auto-organised media, exact date/time picker.
