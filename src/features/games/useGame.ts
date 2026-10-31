import { useCallback, useEffect, useRef, useState } from 'react';
import { onFeed } from '@/features/chat/realtime';
import { friendlyError } from '@/lib/validation';
import { gameApi } from './api';
import type { Game, GameKind, Move } from './logic';

/** The latest game in a chat, kept fresh by the shared realtime feed (and reloaded on resync). */
export function useGame(roomId: string) {
  const [game, setGame] = useState<Game | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try { const g = await gameApi.latest(roomId); if (alive.current) { setGame(g); setError(null); } }
    catch (e) { if (alive.current) setError(friendlyError(e)); }
    finally { if (alive.current) setLoaded(true); }
  }, [roomId]);

  useEffect(() => {
    alive.current = true; void reload();
    const off = onFeed((e) => {
      if (e.type === 'game' && e.row.room_id === roomId) setGame((cur) => (!cur || cur.id !== e.row.id || e.row.version >= cur.version ? e.row : cur));
      else if (e.type === 'resync') void reload();
    });
    return () => { alive.current = false; off(); };
  }, [roomId, reload]);

  // Safety net for "real time": while a game is on, quietly re-read it every 1.5 s. If the realtime push is working this changes
  // nothing; if the push is late, blocked or the table isn't published for realtime, both players still see each move within ~1.5 s.
  const activeId = game && game.status === 'active' ? game.id : null;
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(() => {
      void gameApi.latest(roomId).then((g) => { if (alive.current && g) setGame((cur) => (!cur || cur.id !== g.id || g.version >= cur.version ? g : cur)); }).catch(() => {});
    }, 1500);
    return () => clearInterval(t);
  }, [activeId, roomId]);

  const run = useCallback(async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(null);
    try { await fn(); await reload(); } catch (e) { setError(friendlyError(e)); await reload(); } finally { setBusy(false); }
  }, [busy, reload]);

  return {
    game, loaded, error, busy, setError, reload,
    start: (kind: GameKind, secret: string | null) => run(async () => { await gameApi.start(roomId, kind, secret); }),
    move: (m: Move) => run(async () => { if (game) await gameApi.move(game, m); }),
    guess: (letter: string) => run(async () => { if (game) await gameApi.guess(game.id, letter); }),
    resign: () => run(async () => { if (game) await gameApi.resign(game.id); }),
  };
}
