import { isStickerPreview } from '@/features/stickers/logic';
// Chat data access. Same tables/RPCs as the web app, so both clients share one backend.
// Authorisation is enforced by Row Level Security on the server, not by these queries.
// Every RPC name + argument name here is checked against backend-reference/supabase by __tests__/rpc-contract.test.ts.
import { supabase } from '@/lib/supabase';
import { cleanMessage, escapeLike, UserError, validateGroupName, validateReportReason } from '@/lib/validation';
import type { Reads } from './receipts';
import type { ReactionMap } from './reactions';
import type { Status } from './presence';

export type Person = { username: string; avatar_path: string | null; bio: string | null };
export type Participant = { profile_id: string; role: 'admin' | 'member' | string; joined_at: string; profiles: Person | null };
export type Room = {
  id: string; name: string | null; is_direct: boolean; notes_owner: string | null; last_message_at: string;
  participants: Participant[];
};
export type Message = {
  id: string; room_id: string; sender_id: string; content: string; created_at: string; edited_at: string | null;
  reply_to: string | null; attachment_path: string | null; attachment_name: string | null;
  attachment_type: string | null; attachment_duration: number | null; status_label: string | null;
};
export type Preview = { room_id: string; sender_id: string; content: string; created_at: string; attachment_type: string | null };
export type UserHit = { id: string; username: string; avatar_path: string | null; bio: string | null };
export type ReplyTarget = Pick<Message, 'id' | 'sender_id' | 'content' | 'attachment_path' | 'attachment_name' | 'attachment_type' | 'attachment_duration'>;
export type Privacy = { show_online: boolean; show_last_seen: boolean; read_receipts: boolean };

const PAGE = 40;

/** Throw the Supabase error (callers show friendlyError(e)); otherwise return data. */
function ok<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw res.error;
  return res.data;
}

// ---------------------------------------------------------------- rooms
export async function loadRooms(): Promise<Room[]> {
  const data = ok(await supabase.from('rooms')
    .select('id, name, is_direct, notes_owner, last_message_at, participants(profile_id, role, joined_at, profiles(username, avatar_path, bio))')
    .order('last_message_at', { ascending: false }));
  return (data ?? []) as unknown as Room[];
}

export async function loadPreviews(): Promise<Map<string, Preview>> {
  const data = ok(await supabase.rpc('get_room_previews'));
  return new Map(((data ?? []) as Preview[]).map((p) => [p.room_id, p]));
}

export async function loadUnread(): Promise<Map<string, number>> {
  const data = ok(await supabase.rpc('get_unread_counts'));
  return new Map(((data ?? []) as { room_id: string; unread: number }[]).map((r) => [r.room_id, r.unread]));
}

export async function createDirectRoom(otherUserId: string): Promise<string> {
  return ok(await supabase.rpc('create_direct_room', { other_user_id: otherUserId })) as string;
}

export async function createGroupRoom(name: string, memberIds: string[]): Promise<string> {
  const bad = validateGroupName(name);
  if (bad) throw new UserError(bad);
  if (memberIds.length > 49) throw new UserError('Too many members (max 50 including you)');
  return ok(await supabase.rpc('create_group_room', { room_name: name.trim(), member_ids: memberIds })) as string;
}

export async function renameRoom(roomId: string, name: string): Promise<void> {
  const bad = validateGroupName(name);
  if (bad) throw new UserError(bad);
  ok(await supabase.rpc('rename_room', { p_room: roomId, new_name: name.trim() }));
}
export async function addMember(roomId: string, userId: string): Promise<void> {
  ok(await supabase.rpc('add_room_member', { p_room: roomId, p_user: userId }));
}
export async function removeMember(roomId: string, userId: string): Promise<void> {
  ok(await supabase.rpc('remove_room_member', { p_room: roomId, p_user: userId }));
}
export async function setMemberRole(roomId: string, userId: string, role: 'admin' | 'member'): Promise<void> {
  ok(await supabase.rpc('set_member_role', { p_room: roomId, p_user: userId, new_role: role }));
}
export async function leaveRoom(roomId: string): Promise<void> {
  ok(await supabase.rpc('leave_room', { p_room: roomId }));
}

export async function searchUsers(query: string, myId: string, exclude: string[] = []): Promise<UserHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = ok(await supabase.from('profiles').select('id, username, avatar_path, bio')
    .ilike('username', `%${escapeLike(q)}%`).neq('id', myId).order('username').limit(20));
  return ((data ?? []) as UserHit[]).filter((u) => !exclude.includes(u.id));
}

// ---------------------------------------------------------------- messages
export async function loadMessages(roomId: string, limit = PAGE): Promise<{ messages: Message[]; hasMore: boolean }> {
  const data = ok(await supabase.from('messages').select('*')
    .eq('room_id', roomId).order('created_at', { ascending: false }).limit(limit + 1));
  const rows = (data ?? []) as Message[];
  return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
}

export async function loadOlder(roomId: string, beforeIso: string, limit = PAGE): Promise<{ messages: Message[]; hasMore: boolean }> {
  const data = ok(await supabase.from('messages').select('*')
    .eq('room_id', roomId).lt('created_at', beforeIso).order('created_at', { ascending: false }).limit(limit + 1));
  const rows = (data ?? []) as Message[];
  return { messages: rows.slice(0, limit).reverse(), hasMore: rows.length > limit };
}

