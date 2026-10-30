import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, TextInput, View } from 'react-native';
import { ConfirmDialog } from '@/components/dialogs';
import { Avatar, Banner, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { loadMessages } from '@/features/chat/api';
import { useChat } from '@/features/chat/ChatProvider';
import { chatContext, LunexError, MAX_MESSAGE, safeHref, type Turn } from '@/features/lunex/client';
import { lunex } from '@/features/lunex/instance';
import { loadTurns, saveTurns } from '@/features/lunex/store';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';

const CHIPS = [
  { text: 'How do I make a group call?', send: true }, { text: 'Research: ', label: 'Research a topic', send: false },
  { text: '/translate zulu: good morning', label: 'Translate', send: true }, { text: '/calc 15% of 240', label: 'Quick maths', send: true }, { text: '/help', label: 'What can you do?', send: true },
];

export default function Lunex() {
  const { session } = useAuth(); const me = session!.user.id;
  const { roomId } = useLocalSearchParams<{ roomId?: string }>();
  const router = useRouter(); const { colors } = useTheme();
  const { room, nameOf } = useChat();
  const [turns, setTurns] = useState<Turn[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(''); const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);
  const turnsRef = useRef<Turn[]>([]); const asked = useRef(false); const abort = useRef<AbortController | null>(null);

  useEffect(() => { lunex.wake(); void loadTurns(me).then((t) => { turnsRef.current = t; setTurns(t); }); return () => abort.current?.abort(); }, [me]);

  async function send(text: string, extra: { skill?: string; context?: unknown; display?: string } = {}) {
    const message = text.trim();
    if (!message || busy) return;
    if (message.length > MAX_MESSAGE) { setError(`Messages are limited to ${MAX_MESSAGE} characters.`); return; }
    setError(null); setBusy(true); setLive(''); setStatus('Thinking…'); setDraft('');
    const history = turnsRef.current;
    const withUser = [...history, { role: 'user' as const, text: extra.display ?? message }];
    turnsRef.current = withUser; setTurns(withUser);
    const ctl = new AbortController(); abort.current = ctl;
    try {
      const r = await lunex.ask(message, { history, skill: extra.skill, context: extra.context, signal: ctl.signal, onStatus: setStatus, onDelta: (d) => setLive((x) => x + d) });
      const next = [...withUser, { role: 'assistant' as const, text: r.reply || 'I do not have an answer for that.', sources: r.sources }];
      turnsRef.current = next; setTurns(next); void saveTurns(me, next);
      if (r.remainingToday != null) setLeft(r.remainingToday);
    } catch (e) {
      if (ctl.signal.aborted) { void saveTurns(me, withUser); return; }   // I pressed Stop: not an error
      const m = e instanceof LunexError ? (e.status === 429 && e.retryAfter ? `${e.message} Try again in ${e.retryAfter} seconds.` : e.message) : friendlyError(e);
      setError(m); void saveTurns(me, withUser);
    } finally { setBusy(false); setLive(''); setStatus(null); abort.current = null; }
  }

  // "Summarize this chat" arrives with a roomId; do it once
  useEffect(() => {
    if (!roomId || turns === null || asked.current) return;
    asked.current = true;
    void (async () => {
      try {
        const r = room(roomId); const { messages } = await loadMessages(roomId, 150);
        const nm = (id: string) => nameOf(id, r?.participants.find((p) => p.profile_id === id)?.profiles?.username ?? 'Someone');
        const context = chatContext([...messages].reverse().map((m) => ({ sender_id: m.sender_id, content: m.content, deleted_at: (m as { deleted_at?: string | null }).deleted_at })), nm);
        if (!context.messages.length) { setError('There are no text messages to summarize yet.'); return; }
        await send('Summarize this chat', { skill: 'summarize', context, display: `Summarize this chat (last ${context.messages.length} messages)` });
      } catch (e) { setError(friendlyError(e)); }
    })();
  }, [roomId, turns]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo(() => [...(turns ?? []), ...(busy && live ? [{ role: 'assistant' as const, text: live }] : [])].reverse(), [turns, busy, live]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}><Text variant="title" style={{ color: colors.accent }}>‹</Text></Pressable>
        <Avatar name="LUNEX" size={36} index={3} />
        <View style={{ flex: 1 }}><Text variant="strong">LUNEX</Text><Text variant="small" muted>{left != null ? `${left} messages left today` : 'AI assistant'}</Text></View>
        {turns?.length ? <Pressable accessibilityRole="button" accessibilityLabel="Clear conversation" onPress={() => setClearing(true)} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}><Text>🗑</Text></Pressable> : null}
      </View>
      {error ? <Banner kind="error" text={error} /> : null}
      <FlatList
        style={{ flex: 1 }} data={data} inverted keyExtractor={(_, i) => String(i)} accessibilityLabel="Conversation with LUNEX"
        ListEmptyComponent={turns !== null && !busy ? (
          <View style={{ gap: space.sm, padding: space.md, transform: [{ scaleY: -1 }] }}>
            <Text muted>Ask me anything: answers, research, summaries, translations, quick maths.</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {CHIPS.map((c) => (
                <Pressable key={c.text} accessibilityRole="button" onPress={() => (c.send ? void send(c.text) : setDraft(c.text))} style={{ minHeight: MIN_TOUCH, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' }}><Text>{c.label ?? c.text}</Text></Pressable>
              ))}
            </View>
          </View>
        ) : undefined}
        renderItem={({ item }) => {
          const mine = item.role === 'user';
          return (
            <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', marginVertical: 4, padding: space.md, borderRadius: radius.lg, backgroundColor: mine ? colors.own : colors.other }}>
              <Text selectable accessibilityLabel={`${mine ? 'You' : 'LUNEX'}: ${item.text}`} style={{ color: mine ? colors.ownText : colors.otherText }}>{item.text}</Text>
              {item.sources?.length ? (
                <View style={{ marginTop: space.sm, gap: 2 }}>
                  <Text variant="small" muted>Sources</Text>
                  {item.sources.map((s, i) => { const href = s.url ? safeHref(s.url) : null; return href
                    ? <Pressable key={i} accessibilityRole="link" onPress={() => void Linking.openURL(href)} style={{ minHeight: 32, justifyContent: 'center' }}><Text variant="small" style={{ color: colors.accent, textDecorationLine: 'underline' }}>{s.title}</Text></Pressable>
                    : <Text key={i} variant="small" muted>{s.title}</Text>; })}
                </View>
              ) : null}
            </View>
          );
        }}
        ListHeaderComponent={busy ? <Text accessibilityLiveRegion="polite" muted style={{ padding: space.sm }}>{status ?? 'Thinking…'}</Text> : undefined}
      />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingTop: space.sm }}>
        <TextInput accessibilityLabel="Message LUNEX" value={draft} onChangeText={setDraft} multiline maxLength={MAX_MESSAGE} editable={!busy} placeholder="Message LUNEX…" placeholderTextColor={colors.muted}
          style={[type.body, { flex: 1, maxHeight: 120, minHeight: MIN_TOUCH, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm }]} />
        <Pressable accessibilityRole="button" accessibilityLabel={busy ? 'Stop' : 'Send message'} onPress={() => (busy ? abort.current?.abort() : void send(draft))} disabled={!busy && !draft.trim()}
          style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: !busy && !draft.trim() ? 0.5 : 1 }}>
          <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 20 }}>{busy ? '■' : '↑'}</Text>
        </Pressable>
      </View>
      <Text variant="small" muted style={{ textAlign: 'center', paddingVertical: space.xs }}>LUNEX is an AI and can make mistakes. Don't share passwords or secrets. Messages here are sent to LUNEX and its AI provider.</Text>
      <ConfirmDialog visible={clearing} title="Clear conversation?" body="This removes it from this phone." confirmLabel="Clear" destructive onClose={() => setClearing(false)}
        onConfirm={() => { turnsRef.current = []; setTurns([]); void saveTurns(me, []); }} />
    </Screen>
  );
}
