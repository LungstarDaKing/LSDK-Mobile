// Typing + "I read this" pings over a PRIVATE realtime channel (the database only lets room members join it; see
// rt_room_ok in the backend). Nothing here is stored. Matches the web app's protocol: events 'typing' and 'read'
// with payload { uid }.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { typingEnabled } from '@/lib/prefs';

const TYPING_EVERY = 2500;   // send at most one typing ping per 2.5 s
const TYPING_SHOW_FOR = 4000; // hide the indicator if no new ping arrives

export function useRoomEvents(roomId: string, me: string, onRead: () => void) {
  const chRef = useRef<RealtimeChannel | null>(null);
  const ready = useRef(false);
  const lastSent = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;
  const [typers, setTypers] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const t = timers.current;
    void (async () => {
      const showTyping = await typingEnabled();
      if (!alive) return;
      const ch = supabase.channel(`room:${roomId}`, { config: { private: true, broadcast: { self: false } } });
      ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
        const uid = (payload as { uid?: string } | undefined)?.uid;
        if (!showTyping || !uid || uid === me) return;
        setTypers((cur) => (cur.includes(uid) ? cur : [...cur, uid]));
        clearTimeout(t.get(uid));
        t.set(uid, setTimeout(() => setTypers((cur) => cur.filter((x) => x !== uid)), TYPING_SHOW_FOR));
      }).on('broadcast', { event: 'read' }, ({ payload }) => {
        const uid = (payload as { uid?: string } | undefined)?.uid;
        if (uid && uid !== me) onReadRef.current();
      }).subscribe((s) => { ready.current = s === 'SUBSCRIBED'; });
      chRef.current = ch;
    })();
    return () => {
      alive = false;
      ready.current = false;
      for (const x of t.values()) clearTimeout(x);
      t.clear();
      setTypers([]);
      if (chRef.current) { void supabase.removeChannel(chRef.current); chRef.current = null; }
    };
  }, [roomId, me]);

  const sendTyping = useCallback(async () => {
    const now = Date.now();
    if (!ready.current || !chRef.current || now - lastSent.current < TYPING_EVERY) return;
    if (!(await typingEnabled())) return;
    lastSent.current = now;
    void chRef.current.send({ type: 'broadcast', event: 'typing', payload: { uid: me } }).catch(() => {});
  }, [me]);

  const sendRead = useCallback(() => {
    if (ready.current && chRef.current) void chRef.current.send({ type: 'broadcast', event: 'read', payload: { uid: me } }).catch(() => {});
  }, [me]);

  return { typers, sendTyping, sendRead };
}
