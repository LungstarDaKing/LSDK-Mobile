// ONE shared realtime channel for the whole app. Screens subscribe via onFeed(); they never create channels.
// (Phase 1 created a channel per screen with the same name, which Supabase treats as the same channel and refuses
// to subscribe twice. This module fixes that.)
import { AppState } from 'react-native';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Message } from './api';
import type { CallRow, Signal } from '@/features/calls/types';
import type { GroupCallRow, GroupMemberRow, GroupSignal } from '@/features/calls/groupTypes';
import type { Game } from '@/features/games/logic';
import type { WatchRow } from '@/features/watch/logic';

export type ReactionRow = { message_id: string; user_id: string; room_id?: string; emoji?: string };
export type FeedEvent =
  | { type: 'message'; event: 'INSERT' | 'UPDATE'; row: Message }
  | { type: 'message'; event: 'DELETE'; row: { id: string } }
  | { type: 'reaction'; event: 'INSERT' | 'UPDATE' | 'DELETE'; row: ReactionRow }
  | { type: 'call'; row: CallRow }       // a call I am part of changed (rows are limited to mine by RLS)
  | { type: 'gcall'; row: GroupCallRow }                        // a group call in one of my chats changed
  | { type: 'gmember'; row: GroupMemberRow & { call_id: string } } // someone was invited to / joined / left a group call
  | { type: 'gsignal'; row: GroupSignal }                       // group-call signalling addressed to me
  | { type: 'game'; row: Game }         // a game in one of my chats changed (rows limited to my games by RLS)
  | { type: 'watch'; row: WatchRow | null; roomId: string }   // a shared watch session changed (row null = it ended)
  | { type: 'signal'; row: Signal }     // WebRTC signalling addressed to me
  | { type: 'nickname' }     // a nickname about me or by me changed
  | { type: 'membership' }   // I was added to / removed from a room, or someone joined/left
  | { type: 'resync' };      // connection came back or app returned to foreground: refetch what you show

type Handler = (e: FeedEvent) => void;
const listeners = new Set<Handler>();
let channel: RealtimeChannel | null = null;
let appSub: { remove: () => void } | null = null;
let hadError = false;

const emit = (e: FeedEvent) => { for (const fn of [...listeners]) { try { fn(e); } catch { /* one bad listener must not break others */ } } };

export function onFeed(fn: Handler): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function startFeed(): void {
  if (channel) return;
  channel = supabase.channel('lsdk-feed-mobile')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => emit({ type: 'message', event: 'INSERT', row: p.new as Message }))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => emit({ type: 'message', event: 'UPDATE', row: p.new as Message }))
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (p) => {
      const id = (p.old as { id?: string }).id;
      if (id) emit({ type: 'message', event: 'DELETE', row: { id } });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) => {
      const row = (p.eventType === 'DELETE' ? p.old : p.new) as ReactionRow;
      if (row?.message_id && row?.user_id) emit({ type: 'reaction', event: p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', row });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'nicknames' }, () => emit({ type: 'nickname' }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, () => emit({ type: 'membership' }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, (p) => {
      if (p.eventType !== 'DELETE' && (p.new as CallRow)?.id) emit({ type: 'call', row: p.new as CallRow });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'call_signals' }, (p) => emit({ type: 'signal', row: p.new as Signal }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_calls' }, (p) => {
      if (p.eventType !== 'DELETE' && (p.new as GroupCallRow)?.id) emit({ type: 'gcall', row: p.new as GroupCallRow });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_call_members' }, (p) => {
      const r = p.new as GroupMemberRow & { call_id: string };
      if (p.eventType !== 'DELETE' && r?.call_id && r?.profile_id) emit({ type: 'gmember', row: r });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_call_signals' }, (p) => emit({ type: 'gsignal', row: p.new as GroupSignal }))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, (p) => {
      if (p.eventType !== 'DELETE' && (p.new as Game)?.id) emit({ type: 'game', row: p.new as Game });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'watch_sessions' }, (p) => {
      if (p.eventType === 'DELETE') { const id = (p.old as { room_id?: string }).room_id; if (id) emit({ type: 'watch', row: null, roomId: id }); }
      else emit({ type: 'watch', row: p.new as WatchRow, roomId: (p.new as WatchRow).room_id });
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') { if (hadError) { hadError = false; emit({ type: 'resync' }); } }
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') hadError = true;
    });

  let last: string | null | undefined = AppState.currentState;
  appSub = AppState.addEventListener('change', (s) => {
    if (s === 'active' && last !== 'active') emit({ type: 'resync' });
    last = s;
  });
}

export function stopFeed(): void {
  appSub?.remove(); appSub = null;
  if (channel) { void supabase.removeChannel(channel); channel = null; }
  hadError = false;
  listeners.clear();
}
