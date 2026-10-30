import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { UserPicker } from '@/components/UserPicker';
import { Banner, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { createDirectRoom } from '@/features/chat/api';
import { useChat } from '@/features/chat/ChatProvider';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, space } from '@/theme/tokens';

export default function NewChat() {
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { colors } = useTheme();
  const { refresh } = useChat();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(userId: string, username: string) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const id = await createDirectRoom(userId);
      await refresh();
      router.replace({ pathname: '/chat/[roomId]', params: { roomId: id, title: username } });
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text variant="strong" style={{ color: colors.accent }}>Cancel</Text>
        </Pressable>
        <Text variant="h2" style={{ flex: 1, textAlign: 'center', marginRight: MIN_TOUCH }}>New chat</Text>
      </View>
      {error ? <Banner kind="error" text={error} /> : null}
      <UserPicker me={me} autoFocus onPick={(u) => void start(u.id, u.username)} />
    </Screen>
  );
}
