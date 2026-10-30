import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { takeDueReminders, type Reminder } from './api';
import { previewText } from './rules';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

/** While the app is open, show reminders as they come due (each fires once). When the app is closed, the phone notification covers it. */
export function ReminderBoot() {
  const router = useRouter();
  const { colors } = useTheme();
  const [due, setDue] = useState<Reminder[]>([]);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (AppState.currentState !== 'active') return;
      const got = await takeDueReminders().catch(() => []);
      if (!stop && got.length) setDue((d) => [...d, ...got]);
    };
    const first = setTimeout(tick, 1500); const iv = setInterval(tick, 30_000);
    return () => { stop = true; clearTimeout(first); clearInterval(iv); };
  }, []);
  const r = due[0];
  if (!r) return null;
  const next = () => setDue((d) => d.slice(1));
  return (
    <View accessibilityLiveRegion="assertive" style={{ position: 'absolute', left: space.md, right: space.md, top: 48, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent, gap: space.sm, zIndex: 50 }}>
      <Text variant="strong">⏰ Reminder</Text>
      <Text numberOfLines={3}>{previewText(r.messages)}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss reminder" onPress={next} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.md }}><Text>Dismiss</Text></Pressable>
        {r.messages ? <Pressable accessibilityRole="button" accessibilityLabel="Open the chat" onPress={() => { const id = r.messages!.room_id; next(); router.push({ pathname: '/chat/[roomId]', params: { roomId: id } }); }} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space.md }}><Text style={{ color: colors.accent }}>Open chat</Text></Pressable> : null}
      </View>
    </View>
  );
}
