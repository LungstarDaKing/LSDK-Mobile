// Call RPCs and reads. Rules (who may call whom, rate limits, busy detection) are enforced by the database.
import { supabase } from '@/lib/supabase';
import { env } from '@/lib/env';
import { UserError } from '@/lib/validation';
import type { CallApi, CallRow, Signal } from './types';

const CALL_COLS = 'id, caller_id, callee_id, room_id, kind, status, created_at, answered_at, ended_at';
const SIG_COLS = 'id, call_id, from_id, to_id, kind, payload, created_at';

function check(error: { message: string; code?: string } | null, fallback: string): void {
  if (!error) return;
  // `raise exception` in our SQL functions (SQLSTATE P0001) carries a message written for people; anything else stays generic
  throw new UserError(error.code === 'P0001' && error.message ? error.message : fallback);
}

export const callApi: CallApi = {
  async start(callee, kind) {
    const { data, error } = await supabase.rpc('start_call', { p_callee: callee, p_kind: kind });
    check(error, 'Could not start the call.');
    if (typeof data !== 'string') throw new UserError('Could not start the call.');
    return data;
  },
  async answer(id) { check((await supabase.rpc('answer_call', { p_call: id })).error, 'Could not answer the call.'); },
  async decline(id) { check((await supabase.rpc('decline_call', { p_call: id })).error, 'Could not decline the call.'); },
  async end(id) { check((await supabase.rpc('end_call', { p_call: id })).error, 'Could not end the call.'); },
  async signal(id, kind, payload) { check((await supabase.rpc('send_call_signal', { p_call: id, p_kind: kind, p_payload: payload })).error, 'Signal failed.'); },
  async getCall(id) {
    const { data, error } = await supabase.from('calls').select(CALL_COLS).eq('id', id).maybeSingle();
    if (error) throw error;
    return (data as CallRow | null) ?? null;
  },
  async ringingForMe() {
    const since = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await supabase.from('calls').select(CALL_COLS).eq('status', 'ringing').gt('created_at', since);
    if (error) throw error;
    return (data ?? []) as CallRow[];
  },
  async pendingSignals(callId) {
    const { data, error } = await supabase.from('call_signals').select(SIG_COLS).eq('call_id', callId).order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as Signal[];
  },
};

export type LogRow = CallRow & { caller: { username: string; avatar_path: string | null } | null; callee: { username: string; avatar_path: string | null } | null };
export async function loadCallLog(limit = 60): Promise<LogRow[]> {
  const { data, error } = await supabase
    .from('calls')
    .select(`${CALL_COLS}, caller:caller_id(username, avatar_path), callee:callee_id(username, avatar_path)`)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as LogRow[];
}
export async function clearCallLog(): Promise<void> {
  const { error } = await supabase.rpc('hide_call_history');
  if (error) throw new UserError('Could not clear call history.');
}

// ---- ICE servers: public STUN always; TURN relay credentials from the project's Worker (EXPO_PUBLIC_TURN_URL) when set.
const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
let cached: { at: number; servers: unknown[] } | null = null;
const TTL = 20 * 3600_000;
export async function loadIceServers(fetchFn: typeof fetch = fetch): Promise<unknown[]> {
  if (!env.turnUrl) return STUN;
  if (cached && Date.now() - cached.at < TTL) return cached.servers;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetchFn(env.turnUrl, { signal: ctl.signal }); clearTimeout(t);
    const j = (await r.json()) as { iceServers?: unknown };
    const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
    if (r.ok && list.length) { cached = { at: Date.now(), servers: [...STUN, ...list] }; return cached.servers; }
  } catch { /* fall back to STUN only */ }
  return STUN;
}
export function _resetIceCache(): void { cached = null; }
