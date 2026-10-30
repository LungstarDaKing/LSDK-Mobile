import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';
import type { GroupApi, GroupCallRow, GroupMemberRow, GroupSignal } from './groupTypes';

const RING_MS = 60_000;
function check(error: { message: string; code?: string } | null, fallback: string): void {
  if (!error) return;
  throw new UserError(error.code === 'P0001' && error.message ? error.message : fallback);
}
const CALL_COLS = 'id, room_id, kind, started_by, created_at, ended_at';

export function makeGroupApi(meId: string): GroupApi {
  return {
    async start(room, kind) {
      const { data, error } = await supabase.rpc('start_group_call', { p_room: room, p_kind: kind });
      check(error, 'Could not start the group call.');
      if (typeof data !== 'string') throw new UserError('Could not start the group call.');
      return data;
    },
    async join(id) { check((await supabase.rpc('join_group_call', { p_call: id })).error, 'Could not join the call.'); },
    async decline(id) { await supabase.rpc('decline_group_call', { p_call: id }); },
    async leave(id) { await supabase.rpc('leave_group_call', { p_call: id }); },
    async ping(id) { check((await supabase.rpc('group_call_ping', { p_call: id })).error, 'ping'); },
    async signal(id, to, kind, payload) { check((await supabase.rpc('send_group_signal', { p_call: id, p_to: to, p_kind: kind, p_payload: payload })).error, 'Signal failed.'); },
    async getCall(id) {
      const { data } = await supabase.from('group_calls').select(CALL_COLS).eq('id', id).maybeSingle();
      return (data as GroupCallRow | null) ?? null;
    },
    async members(id) {
      const { data } = await supabase.from('group_call_members').select('profile_id, state, invited_at, joined_at').eq('call_id', id);
      return (data ?? []) as GroupMemberRow[];
    },
    async mySignals(id) {
      const { data } = await supabase.from('group_call_signals').select('id, call_id, from_id, to_id, kind, payload, created_at').eq('call_id', id).eq('to_id', meId).order('created_at', { ascending: true });
      return (data ?? []) as GroupSignal[];
    },
    async ringingForMe() {
      const { data } = await supabase.from('group_call_members').select('call_id, state, invited_at').eq('profile_id', meId).eq('state', 'ringing').gt('invited_at', new Date(Date.now() - RING_MS).toISOString());
      return (data ?? []) as { call_id: string; invited_at: string }[];
    },
    async activeForRoom(roomId) {
      const { data } = await supabase.from('group_calls').select(CALL_COLS).eq('room_id', roomId).is('ended_at', null)
        .gt('created_at', new Date(Date.now() - 8 * 3600_000).toISOString()).order('created_at', { ascending: false }).limit(1);
      return ((data ?? [])[0] as GroupCallRow | undefined) ?? null;
    },
  };
}

export async function loadGroupCallLog(limit = 40): Promise<import('./log').GroupLogRow[]> {
  const { data, error } = await supabase.from('group_call_members')
    .select('call_id, state, joined_at, left_at, invited_at, group_calls(id, room_id, kind, started_by, created_at, ended_at, rooms(name))')
    .eq('hidden', false).order('invited_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return ((data ?? []) as unknown as import('./log').GroupLogRow[]).filter((r) => r.group_calls);
}
export async function clearGroupCallLog(): Promise<void> {
  const { error } = await supabase.rpc('hide_group_call_history');
  if (error) throw new UserError('Could not clear call history.');
}
