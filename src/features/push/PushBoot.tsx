import * as Notifications from 'expo-notifications';
import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';
import { configureForeground, pushSupported, register } from './push';
import { routeFor } from './route';

/** Mounted once while signed in: refreshes this phone's token (without prompting) and opens the right screen when a notification is tapped. */
export function PushBoot() {
  const router = useRouter();
  useEffect(() => {
    if (!pushSupported) return;
    configureForeground();
    void register(false);
    const open = (data: unknown) => { const t = routeFor(data); if (t) router.push(t as Href); };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
    void Notifications.getLastNotificationResponseAsync().then((r) => { if (r) open(r.notification.request.content.data); }).catch(() => {});
    return () => sub.remove();
  }, [router]);
  return null;
}
