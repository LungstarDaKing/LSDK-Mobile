import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { onFeed } from '@/features/chat/realtime';
import { friendlyError } from '@/lib/validation';
import { loadIceServers } from './api';
import { setMinimized } from './callUi';
import { GroupCallManager } from './GroupCallManager';
import { makeGroupApi } from './groupApi';
import type { GroupApi, GroupCallRow, GroupState } from './groupTypes';
import { initRtc, rtc, rtcAvailable } from './rtc';
import { startRinging, stopRinging } from './ringtone';
import type { CallKind } from './types';

type Ctx = {
  state: GroupState; available: boolean; notice: string | null; clearNotice: () => void; endedCount: number;
  start: (roomId: string, kind: CallKind) => Promise<string | null>;
  join: (callId: string) => Promise<string | null>;
  accept: () => void; decline: () => void; hangup: () => void;
  toggleMute: () => void; toggleCamera: () => void; flipCamera: () => void; enableVideo: () => Promise<string | null>; retryPeer: (id: string) => void;
  /** a call that is running in this chat right now (for the "Join" banner) */
  activeFor: (roomId: string) => Promise<GroupCallRow | null>;
};
const C = createContext<Ctx | null>(null);

export function GroupCallProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [state, setState] = useState<GroupState>(GroupCallManager.blank());
  const [notice, setNotice] = useState<string | null>(null);
  const [endedCount, setEnded] = useState(0);
  const mgr = useRef<GroupCallManager | null>(null);
  const api = useRef<GroupApi | null>(null);

  useEffect(() => {
    if (!enabled || !me || !rtcAvailable) return;
    initRtc();
    const a = makeGroupApi(me); api.current = a;
    const m = new GroupCallManager({
      api: a, meId: me, rtc, loadIce: () => loadIceServers(), isForeground: () => AppState.currentState === 'active',
      onChange: setState,
      onEnded: (e) => { setMinimized(false); setEnded((n) => n + 1); if (e.message) setNotice(e.message); else if (e.reason === 'missed') setNotice('You missed a group call.'); },
    });
    mgr.current = m;
    const off = onFeed((e) => {
      if (e.type === 'gmember') m.onMemberRow(e.row);
      else if (e.type === 'gcall') m.onCallRow(e.row);
      else if (e.type === 'gsignal') m.onSignal(e.row);
      else if (e.type === 'resync') m.onForeground();
    });
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') m.onForeground(); });
    void m.checkRinging();
    return () => { sub.remove(); off(); m.destroy(); mgr.current = null; api.current = null; setState(GroupCallManager.blank()); };
  }, [enabled, me]);

  useEffect(() => { if (state.phase === 'incoming') void startRinging(true, undefined, state.starterId); else stopRinging(); return () => stopRinging(); }, [state.phase, state.starterId]);
  useEffect(() => {
    if (state.phase !== 'idle') void activateKeepAwakeAsync('group-call').catch(() => {}); else deactivateKeepAwake('group-call').catch(() => {});
  }, [state.phase]);

  const start = useCallback(async (roomId: string, kind: CallKind) => { try { await mgr.current?.start(roomId, kind); return null; } catch (e) { return friendlyError(e); } }, []);
  const join = useCallback(async (callId: string) => { try { await mgr.current?.join(callId); return null; } catch (e) { return friendlyError(e); } }, []);
  const enableVideo = useCallback(async () => { try { await mgr.current?.enableVideo(); return null; } catch (e) { return friendlyError(e); } }, []);
  const activeFor = useCallback(async (roomId: string) => { try { return (await api.current?.activeForRoom(roomId)) ?? null; } catch { return null; } }, []);

  const value = useMemo<Ctx>(() => ({
    state, available: rtcAvailable, notice, clearNotice: () => setNotice(null), endedCount, start, join, enableVideo, activeFor,
    accept: () => void mgr.current?.accept(), decline: () => void mgr.current?.decline(), hangup: () => void mgr.current?.hangup(),
    toggleMute: () => mgr.current?.toggleMute(), toggleCamera: () => mgr.current?.toggleCamera(), flipCamera: () => mgr.current?.flipCamera(),
    retryPeer: (id) => mgr.current?.retryPeer(id),
  }), [state, notice, endedCount, start, join, enableVideo, activeFor]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useGroupCall(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useGroupCall must be used inside <GroupCallProvider>');
  return v;
}
