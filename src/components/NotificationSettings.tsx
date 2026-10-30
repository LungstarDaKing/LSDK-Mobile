import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Banner, Button, Text } from '@/components/ui';
import { getPreview, isRegistered, pushSupported, register, setPreview, unregister } from '@/features/push/push';
import { useTheme } from '@/theme/ThemeProvider';
import { space } from '@/theme/tokens';

export function NotificationSettings() {
  const { colors } = useTheme();
  const [on, setOn] = useState(false);
  const [preview, setPrev] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { void isRegistered().then(setOn); void getPreview().then(setPrev); }, []);
  if (!pushSupported) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="strong">Notifications</Text>
      <Text variant="small" muted>Messages and calls when the app is closed. This phone only.</Text>
      {msg ? <Banner kind="error" text={msg} /> : null}
      {on
        ? <Button title="Turn off on this phone" variant="soft" onPress={async () => { await unregister(); setOn(false); setMsg(null); }} />
        : <Button title="Turn on notifications" onPress={async () => { const m = await register(true); setMsg(m); setOn(!m); }} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 }}>
        <View style={{ flex: 1 }}><Text variant="strong">Show message text</Text><Text variant="small" muted>If off, notifications just say "New message".</Text></View>
        <Switch accessibilityLabel="Show message text in notifications" value={preview} trackColor={{ true: colors.accent, false: colors.border }}
          onValueChange={(v) => { setPrev(v); void setPreview(v); }} />
      </View>
    </View>
  );
}
