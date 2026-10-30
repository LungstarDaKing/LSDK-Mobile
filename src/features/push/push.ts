// Phone notifications through Expo's push service. Needs: a development/production build (not Expo Go on Android),
// an EAS project id, FCM (Android) / APNs (iOS) credentials, and backend-additions/mobile-push.sql + Edge Function deployed.
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { isExpoGo } from '@/lib/runtime';
import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';

const K_TOKEN = 'lsdkchat.pushtoken.v1';
const K_PREVIEW = 'lsdkchat.pushpreview.v1';
export const pushSupported = Platform.OS !== 'web' && !isExpoGo;   // Expo Go has no remote push; use a development build

export function projectId(): string | undefined {
  const c = Constants as unknown as { easConfig?: { projectId?: string }; expoConfig?: { extra?: { eas?: { projectId?: string } } } };
  return c.easConfig?.projectId ?? c.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
}

/** Call once at start-up: how a notification looks while the app is open. Calls are shown by the call screen instead. */
export function configureForeground(): void {
  if (!pushSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async (n) => {
      const kind = (n.request.content.data as { kind?: string } | null)?.kind;
      const show = kind !== 'call';
      return { shouldShowAlert: show, shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
    },
  });
}

async function setupChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('messages', { name: 'Messages', importance: Notifications.AndroidImportance.HIGH });
  await Notifications.setNotificationChannelAsync('calls', { name: 'Calls', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 600, 400, 600], sound: 'default' });
}

export async function getPreview(): Promise<boolean> { try { return (await AsyncStorage.getItem(K_PREVIEW)) !== 'off'; } catch { return true; } }
export async function setPreview(on: boolean): Promise<void> {
  try { await AsyncStorage.setItem(K_PREVIEW, on ? 'on' : 'off'); } catch { /* ignore */ }
  const token = await AsyncStorage.getItem(K_TOKEN).catch(() => null);
  if (token) await register(false).catch(() => {});   // re-save so the server uses the new choice
}

/** Ask permission (if asked to), get this phone's token and tell the server. Returns null when ok, or a message for the user. */
export async function register(askPermission = true): Promise<string | null> {
  if (!pushSupported) return isExpoGo ? 'Notifications need the development build of the app (not Expo Go).' : 'Phone notifications are not available in the browser version.';
  if (!Device.isDevice) return 'Notifications only work on a real phone, not a simulator.';
  try {
    await setupChannels();
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted' && askPermission) status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return 'Notifications are off. Turn them on for LSDK Chat in your phone settings.';
    const id = projectId();
    if (!id) return 'This build has no EAS project id, so notifications cannot be set up. See docs/PHASE5.md.';
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const { error } = await supabase.rpc('save_mobile_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android', p_show_preview: await getPreview() });
    if (error) throw new UserError('Could not turn on notifications. Ask the app owner to run the mobile push SQL (see docs/PHASE5.md).');
    await AsyncStorage.setItem(K_TOKEN, token).catch(() => {});
    return null;
  } catch (e) {
    return e instanceof UserError ? e.message : 'Could not turn on notifications.';
  }
}

/** Sign-out / turn off: stop this phone receiving this account's alerts. */
export async function unregister(): Promise<void> {
  const token = await AsyncStorage.getItem(K_TOKEN).catch(() => null);
  if (!token) return;
  try { await supabase.rpc('remove_mobile_push_token', { p_token: token }); await AsyncStorage.removeItem(K_TOKEN); } catch { /* the server drops dead tokens by itself */ }
}
export async function isRegistered(): Promise<boolean> { return !!(await AsyncStorage.getItem(K_TOKEN).catch(() => null)); }