export async function sendText(roomId: string, senderId: string, raw: string, replyTo?: string | null): Promise<Message | null> {
  const content = cleanMessage(raw);
  if (!content) return null;
  const data = ok(await supabase.from('messages')
    .insert({ room_id: roomId, sender_id: senderId, content, ...(replyTo ? { reply_to: replyTo } : {}) })
    .select('*').single());
  return data as Message;
}

/** Only the sender may edit, and only the text. The database enforces both; we also check that a row came back. */
export async function editMessage(id: string, raw: string): Promise<Message> {
  const content = cleanMessage(raw);
  if (!content) throw new UserError('Messages must be 1 to 1000 characters.');
  const data = ok(await supabase.from('messages').update({ content }).eq('id', id).select('*').maybeSingle());
  if (!data) throw new UserError('Could not edit that message.');
  return data as Message;
}

/** Sender or room admin. RLS silently matches 0 rows when not allowed, so verify a row was actually deleted. */
export async function deleteMessage(id: string): Promise<void> {
  const data = ok(await supabase.from('messages').delete().eq('id', id).select('id'));
  if (!data || (data as unknown[]).length === 0) throw new UserError('Could not delete that message.');
}

export async function reportMessage(messageId: string, reason: string): Promise<void> {
  const bad = validateReportReason(reason);
  if (bad) throw new UserError(bad);
  ok(await supabase.rpc('report_message', { p_message: messageId, p_reason: reason.trim() }));
}

export async function fetchReplyTargets(ids: string[]): Promise<ReplyTarget[]> {
  if (!ids.length) return [];
  const data = ok(await supabase.from('messages')
    .select('id, sender_id, content, attachment_path, attachment_name, attachment_type, attachment_duration').in('id', ids));
  return (data ?? []) as ReplyTarget[];
}

// ---------------------------------------------------------------- reactions
export async function loadReactions(roomId: string): Promise<ReactionMap> {
  const data = ok(await supabase.from('message_reactions').select('message_id, user_id, emoji').eq('room_id', roomId).limit(5000));
  const out: ReactionMap = new Map();
  for (const r of (data ?? []) as { message_id: string; user_id: string; emoji: string }[]) {
    if (!out.has(r.message_id)) out.set(r.message_id, new Map());
    out.get(r.message_id)!.set(r.user_id, r.emoji);
  }
  return out;
}

/** Toggles: same emoji again removes it. Returns the emoji now set, or null. */
export async function reactToMessage(messageId: string, emoji: string): Promise<string | null> {
  return ok(await supabase.rpc('react_to_message', { p_message: messageId, p_emoji: emoji })) as string | null;
}

// ---------------------------------------------------------------- read receipts, presence, privacy
export async function markRead(roomId: string): Promise<void> {
  ok(await supabase.rpc('mark_room_read', { p_room: roomId }));
}

export async function loadReads(roomId: string): Promise<Reads> {
  const data = ok(await supabase.rpc('get_room_reads', { p_room: roomId }));
  return new Map(((data ?? []) as { profile_id: string; last_read_at: string }[]).map((r) => [r.profile_id, new Date(r.last_read_at)]));
}

export async function heartbeat(): Promise<void> {
  await supabase.rpc('heartbeat'); // best effort; errors ignored by caller
}

export async function getStatuses(ids: string[]): Promise<Map<string, Status>> {
  if (!ids.length) return new Map();
  const data = ok(await supabase.rpc('get_statuses', { p_ids: ids.slice(0, 100) }));
  return new Map(((data ?? []) as { id: string; online: boolean; last_seen_at: string | null }[])
    .map((r) => [r.id, { online: r.online, last_seen_at: r.last_seen_at }]));
}

export async function loadPrivacy(uid: string): Promise<Privacy> {
  const data = ok(await supabase.from('user_private').select('show_online, show_last_seen, read_receipts').eq('id', uid).maybeSingle());
  return (data as Privacy | null) ?? { show_online: true, show_last_seen: true, read_receipts: true };
}
export async function setPrivacy(online: boolean, lastSeen: boolean): Promise<void> {
  ok(await supabase.rpc('set_privacy', { p_online: online, p_last_seen: lastSeen }));
}
export async function setReadReceipts(on: boolean): Promise<void> {
  ok(await supabase.rpc('set_read_receipts', { p_on: on }));
}

// ---------------------------------------------------------------- helpers
export function roomTitle(room: Room, myId: string, nicks?: ReadonlyMap<string, string>): string {
  if (room.notes_owner) return 'Notes to self';
  if (!room.is_direct) return room.name ?? 'Group';
  const other = room.participants.find((p) => p.profile_id !== myId);
  return (other && nicks?.get(other.profile_id)) || other?.profiles?.username || 'Chat';
}

export function previewText(p: Preview | undefined): string {
  if (!p) return 'No messages yet';
  if (isStickerPreview(p.content)) return 'Sticker';
  if (p.content?.trim()) return p.content;
  const t = p.attachment_type ?? '';
  return t.startsWith('image') ? 'Photo' : t.startsWith('audio') ? 'Voice message' : t.startsWith('video') ? 'Video' : 'Attachment';
}

export function attachmentLabel(type: string | null): string {
  const t = type ?? '';
  return t.startsWith('image') ? 'Photo' : t.startsWith('audio') ? 'Voice message' : t.startsWith('video') ? 'Video' : 'Attachment';
}

export const myRole = (room: Room | undefined, me: string) => room?.participants.find((p) => p.profile_id === me)?.role ?? 'member';
