import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/features/auth/AuthProvider';
import { onFeed } from '@/features/chat/realtime';
import { friendlyError } from '@/lib/validation';
import { callApi, loadIceServers } from './api';
import { CallManager } from './CallManager';
import { initRtc, rtc, rtcAvailable } from './rtc';
import { startRinging, stopRinging } from './ringtone';
import type { CallKind, CallState, EndInfo } from './types';

type Ctx = {
  state: CallState; available: boolean; notice: string | null; clearNotice: () => void;
  call: (peerId: string, kind: CallKind) => Promise<string | null>;
  accept: () => void; decline: () => void; hangup: () => void;
  toggleMute: () => void; toggleCamera: () => void; flipCamera: () => void; enableVideo: () => Promise<string | null>;
  /** bumps whenever a call ends, so the call log can reload */
  endedCount: number;
};
const C = createContext<Ctx | null>(null);

export function endMessage(e: EndInfo, who: string): string | null {
  if (e.message) return e.message;
  switch (e.reason) {
    case 'missed': return e.peerId ? `Call with ${who} was not answered.` : null;
    case 'ended': return e.seconds > 0 ? `Call with ${who} ended (${Math.floor(e.seconds / 60)}:${String(e.seconds % 60).padStart(2, '0')}).` : null;
    default: return null;
  }
}

export function CallProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { session } = useAuth();
  const me = session?.user.id;
  const [state, setState] = useState<CallState>(CallManager.blank());
  const [notice, setNotice] = useState<string | null>(null);
  const [endedCount, setEnded] = useState(0);
  const mgr = useRef<CallManager | null>(null);

  useEffect(() => {
    if (!enabled || !me || !rtcAvailable) return;
    initRtc();
    const m = new CallManager({
      api: callApi, meId: me, rtc, loadIce: () => loadIceServers(),
      isForeground: () => AppState.currentState === 'active',
      onChange: setState,
      onEnded: (e) => { setEnded((n) => n + 1); if (e.message) setNotice(e.message); else if (e.reason === 'missed') setNotice('Call was not answered.'); },
    });
    mgr.current = m;
    const off = onFeed((e) => {
      if (e.type === 'call') m.onCallRow(e.row);
      else if (e.type === 'signal') m.onSignal(e.row);
      else if (e.type === 'resync') void m.checkRinging();
    });
    void m.checkRinging();
    // realtime can drop; these two safety nets are cheap
    const poll = setInterval(() => { void m.pollSignals(); void m.checkRinging(); }, 8000);
    return () => { clearInterval(poll); off(); m.destroy(); mgr.current = null; setState(CallManager.blank()); };
  }, [enabled, me]);

  // ring while an incoming call is waiting; stay awake during a call
  useEffect(() => {
    if (state.phase === 'incoming') void startRinging(true, undefined, state.peerId); else stopRinging();
    return () => stopRinging();
  }, [state.phase, state.peerId]);
  useEffect(() => {
    const on = state.phase !== 'idle';
    if (on) void activateKeepAwakeAsync('call').catch(() => {}); else deactivateKeepAwake('call').catch(() => {});
  }, [state.phase]);

  const call = useCallback(async (peerId: string, kind: CallKind) => {
    try { await mgr.current?.start(peerId, kind); return null; } catch (e) { return friendlyError(e); }
  }, []);
  const enableVideo = useCallback(async () => { try { await mgr.current?.enableVideo(); return null; } catch (e) { return friendlyError(e); } }, []);

  const value = useMemo<Ctx>(() => ({
    state, available: rtcAvailable, notice, clearNotice: () => setNotice(null), endedCount, call, enableVideo,
    accept: () => void mgr.current?.accept(), decline: () => void mgr.current?.decline(), hangup: () => void mgr.current?.hangup(),
    toggleMute: () => mgr.current?.toggleMute(), toggleCamera: () => mgr.current?.toggleCamera(), flipCamera: () => mgr.current?.flipCamera(),
  }), [state, notice, endedCount, call, enableVideo]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useCall(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error('useCall must be used inside <CallProvider>');
  return v;
}
