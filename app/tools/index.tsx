import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, TextInput, View } from 'react-native';
import { Banner, Button, EmptyState, Screen, Text } from '@/components/ui';
import { useChat } from '@/features/chat/ChatProvider';
import { cancelLocalReminder } from '@/features/tools/local';
import { listReminders, listSaved, listScheduled, removeReminder, removeSaved, removeScheduled, searchMessages, type MsgLite, type Reminder, type Saved, type Scheduled } from '@/features/tools/api';
import { groupByCollection, previewText, validateSearch, whenLabel, type SearchKind } from '@/features/tools/rules';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

type Tab = 'saved' | 'reminders' | 'scheduled' | 'search';
const TABS: { id: Tab; label: string }[] = [{ id: 'saved', label: 'Saved' }, { id: 'reminders', label: 'Reminders' }, { id: 'scheduled', label: 'Scheduled' }, { id: 'search', label: 'Search' }];

function Row({ title, sub, onOpen, onRemove, removeLabel = 'Remove' }: { title: string; sub?: string; onOpen?: () => void; onRemove?: () => void; removeLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: MIN_TOUCH + 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${sub ?? ''}. Open chat`} onPress={onOpen} style={{ flex: 1, paddingVertical: space.sm }}>
        <Text numberOfLines={2}>{title}</Text>
        {sub ? <Text variant="small" muted>{sub}</Text> : null}
      </Pressable>
      {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={removeLabel} onPress={onRemove} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.danger }}>✕</Text></Pressable> : null}
    </View>
  );
}

export default function Tools() {
  const router = useRouter();
  const { colors } = useTheme();
  const { rooms, room } = useChat();
  const [tab, setTab] = useState<Tab>('saved');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [rem, setRem] = useState<Reminder[] | null>(null);
  const [sch, setSch] = useState<Scheduled[] | null>(null);
  const [q, setQ] = useState(''); const [kind, setKind] = useState<SearchKind>('text');
  const [hits, setHits] = useState<MsgLite[] | null>(null); const [busy, setBusy] = useState(false);

  const roomName = useCallback((id: string) => room(id)?.name ?? (room(id)?.notes_owner ? 'Notes to self' : 'Chat'), [room]);
  const open = (roomId: string) => router.push({ pathname: '/chat/[roomId]', params: { roomId } });
  const guard = async (fn: () => Promise<void>) => { setError(null); try { await fn(); } catch (e) { setError(friendlyError(e)); } };

  useEffect(() => {
    void guard(async () => {
      if (tab === 'saved') setSaved(await listSaved());
      else if (tab === 'reminders') setRem(await listReminders());
      else if (tab === 'scheduled') setSch(await listScheduled());
    });
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  void rooms;

  async function runSearch() {
    const bad = validateSearch(q, kind); if (bad) { setError(bad); return; }
    setBusy(true); await guard(async () => { setHits(await searchMessages(q, kind)); }); setBusy(false);
  }

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}><Text variant="title" style={{ color: colors.accent }}>‹</Text></Pressable>
        <Text variant="title">Tools</Text>
      </View>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: space.xs, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <Pressable key={t.id} accessibilityRole="tab" accessibilityState={{ selected: tab === t.id }} onPress={() => { setError(null); setTab(t.id); }}
            style={{ minHeight: MIN_TOUCH, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: tab === t.id ? colors.accent : colors.surface2 }}>
            <Text style={{ color: tab === t.id ? colors.accentText : colors.text }}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Banner kind="error" text={error} /> : null}

      {tab === 'saved' ? (saved === null ? <ActivityIndicator accessibilityLabel="Loading" /> : !saved.length
        ? <EmptyState title="Nothing saved" body="Press and hold a message in a chat and choose Save." />
        : <FlatList data={groupByCollection(saved)} keyExtractor={(g) => g.name} renderItem={({ item: g }) => (
          <View style={{ marginBottom: space.lg }}>
            <Text variant="strong" accessibilityRole="header">{g.name} ({g.items.length})</Text>
            {g.items.map((s) => <Row key={s.id} title={previewText(s.messages)} sub={s.messages ? roomName(s.messages.room_id) : undefined}
              onOpen={() => s.messages && open(s.messages.room_id)} removeLabel="Remove from saved"
              onRemove={() => void guard(async () => { await removeSaved(s.id); setSaved((x) => x?.filter((i) => i.id !== s.id) ?? x); })} />)}
          </View>
        )} />) : null}

      {tab === 'reminders' ? (rem === null ? <ActivityIndicator accessibilityLabel="Loading" /> : !rem.length
        ? <EmptyState title="No reminders" body="Press and hold a message and choose Remind me." />
        : <FlatList data={rem} keyExtractor={(r) => r.id} renderItem={({ item: r }) => (
          <Row title={previewText(r.messages)} sub={`${whenLabel(r.remind_at)} · ${r.messages ? roomName(r.messages.room_id) : ''}`} onOpen={() => r.messages && open(r.messages.room_id)} removeLabel="Delete reminder"
            onRemove={() => void guard(async () => { await removeReminder(r.id); if (r.messages) void cancelLocalReminder(r.messages.id); setRem((x) => x?.filter((i) => i.id !== r.id) ?? x); })} />
        )} />) : null}

      {tab === 'scheduled' ? (sch === null ? <ActivityIndicator accessibilityLabel="Loading" /> : !sch.length
        ? <EmptyState title="Nothing scheduled" body="In a chat, tap the clock button next to the message box to send later." />
        : <FlatList data={sch} keyExtractor={(s) => s.id} renderItem={({ item: s }) => (
          <Row title={s.content}
            sub={`${roomName(s.room_id)} · ${s.status === 'pending' ? (s.when_online ? 'When they come online' : whenLabel(s.send_at)) : s.status === 'sent' ? 'Sent' : s.status === 'expired' ? 'Expired' : `Failed${s.error ? `: ${s.error}` : ''}`}`}
            onOpen={() => open(s.room_id)} removeLabel={s.status === 'pending' ? 'Cancel scheduled message' : 'Remove from list'}
            onRemove={() => void guard(async () => { await removeScheduled(s.id); setSch((x) => x?.filter((i) => i.id !== s.id) ?? x); })} />
        )} />) : null}

      {tab === 'search' ? (
        <View style={{ gap: space.sm, flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: space.xs }}>
            {(['text', 'files', 'links'] as SearchKind[]).map((k) => (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected: kind === k }} onPress={() => { setKind(k); setHits(null); }}
                style={{ minHeight: MIN_TOUCH, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: 'center', borderWidth: 1, borderColor: kind === k ? colors.accent : colors.border }}>
                <Text>{k === 'text' ? 'Messages' : k === 'files' ? 'Files' : 'Links'}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput accessibilityLabel="Search text" value={q} onChangeText={setQ} onSubmitEditing={() => void runSearch()} returnKeyType="search" maxLength={100}
            placeholder={kind === 'text' ? 'Search your messages' : 'Optional: filter by name'} placeholderTextColor={colors.muted}
            style={{ minHeight: MIN_TOUCH, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.md, color: colors.text }} />
          <Button title="Search" onPress={() => void runSearch()} loading={busy} />
          {hits === null ? null : !hits.length ? <EmptyState title="No results" /> : (
            <FlatList data={hits} keyExtractor={(m) => m.id} renderItem={({ item: m }) => <Row title={previewText(m)} sub={`${roomName(m.room_id)} · ${m.created_at.slice(0, 10)}`} onOpen={() => open(m.room_id)} />} />
          )}
        </View>
      ) : null}
    </Screen>
  );
}
