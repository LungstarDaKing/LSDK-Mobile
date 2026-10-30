import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { safeStickerUrl, type StickerItem } from './logic';

const MAX = { recent: 30, fav: 60 } as const;
const key = (name: string, uid: string) => `lsdk.stk.${name}.${uid}`;

/** Recents and favourites: kept on this phone, removed at sign-out (like the website). */
export async function loadList(name: 'recent' | 'fav', uid: string): Promise<StickerItem[]> {
  try {
    const a = JSON.parse((await AsyncStorage.getItem(key(name, uid))) ?? '[]') as unknown;
    return Array.isArray(a) ? (a as StickerItem[]).filter((i) => safeStickerUrl(i?.url) && safeStickerUrl(i?.preview)).slice(0, MAX[name]) : [];
  } catch { return []; }
}
async function save(name: 'recent' | 'fav', uid: string, a: StickerItem[]) {
  try { await AsyncStorage.setItem(key(name, uid), JSON.stringify(a.slice(0, MAX[name]))); } catch { /* full or blocked */ }
}
export async function addToList(name: 'recent' | 'fav', uid: string, item: StickerItem): Promise<StickerItem[]> {
  const a = (await loadList(name, uid)).filter((i) => i.url !== item.url);
  a.unshift({ id: item.id, title: item.title, url: item.url, preview: item.preview });
  await save(name, uid, a); return a.slice(0, MAX[name]);
}
export async function removeFromList(name: 'recent' | 'fav', uid: string, url: string): Promise<StickerItem[]> {
  const a = (await loadList(name, uid)).filter((i) => i.url !== url);
  await save(name, uid, a); return a;
}
export async function wipeLists(): Promise<void> {
  try { const ks = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('lsdk.stk.')); if (ks.length) await AsyncStorage.multiRemove(ks); } catch { /* ignore */ }
}

/* ---------- My stickers: .webp files in the app's own storage, per account ---------- */
export const MAX_MINE = 60;
export type Mine = { id: string; uri: string; created: number };
const dirFor = (uid: string) => new Directory(Paths.document, 'stickers', uid.replace(/[^a-zA-Z0-9-]/g, ''));

export async function mineList(uid: string): Promise<Mine[]> {
  try {
    const d = dirFor(uid); if (!d.exists) return [];
    return d.list().filter((f): f is File => f instanceof File && f.name.endsWith('.webp'))
      .map((f) => ({ id: f.name, uri: f.uri, created: Number(f.name.split('-')[0]) || 0 }))
      .sort((a, b) => b.created - a.created);
  } catch { return []; }
}
export async function mineAdd(uid: string, sourceUri: string): Promise<Mine> {
  const d = dirFor(uid); d.create({ intermediates: true, idempotent: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
  const dest = new File(d, name);
  new File(sourceUri).copy(dest);
  const all = await mineList(uid);
  for (const old of all.slice(MAX_MINE)) { try { new File(old.uri).delete(); } catch { /* ignore */ } }
  return { id: name, uri: dest.uri, created: Number(name.split('-')[0]) };
}
export async function mineRemove(uri: string): Promise<void> { try { new File(uri).delete(); } catch { /* already gone */ } }
