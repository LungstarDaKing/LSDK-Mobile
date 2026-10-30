// Per-device preferences (not synced). Server-side privacy settings live in user_private instead.
import AsyncStorage from '@react-native-async-storage/async-storage';

const K_TYPING = 'lsdk.typing';

export async function typingEnabled(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(K_TYPING)) !== 'off'; } catch { return true; }
}
export async function setTypingEnabled(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(K_TYPING, on ? 'on' : 'off'); } catch { /* storage unavailable: keep default */ }
}
