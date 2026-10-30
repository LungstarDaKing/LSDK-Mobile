// Chat backgrounds are a per-device preference (the web app keeps them in the browser too; nothing is uploaded).
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Bg = { id: string; name: string; light: string | null; dark: string | null };
/** `default` follows the app theme. Colours are muted so message bubbles keep their contrast. */
export const BACKGROUNDS: Bg[] = [
  { id: 'default', name: 'Default', light: null, dark: null },
  { id: 'lavender', name: 'Lavender', light: '#ece8fb', dark: '#1a1533' },
  { id: 'sand', name: 'Sand', light: '#f3ead9', dark: '#2a2316' },
  { id: 'mint', name: 'Mint', light: '#dff3ea', dark: '#10261f' },
  { id: 'sky', name: 'Sky', light: '#dcecf9', dark: '#0f2233' },
  { id: 'rose', name: 'Rose', light: '#f9e0e6', dark: '#2d151c' },
  { id: 'slate', name: 'Slate', light: '#e3e6ea', dark: '#14181d' },
  { id: 'night', name: 'Night', light: '#cfd3e6', dark: '#07050f' },
];
export const IMAGE_ID = 'image';

export type Prefs = { def: string; per: Record<string, string>; imageUri: string | null; dim: 0 | 1 | 2 };
export const DIM_LEVELS = [0, 0.3, 0.55] as const;
export const DEFAULTS: Prefs = { def: 'default', per: {}, imageUri: null, dim: 1 };

const KEY = 'lsdkchat.bgprefs.v1';
const known = (id: unknown, imageUri: string | null): id is string =>
  typeof id === 'string' && (BACKGROUNDS.some((b) => b.id === id) || (id === IMAGE_ID && !!imageUri));

/** Defensive parse: stored data may be old, hand-edited or corrupt. */
export function parsePrefs(raw: string | null): Prefs {
  try {
    const p = JSON.parse(raw ?? 'null') as Partial<Prefs> | null;
    if (!p || typeof p !== 'object') return { ...DEFAULTS };
    const imageUri = typeof p.imageUri === 'string' && p.imageUri ? p.imageUri : null;
    const per: Record<string, string> = {};
    if (p.per && typeof p.per === 'object') for (const [k, v] of Object.entries(p.per)) if (known(v, imageUri)) per[k] = v;
    return { def: known(p.def, imageUri) ? p.def : 'default', per, imageUri, dim: p.dim === 0 || p.dim === 2 ? p.dim : 1 };
  } catch { return { ...DEFAULTS }; }
}

/** Which background applies in this chat: its own choice, else the default. */
export const resolveBackground = (p: Prefs, roomId: string | undefined): string => (roomId && p.per[roomId]) || p.def;

export function colorFor(id: string, isDark: boolean): string | null {
  const b = BACKGROUNDS.find((x) => x.id === id);
  return b ? (isDark ? b.dark : b.light) : null;
}

/** Set (or with id=null clear) a chat's own background; roomId undefined sets the default. Returns the new prefs. */
export function withChoice(p: Prefs, roomId: string | undefined, id: string | null): Prefs {
  if (!roomId) return { ...p, def: id ?? 'default' };
  const per = { ...p.per };
  if (id) per[roomId] = id; else delete per[roomId];
  return { ...p, per };
}

/** Removing the picture must not leave anything pointing at it. */
export function withoutImage(p: Prefs): Prefs {
  const per: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.per)) if (v !== IMAGE_ID) per[k] = v;
  return { ...p, imageUri: null, def: p.def === IMAGE_ID ? 'default' : p.def, per };
}

let cache: Prefs | null = null;
const subs = new Set<(p: Prefs) => void>();
export async function loadPrefs(): Promise<Prefs> {
  if (cache) return cache;
  try { cache = parsePrefs(await AsyncStorage.getItem(KEY)); } catch { cache = { ...DEFAULTS }; }
  return cache;
}
export async function savePrefs(p: Prefs): Promise<void> {
  cache = p;
  subs.forEach((f) => f(p));
  try { await AsyncStorage.setItem(KEY, JSON.stringify(p)); } catch { /* keep the in-memory choice for this session */ }
}
export const subscribePrefs = (f: (p: Prefs) => void) => { subs.add(f); return () => { subs.delete(f); }; };
