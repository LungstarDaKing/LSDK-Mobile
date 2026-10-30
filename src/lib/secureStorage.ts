// Supabase session storage. Native: expo-secure-store (Keychain / Keystore). SecureStore caps values at ~2 KB and a
// Supabase session is larger, so values are split into chunks. Web: falls back to localStorage (Supabase default).
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CHUNK = 1800;
const countKey = (k: string) => `${k}__n`;
const part = (k: string, i: number) => `${k}__${i}`;

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const n = Number(await SecureStore.getItemAsync(countKey(key)));
    if (!n) return null;
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(part(key, i));
      if (p == null) return null; // corrupt/partial -> treat as signed out
      parts.push(p);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const old = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(part(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
    await SecureStore.setItemAsync(countKey(key), String(n));
    for (let i = n; i < old; i++) await SecureStore.deleteItemAsync(part(key, i));
  },
  async removeItem(key: string): Promise<void> {
    const n = Number(await SecureStore.getItemAsync(countKey(key))) || 0;
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(part(key, i));
    await SecureStore.deleteItemAsync(countKey(key));
  },
};

export const isWeb = Platform.OS === 'web';
