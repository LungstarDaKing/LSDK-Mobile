import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, View } from 'react-native';
import { ActionSheet } from '@/components/dialogs';
import { Avatar, Banner, Button, EmptyState, Loading, Screen, Text } from '@/components/ui';
import { getNotesRoom } from '@/features/tools/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { previewText, roomTitle, type Room } from '@/features/chat/api';
import { useChat } from '@/features/chat/ChatProvider';
import { listTime } from '@/features/chat/messageList';
import { useStatuses } from '@/features/chat/usePresence';
import { env } from '@/lib/env';
import { friendlyError } from '@/lib/validation';
import { colorIndex } from '@/lib/hash';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

export default function Chats() {
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { colors } = useTheme();
  const { rooms, previews, unread, flags, setFlag, clearUnread, loaded, error, refresh, nicknames, nameOf } = useChat();
  const [rowMenu, setRowMenu] = useState<{ room: Room; title: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const partnerOf = (r: Room) => (r.is_direct && !r.notes_owner ? r.participants.find((p) => p.profile_id !== me)?.profile_id : undefined);
  const partnerIds = useMemo(() => rooms.map(partnerOf).filter((x): x is string => !!x).slice(0, 100), [rooms]); // eslint-disable-line react-hooks/exhaustive-deps
  const statuses = useStatuses(partnerIds);

  if (!loaded) return <Loading />;

  async function openNotes() {
    try { const id = await getNotesRoom(); await refresh(); router.push({ pathname: '/chat/[roomId]', params: { roomId: id, title: 'Notes to self' } }); } catch (e) { setNoteError(friendlyError(e)); }
  }
  const open = (r: Room, title: string) => router.push({ pathname: '/chat/[roomId]', params: { roomId: r.id, title } });

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.md }}>
        <Text variant="title" style={{ flex: 1 }}>Chats</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="New chat or group" onPress={() => setMenu(true)}
          style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.accentText, fontSize: 26, lineHeight: 30, fontWeight: '600' }}>+</Text>
        </Pressable>
      </View>
      {error ? <Banner kind="error" text={error} /> : null}
      {noteError ? <Banner kind="error" text={noteError} /> : null}
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} tintColor={colors.accent} />}
        ListEmptyComponent={<EmptyState title="No chats yet" body="Find someone by username, or create a group." action={<Button title="Start a chat" onPress={() => router.push('/new-chat')} />} />}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        contentContainerStyle={{ flexGrow: 1 }}
        renderItem={({ item }) => {
          const n = unread.get(item.id) ?? 0;
          const flagged = flags.has(item.id) && n === 0;
          const title = roomTitle(item, me, nicknames);
          const pv = previews.get(item.id);
          const pid = partnerOf(item);
          const online = !!pid && statuses.get(pid)?.online;
          const who = pv && !item.is_direct ? (pv.sender_id === me ? 'You: ' : `${nameOf(pv.sender_id, item.participants.find((p) => p.profile_id === pv.sender_id)?.profiles?.username ?? 'Someone')}: `) : (pv && pv.sender_id === me ? 'You: ' : '');
          return (
            <Pressable
              accessibilityRole="button" accessibilityLabel={`${title}${online ? ', online' : ''}${n ? `, ${n} unread` : flagged ? ', marked unread' : ''}. ${who}${previewText(pv)}`}
              onPress={() => open(item, title)}
              onLongPress={() => setRowMenu({ room: item, title })}
              accessibilityHint="Long press for more options"
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 68, borderRadius: radius.lg, backgroundColor: pressed ? colors.surface2 : colors.surface })}
            >
              <View>
                <Avatar name={title} index={colorIndex(pid ?? item.id)} path={pid ? item.participants.find((x) => x.profile_id === pid)?.profiles?.avatar_path : null} />
                {online ? <View style={{ position: 'absolute', right: 0, bottom: 0, width: 13, height: 13, borderRadius: 7, backgroundColor: colors.online, borderWidth: 2, borderColor: colors.surface }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                  <Text variant="strong" numberOfLines={1} style={{ flex: 1 }}>{title}</Text>
                  {pv ? <Text variant="small" style={{ color: n ? colors.accent : colors.muted }}>{listTime(pv.created_at)}</Text> : null}
                </View>
                <Text variant="small" muted numberOfLines={1}>{who}{previewText(pv)}</Text>
              </View>
              {n > 0 ? (
                <View style={{ minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 }}>
                  <Text variant="small" style={{ color: colors.accentText, fontWeight: '700' }}>{n > 99 ? '99+' : n}</Text>
                </View>
              ) : flagged ? (
                <View accessible={false} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent }} />
              ) : null}
            </Pressable>
          );
        }}
      />
      <ActionSheet visible={!!rowMenu} title={rowMenu?.title} onClose={() => setRowMenu(null)} actions={rowMenu ? [
        (flags.has(rowMenu.room.id) || (unread.get(rowMenu.room.id) ?? 0) > 0)
          ? { label: 'Mark as read', onPress: () => { const id = rowMenu.room.id; clearUnread(id); setFlag(id, false).catch((e) => setNoteError(friendlyError(e))); } }
          : { label: 'Mark as unread', onPress: () => { setFlag(rowMenu.room.id, true).catch((e) => setNoteError(friendlyError(e))); } },
        { label: 'Open chat', onPress: () => open(rowMenu.room, rowMenu.title) },
      ] : []} />
      <ActionSheet visible={menu} onClose={() => setMenu(false)} actions={[
        { label: 'New chat', onPress: () => router.push('/new-chat') },
        { label: 'New group', onPress: () => router.push('/new-group') },
        ...(env.lunexUrl ? [{ label: 'LUNEX assistant', onPress: () => router.push('/lunex') }] : []),
        { label: 'Play on your own', onPress: () => router.push('/solo') },
        { label: 'Notes to myself', onPress: () => { void openNotes(); } },
        { label: 'Tools: saved, reminders, search', onPress: () => router.push('/tools') },
      ]} />
    </Screen>
  );
}
