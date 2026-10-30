import type { CallKind, StreamLike } from './types';

export const MAX_GROUP = 6;
export type GroupCallRow = { id: string; room_id: string; kind: CallKind; started_by: string; created_at: string; ended_at: string | null };
export type GroupMemberState = 'ringing' | 'joined' | 'declined' | 'left' | 'missed';
export type GroupMemberRow = { call_id?: string; profile_id: string; state: GroupMemberState; invited_at: string; joined_at: string | null };
export type GroupSignal = { id: string; call_id: string; from_id: string; to_id: string; kind: 'offer' | 'answer' | 'candidate'; payload: unknown };
export type PeerState = 'connecting' | 'connected' | 'failed';
export type PeerView = { state: PeerState; stream: StreamLike | null; screen: StreamLike | null };
export type GroupPhase = 'idle' | 'incoming' | 'joining' | 'active';
export type GroupState = {
  phase: GroupPhase; call: GroupCallRow | null; kind: CallKind | null; roomId: string | null; starterId: string | null;
  members: GroupMemberRow[]; peers: Record<string, PeerView>; local: StreamLike | null; muted: boolean; camOff: boolean; startedAt: number | null;
};
export type GroupEnd = { reason: 'ended' | 'declined' | 'missed' | 'nobody' | 'error'; message: string | null; call: GroupCallRow | null; kind: CallKind | null; roomId: string | null; seconds: number };

export interface GroupApi {
  start(room: string, kind: CallKind): Promise<string>;
  join(id: string): Promise<void>;
  decline(id: string): Promise<void>;
  leave(id: string): Promise<void>;
  ping(id: string): Promise<void>;
  signal(id: string, to: string, kind: GroupSignal['kind'], payload: unknown): Promise<void>;
  getCall(id: string): Promise<GroupCallRow | null>;
  members(id: string): Promise<GroupMemberRow[]>;
  mySignals(id: string): Promise<GroupSignal[]>;
  ringingForMe(): Promise<{ call_id: string; invited_at: string }[]>;
  activeForRoom(roomId: string): Promise<GroupCallRow | null>;
}
