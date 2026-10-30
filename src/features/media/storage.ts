// Storage access (private buckets, signed URLs). Authorisation is enforced by storage RLS on the server.
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';
import type { Message } from '@/features/chat/api';
import {
  AVATAR_MAX_BYTES, AVATAR_PATH_RE, MAX_BYTES, MEDIA_PATH_RE, MIN_VOICE_MS, MAX_VOICE_MS,
  avatarPath, cleanName, extFor, mediaPath, sniffOk, validateUpload,
} from './rules';

export type Picked = { uri: string; name: string | null; mime: string | null; size: number | null; durationMs?: number | null };
export type Uploaded = { path: string; name: string; type: string; size: number; durationMs: number | null };

export async function readBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

/** Upload a picked file to the `media` bucket. Validates type, size and magic bytes first. */
export async function uploadMedia(roomId: string, userId: string, f: Picked, mime: string, fallbackName: string /* used when the file has no name; include the extension */): Promise<Uploaded> {
  const bytes = await readBytes(f.uri);
  const bad = validateUpload(bytes.length, mime);
  if (bad) throw new UserError(bad);
  if (!sniffOk(bytes, mime)) throw new UserError('That file does not match its type, so it was not sent.');
  const ext = extFor(mime);
  const path = mediaPath(roomId, userId, Crypto.randomUUID(), ext);
  if (!MEDIA_PATH_RE.test(path)) throw new UserError('Could not prepare that file.');
  const { error } = await supabase.storage.from('media').upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  let durationMs: number | null = null;
  if (mime.startsWith('audio/') && f.durationMs != null) {
    durationMs = Math.round(f.durationMs);
    if (durationMs < MIN_VOICE_MS) { await removeMedia([path]).catch(() => {}); throw new UserError('That recording is too short.'); }
    durationMs = Math.min(durationMs, MAX_VOICE_MS);
  }
  return { path, name: cleanName(f.name, fallbackName), type: mime, size: bytes.length, durationMs };
}

export async function removeMedia(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from('media').remove(paths);
  if (error) throw error;
}

/** Insert the message row. The server requires the uploaded object to exist first (messages_check_attachment). */
export async function sendAttachment(roomId: string, senderId: string, up: Uploaded, caption: string, replyTo: string | null): Promise<Message> {
  const row = {
    room_id: roomId, sender_id: senderId, content: caption.trim().slice(0, 1000), reply_to: replyTo ?? undefined,
    attachment_path: up.path, attachment_name: up.name, attachment_type: up.type, attachment_size: up.size,
    ...(up.durationMs != null ? { attachment_duration: up.durationMs } : {}),
  };
  const { data, error } = await supabase.from('messages').insert(row).select('*').single();
  if (error) {
    await removeMedia([up.path]).catch(() => {});   // don't leave an orphan file behind
    throw error;
  }
  return data as Message;
}

// ------------------------------------------------------------ signed URLs (cached until shortly before expiry)
const TTL = 3600;
const cache = new Map<string, { url: string; exp: number }>();
const key = (bucket: string, path: string) => `${bucket}:${path}`;

export async function signedUrl(bucket: 'media' | 'avatars' | 'stories', path: string): Promise<string | null> {
  const k = key(bucket, path);
  const hit = cache.get(k);
  if (hit && hit.exp > Date.now() + 60_000) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL);
  if (error || !data?.signedUrl) return null;
  cache.set(k, { url: data.signedUrl, exp: Date.now() + TTL * 1000 });
  return data.signedUrl;
}
export const clearUrlCache = () => cache.clear();

// ------------------------------------------------------------ avatars
export async function uploadAvatar(userId: string, jpeg: { uri: string }): Promise<string> {
  const bytes = await readBytes(jpeg.uri);
  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) throw new UserError('That picture is too large. Try another one.');
  if (!sniffOk(bytes, 'image/jpeg')) throw new UserError('Profile pictures must be JPEG after processing.');
  const path = avatarPath(userId, Crypto.randomUUID());
  if (!AVATAR_PATH_RE.test(path)) throw new UserError('Could not prepare that picture.');
  const { error } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function removeAvatarFiles(paths: string[]): Promise<void> {
  const list = paths.filter(Boolean);
  if (!list.length) return;
  const { error } = await supabase.storage.from('avatars').remove(list);
  if (error) throw error;
}

/** Set (or clear with null) my avatar, then delete the previous file. Column grant is update(username, bio, avatar_path). */
export async function setAvatarPath(userId: string, next: string | null, previous: string | null): Promise<void> {
  const { data, error } = await supabase.from('profiles').update({ avatar_path: next }).eq('id', userId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new UserError('Could not update your picture.');
  if (previous && previous !== next) await removeAvatarFiles([previous]).catch(() => {});
}

export async function updateProfileText(userId: string, patch: { username?: string; bio?: string | null }): Promise<void> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new UserError('Could not save your profile.');
}

export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ------------------------------------------------------------ export + delete
export type Export = { exported_at: string; profile: unknown; rooms: unknown; messages: unknown[]; note: string };

export async function exportMyData(userId: string): Promise<Export> {
  const profile = (await supabase.from('profiles').select('id, username, bio, avatar_path, created_at').eq('id', userId).maybeSingle()).data;
  const rooms = (await supabase.from('rooms').select('id, name, is_direct, created_at')).data ?? [];
  const messages: unknown[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('messages')
      .select('id, room_id, content, created_at, edited_at, reply_to, attachment_name, attachment_type, attachment_size')
      .eq('sender_id', userId).order('created_at', { ascending: true }).range(from, from + 999);
    if (error) throw error;
    messages.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { exported_at: new Date().toISOString(), profile, rooms, messages, note: 'Your own profile and the messages you sent. Attachments are listed by name, not included.' };
}

/** Delete every file I own, then the account. Auth deletion does not remove storage objects, so this must run first. */
export async function deleteAccountEverything(userId: string, roomIds: string[], avatar: string | null): Promise<void> {
  for (const room of roomIds) {
    const { data } = await supabase.storage.from('media').list(`${room}/${userId}`, { limit: 1000 });
    const paths = (data ?? []).map((o) => `${room}/${userId}/${o.name}`);
    for (let i = 0; i < paths.length; i += 100) await removeMedia(paths.slice(i, i + 100));
  }
  const { data: av } = await supabase.storage.from('avatars').list(userId, { limit: 100 });
  await removeAvatarFiles([...(av ?? []).map((o) => `${userId}/${o.name}`), ...(avatar ? [avatar] : [])]);
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
}

export { MAX_BYTES };
