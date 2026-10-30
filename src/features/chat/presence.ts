// Presence text. The server decides who may see what (get_statuses); this only formats what it returns.
export type Status = { online: boolean; last_seen_at: string | null };

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** null = show nothing (person hides it, or you do). */
export function statusText(s: Status | undefined, now: Date = new Date()): string | null {
  if (!s) return null;
  if (s.online) return 'online';
  if (!s.last_seen_at) return null;
  const d = new Date(s.last_seen_at);
  if (Number.isNaN(d.getTime())) return null;
  if (sameDay(d, now)) return `last seen today at ${hhmm(d)}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (sameDay(d, y)) return `last seen yesterday at ${hhmm(d)}`;
  return `last seen ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
