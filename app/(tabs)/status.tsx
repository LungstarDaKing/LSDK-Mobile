import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { Avatar, Banner, EmptyState, Loading, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useChat } from '@/features/chat/ChatProvider';
import { ageLabel, firstUnseen, timeLeftLabel, type Group } from '@/features/status/stories';
import { useStatus } from '@/features/status/useStatus';
import { colorIndex } from '@/lib/hash';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

function Ring({ on, children }: { on: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return <View style={{ padding: 3, borderRadius: 40, borderWidth: 2.5, borderColor: on ? colors.accent : colors.border }}>{children}</View>;
}

export default function Status() {
  const { session, profile } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { colors } = useTheme();
  const { nameOf } = useChat();
  const st = useStatus(me);

  // Statuses change while you are away (they expire, people post): refetch every time this tab is shown.
  useFocusEffect(useCallback(() => { void st.refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []));

  const mine = st.groups.find((g) => g.mine);
  const others = st.groups.filter((g) => !g.mine);
  const open = (g: Group) => router.push({ pathname: '/status/[authorId]', params: { authorId: g.authorId, start: String(firstUnseen(g, st.viewed)) } });

  const row = (g: Group) => {
    const name = nameOf(g.authorId, g.username);
    const unseen = g.unseen > 0;
    return (
      <Pressable
        key={g.authorId} accessibilityRole="button"
        accessibilityLabel={`${name}. ${g.stories.length} status ${g.stories.length === 1 ? 'update' : 'updates'}, ${unseen ? `${g.unseen} new, ` : 'all seen, '}${ageLabel(g.latest)}`}
        onPress={() => open(g)}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 72, borderRadius: radius.lg, backgroundColor: pressed ? colors.surface2 : colors.surface })}
      >
        <Ring on={unseen}><Avatar name={name} size={48} index={colorIndex(g.authorId)} path={g.avatar_path} /></Ring>
        <View style={{ flex: 1 }}>
          <Text variant="strong" numberOfLines={1}>{name}</Text>
          <Text variant="small" muted>{ageLabel(g.latest)}{unseen ? ` · ${g.unseen} new` : ''}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Text variant="title" accessibilityRole="header">Status</Text>
      {st.error ? <View style={{ marginTop: space.sm }}><Banner kind="error" text={st.error} /></View> : null}
      {!st.loaded ? <Loading /> : (
        <FlatList
          data={others} keyExtractor={(g) => g.authorId} renderItem={({ item }) => row(item)}
          contentContainerStyle={{ gap: space.sm, paddingVertical: space.md, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={st.refreshing} onRefresh={() => void st.refresh()} tintColor={colors.accent} />}
          ListHeaderComponent={
            <View style={{ gap: space.sm, marginBottom: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 72, borderRadius: radius.lg, backgroundColor: colors.surface }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={mine ? `My status. ${mine.stories.length} ${mine.stories.length === 1 ? 'update' : 'updates'}, ${timeLeftLabel(mine.stories[mine.stories.length - 1].expires_at)}. Tap to view` : 'My status. Add a status update'}
                  onPress={() => (mine ? open(mine) : router.push('/status/new'))}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH }}
                >
                  <Ring on={!!mine}><Avatar name={profile?.username ?? '?'} size={48} index={colorIndex(me)} path={profile?.avatar_path} /></Ring>
                  <View style={{ flex: 1 }}>
                    <Text variant="strong">My status</Text>
                    <Text variant="small" muted>{mine ? `${mine.stories.length} ${mine.stories.length === 1 ? 'update' : 'updates'} · ${timeLeftLabel(mine.stories[mine.stories.length - 1].expires_at)}` : 'Tap to add a status update'}</Text>
                  </View>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Add a status update" onPress={() => router.push('/status/new')}
                  style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.accentText, fontSize: 24, lineHeight: 28 }}>+</Text>
                </Pressable>
              </View>
              {others.length ? <Text variant="small" muted style={{ marginTop: space.sm }}>Recent updates</Text> : null}
            </View>
          }
          ListEmptyComponent={<EmptyState title="No updates yet" body="Updates from people you chat with show up here for 24 hours." />}
        />
      )}
    </Screen>
  );
}
