import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, TextInput, View } from 'react-native';
import { ActionSheet, ConfirmDialog, PromptDialog } from '@/components/dialogs';
import { MessageBubble } from '@/components/MessageBubble';
import { ReactionBar } from '@/components/ReactionBar';
import { TypingBubble } from '@/components/TypingBubble';
import { Banner, Loading, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { reportMessage, roomTitle } from '@/features/chat/api';
import { useChat } from '@/features/chat/ChatProvider';
import { appendSpoken, commandOf, dictationAvailable, dictationError, startDictation } from '@/features/chat/dictation';
import { saveMessage, scheduleMessage, setReminder } from '@/features/tools/api';
import { scheduleLocalReminder } from '@/features/tools/local';
import { cleanCollection, hoursFromNow, quickTimes } from '@/features/tools/rules';
import { useCall } from '@/features/calls/CallProvider';
import { useGroupCall } from '@/features/calls/GroupCallProvider';
import type { GroupCallRow } from '@/features/calls/groupTypes';
import { onFeed } from '@/features/chat/realtime';
import { buildItems, quoteText, type ChatMsg, type Item } from '@/features/chat/messageList';
import { statusText } from '@/features/chat/presence';
import { summarize } from '@/features/chat/reactions';
import { lastSeenMessageId, readersOf, seenCaption } from '@/features/chat/receipts';
import { useRoom } from '@/features/chat/useRoom';
import { useStatuses } from '@/features/chat/usePresence';
import { useRoomEvents } from '@/features/chat/useRoomEvents';
import { colorIndex } from '@/lib/hash';
import { cleanMessage, friendlyError, MAX_MESSAGE, MAX_REPORT, validateReportReason } from '@/lib/validation';
import { Image } from 'expo-image';
import { colorFor, DIM_LEVELS, IMAGE_ID, resolveBackground } from '@/features/appearance/backgrounds';
import { useBgPrefs } from '@/features/appearance/useBackground';
import { pickDocument, pickFromLibrary, takePhoto, type Choice, type PickResult } from '@/features/media/pick';
import { fmtDuration } from '@/features/media/rules';
import { useVoiceRecorder } from '@/features/media/useVoiceRecorder';
import { StickerPanel, type StickerChoice } from '@/features/stickers/StickerPanel';
import { stickerContent } from '@/features/stickers/logic';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';

export default function ChatRoom() {
  const { roomId, title: titleParam } = useLocalSearchParams<{ roomId: string; title?: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const bgPrefs = useBgPrefs();
  const bgId = resolveBackground(bgPrefs, roomId);
  const bgColor = colorFor(bgId, isDark);
  const bgImage = bgId === IMAGE_ID ? bgPrefs.imageUri : null;
  const { room: getRoom, clearUnread, flags, setFlag, nicknames, nameOf: nameFrom } = useChat();
  const room = getRoom(roomId);
  const calls = useCall();
  const gcalls = useGroupCall();
  const [liveGroup, setLiveGroup] = useState<GroupCallRow | null>(null);

  const roomRef = useRef<{ onReadPing: () => void } | null>(null);
  const events = useRoomEvents(roomId, me, () => roomRef.current?.onReadPing());
  const flagsRef = useRef(flags); flagsRef.current = flags;
  const r = useRoom(roomId, me, { onViewed: () => { clearUnread(roomId); if (flagsRef.current.has(roomId)) setFlag(roomId, false).catch(() => {}); }, sendReadPing: events.sendRead });
  roomRef.current = r;

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [menu, setMenu] = useState<ChatMsg | null>(null);
  const [editing, setEditing] = useState<ChatMsg | null>(null);
  const [deleting, setDeleting] = useState<ChatMsg | null>(null);
  const [reporting, setReporting] = useState<ChatMsg | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attachMenu, setAttachMenu] = useState(false);
  const [stickers, setStickers] = useState(false);
  const [saving, setSaving] = useState<ChatMsg | null>(null);
  const [remindFor, setRemindFor] = useState<ChatMsg | null>(null);
  const [remindCustom, setRemindCustom] = useState<ChatMsg | null>(null);
  const [schedMenu, setSchedMenu] = useState(false);
  const [schedCustom, setSchedCustom] = useState(false);
  const [schedWhen, setSchedWhen] = useState<{ at: Date | null; online: boolean } | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const list = useRef<FlatList<Item>>(null);

  const isDirect = room?.is_direct ?? true;
  const iAmAdmin = room?.participants.find((p) => p.profile_id === me)?.role === 'admin';
  const title = (room ? roomTitle(room, me, nicknames) : titleParam) ?? 'Chat';
  const partnerId = isDirect ? room?.participants.find((p) => p.profile_id !== me)?.profile_id : undefined;
  const statuses = useStatuses(partnerId ? [partnerId] : []);

  const nameOf = useCallback((id: string) => nameFrom(id, room?.participants.find((p) => p.profile_id === id)?.profiles?.username ?? 'Former member'), [room, nameFrom]);
  const nameColor = (id: string) => colors.nameColors[colorIndex(id)];

  useEffect(() => {
    if (isDirect || !gcalls.available) { setLiveGroup(null); return; }
    let alive = true;
    const look = () => { void gcalls.activeFor(roomId).then((c) => { if (alive) setLiveGroup(c); }); };
    look();
    const off = onFeed((e) => { if (e.type === 'gcall' || e.type === 'gmember' || e.type === 'resync') look(); });
    return () => { alive = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isDirect, gcalls.available, gcalls.state.phase]);
  const items = useMemo(() => buildItems(r.msgs ?? [], { me, isDirect }), [r.msgs, me, isDirect]);
  const data = useMemo(() => [...items].reverse(), [items]); // inverted list renders newest at the bottom
  const lastSeenId = useMemo(() => (room && r.msgs ? lastSeenMessageId(r.msgs, room.participants, me, r.reads) : null), [room, r.msgs, me, r.reads]);

  const subtitle = r.error && !r.msgs?.length ? null
    : events.typers.length
      ? (isDirect ? 'typing…' : `${events.typers.map(nameOf).join(', ')} ${events.typers.length > 1 ? 'are' : 'is'} typing…`)
      : isDirect ? statusText(partnerId ? statuses.get(partnerId) : undefined)
      : room ? `${room.participants.length} members` : null;

  const [dictating, setDictating] = useState(false);
  const [interim, setInterim] = useState('');
  const draftRef = useRef(draft); draftRef.current = draft;
  const stopDictation = useRef<(() => void) | null>(null);
  const submitRef = useRef<() => void>(() => {});
  useEffect(() => () => { stopDictation.current?.(); }, []);
  function toggleDictation() {
    if (dictating) { stopDictation.current?.(); return; }
    setAttachError(null);
    setDictating(true);
    const lang = (() => { try { return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US'; } catch { return 'en-US'; } })();
    stopDictation.current = startDictation({
      lang,
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim('');
        const cmd = commandOf(text);
        if (cmd === 'send') submitRef.current();
        else if (cmd === 'clear') setDraft('');
        else if (cmd === 'stop') stopDictation.current?.();
        else if (text) setDraft(appendSpoken(draftRef.current, text).slice(0, MAX_MESSAGE));
      },
      onError: (code) => { const m = dictationError(code); if (m) setAttachError(m); },
      onEnd: () => { setDictating(false); setInterim(''); stopDictation.current = null; },
    });
  }

  function onChangeDraft(v: string) {
    setDraft(v);
    if (v) void events.sendTyping();
  }

  function submit() {
    if (!cleanMessage(draft)) return;
    if (r.send(draft, replyTo?.id ?? null)) { setDraft(''); setReplyTo(null); setNotice(null); }
  }

  submitRef.current = submit;

  function sendChoice(c: Choice, caption: string) {
    r.sendFile(c.picked, c.mime, caption, replyTo?.id ?? null, c.fallback);
    setReplyTo(null); setNotice(null);
  }
  async function attach(pick: () => Promise<PickResult>) {
    setAttachError(null);
    try {
      if (Platform.OS === 'ios') await new Promise((ok) => setTimeout(ok, 400)); // let the sheet finish dismissing before the system picker opens
      const res = await pick();
      if (!res) return;
      if ('error' in res) { setAttachError(res.error); return; }
      const caption = cleanMessage(draft) ?? '';
      sendChoice(res.choice, caption);
      if (caption) setDraft('');
    } catch (e) { setAttachError(friendlyError(e)); }
  }
  function sendSticker(c: StickerChoice) {
    setStickers(false); setAttachError(null);
    if (c.kind === 'link') r.send(stickerContent(c.item.url), replyTo?.id ?? null);
    else r.sendFile({ uri: c.uri, name: 'sticker.webp', mime: 'image/webp', size: null }, 'image/webp', '', replyTo?.id ?? null, 'sticker.webp');
    setReplyTo(null); setNotice(null);
  }
  const voice = useVoiceRecorder((c) => sendChoice(c, ''));

  function jumpTo(id: string) {
    const index = data.findIndex((it) => it.kind === 'msg' && it.msg.id === id);
    if (index < 0) { setNotice('That message is further back. Scroll up to load older messages.'); return; }
    list.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  }


  async function remind(m: ChatMsg, when: Date) {
    try {
      await setReminder(m.id, when);
      void scheduleLocalReminder(m.id, when, m, roomId);
      setNotice('Reminder set.');
    } catch (e) { setAttachError(friendlyError(e)); }
  }

  const menuMine = menu?.sender_id === me;
  const menuActions = menu ? [
    { label: 'Reply', onPress: () => setReplyTo(menu) },
    { label: 'Save', onPress: () => setSaving(menu) },
    { label: 'Remind me', onPress: () => setRemindFor(menu) },
    ...(menu.content?.trim() ? [{ label: 'Copy text', onPress: () => { void Clipboard.setStringAsync(menu.content); } }] : []),
    ...(menuMine && menu.content?.trim() ? [{ label: 'Edit', onPress: () => setEditing(menu) }] : []),
    ...(menuMine || iAmAdmin ? [{ label: 'Delete', destructive: true, onPress: () => setDeleting(menu) }] : []),
    ...(!menuMine ? [{ label: 'Report', destructive: true, onPress: () => setReporting(menu) }] : []),
  ] : [];

  const renderItem = ({ item }: { item: Item }) => {
    if (item.kind === 'day') {
      return <View style={{ alignSelf: 'center', marginVertical: space.md, paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surface2 }}>
        <Text variant="small" muted>{item.label}</Text>
      </View>;
    }
    const m = item.msg;
    const mine = m.sender_id === me;
    const target = m.reply_to ? (r.msgs?.find((x) => x.id === m.reply_to) ?? r.replyCache.get(m.reply_to)) : undefined;
    const seen = mine && !!room && readersOf(m, room.participants, me, r.reads).length > 0;
    return (
      <MessageBubble
        msg={m} mine={mine} grouped={item.grouped}
        senderName={item.showName ? nameOf(m.sender_id) : null} a11yName={nameOf(m.sender_id)} senderColor={nameColor(m.sender_id)}
        quote={m.reply_to ? { sender: target ? nameOf(target.sender_id) : 'Message', target } : null}
        chips={summarize(r.reactions.get(m.id), me)}
        seen={seen}
        seenCaption={seen && m.id === lastSeenId && room ? seenCaption(room.is_direct, readersOf(m, room.participants, me, r.reads).length) : null}
        onLongPress={setMenu} onChip={(msg, e) => void r.react(msg.id, e)} onQuote={jumpTo} onRetry={r.retry} onDiscard={r.discard}
      />
    );
  };

  return (
    <Screen style={{ padding: 0, ...(bgColor ? { backgroundColor: bgColor } : {}) }}>
      {bgImage ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Image source={{ uri: bgImage }} contentFit="cover" style={{ flex: 1 }} />
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', opacity: DIM_LEVELS[bgPrefs.dim] }} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH + 8, justifyContent: 'center', alignItems: 'center' }}>
          <Text variant="title" style={{ color: colors.accent, lineHeight: 34 }}>‹</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle ?? ''}. Open chat info`}
          onPress={() => router.push({ pathname: '/chat/[roomId]/info', params: { roomId } })}
          style={{ flex: 1, minHeight: MIN_TOUCH + 8, justifyContent: 'center' }}
        >
          <Text variant="strong" numberOfLines={1}>{title}</Text>
          {subtitle ? <Text variant="small" style={{ color: events.typers.length ? colors.accent : colors.muted }} numberOfLines={1}>{subtitle}</Text> : null}
        </Pressable>
        {isDirect && partnerId ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Watch together" onPress={() => router.push({ pathname: '/chat/[roomId]/watch', params: { roomId } })} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>🎬</Text>
          </Pressable>
        ) : null}
        {isDirect && partnerId ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Play a game" onPress={() => router.push({ pathname: '/chat/[roomId]/game', params: { roomId } })} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>🎮</Text>
          </Pressable>
        ) : null}
        {!isDirect && room && gcalls.available ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Start a group voice call" onPress={async () => setAttachError(await gcalls.start(roomId, 'voice'))} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>📞</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Start a group video call" onPress={async () => setAttachError(await gcalls.start(roomId, 'video'))} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>🎥</Text>
            </Pressable>
          </>
        ) : null}
        {isDirect && partnerId && calls.available ? (
          <>
            <Pressable accessibilityRole="button" accessibilityLabel="Start a voice call" onPress={async () => setAttachError(await calls.call(partnerId, 'voice'))} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>📞</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Start a video call" onPress={async () => setAttachError(await calls.call(partnerId, 'video'))} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20 }}>🎥</Text>
            </Pressable>
          </>
        ) : null}
      </View>

      {liveGroup && gcalls.state.phase === 'idle' && gcalls.available ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`A group ${liveGroup.kind} call is running. Join`} onPress={async () => setAttachError(await gcalls.join(liveGroup.id))}
          style={{ margin: space.sm, minHeight: MIN_TOUCH, borderRadius: radius.md, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md }}>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>A group {liveGroup.kind} call is running</Text>
          <Text style={{ color: colors.accent, fontWeight: '700' }}>Join</Text>
        </Pressable>
      ) : null}
      {gcalls.notice ? <View style={{ padding: space.sm }}><Banner kind="success" text={gcalls.notice} /></View> : null}
      {r.error ? <View style={{ padding: space.sm }}><Banner kind="error" text={r.error} /></View> : null}
      {notice ? <View style={{ padding: space.sm }}><Banner kind="success" text={notice} /></View> : null}
      {attachError || voice.error ? <View style={{ padding: space.sm }}><Banner kind="error" text={(attachError ?? voice.error)!} /></View> : null}

      {r.msgs === null ? <Loading /> : (
        <FlatList
          ref={list} data={data} inverted keyExtractor={(it) => it.key} renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: space.md, paddingVertical: space.sm }}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
          onEndReached={() => void r.loadMore()} onEndReachedThreshold={0.4}
          onScrollToIndexFailed={(i) => { setTimeout(() => list.current?.scrollToOffset({ offset: i.averageItemLength * i.index, animated: true }), 100); }}
          ListHeaderComponent={events.typers.length ? <TypingBubble /> : undefined}
          ListFooterComponent={r.loadingOlder ? <ActivityIndicator color={colors.accent} accessibilityLabel="Loading older messages" style={{ padding: space.lg }} /> : r.hasMore ? undefined : (
            <Text variant="small" muted style={{ textAlign: 'center', paddingVertical: space.lg }}>{r.msgs.length ? 'Start of conversation' : 'No messages yet. Say hello!'}</Text>
          )}
        />
      )}

      {replyTo ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ width: 3, alignSelf: 'stretch', backgroundColor: colors.gold, borderRadius: 2 }} />
          <View style={{ flex: 1 }}>
            <Text variant="small" style={{ fontWeight: '700' }} numberOfLines={1}>Replying to {replyTo.sender_id === me ? 'yourself' : nameOf(replyTo.sender_id)}</Text>
            <Text variant="small" muted numberOfLines={1}>{quoteText(replyTo)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel reply" onPress={() => setReplyTo(null)} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="h2" muted>×</Text>
          </Pressable>
        </View>
      ) : null}

      {voice.recording ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel recording" onPress={() => void voice.cancel()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLiveRegion="polite">
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.danger }} />
            <Text accessibilityLabel={`Recording, ${fmtDuration(voice.elapsedMs)}`}>{fmtDuration(voice.elapsedMs)}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Send voice note" onPress={() => void voice.send()}
            style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 20 }}>↑</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Attach a photo, video or file" onPress={() => setAttachMenu(true)} disabled={r.msgs === null}
            style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: colors.accent, fontSize: 24, lineHeight: 28 }}>+</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Stickers" onPress={() => setStickers(true)} disabled={r.msgs === null}
            style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>🙂</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Send a message later" onPress={() => setSchedMenu(true)} disabled={r.msgs === null}
            style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 20 }}>⏰</Text>
          </Pressable>
          {dictationAvailable() ? (
            <Pressable accessibilityRole="button" accessibilityLabel={dictating ? 'Stop dictation' : 'Dictate a message'} accessibilityState={{ selected: dictating }}
              accessibilityHint="Speak and your words are typed into the message box" onPress={toggleDictation} disabled={r.msgs === null}
              style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: dictating ? colors.accent : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 20, color: dictating ? colors.accentText : colors.text }}>{dictating ? '■' : '🗣'}</Text>
            </Pressable>
          ) : null}
          <TextInput
            accessibilityLabel="Message" value={draft} onChangeText={onChangeDraft} multiline maxLength={MAX_MESSAGE}
            editable={r.msgs !== null} placeholder="Message" placeholderTextColor={colors.muted}
            onKeyPress={Platform.OS === 'web' ? (e) => {
              const n = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
              if (n.key === 'Enter' && !n.shiftKey) { (e as unknown as { preventDefault?: () => void }).preventDefault?.(); submit(); }
            } : undefined}
            style={[type.body, { flex: 1, maxHeight: 120, minHeight: MIN_TOUCH, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5, borderRadius: radius.lg, paddingHorizontal: space.md, paddingVertical: space.sm }]}
          />
          {cleanMessage(draft) ? (
            <Pressable
              accessibilityRole="button" accessibilityLabel="Send" onPress={submit}
              style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 20 }}>↑</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel="Record a voice note" accessibilityHint="Starts recording. Tap send when finished." onPress={() => { setAttachError(null); void voice.start(); }} disabled={r.msgs === null}
              style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.accentText, fontSize: 20 }}>🎤</Text>
            </Pressable>
          )}
        </View>
      )}

      {dictating && interim ? <Text variant="small" muted numberOfLines={2} style={{ paddingHorizontal: space.md }}>Hearing: {interim}</Text> : null}
      {stickers ? <StickerPanel me={me} onPick={sendSticker} onClose={() => setStickers(false)} /> : null}
      <ActionSheet
        visible={attachMenu} onClose={() => setAttachMenu(false)} title="Attach"
        actions={[
          { label: 'Photo or video', onPress: () => void attach(pickFromLibrary) },
          { label: 'Camera', onPress: () => void attach(takePhoto) },
          { label: 'File', onPress: () => void attach(pickDocument) },
        ]}
      />
      <ActionSheet
        visible={!!menu} onClose={() => setMenu(null)} actions={menuActions}
        title={menu ? quoteText(menu) : undefined}
        header={menu ? <ReactionBar current={r.reactions.get(menu.id)?.get(me)} onPick={(e) => { const id = menu.id; setMenu(null); void r.react(id, e); }} /> : undefined}
      />
      <PromptDialog
        visible={!!editing} title="Edit message" label="Message" initial={editing?.content ?? ''} submitLabel="Save" maxLength={MAX_MESSAGE} multiline
        validate={(v) => (cleanMessage(v) ? null : 'Messages must be 1 to 1000 characters.')}
        onSubmit={async (v) => { if (editing && v.trim() !== editing.content) await r.edit(editing.id, v).catch((e) => { throw new Error(friendlyError(e)); }); }}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        visible={!!deleting} title="Delete message?" body="This removes it for everyone in the chat." confirmLabel="Delete" destructive
        onConfirm={() => { const m = deleting!; r.remove(m.id).catch((e) => r.setError(friendlyError(e))); }} onClose={() => setDeleting(null)}
      />
      <PromptDialog
        visible={!!saving} title="Save message" label="Collection (leave as Saved if unsure)" initial="Saved" submitLabel="Save" maxLength={30}
        validate={(v) => { const c = cleanCollection(v); return c.ok ? null : c.error; }}
        onSubmit={async (v) => { const c = cleanCollection(v); if (c.ok && saving) { await saveMessage(saving.id, c.value).catch((e) => { throw new Error(friendlyError(e)); }); setNotice('Saved. Find it under Tools.'); } }}
        onClose={() => setSaving(null)}
      />
      <ActionSheet visible={!!remindFor} title="Remind me about this message" onClose={() => setRemindFor(null)} actions={[
        ...quickTimes().map((q) => ({ label: q.label, onPress: () => void remind(remindFor!, q.date) })),
        { label: 'In a number of hours…', onPress: () => setRemindCustom(remindFor) },
      ]} />
      <PromptDialog
        visible={!!remindCustom} title="Remind me in…" label="Hours from now (for example 3 or 0.5)" submitLabel="Set reminder" maxLength={6}
        validate={(v) => { const h = hoursFromNow(v); return h.ok ? null : h.error; }}
        onSubmit={async (v) => { const h = hoursFromNow(v); if (h.ok && remindCustom) await remind(remindCustom, h.date); }}
        onClose={() => setRemindCustom(null)}
      />
      <ActionSheet visible={schedMenu} title="Send later" onClose={() => setSchedMenu(false)} actions={[
        ...quickTimes().map((q) => ({ label: q.label, onPress: () => setSchedWhen({ at: q.date, online: false }) })),
        { label: 'In a number of hours…', onPress: () => setSchedCustom(true) },
        ...(isDirect ? [{ label: 'When they come online', onPress: () => setSchedWhen({ at: null, online: true }) }] : []),
      ]} />
      <PromptDialog
        visible={schedCustom} title="Send in…" label="Hours from now (for example 3 or 0.5)" submitLabel="Next" maxLength={6}
        validate={(v) => { const h = hoursFromNow(v); return h.ok ? null : h.error; }}
        onSubmit={(v) => { const h = hoursFromNow(v); if (h.ok) setSchedWhen({ at: h.date, online: false }); }}
        onClose={() => setSchedCustom(false)}
      />
      <PromptDialog
        visible={!!schedWhen} title="Message to send later" label="Message" initial={draft} submitLabel="Schedule" maxLength={MAX_MESSAGE} multiline
        validate={(v) => (cleanMessage(v) ? null : 'Messages must be 1 to 1000 characters.')}
        onSubmit={async (v) => {
          const w = schedWhen!;
          await scheduleMessage({ room: roomId, content: v.trim(), at: w.at, whenOnline: w.online, replyTo: replyTo?.id ?? null }).catch((e) => { throw new Error(friendlyError(e)); });
          if (v.trim() === draft.trim()) setDraft('');
          setReplyTo(null); setNotice(w.online ? 'It will send when they come online.' : 'Scheduled. See it under Tools.');
        }}
        onClose={() => setSchedWhen(null)}
      />
      <PromptDialog
        visible={!!reporting} title="Report message" label="What is wrong with it?" submitLabel="Send report" maxLength={MAX_REPORT} multiline
        validate={validateReportReason}
        onSubmit={async (v) => { await reportMessage(reporting!.id, v).catch((e) => { throw new Error(friendlyError(e)); }); setNotice('Report sent. Thank you.'); }}
        onClose={() => setReporting(null)}
      />
    </Screen>
  );
}
