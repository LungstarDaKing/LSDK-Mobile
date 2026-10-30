import type { CallRow } from './types';
import type { LogRow } from './api';

export type LogItem = { id: string; peerId: string; peerName: string; avatar: string | null; kind: CallRow['kind']; label: string; missed: boolean; when: string; group?: { roomId: string; callId: string } };

export type GroupLogRow = {
  call_id: string; state: string; joined_at: string | null; left_at: string | null; invited_at: string;
  group_calls: { id: string; room_id: string; kind: CallRow['kind']; started_by: string; created_at: string; ended_at: string | null; rooms: { name: string | null } | { name: string | null }[] | null } | null;
};

/** A group call row as the Calls tab shows it, from MY point of view. */
export function describeGroupCall(r: GroupLogRow, me: string): LogItem | null {
  const g = r.group_calls; if (!g) return null;
  const room = Array.isArray(g.rooms) ? g.rooms[0] : g.rooms;
  let label: string; let missed = false;
  if (r.state === 'joined' || r.state === 'left') {
    const secs = r.joined_at && (r.left_at ?? g.ended_at) ? Math.max(0, Math.round((new Date((r.left_at ?? g.ended_at)!).getTime() - new Date(r.joined_at).getTime()) / 1000)) : 0;
    label = `${g.started_by === me ? 'Started' : 'Joined'}${secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : ''}${g.ended_at ? '' : ' · still going'}`;
  } else if (r.state === 'declined') label = 'You declined';
  else if (r.state === 'missed') { label = 'Missed'; missed = true; }
  else { label = g.ended_at ? 'Missed' : 'Ringing…'; missed = !!g.ended_at; }
  return { id: `g-${r.call_id}`, peerId: g.room_id, peerName: room?.name || 'Group', avatar: null, kind: g.kind, label, missed, when: r.invited_at, group: { roomId: g.room_id, callId: g.id } };
}

/** Turn a call row into what the Calls tab shows, from MY point of view. */
export function describeCall(r: LogRow, me: string): LogItem {
  const out = r.caller_id === me;
  const peer = out ? r.callee : r.caller;
  let label: string;
  let missed = false;
  switch (r.status) {
    case 'ended': case 'accepted': {
      const secs = r.answered_at && r.ended_at ? Math.max(0, Math.round((new Date(r.ended_at).getTime() - new Date(r.answered_at).getTime()) / 1000)) : 0;
      label = `${out ? 'Outgoing' : 'Incoming'}${secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : ''}`; break;
    }
    case 'declined': label = out ? 'Declined by them' : 'You declined'; break;
    case 'busy': label = 'They were busy'; break;
    case 'missed': label = out ? 'No answer' : 'Missed'; missed = !out; break;
    default: label = out ? 'Calling…' : 'Ringing…';
  }
  return { id: r.id, peerId: out ? r.callee_id : r.caller_id, peerName: peer?.username ?? 'Former member', avatar: peer?.avatar_path ?? null, kind: r.kind, label, missed, when: r.created_at };
}
