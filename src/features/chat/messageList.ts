import { isStickerPreview } from '@/features/stickers/logic';
// Pure list logic for a chat thread (oldest -> newest). Kept free of React so it can be unit tested.
import type { Message } from './api';

export type ChatMsg = Message & { _pending?: boolean; _failed?: boolean; _localUri?: string };
export type Item =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'msg'; key: string; msg: ChatMsg; showName: boolean; grouped: boolean };

const byTime = (a: ChatMsg, b: ChatMsg) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0);

/** Add a message that arrived (realtime or send response). Dedupes by id and drops the matching optimistic copy. */
export function mergeIncoming(list: ChatMsg[], m: Message, me: string): ChatMsg[] {
  if (list.some((x) => x.id === m.id)) return list.map((x) => (x.id === m.id ? { ...m } : x));
  let base = list;
  if (m.sender_id === me) {
    const i = base.findIndex((x) => x._pending && x.sender_id === me && x.content === m.content && (x.reply_to ?? null) === (m.reply_to ?? null)
      && (x.attachment_type ?? null) === (m.attachment_type ?? null) && (x.attachment_name ?? null) === (m.attachment_name ?? null));
    if (i >= 0) base = [...base.slice(0, i), ...base.slice(i + 1)];
  }
  const next = [...base, m as ChatMsg];
  const n = next.length;
  return n > 1 && byTime(next[n - 2], next[n - 1]) > 0 ? next.sort(byTime) : next;
}

/** Swap an optimistic message for the saved one (or just remove it if the realtime copy already arrived). */
export function replacePending(list: ChatMsg[], tmpId: string, real: Message): ChatMsg[] {
  const without = list.filter((x) => x.id !== tmpId);
  return without.some((x) => x.id === real.id) ? without : [...without, real as ChatMsg].sort(byTime);
}

export const markFailed = (list: ChatMsg[], tmpId: string): ChatMsg[] =>
  list.map((x) => (x.id === tmpId ? { ...x, _pending: false, _failed: true } : x));
export const markRetrying = (list: ChatMsg[], tmpId: string): ChatMsg[] =>
  list.map((x) => (x.id === tmpId ? { ...x, _pending: true, _failed: false } : x));
export const removeById = (list: ChatMsg[], id: string): ChatMsg[] => list.filter((x) => x.id !== id);

export function applyUpdate(list: ChatMsg[], m: Message): ChatMsg[] {
  return list.map((x) => (x.id === m.id ? { ...x, ...m } : x));
}

export function prependOlder(list: ChatMsg[], older: Message[]): ChatMsg[] {
  const have = new Set(list.map((x) => x.id));
  return [...older.filter((o) => !have.has(o.id)), ...list];
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return 'Today';
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (dayKey(d) === dayKey(y)) return 'Yesterday';
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Flat render list, oldest -> newest, with day separators and "grouped" runs from the same sender. */
export function buildItems(msgs: ChatMsg[], o: { me: string; isDirect: boolean; now?: Date }): Item[] {
  const out: Item[] = [];
  let prev: ChatMsg | null = null;
  for (const m of msgs) {
    const d = new Date(m.created_at);
    const newDay = !prev || dayKey(new Date(prev.created_at)) !== dayKey(d);
    if (newDay) out.push({ kind: 'day', key: `day-${dayKey(d)}`, label: dayLabel(m.created_at, o.now) });
    const grouped = !newDay && !!prev && prev.sender_id === m.sender_id && d.getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS;
    out.push({ kind: 'msg', key: m.id, msg: m, grouped, showName: m.sender_id !== o.me && !o.isDirect && !grouped });
    prev = m;
  }
  return out;
}

/** Short text for a quoted / replied-to message. */
export function quoteText(t: { content: string; attachment_type: string | null } | undefined): string {
  if (!t) return 'Original message unavailable';
  if (isStickerPreview(t.content)) return 'Sticker';
  if (t.content?.trim()) return t.content.length > 80 ? `${t.content.slice(0, 79)}…` : t.content;
  const a = t.attachment_type ?? '';
  return a.startsWith('image') ? 'Photo' : a.startsWith('audio') ? 'Voice message' : a.startsWith('video') ? 'Video' : 'Attachment';
}

/** Time shown on a chat-list row: clock today, "Yesterday", otherwise a short date. */
export function listTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const label = dayLabel(iso, now);
  if (label === 'Today') return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return label;
}
