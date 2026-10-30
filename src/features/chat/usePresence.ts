import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getStatuses, heartbeat } from './api';
import type { Status } from './presence';

const BEAT_EVERY = 30_000; // server throttles to one update per 20 s

/** Keeps "online" fresh while the app is in the foreground. Mount once (tabs layout). */
export function useHeartbeat(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const beat = () => { if (AppState.currentState === 'active') void heartbeat().catch(() => {}); };
    beat();
    const t = setInterval(beat, BEAT_EVERY);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') beat(); });
    return () => { clearInterval(t); sub.remove(); };
  }, [enabled]);
}

/** Online / last-seen for some people. The server returns nothing for people who hide it (or if you hide yours). */
export function useStatuses(ids: string[]) {
  const [map, setMap] = useState<Map<string, Status>>(new Map());
  const key = [...ids].sort().join(',');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    if (!ids.length) { setMap(new Map()); return; }
    const load = () => getStatuses(ids).then((m) => { if (alive.current) setMap(m); }).catch(() => {});
    void load();
    const t = setInterval(load, 45_000);
    return () => { alive.current = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return map;
}
