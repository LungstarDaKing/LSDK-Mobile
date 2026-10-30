// State + actions for one open conversation: messages, older pages, reactions, read receipts, replies,
// optimistic sending with retry, edit / delete / react. All list manipulation is in messageList.ts (unit tested).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { friendlyError } from '@/lib/validation';
import { removeMedia, sendAttachment, uploadMedia, type Picked, type Uploaded } from '@/features/media/storage';
import { cleanName } from '@/features/media/rules';
import {
  deleteMessage, editMessage, fetchReplyTargets, loadMessages, loadOlder, loadReactions, loadReads, markRead,
  reactToMessage, sendText, type Message, type ReplyTarget,
} from './api';
import {
  applyUpdate, markFailed, markRetrying, mergeIncoming, prependOlder, removeById, replacePending, type ChatMsg,
} from './messageList';
import { onFeed } from './realtime';
import { setReaction, type ReactionMap } from './reactions';
import type { Reads } from './receipts';

export function useRoom(roomId: string, me: string, opts: { onViewed: () => void; sendReadPing: () => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [reactions, setReactions] = useState<ReactionMap>(new Map());
  const [reads, setReads] = useState<Reads>(new Map());
  const [replyCache, setReplyCache] = useState<Map<string, ReplyTarget>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const msgsRef = useRef<ChatMsg[] | null>(null);
  msgsRef.current = msgs;
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // pending file sends: what to upload, and (once uploaded) the stored object so a retry never uploads twice
  const uploads = useRef(new Map<string, { picked: Picked; mime: string; fallback: string; up?: Uploaded }>());
  const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---- reply targets that are not in the loaded page
  const ensureReplyTargets = useCallback(async (list: Message[]) => {
    const have = new Set(list.map((m) => m.id));
    const need = [...new Set(list.map((m) => m.reply_to).filter((id): id is string => !!id && !have.has(id)))];
    if (!need.length) return;
    try {
      const rows = await fetchReplyTargets(need);
      if (!alive.current || !rows.length) return;
      setReplyCache((cur) => { const n = new Map(cur); for (const r of rows) n.set(r.id, r); return n; });
    } catch { /* quote just shows "unavailable" */ }
  }, []);

  const refreshReads = useCallback(async () => {
    try { const r = await loadReads(roomId); if (alive.current) setReads(r); } catch { /* receipts are optional */ }
  }, [roomId]);

  const viewed = useCallback(() => {
    // Never mark as read while the app is in the background (the sender would wrongly see "Seen").
    if (AppState.currentState !== 'active') return;
    markRead(roomId).then(() => optsRef.current.sendReadPing()).catch(() => {});
    optsRef.current.onViewed();
  }, [roomId]);

  const loadAll = useCallback(async () => {
    try {
      const [{ messages, hasMore: more }, rx] = await Promise.all([loadMessages(roomId), loadReactions(roomId).catch(() => new Map() as ReactionMap)]);
      if (!alive.current) return;
      setMsgs((cur) => {
        // keep unsent/failed local messages across a refresh
        const local = (cur ?? []).filter((m) => m._pending || m._failed);
        return [...messages, ...local];
      });
      setHasMore(more); setReactions(rx); setError(null);
      void ensureReplyTargets(messages);
      void refreshReads();
      viewed();
    } catch (e) {
      if (alive.current) { setError(friendlyError(e)); setMsgs((c) => c ?? []); }
    }
  }, [roomId, ensureReplyTargets, refreshReads, viewed]);

  useEffect(() => {
    alive.current = true;
    setMsgs(null); setReactions(new Map()); setReads(new Map()); setReplyCache(new Map()); setHasMore(false);
    void loadAll();
    const off = onFeed((e) => {
      if (e.type === 'resync') { void loadAll(); return; }
      if (e.type === 'message') {
        if (e.event === 'DELETE') { setMsgs((c) => c && removeById(c, e.row.id)); return; }
        if (e.row.room_id !== roomId) return;
        if (e.event === 'INSERT') {
          setMsgs((c) => (c ? mergeIncoming(c, e.row, me) : c));
          void ensureReplyTargets([e.row]);
          if (e.row.sender_id !== me) viewed();
        } else setMsgs((c) => (c ? applyUpdate(c, e.row) : c));
      } else if (e.type === 'reaction') {
        const { message_id, user_id, emoji } = e.row;
        setReactions((c) => setReaction(c, message_id, user_id, e.event === 'DELETE' ? null : (emoji ?? null)));
      }
    });
    return () => { alive.current = false; off(); if (readTimer.current) clearTimeout(readTimer.current); };
  }, [roomId, me, loadAll, ensureReplyTargets, viewed]);

  /** Called when the other side pings "I read this" (debounced: several pings -> one fetch). */
  const onReadPing = useCallback(() => {
    if (readTimer.current) clearTimeout(readTimer.current);
    readTimer.current = setTimeout(() => { void refreshReads(); }, 400);
  }, [refreshReads]);

  const loadMore = useCallback(async () => {
    const cur = msgsRef.current;
    if (!cur || !hasMore || loadingOlder) return;
    const oldest = cur.find((m) => !m._pending && !m._failed);
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const { messages, hasMore: more } = await loadOlder(roomId, oldest.created_at);
      if (!alive.current) return;
      setMsgs((c) => (c ? prependOlder(c, messages) : c));
      setHasMore(more);
      void ensureReplyTargets(messages);
    } catch (e) { if (alive.current) setError(friendlyError(e)); }
    if (alive.current) setLoadingOlder(false);
  }, [roomId, hasMore, loadingOlder, ensureReplyTargets]);

  // ---- sending (optimistic) --------------------------------------------------------------
  const deliver = useCallback(async (tmp: ChatMsg) => {
    try {
      const job = uploads.current.get(tmp.id);
      const saved = job
        ? await (async () => {
          job.up ??= await uploadMedia(roomId, me, job.picked, job.mime, job.fallback);
          const row = await sendAttachment(roomId, me, job.up, tmp.content, tmp.reply_to);
          uploads.current.delete(tmp.id);
          return row;
        })()
        : await sendText(roomId, me, tmp.content, tmp.reply_to);
      if (!alive.current || !saved) return;
      setMsgs((c) => (c ? replacePending(c, tmp.id, saved) : c));
    } catch (e) {
      if (!alive.current) return;
      setMsgs((c) => (c ? markFailed(c, tmp.id) : c));
      setError(friendlyError(e));
    }
  }, [roomId, me]);

  const send = useCallback((text: string, replyTo: string | null) => {
    const content = text.trim().slice(0, 1000);
    if (!content) return false;
    const tmp: ChatMsg = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, room_id: roomId, sender_id: me, content,
      created_at: new Date().toISOString(), edited_at: null, reply_to: replyTo, attachment_path: null, attachment_name: null,
      attachment_type: null, attachment_duration: null, status_label: null, _pending: true,
    };
    setError(null);
    setMsgs((c) => [...(c ?? []), tmp]);
    void deliver(tmp);
    return true;
  }, [roomId, me, deliver]);

  /** Send a picked file. The bubble appears at once with the local preview; upload happens in the background. */
  const sendFile = useCallback((picked: Picked, mime: string, caption: string, replyTo: string | null, fallbackName: string) => {
    const tmp: ChatMsg = {
      id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, room_id: roomId, sender_id: me,
      content: caption.trim().slice(0, 1000), created_at: new Date().toISOString(), edited_at: null, reply_to: replyTo,
      attachment_path: null, attachment_name: cleanName(picked.name, fallbackName), attachment_type: mime,
      attachment_duration: picked.durationMs != null ? Math.round(picked.durationMs) : null, status_label: null, _pending: true, _localUri: picked.uri,
    };
    uploads.current.set(tmp.id, { picked, mime, fallback: fallbackName });
    setError(null);
    setMsgs((c) => [...(c ?? []), tmp]);
    void deliver(tmp);
  }, [roomId, me, deliver]);

  const retry = useCallback((tmpId: string) => {
    const m = msgsRef.current?.find((x) => x.id === tmpId);
    if (!m) return;
    setError(null);
    setMsgs((c) => (c ? markRetrying(c, tmpId) : c));
    void deliver(m);
  }, [deliver]);

  const discard = useCallback((tmpId: string) => {
    const job = uploads.current.get(tmpId);
    uploads.current.delete(tmpId);
    if (job?.up) void removeMedia([job.up.path]).catch(() => {});   // uploaded but never attached to a message
    setMsgs((c) => (c ? removeById(c, tmpId) : c));
  }, []);

  // ---- edit / delete / react -------------------------------------------------------------
  const edit = useCallback(async (id: string, text: string) => {
    const saved = await editMessage(id, text);
    setMsgs((c) => (c ? applyUpdate(c, saved) : c));
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteMessage(id);
    setMsgs((c) => (c ? removeById(c, id) : c));
  }, []);

  const react = useCallback(async (messageId: string, emoji: string) => {
    const before = reactions;
    const mine = before.get(messageId)?.get(me);
    // optimistic: same emoji removes it, otherwise set/replace
    setReactions((c) => setReaction(c, messageId, me, mine === emoji ? null : emoji));
    try {
      const now = await reactToMessage(messageId, emoji);
      if (alive.current) setReactions((c) => setReaction(c, messageId, me, now));
    } catch (e) {
      if (alive.current) { setReactions(before); setError(friendlyError(e)); }
    }
  }, [reactions, me]);

  return { msgs, hasMore, loadingOlder, loadMore, reactions, reads, replyCache, error, setError, send, sendFile, retry, discard, edit, remove, react, onReadPing };
}
