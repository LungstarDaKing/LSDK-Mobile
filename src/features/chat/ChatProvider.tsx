import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyError } from '@/lib/validation';
import { loadNicknames, nameFor } from './nicknames';
import { loadPreviews, loadRooms, loadUnread, type Preview, type Room } from './api';
import { onFeed, startFeed, stopFeed } from './realtime';
import { useHeartbeat } from './usePresence';
import { loadMarkedUnread, setMarkedUnread } from '@/features/tools/api';

type ChatState = {
  rooms: Room[];
  previews: Map<string, Preview>;
  unread: Map<string, number>;
  /** Chats I flagged "mark as unread". */
  flags: Set<string>;
  setFlag: (roomId: string, value: boolean) => Promise<void>;
  nicknames: Map<string, string>;
  /** Name to show for a person: my private nickname for them, else their username. */
  nameOf: (id: string, username?: string | null) => string;
  loaded: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clearUnread: (roomId: string) => void;
  room: (id: string) => Room | undefined;
};

const Ctx = createContext<ChatState | null>(null);

/** Owns the room list, the single realtime channel and the online heartbeat. Active only while signed in + consented. */
export function ChatProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [previews, setPreviews] = useState<Map<string, Preview>>(new Map());
  const [unread, setUnread] = useState<Map<string, number>>(new Map());
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [nicknames, setNicknames] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { session } = useAuth();
  const uid = session?.user.id;
  useHeartbeat(enabled);

  const refresh = useCallback(async () => {
    try {
      const [r, p, u, f] = await Promise.all([loadRooms(), loadPreviews(), loadUnread(), loadMarkedUnread().catch(() => new Set<string>())]);
      if (!alive.current) return;
      setRooms(r); setPreviews(p); setUnread(u); setFlags(f); setError(null); setLoaded(true);
      // nicknames are a nice-to-have: never let them break the chat list
      if (uid) loadNicknames(uid).then((n) => { if (alive.current) setNicknames(n); }).catch(() => {});
    } catch (e) {
      if (alive.current) { setError(friendlyError(e)); setLoaded(true); }
    }
  }, [uid]);

  // Many events can arrive at once (a burst of messages); refresh once after things settle.
  const refreshSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void refresh(); }, 300);
  }, [refresh]);

  useEffect(() => {
    alive.current = true;
    if (!enabled) {
      setRooms([]); setPreviews(new Map()); setUnread(new Map()); setFlags(new Set()); setNicknames(new Map()); setLoaded(false); setError(null);
      return;
    }
    void refresh();
    startFeed();
    const off = onFeed((e) => {
      if (e.type === 'message' || e.type === 'membership' || e.type === 'resync' || e.type === 'nickname') refreshSoon();
    });
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      off();
      stopFeed();
    };
  }, [enabled, refresh, refreshSoon]);

  const clearUnread = useCallback((roomId: string) => {
    setUnread((cur) => { if (!cur.get(roomId)) return cur; const n = new Map(cur); n.delete(roomId); return n; });
  }, []);

  const setFlag = useCallback(async (roomId: string, value: boolean) => {
    const apply = (v: boolean) => setFlags((cur) => { if (cur.has(roomId) === v) return cur; const n = new Set(cur); if (v) n.add(roomId); else n.delete(roomId); return n; });
    apply(value);
    try { await setMarkedUnread(roomId, value); } catch (e) { apply(!value); throw e; }
  }, []);

  const value = useMemo<ChatState>(() => ({
    rooms, previews, unread, flags, setFlag, nicknames, loaded, error, refresh, clearUnread,
    nameOf: (id: string, username?: string | null) => nameFor(nicknames, id, username),
    room: (id: string) => rooms.find((r) => r.id === id),
  }), [rooms, previews, unread, flags, setFlag, nicknames, loaded, error, refresh, clearUnread]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChat() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChat must be used inside <ChatProvider>');
  return v;
}
