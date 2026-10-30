// Pure rules for the smart tools. Limits mirror update-v0.7.sql (the database enforces them; these give instant feedback).
export const MAX_SCHEDULED_TEXT = 1000;
export const MAX_COLLECTION = 30;
export const MAX_SEARCH = 100;
export const MIN_TEXT_SEARCH = 2;
export const SEARCH_KINDS = ['text', 'files', 'links'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

type Msg = { content?: string | null; attachment_name?: string | null } | null | undefined;

export function previewText(m: Msg, max = 120): string {
  if (!m) return 'Message deleted';
  const t = (m.content ?? '').trim().replace(/\s+/g, ' ');
  const file = m.attachment_name ? (/^voice-note/.test(m.attachment_name) ? '🎤 Voice note' : `📎 ${m.attachment_name}`) : '';
  const s = [file, t].filter(Boolean).join(' ');
  return s.length > max ? s.slice(0, max - 1) + '…' : s || '(empty)';
}

export function cleanCollection(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim() || 'Saved';
  if (v.length > MAX_COLLECTION) return { ok: false, error: `Collection names are limited to ${MAX_COLLECTION} characters.` };
  return { ok: true, value: v };
}

export function validateSearch(q: string, kind: SearchKind): string | null {
  const v = q.trim();
  if (v.length > MAX_SEARCH) return 'Search text is too long.';
  if (kind === 'text' && v.length < MIN_TEXT_SEARCH) return `Type at least ${MIN_TEXT_SEARCH} characters.`;
  return null;
}

export type QuickTime = { label: string; date: Date };
export function quickTimes(now = new Date()): QuickTime[] {
  const at = (d: Date, h: number) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
  const list: QuickTime[] = [{ label: 'In 1 hour', date: new Date(now.getTime() + 3_600_000) }];
  if (now.getHours() < 17) list.push({ label: 'This evening (18:00)', date: at(now, 18) });
  list.push({ label: 'Tomorrow morning (08:00)', date: at(new Date(now.getTime() + 86_400_000), 8) });
  return list;
}

/** "How many hours from now?" text -> a Date, or an error. Accepts 0.5 up to 8760 (one year). */
export function hoursFromNow(raw: string, now = new Date()): { ok: true; date: Date } | { ok: false; error: string } {
  const n = Number(raw.trim().replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Type a number of hours, for example 3 or 0.5.' };
  if (n > 24 * 365 - 1) return { ok: false, error: 'Choose a time within the next year.' };
  const date = new Date(now.getTime() + Math.round(n * 3_600_000));
  if (date.getTime() - now.getTime() < 60_000) return { ok: false, error: 'Choose at least one minute from now.' };
  return { ok: true, date };
}

export function whenLabel(iso: string, now = Date.now()): string {
  const d = new Date(iso); const diff = d.getTime() - now;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff <= 0) return 'Due now';
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${time}`;
}

export function groupByCollection<T extends { collection: string }>(items: T[]): { name: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const i of items) { const a = m.get(i.collection) ?? []; a.push(i); m.set(i.collection, a); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, items]) => ({ name, items }));
}
