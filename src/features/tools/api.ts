// Thin wrappers around the v0.7 database functions. Every rule (who may save/schedule what, quotas) is enforced by the database.
import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';
import type { SearchKind } from './rules';

type Err = { message: string; code?: string } | null;
function fail(error: Err, fallback: string): never {
  throw new UserError(error?.code === 'P0001' && error.message ? error.message : fallback);
}

export type MsgLite = { id: string; room_id: string; sender_id: string; content: string | null; created_at: string; attachment_name: string | null; attachment_type: string | null; attachment_path: string | null };
export type Saved = { id: string; collection: string; created_at: string; messages: MsgLite | null };
export type Reminder = { id: string; remind_at: string; messages: Pick<MsgLite, 'id' | 'room_id' | 'sender_id' | 'content' | 'attachment_name' | 'created_at'> | null };
export type Scheduled = { id: string; room_id: string; content: string; send_at: string; when_online: boolean; status: 'pending' | 'sent' | 'failed' | 'expired'; error: string | null; created_at: string; sent_at: string | null };

export async function getNotesRoom(): Promise<string> {
  const { data, error } = await supabase.rpc('get_notes_room');
  if (error || typeof data !== 'string') fail(error, 'Could not open your notes.');
  return data;
}

export async function saveMessage(id: string, collection: string): Promise<void> {
  const { error } = await supabase.rpc('save_message', { p_message: id, p_collection: collection });
  if (error) fail(error, 'Could not save the message.');
}
export async function listSaved(): Promise<Saved[]> {
  const { data, error } = await supabase.from('saved_items')
    .select('id, collection, created_at, messages(id, room_id, sender_id, content, created_at, attachment_name, attachment_type, attachment_path)')
    .order('created_at', { ascending: false }).limit(500);
  if (error) fail(error, 'Could not load your saved messages.');
  return (data ?? []) as unknown as Saved[];
}
export async function removeSaved(id: string): Promise<void> {
  const { error } = await supabase.from('saved_items').delete().eq('id', id);
  if (error) fail(error, 'Could not remove it.');
}

export async function setReminder(messageId: string, when: Date): Promise<void> {
  const { error } = await supabase.rpc('set_reminder', { p_message: messageId, p_when: when.toISOString() });
  if (error) fail(error, 'Could not set the reminder.');
}
export async function listReminders(): Promise<Reminder[]> {
  const { data, error } = await supabase.from('message_reminders')
    .select('id, remind_at, messages(id, room_id, sender_id, content, attachment_name, created_at)').order('remind_at');
  if (error) fail(error, 'Could not load your reminders.');
  return (data ?? []) as unknown as Reminder[];
}
export async function removeReminder(id: string): Promise<void> {
  const { error } = await supabase.from('message_reminders').delete().eq('id', id);
  if (error) fail(error, 'Could not remove the reminder.');
}

export async function scheduleMessage(o: { room: string; content: string; at: Date | null; whenOnline: boolean; replyTo?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('schedule_message', { p_room: o.room, p_content: o.content, p_send_at: o.at ? o.at.toISOString() : null, p_when_online: o.whenOnline, p_reply_to: o.replyTo ?? null });
  if (error) fail(error, 'Could not schedule the message.');
}
export async function listScheduled(): Promise<Scheduled[]> {
  const { data, error } = await supabase.from('scheduled_messages')
    .select('id, room_id, content, send_at, when_online, status, error, created_at, sent_at').order('created_at', { ascending: false }).limit(100);
  if (error) fail(error, 'Could not load scheduled messages.');
  return (data ?? []) as Scheduled[];
}
export async function removeScheduled(id: string): Promise<void> {
  const { error } = await supabase.from('scheduled_messages').delete().eq('id', id);
  if (error) fail(error, 'Could not cancel it.');
}

export async function searchMessages(q: string, kind: SearchKind, before: string | null = null, limit = 40): Promise<MsgLite[]> {
  const { data, error } = await supabase.rpc('search_messages', { p_q: q.trim(), p_kind: kind, p_before: before, p_limit: limit });
  if (error) fail(error, 'Search failed.');
  return (data ?? []) as MsgLite[];
}

/** Reminders that have come due while the app is open. Each is deleted first so it fires once, on one device. */
export async function takeDueReminders(): Promise<Reminder[]> {
  const { data, error } = await supabase.from('message_reminders')
    .select('id, remind_at, messages(id, room_id, sender_id, content, attachment_name, created_at)')
    .lte('remind_at', new Date().toISOString()).order('remind_at').limit(5);
  if (error) return [];
  const fired: Reminder[] = [];
  for (const r of (data ?? []) as unknown as Reminder[]) {
    const { error: e } = await supabase.from('message_reminders').delete().eq('id', r.id);
    if (!e) fired.push(r);
  }
  return fired;
}

/** Rooms I have flagged "mark as unread" (private to me, enforced by RLS). */
export async function loadMarkedUnread(): Promise<Set<string>> {
  const { data, error } = await supabase.from('room_flags').select('room_id').eq('marked_unread', true);
  if (error) return new Set(); // older database without the table: just no flags
  return new Set((data ?? []).map((r: { room_id: string }) => r.room_id));
}

export async function setMarkedUnread(room: string, value: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_marked_unread', { p_room: room, p_value: value });
  if (error) fail(error, 'Could not update that chat.');
}
