// A reminder also becomes a notification on THIS phone, so it can fire while the app is closed.
// (The in-app watcher covers the app being open; this covers it being closed. Native only; unverified on a device.)
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isExpoGo } from '@/lib/runtime';
import { previewText } from './rules';

const KEY = 'lsdkchat.reminder-notifs.v1';
type MapT = Record<string, string>;
async function load(): Promise<MapT> { try { return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}') as MapT; } catch { return {}; } }
async function save(m: MapT) { try { await AsyncStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ } }

export async function scheduleLocalReminder(messageId: string, when: Date, msg: { content?: string | null; attachment_name?: string | null }, roomId: string): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') return;      // no prompt here; Settings -> Notifications asks
    await cancelLocalReminder(messageId);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: 'Reminder', body: previewText(msg, 100), data: { kind: 'message', path: `#/chat/${roomId}` } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    const m = await load(); m[messageId] = id; await save(m);
  } catch { /* the in-app reminder still works */ }
}
export async function cancelLocalReminder(messageId: string): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const m = await load(); const id = m[messageId];
    if (!id) return;
    await Notifications.cancelScheduledNotificationAsync(id);
    delete m[messageId]; await save(m);
  } catch { /* ignore */ }
}
