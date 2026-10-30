import { useCallback, useEffect, useRef, useState } from 'react';
import { onFeed } from '@/features/chat/realtime';
import { friendlyError } from '@/lib/validation';
import { watchApi } from './api';
import type { WatchRow } from './logic';

/** The shared watch session of a chat, kept fresh by the shared realtime feed. `receivedAt` is when this phone last got the row. */
export function useWatch(roomId: string) {
  const [row, setRow] = useState<WatchRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const receivedAt = useRef(Date.now());
  const alive = useRef(true);

  const apply = useCallback((r: WatchRow | null) => { receivedAt.current = Date.now(); setRow((cur) => (r && cur && cur.version > r.version && cur.provider === r.provider && cur.media_id === r.media_id ? cur : r)); }, []);
  const reload = useCallback(async () => {
    try { const r = await watchApi.get(roomId); if (alive.current) { apply(r); setError(null); } }
    catch (e) { if (alive.current) setError(friendlyError(e)); }
    finally { if (alive.current) setLoaded(true); }
  }, [roomId, apply]);

  useEffect(() => {
    alive.current = true; void reload();
    const off = onFeed((e) => {
      if (e.type === 'watch' && e.roomId === roomId) apply(e.row);
      else if (e.type === 'resync') void reload();
    });
    return () => { alive.current = false; off(); };
  }, [roomId, reload, apply]);

  const act = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    try { await fn(); await reload(); } catch (e) { setError(friendlyError(e)); }
  }, [reload]);

  return { row, loaded, error, setError, receivedAt, act };
}
