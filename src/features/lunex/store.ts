// The LUNEX conversation lives only on this phone and is removed on sign-out (like the website).
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Turn } from './client';

const PREFIX = 'lsdkchat.lunex.';
const MAX_STORED = 100;
export const validTurn = (t: any): t is Turn => !!t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string';

export async function loadTurns(uid: string): Promise<Turn[]> {
  try { const a = JSON.parse((await AsyncStorage.getItem(PREFIX + uid)) ?? '[]'); return Array.isArray(a) ? a.filter(validTurn).slice(-MAX_STORED) : []; } catch { return []; }
}
export async function saveTurns(uid: string, turns: Turn[]): Promise<void> {
  try { await AsyncStorage.setItem(PREFIX + uid, JSON.stringify(turns.slice(-MAX_STORED))); } catch { /* storage full: keep going without saving */ }
}
export async function wipeTurns(): Promise<void> {
  try { const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX)); if (keys.length) await AsyncStorage.multiRemove(keys); } catch { /* ignore */ }
}
