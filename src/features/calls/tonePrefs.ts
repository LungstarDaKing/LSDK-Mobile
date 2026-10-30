// Ringtone choices: one default plus one optional tone per person, kept only on this phone (like the website). Pure logic, unit-tested.
export const MAX_CUSTOM = 5;
export const MAX_TONE_BYTES = 3 * 1024 * 1024;
export const MAX_TONE_SECONDS = 30;
export const STOCK_IDS = ['classic', 'marimba', 'chime', 'pulse', 'rise', 'bubbles'] as const;
export type Prefs = { def: string; per: Record<string, string> };
export type CustomTone = { id: string; name: string; file: string };

export function parsePrefs(raw: unknown): Prefs {
  const o = (raw && typeof raw === 'object' ? raw : {}) as { def?: unknown; per?: unknown };
  const per: Record<string, string> = {};
  if (o.per && typeof o.per === 'object') for (const [k, v] of Object.entries(o.per as Record<string, unknown>)) if (typeof v === 'string' && v) per[k] = v;
  return { def: typeof o.def === 'string' && o.def ? o.def : 'classic', per };
}
export const toneFor = (p: Prefs, peerId?: string | null): string => (peerId && p.per[peerId]) || p.def;
export const setDefault = (p: Prefs, id: string): Prefs => ({ ...p, def: id });
export const setPerson = (p: Prefs, uid: string, id: string | null): Prefs => {
  const per = { ...p.per }; if (id) per[uid] = id; else delete per[uid];
  return { ...p, per };
};
/** Removing a custom tone also removes every choice that pointed at it. */
export function forget(p: Prefs, id: string): Prefs {
  const per: Record<string, string> = {};
  for (const [u, t] of Object.entries(p.per)) if (t !== id) per[u] = t;
  return { def: p.def === id ? 'classic' : p.def, per };
}
/** Is this tone still available? (a removed custom tone falls back to the stock default) */
export const resolve = (id: string, custom: { id: string }[]): string => (STOCK_IDS.includes(id as never) || custom.some((c) => c.id === id) ? id : 'classic');

export function validateTone(f: { name?: string | null; mime?: string | null; size?: number | null }, have: number): string | null {
  if (have >= MAX_CUSTOM) return `You can keep up to ${MAX_CUSTOM} of your own ringtones. Remove one first.`;
  const okType = (f.mime ?? '').startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|caf)$/i.test(f.name ?? '');
  if (!okType) return 'Choose an audio file (MP3, M4A, WAV...).';
  if ((f.size ?? 0) > MAX_TONE_BYTES) return 'That file is too big for a ringtone (max 3 MB).';
  return null;
}
export const cleanToneName = (n: string | null | undefined): string => (n ?? '').replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N} _\-().]/gu, '').trim().slice(0, 40) || 'My ringtone';
