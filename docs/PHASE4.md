# Phase 4: status updates, nicknames, chat backgrounds, image editor (v0.4.0)

## What is new
- **Status tab**: my status + people with updates (unseen first), pull to refresh, refetch every time the tab is shown.
- **New status**: text (8 colours, all >= 4.5:1 contrast with white text, tested), photo (library or camera, edited first), video (<= 20 MB), optional caption. Server limits: 20 a day, 24 h life.
- **Viewer**: auto-advance for text/photo (hold to pause), previous/next buttons for screen readers, like, reply (arrives in your normal chat with the person), report, delete mine, "Views and reactions" for my own. Marks statuses viewed on the server.
- **Settings**: "Share my status" switch (`set_story_sharing`), default chat background.
- **Nicknames**: set from chat info (DM or any group member). Used for chat titles, sender names and status rows. Only you see them; the real username is shown in the DM info screen.
- **Chat backgrounds**: 7 colours + default (light/dark aware) or your own picture (cropped, dim levels). Per chat or default. Stored on this device only (same as the web app).
- **Image editor**: centred crop to Square / 4:5 / 9:16 / 16:9, rotate, flip, reset.
- **Fix (affected Phase 3 too)**: messages written for the user (e.g. "That file is 25 MB. The limit is 20 MB.") were being replaced by "Something went wrong". Added `UserError`; `friendlyError` shows those as written and still hides unknown errors.

## Verified (actually run)
- TypeScript clean; **125 jest tests** (status grouping/order/labels, text-status contrast, background prefs parse/resolve/persist, crop maths for odd sizes, status + nickname API call shapes, upload-then-insert ordering, orphan cleanup, RPC argument names against the real SQL, insert columns vs the column-level grants).
- **76 browser checks** (Chromium, fake backend): status tab, viewing marks seen, like/comment/report, next, signed URL from the `stories` bucket, posting a text status, own status delete, nickname set + shown, background saved and applied, sharing switch, plus all Phase 1-3 checks.
- Android + iOS Hermes bundles export; `expo prebuild` works for both and permissions are unchanged.

## NOT done / NOT verified
- No device run: camera, video playback, image picker, crop on real photos, file copy of the background picture.
- **No colour filters** (see PARITY). **No audio statuses** (viewer plays them, composer does not create them). **No "save someone's status"** (needs a media-library permission and a save flow).
- Statuses and nicknames do not update live; they refresh on tab focus / pull / app resume of the chat feed (nickname changes do arrive live through the existing feed, untested against real realtime).
- Real Supabase: RLS, the 20-a-day trigger, `story_visible` were read from SQL, never executed.
- **Ringtones** deliberately not built: they only play for incoming calls (Phase 5).
- Custom background picture is hidden on web (a browser blob link would not survive a reload).
