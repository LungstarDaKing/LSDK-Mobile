import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { Avatar, Banner, Button, EmptyState, Screen, Text } from '@/components/ui';
import { ConfirmDialog } from '@/components/dialogs';
import { useAuth } from '@/features/auth/AuthProvider';
import { clearCallLog, loadCallLog } from '@/features/calls/api';
import { useCall } from '@/features/calls/CallProvider';
import { clearGroupCallLog, loadGroupCallLog } from '@/features/calls/groupApi';
import { useGroupCall } from '@/features/calls/GroupCallProvider';
import { describeCall, describeGroupCall, type LogItem } from '@/features/calls/log';
import { ageLabel } from '@/features/status/stories';
import { useChat } from '@/features/chat/ChatProvider';
import { friendlyError } from '@/lib/validation';
import { colorIndex } from '@/lib/hash';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, space } from '@/theme/tokens';

export default function Calls() {
  const { session } = useAuth(); const me = session!.user.id;
  const { colors } = useTheme();
  const c = useCall(); const g = useGroupCall();
  const { nameOf } = useChat();
  const [items, setItems] = useState<LogItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    try {
      const one = (await loadCallLog()).map((r) => describeCall(r, me));
      const grp = (await loadGroupCallLog().catch(() => [])).map((r) => describeGroupCall(r, me)).filter((x): x is LogItem => !!x);
      setItems([...one, ...grp].sort((a, b) => b.when.localeCompare(a.when))); setError(null);
    } catch (e) { setError(friendlyError(e)); setItems((x) => x ?? []); }
  }, [me]);
  useEffect(() => { void load(); }, [load, c.endedCount, g.endedCount]);

  async function ring(i: LogItem) {
    const msg = i.group ? await g.start(i.group.roomId, i.kind) : await c.call(i.peerId, i.kind);
    if (msg) setError(msg);
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="title">Calls</Text>
        {items?.length ? <Button title="Clear" variant="soft" onPress={() => setClearing(true)} /> : null}
      </View>
      {!c.available ? <Banner kind="error" text="Calls are not available here. In a browser, use a recent Chrome, Edge, Safari or Firefox. On a phone they need the development build of the app, not Expo Go." /> : null}
      {c.notice ? <Banner kind="success" text={c.notice} /> : null}
      {g.notice ? <Banner kind="success" text={g.notice} /> : null}
      {error ? <Banner kind="error" text={error} /> : null}
      {items === null ? <ActivityIndicator accessibilityLabel="Loading calls" /> : items.length === 0 ? (
        <EmptyState title="No calls yet" body="Open a chat and tap the phone or camera button. You can call someone once you have both sent each other a message." />
      ) : (
        <FlatList data={items} keyExtractor={(i) => i.id} renderItem={({ item }) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.group ? item.peerName : nameOf(item.peerId, item.peerName)}, ${item.label}, ${ageLabel(item.when)}. Call back`}
            onPress={() => void ring(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: MIN_TOUCH + 12 }}>
            <Avatar name={item.peerName} index={colorIndex(item.peerId)} path={item.avatar} />
            <View style={{ flex: 1 }}>
              <Text variant="strong" style={item.missed ? { color: colors.danger } : undefined}>{item.group ? `👥 ${item.peerName}` : nameOf(item.peerId, item.peerName)}</Text>
              <Text variant="small" muted>{item.kind === 'video' ? 'Video' : 'Voice'} · {item.label} · {ageLabel(item.when)}</Text>
            </View>
            <Text style={{ color: colors.accent }}>{item.kind === 'video' ? '🎥' : '📞'}</Text>
          </Pressable>
        )} />
      )}
      <ConfirmDialog visible={clearing} title="Clear call history?" body="This only clears it for you." confirmLabel="Clear" destructive
        onClose={() => setClearing(false)}
        onConfirm={async () => { try { await clearCallLog(); await clearGroupCallLog().catch(() => {}); await load(); } catch (e) { setError(friendlyError(e)); } }} />
    </Screen>
  );
}
