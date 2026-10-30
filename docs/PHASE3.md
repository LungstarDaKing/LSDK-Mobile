# Phase 3: media, voice notes, avatars, profile (v0.3.0)

## What is new
- **Attachments**: photo/video library, camera, and files (PDF, text, audio, video, images). Images are re-encoded (removes EXIF/GPS) and capped at 1600 px; GIF/WebP are sent as-is.
- **Upload pipeline** (`src/features/media/`): type allow-list and 20 MiB cap (mirrors the SQL), magic-byte check, upload to private `media` bucket at `<room>/<me>/<uuid>.<ext>`, then insert the message (the server requires the object to exist first). Failure after upload removes the orphan; a retry never uploads twice; discarding a failed send removes the uploaded file.
- **Display**: signed URLs (1 h, cached), photo + full-screen viewer, video viewer, file rows, voice player. webm/ogg voice notes (from web) show as a file on iOS because iOS cannot decode them.
- **Voice notes**: record (m4a on phones), 0.3 s minimum, 10 min max, cancel/send. Stored with `attachment_duration`.
- **Avatars** everywhere (chat list, info, members, picker, settings). Profile screen: change/remove picture (centre-crop 256 px JPEG, <= 1 MiB), username, bio (160), change password, JSON export, delete account (type DELETE).
- **Account deletion** removes your files first (auth deletion does not delete storage objects), then calls `delete_my_account`. If file removal fails the account is NOT deleted.

## Verified (actually run)
- TypeScript clean; **91 jest tests** (rules vs the real SQL allow-list, upload/send/avatar/delete call shapes, bucket + profile-column contract).
- **53 browser checks** (Chromium, fake backend), including attachment render, signed-URL request, file upload, rejected type, profile save, password validation, export download, delete-account ordering.
- Android + iOS Hermes bundles export; `expo prebuild` for both. Generated Info.plist has camera, photos and microphone strings; Android has RECORD_AUDIO.
- A bug caught here: `expo-image-picker`'s `microphonePermission: false` was stripping the microphone permission added by `expo-audio`. Both plugins now carry the string.

## NOT verified
- Anything on a real phone: pickers, camera, recording, audio/video playback, share sheet.
- Real Supabase: storage RLS, the 300-file quota, the `messages_check_attachment` trigger were read from SQL, never executed.
- Web voice-note recording format varies by browser (webm on Chrome, mp4 on Safari); not run.
- Files you uploaded in rooms you have since left cannot be listed, so account deletion cannot remove them.
- Camera permission on Android: manifest does not declare CAMERA (intent capture); behaviour on device unconfirmed.
- Background audio is disabled (`enableBackgroundPlayback: false`); Phase 5 calls will need it re-enabled.
