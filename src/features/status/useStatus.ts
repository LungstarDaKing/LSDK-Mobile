import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { friendlyError } from '@/lib/validation';
import { loadMyLikes, loadMyViews, loadStories } from './api';
import { groupStories, type Story } from './stories';

/** Statuses visible to me, who I have seen/liked. Refetch with refresh(); mutate locally with the helpers. */
export function useStatus(me: string) {
  const [stories, setStories] = useState<Story[] | null>(null);
  const [viewed, setViewed] = useState<Set<string>>(new Set());
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const [s, v, l] = await Promise.all([loadStories(), loadMyViews(), loadMyLikes(me)]);
      if (!alive.current) return;
      setStories(s); setViewed(v); setLiked(l); setError(null);
    } catch (e) {
      if (alive.current) { setError(friendlyError(e)); setStories((c) => c ?? []); }
    }
    if (alive.current) setRefreshing(false);
  }, [me]);

  useEffect(() => { void refresh(); }, [refresh]);

  const groups = useMemo(() => groupStories(stories ?? [], me, viewed), [stories, me, viewed]);
  const markSeen = useCallback((id: string) => setViewed((c) => (c.has(id) ? c : new Set(c).add(id))), []);
  const setLike = useCallback((id: string, on: boolean) => setLiked((c) => { const n = new Set(c); if (on) n.add(id); else n.delete(id); return n; }), []);
  const dropStory = useCallback((id: string) => setStories((c) => (c ? c.filter((s) => s.id !== id) : c)), []);

  return { loaded: stories !== null, groups, viewed, liked, error, setError, refreshing, refresh, markSeen, setLike, dropStory };
}
