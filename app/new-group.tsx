import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { UserPicker } from '@/components/UserPicker';
import { Banner, Button, Field, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { createGroupRoom, type UserHit } from '@/features/chat/api';
import { useChat } from '@/features/chat/ChatProvider';
import { friendlyError, MAX_GROUP_NAME, validateGroupName } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

export default function NewGroup() {
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { colors } = useTheme();
  const { refresh } = useChat();
  const [name, setName] = useState('');
  const [members, setMembers] = useState<UserHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (u: UserHit) => setMembers((cur) => (cur.some((x) => x.id === u.id) ? cur.filter((x) => x.id !== u.id) : [...cur, u]));

  async function create() {
    const bad = validateGroupName(name);
    if (bad) return setError(bad);
    if (members.length > 49) return setError('Too many members (max 50 including you)');
    setBusy(true); setError(null);
    try {
      const id = await createGroupRoom(name, members.map((m) => m.id));
      await refresh();
      router.replace({ pathname: '/chat/[roomId]', params: { roomId: id, title: name.trim() } });
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text variant="strong" style={{ color: colors.accent }}>Cancel</Text>
        </Pressable>
        <Text variant="h2" style={{ flex: 1, textAlign: 'center', marginRight: MIN_TOUCH }}>New group</Text>
      </View>
      <View style={{ gap: space.md }}>
        {error ? <Banner kind="error" text={error} /> : null}
        <Field label="Group name" value={name} onChangeText={setName} maxLength={MAX_GROUP_NAME} hint={`${name.trim().length}/${MAX_GROUP_NAME}`} />
        {members.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {members.map((m) => (
              <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`Remove ${m.username}`} onPress={() => toggle(m)}
                style={{ minHeight: 36, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text variant="small" style={{ color: colors.accent, fontWeight: '700' }}>{m.username}</Text>
                <Text variant="small" style={{ color: colors.accent }}>×</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text variant="small" muted>{members.length} added. You can add up to 49 people.</Text>
        <UserPicker me={me} selected={members.map((m) => m.id)} onPick={toggle} />
        <Button title="Create group" onPress={create} loading={busy} />
      </View>
    </Screen>
  );
}
