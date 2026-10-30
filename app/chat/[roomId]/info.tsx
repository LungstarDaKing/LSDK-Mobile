import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ActionSheet, ConfirmDialog, PickerModal, PromptDialog } from '@/components/dialogs';
import { UserPicker } from '@/components/UserPicker';
import { env } from '@/lib/env';
import { Avatar, Banner, Button, EmptyState, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { addMember, leaveRoom, removeMember, renameRoom, roomTitle, setMemberRole, type Participant } from '@/features/chat/api';
import { useChat } from '@/features/chat/ChatProvider';
import { statusText } from '@/features/chat/presence';
import { useStatuses } from '@/features/chat/usePresence';
import { colorIndex } from '@/lib/hash';
import { PersonRingtone } from '@/components/RingtonePicker';
import { MAX_NICKNAME, setNickname } from '@/features/chat/nicknames';
import { BackgroundPicker } from '@/components/BackgroundPicker';
import { friendlyError, MAX_GROUP_NAME, validateGroupName } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

export default function ChatInfo() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { colors } = useTheme();
  const { room: getRoom, refresh, nicknames, nameOf } = useChat();
  const room = getRoom(roomId);
  const others = room?.participants.filter((p) => p.profile_id !== me).map((p) => p.profile_id) ?? [];
  const statuses = useStatuses(others);

  const [target, setTarget] = useState<Participant | null>(null);
  const [removing, setRemoving] = useState<Participant | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [nicking, setNicking] = useState<Participant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}>
      <Text variant="title" style={{ color: colors.accent, lineHeight: 34 }}>‹</Text>
    </Pressable>
  );

  if (!room) {
    return <Screen>{back}<EmptyState title="Chat not found" body="You may have left this group, or it was removed." action={<Button title="Back to chats" onPress={() => router.replace('/(tabs)')} />} /></Screen>;
  }

  const iAmAdmin = room.participants.find((p) => p.profile_id === me)?.role === 'admin';
  const title = roomTitle(room, me, nicknames);
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setError(null); setNotice(null);
    try { await fn(); await refresh(); if (ok) setNotice(ok); } catch (e) { setError(friendlyError(e)); }
  };

  const targetActions = target ? [
    { label: nicknames.has(target.profile_id) ? 'Change nickname' : 'Set nickname', onPress: () => setNicking(target) },
    ...(iAmAdmin ? [
      { label: target.role === 'admin' ? 'Remove admin' : 'Make admin', onPress: () => void run(() => setMemberRole(roomId, target.profile_id, target.role === 'admin' ? 'member' : 'admin')) },
      { label: 'Remove from group', destructive: true, onPress: () => setRemoving(target) },
    ] : []),
  ] : [];
  const nickDialog = (
    <PromptDialog
      visible={!!nicking} title="Nickname" label={`What do you call ${nicking?.profiles?.username ?? 'them'}? Only you see this. Leave empty to remove.`}
      initial={nicking ? nicknames.get(nicking.profile_id) ?? '' : ''} submitLabel="Save" maxLength={MAX_NICKNAME}
      onSubmit={async (v) => { await setNickname(nicking!.profile_id, v).catch((e) => { throw new Error(friendlyError(e)); }); await refresh(); }}
      onClose={() => setNicking(null)}
    />
  );

  if (room.is_direct) {
    const other = room.participants.find((p) => p.profile_id !== me);
    const p = other?.profiles;
    return (
      <Screen scroll>
        {back}
        <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
          <Avatar name={title} size={96} index={colorIndex(other?.profile_id ?? roomId)} path={p?.avatar_path} />
          <Text variant="title">{title}</Text>
          {other && nicknames.has(other.profile_id) ? <Text muted>Username: {p?.username}</Text> : null}
          <Text muted>{statusText(other ? statuses.get(other.profile_id) : undefined) ?? ' '}</Text>
          <Text style={{ textAlign: 'center', maxWidth: 360 }}>{p?.bio || 'No bio yet.'}</Text>
          {other ? <Button title={nicknames.has(other.profile_id) ? 'Change nickname' : 'Set nickname'} variant="soft" onPress={() => setNicking(other)} /> : null}
          {other ? <PersonRingtone personId={other.profile_id} name={nameOf(other.profile_id, p?.username ?? 'them')} /> : null}
        </View>
        {env.lunexUrl ? <Button title="Summarize this chat with LUNEX" variant="soft" onPress={() => router.push({ pathname: '/lunex', params: { roomId } })} /> : null}
        <BackgroundPicker roomId={roomId} />
        {nickDialog}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {back}
      <View style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.lg }}>
        <Avatar name={title} size={80} index={colorIndex(roomId)} />
        <Text variant="title" style={{ textAlign: 'center' }}>{title}</Text>
        <Text muted>{room.participants.length} members</Text>
        {iAmAdmin ? <Button title="Rename group" variant="soft" onPress={() => setRenaming(true)} /> : null}
      </View>

      {error ? <Banner kind="error" text={error} /> : null}
      {notice ? <Banner kind="success" text={notice} /> : null}

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Text variant="h2">Members</Text>
        {iAmAdmin ? <Button title="Add members" variant="soft" onPress={() => setAdding(true)} /> : null}
        {room.participants.map((p) => {
          const you = p.profile_id === me;
          const name = nameOf(p.profile_id, p.profiles?.username);
          const st = you ? null : statusText(statuses.get(p.profile_id));
          const canManage = !you;   // everyone can set a private nickname; admins get more actions
          return (
            <Pressable
              key={p.profile_id} disabled={!canManage} accessibilityRole={canManage ? 'button' : 'text'}
              accessibilityLabel={`${name}${you ? ', you' : ''}${p.role === 'admin' ? ', admin' : ''}${st ? `, ${st}` : ''}${canManage ? (iAmAdmin ? '. Tap to manage' : '. Tap for options') : ''}`}
              onPress={() => setTarget(p)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 60, padding: space.md, borderRadius: radius.md, backgroundColor: pressed ? colors.surface2 : colors.surface })}
            >
              <Avatar name={name} size={40} index={colorIndex(p.profile_id)} path={p.profiles?.avatar_path} />
              <View style={{ flex: 1 }}>
                <Text variant="strong" numberOfLines={1}>{name}{you ? ' (you)' : ''}</Text>
                {st ? <Text variant="small" muted numberOfLines={1}>{st}</Text> : null}
              </View>
              {p.role === 'admin' ? <View style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.accentSoft }}><Text variant="small" style={{ color: colors.accent, fontWeight: '700' }}>Admin</Text></View> : null}
            </Pressable>
          );
        })}
      </View>

      <BackgroundPicker roomId={roomId} />
      <View style={{ marginTop: space.xl }}>
        <Button title="Leave group" variant="danger" onPress={() => setLeaving(true)} />
      </View>
      {nickDialog}

      <ActionSheet visible={!!target} title={target ? nameOf(target.profile_id, target.profiles?.username) : undefined} actions={targetActions} onClose={() => setTarget(null)} />
      <ConfirmDialog
        visible={!!removing} title={`Remove ${removing?.profiles?.username ?? 'member'}?`} body="They will no longer see this group." confirmLabel="Remove" destructive
        onConfirm={() => void run(() => removeMember(roomId, removing!.profile_id), 'Member removed.')} onClose={() => setRemoving(null)}
      />
      <ConfirmDialog
        visible={leaving} title="Leave this group?" body="You will stop receiving its messages. If you are the last admin, the longest-standing member becomes admin." confirmLabel="Leave" destructive
        onConfirm={() => { leaveRoom(roomId).then(() => refresh()).then(() => router.replace('/(tabs)')).catch((e) => setError(friendlyError(e))); }} onClose={() => setLeaving(false)}
      />
      <PromptDialog
        visible={renaming} title="Rename group" label="Group name" initial={room.name ?? ''} submitLabel="Save" maxLength={MAX_GROUP_NAME}
        validate={validateGroupName}
        onSubmit={async (v) => { await renameRoom(roomId, v).catch((e) => { throw new Error(friendlyError(e)); }); await refresh(); }}
        onClose={() => setRenaming(false)}
      />
      <PickerModal visible={adding} title="Add members" onClose={() => setAdding(false)}>
        <UserPicker me={me} exclude={room.participants.map((p) => p.profile_id)} autoFocus
          onPick={(u) => { void run(() => addMember(roomId, u.id), `${u.username} added.`); }} />
      </PickerModal>
    </Screen>
  );
}
