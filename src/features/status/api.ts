// Status updates (stories). Visibility, expiry, quotas and rate limits are enforced by the database (update-v0.4/v0.5 SQL).
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';
import { readBytes, type Picked } from '@/features/media/storage';
import { MAX_BYTES, MAX_STORY_TEXT, STORY_PATH_RE, STORY_TYPES, cleanName, extFor, kindOf, sniffOk, storyPath, validateUpload } from '@/features/media/rules';
import type { Story } from './stories';


function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw res.error;
  return res.data;
}

const COLS = 'id, author_id, kind, content, bg, attachment_path, attachment_name, attachment_type, attachment_size, reported, created_at, expires_at, profiles:author_id(username, avatar_path)';

export async function loadStories(): Promise<Story[]> {
  const data = ok(await supabase.from('stories').select(COLS).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: true }));
  return (data ?? []) as unknown as Story[];
}

/** Which of these statuses I have already seen / liked (both are only readable for my own rows). */
export async function loadMyViews(): Promise<Set<string>> {
  const data = ok(await supabase.from('story_views').select('story_id'));
  return new Set(((data ?? []) as { story_id: string }[]).map((r) => r.story_id));
}
export async function loadMyLikes(me: string): Promise<Set<string>> {
  const data = ok(await supabase.from('story_likes').select('story_id').eq('user_id', me));
  return new Set(((data ?? []) as { story_id: string }[]).map((r) => r.story_id));
}

export async function postTextStory(me: string, raw: string, bg: number): Promise<Story> {
  const content = raw.trim();
  if (content.length < 1 || content.length > MAX_STORY_TEXT) throw new UserError(`Write 1 to ${MAX_STORY_TEXT} characters.`);
  if (!Number.isInteger(bg) || bg < 0 || bg > 7) throw new UserError('Choose a background colour.');
  const data = ok(await supabase.from('stories').insert({ author_id: me, kind: 'text', content, bg }).select(COLS).single());
  return data as unknown as Story;
}

export async function postMediaStory(me: string, f: Picked, mime: string, caption: string): Promise<Story> {
  if (!STORY_TYPES.has(mime)) throw new UserError('Statuses can be photos, videos or audio.');
  const bytes = await readBytes(f.uri);
  const bad = validateUpload(bytes.length, mime);
  if (bad) throw new UserError(bad);
  if (bytes.length > MAX_BYTES) throw new UserError('That file is too large.');
  if (!sniffOk(bytes, mime)) throw new UserError('That file does not match its type, so it was not posted.');
  const text = caption.trim();
  if (text.length > MAX_STORY_TEXT) throw new UserError(`Captions can be up to ${MAX_STORY_TEXT} characters.`);
  const path = storyPath(me, Crypto.randomUUID(), extFor(mime));
  if (!STORY_PATH_RE.test(path)) throw new UserError('Could not prepare that file.');
  const up = await supabase.storage.from('stories').upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) throw up.error;
  const res = await supabase.from('stories').insert({
    author_id: me, kind: kindOf(mime), content: text, attachment_path: path,
    attachment_name: cleanName(f.name, `status.${extFor(mime)}`), attachment_type: mime, attachment_size: bytes.length,
  }).select(COLS).single();
  if (res.error) {
    await supabase.storage.from('stories').remove([path]).catch(() => {});   // no orphan file
    throw res.error;
  }
  return res.data as unknown as Story;
}

/** Delete my status (RLS matches 0 rows for someone else's or a reported one, so verify), then its file. */
export async function deleteStory(s: Pick<Story, 'id' | 'attachment_path'>): Promise<void> {
  const rows = ok(await supabase.from('stories').delete().eq('id', s.id).select('id'));
  if (!rows || (rows as unknown[]).length === 0) throw new UserError('Could not delete that status. Reported statuses are kept for review.');
  if (s.attachment_path) await supabase.storage.from('stories').remove([s.attachment_path]).catch(() => {});
}

export async function markViewed(id: string): Promise<void> { ok(await supabase.rpc('mark_story_viewed', { p_story: id })); }
export async function likeStory(id: string, on: boolean): Promise<boolean> { return ok(await supabase.rpc('like_story', { p_story: id, p_on: on })) as boolean; }
export async function commentOnStory(id: string, content: string): Promise<void> {
  const t = content.trim();
  if (t.length < 1 || t.length > 300) throw new UserError('Comments must be 1-300 characters');
  ok(await supabase.rpc('comment_on_story', { p_story: id, p_content: t }));
}
export async function reportStory(id: string, reason: string): Promise<void> { ok(await supabase.rpc('report_story', { p_story: id, p_reason: reason.trim() })); }

export type Viewer = { viewer_id: string; username: string; viewed_at: string };
export type Activity = { kind: 'like' | 'comment'; id: string | null; user_id: string; username: string; content: string | null; created_at: string };
export async function getViewers(id: string): Promise<Viewer[]> { return (ok(await supabase.rpc('get_story_viewers', { p_story: id })) ?? []) as Viewer[]; }
export async function getActivity(id: string): Promise<Activity[]> { return (ok(await supabase.rpc('get_story_activity', { p_story: id })) ?? []) as Activity[]; }

export async function loadSharing(me: string): Promise<boolean> {
  const data = ok(await supabase.from('user_private').select('share_stories').eq('id', me).maybeSingle());
  return (data as { share_stories: boolean } | null)?.share_stories ?? true;
}
export async function setSharing(on: boolean): Promise<void> { ok(await supabase.rpc('set_story_sharing', { p_on: on })); }
