import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { VideoBox, VoicePlayer } from '@/components/Attachment';
import { ActionSheet, ConfirmDialog, PickerModal, PromptDialog } from '@/components/dialogs';
import { Avatar, Banner, Button, EmptyState, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useChat } from '@/features/chat/ChatProvider';
import { useSignedUrl } from '@/features/media/useSignedUrl';
import { commentOnStory, deleteStory, getActivity, getViewers, likeStory, markViewed, reportStory, type Activity, type Viewer } from '@/features/status/api';
import { AUTO_ADVANCE_MS, ageLabel, autoAdvances, bgColor, timeLeftLabel, type Story } from '@/features/status/stories';
import { useStatus } from '@/features/status/useStatus';
import { colorIndex } from '@/lib/hash';
import { friendlyError, validateReportReason } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';

function Content({ s, onReady }: { s: Story; onReady: () => void }) {
  const { colors } = useTheme();
  const { url, failed } = useSignedUrl('stories', s.attachment_path);
  useEffect(() => { if (s.kind === 'text' || s.kind === 'video' || s.kind === 'audio' || failed) onReady(); }, [s.id, s.kind, failed, onReady]);
  if (s.kind === 'text') {
    return (
      <View style={{ flex: 1, backgroundColor: bgColor(s.bg), alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
        <Text accessibilityRole="text" style={{ color: '#fff', fontSize: 28, fontWeight: '600', textAlign: 'center' }}>{s.content}</Text>
      </View>
    );
  }
  if (!url) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{failed ? <Text style={{ color: '#fff' }}>Could not load this status.</Text> : <ActivityIndicator color="#fff" accessibilityLabel="Loading status" />}</View>;
  if (s.kind === 'image') return <Image source={{ uri: url }} contentFit="contain" onLoad={onReady} onError={onReady} style={{ flex: 1 }} accessibilityLabel={s.content || 'Status photo'} />;
  if (s.kind === 'video') return <VideoBox url={url} />;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ backgroundColor: colors.other, borderRadius: radius.lg, padding: space.lg }}><VoicePlayer url={url} durationMs={null} mine={false} /></View>
    </View>
  );
}

export default function StatusViewer() {
  const { authorId, start } = useLocalSearchParams<{ authorId: string; start?: string }>();
  const { session } = useAuth();
  const me = session!.user.id;
  const router = useRouter();
  const { colors } = useTheme();
  const { nameOf } = useChat();
  const st = useStatus(me);
  const group = st.groups.find((g) => g.authorId === authorId);
  const stories = group?.stories ?? [];

  const [index, setIndex] = useState(() => Math.max(0, parseInt(start ?? '0', 10) || 0));
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [comment, setComment] = useState('');
  const [focused, setFocused] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activity, setActivity] = useState<{ viewers: Viewer[]; items: Activity[] } | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  const i = Math.min(index, Math.max(0, stories.length - 1));
  const cur = stories[i];
  const mine = !!group?.mine;
  const progress = useRef(new Animated.Value(0)).current;
  const value = useRef(0);
  useEffect(() => { const id = progress.addListener(({ value: v }) => { value.current = v; }); return () => progress.removeListener(id); }, [progress]);

  const iRef = useRef(i); iRef.current = i;
  const lenRef = useRef(stories.length); lenRef.current = stories.length;
  const next = useCallback(() => { if (iRef.current + 1 >= lenRef.current) router.back(); else setIndex(iRef.current + 1); }, [router]);
  const prev = useCallback(() => setIndex(Math.max(0, iRef.current - 1)), []);
  const onReady = useCallback(() => setReady(true), []);

  // new story: reset progress and readiness, and tell the server I have seen it
  const curId = cur?.id;
  useEffect(() => {
    progress.setValue(0); value.current = 0; setReady(false); setNotice(null);
    if (!cur || mine) return;
    st.markSeen(cur.id);
    markViewed(cur.id).catch(() => { /* expired or no longer visible: nothing to mark */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curId]);

  // auto-advance for text/photos, paused while holding, typing or a dialog is open
  const hold = paused || focused || menu || reporting || deleting || activityOpen;
  useEffect(() => {
    if (!cur || !autoAdvances(cur.kind) || !ready || hold) return;
    const anim = Animated.timing(progress, { toValue: 1, duration: Math.max(50, AUTO_ADVANCE_MS * (1 - value.current)), easing: Easing.linear, useNativeDriver: false });
    anim.start(({ finished }) => { if (finished) next(); });
    return () => anim.stop();
  }, [curId, ready, hold, next, progress, cur]);

  async function toggleLike() {
    if (!cur) return;
    const on = !st.liked.has(cur.id);
    st.setLike(cur.id, on); setNotice(null);
    try { await likeStory(cur.id, on); } catch (e) { st.setLike(cur.id, !on); st.setError(friendlyError(e)); }
  }
  async function sendComment() {
    const t = comment.trim();
    if (!cur || !t) return;
    try { await commentOnStory(cur.id, t); setComment(''); setNotice('Sent. It will appear in your chat with them.'); }
    catch (e) { setNotice(null); st.setError(friendlyError(e)); }
  }
  async function openActivity() {
    if (!cur) return;
    setActivityOpen(true); setActivity(null);
    try { const [viewers, items] = await Promise.all([getViewers(cur.id), getActivity(cur.id)]); setActivity({ viewers, items }); }
    catch (e) { st.setError(friendlyError(e)); setActivityOpen(false); }
  }
  async function remove() {
    if (!cur) return;
    try {
      await deleteStory(cur);
      st.dropStory(cur.id);
      if (stories.length <= 1) router.back(); else setIndex(Math.max(0, i - 1));
    } catch (e) { st.setError(friendlyError(e)); }
  }

  const back = (
    <Pressable accessibilityRole="button" accessibilityLabel="Close status" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 28, lineHeight: 32 }}>×</Text>
    </Pressable>
  );

  if (!st.loaded) return <SafeAreaView style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" accessibilityLabel="Loading" /></SafeAreaView>;
  if (!group || !cur) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <EmptyState title="Status not available" body="It may have expired or been removed." action={<Button title="Back" onPress={() => router.back()} />} />
      </SafeAreaView>
    );
  }

  const name = mine ? 'My status' : nameOf(group.authorId, group.username);
  const liked = st.liked.has(cur.id);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} accessibilityViewIsModal>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', gap: 4, paddingHorizontal: space.md, paddingTop: space.sm }} accessibilityLabel={`Status ${i + 1} of ${stories.length}`}>
          {stories.map((s, k) => (
            <View key={s.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
              {k < i ? <View style={{ flex: 1, backgroundColor: '#fff' }} /> : k === i ? (
                autoAdvances(s.kind)
                  ? <Animated.View style={{ height: 3, backgroundColor: '#fff', width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
                  : <View style={{ flex: 1, backgroundColor: '#fff' }} />
              ) : null}
            </View>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm }}>
          <Avatar name={name} size={36} index={colorIndex(group.authorId)} path={group.avatar_path} />
          <View style={{ flex: 1 }}>
            <Text variant="strong" style={{ color: '#fff' }} numberOfLines={1}>{name}</Text>
            <Text variant="small" style={{ color: 'rgba(255,255,255,0.75)' }}>{ageLabel(cur.created_at)}{mine ? ` · ${timeLeftLabel(cur.expires_at)}` : ''}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="More options" onPress={() => setMenu(true)} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22 }}>⋯</Text>
          </Pressable>
          {back}
        </View>

        {st.error ? <View style={{ padding: space.sm }}><Banner kind="error" text={st.error} /></View> : null}

        <View style={{ flex: 1 }}>
          <Content key={cur.id} s={cur} onReady={onReady} />
          {cur.content && cur.kind !== 'text' ? (
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: space.md, backgroundColor: 'rgba(0,0,0,0.55)' }}><Text style={{ color: '#fff' }}>{cur.content}</Text></View>
          ) : null}
          {/* tap left = previous, tap right = next, hold = pause. Screen-reader users get the buttons below. */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: cur.kind === 'video' || cur.kind === 'audio' ? 96 : 0, flexDirection: 'row' }} importantForAccessibility="no" accessibilityElementsHidden>
            <Pressable style={{ flex: 3 }} onPress={prev} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={250} />
            <Pressable style={{ flex: 7 }} onPress={next} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} delayLongPress={250} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.sm }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Previous status" onPress={prev} disabled={i === 0} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.35 : 1 }}>
            <Text style={{ color: '#fff', fontSize: 26 }}>‹</Text>
          </Pressable>
          {mine ? (
            <Pressable accessibilityRole="button" accessibilityLabel="See who viewed and reacted" onPress={() => void openActivity()}
              style={{ flex: 1, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Views and reactions</Text>
            </Pressable>
          ) : (
            <>
              <TextInput
                accessibilityLabel="Reply to this status" value={comment} onChangeText={setComment} maxLength={300} placeholder="Reply" placeholderTextColor="rgba(255,255,255,0.6)"
                onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onSubmitEditing={() => void sendComment()} returnKeyType="send"
                style={[type.body, { flex: 1, color: '#fff', minHeight: MIN_TOUCH, borderRadius: radius.pill, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)', paddingHorizontal: space.md }]}
              />
              {comment.trim() ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Send reply" onPress={() => void sendComment()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: colors.accentText, fontWeight: '700', fontSize: 20 }}>↑</Text>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" accessibilityLabel={liked ? 'Unlike' : 'Like'} accessibilityState={{ selected: liked }} onPress={() => void toggleLike()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: liked ? '#f43f5e' : '#fff', fontSize: 26 }}>{liked ? '♥' : '♡'}</Text>
                </Pressable>
              )}
            </>
          )}
          <Pressable accessibilityRole="button" accessibilityLabel="Next status" onPress={next} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 26 }}>›</Text>
          </Pressable>
        </View>
        {notice ? <Text variant="small" style={{ color: '#fff', textAlign: 'center', paddingBottom: space.sm }} accessibilityLiveRegion="polite">{notice}</Text> : null}
      </KeyboardAvoidingView>

      <ActionSheet
        visible={menu} onClose={() => setMenu(false)} title={name}
        actions={mine
          ? [{ label: 'Views and reactions', onPress: () => void openActivity() }, { label: 'Delete this status', destructive: true, onPress: () => setDeleting(true) }]
          : [{ label: 'Report this status', destructive: true, onPress: () => setReporting(true) }]}
      />
      <ConfirmDialog visible={deleting} title="Delete this status?" body="It disappears for everyone straight away." confirmLabel="Delete" destructive onConfirm={() => void remove()} onClose={() => setDeleting(false)} />
      <PromptDialog
        visible={reporting} title="Report status" label="What is wrong with it?" submitLabel="Send report" maxLength={500} multiline validate={validateReportReason}
        onSubmit={async (v) => { await reportStory(cur.id, v).catch((e) => { throw new Error(friendlyError(e)); }); setNotice('Report sent. Thank you.'); }}
        onClose={() => setReporting(false)}
      />
      <PickerModal visible={activityOpen} title="Views and reactions" onClose={() => setActivityOpen(false)}>
        {!activity ? <ActivityIndicator color={colors.accent} accessibilityLabel="Loading" /> : (
          <ScrollView contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }}>
            <Text variant="strong">Seen by {activity.viewers.length}</Text>
            {activity.viewers.length === 0 ? <Text muted>Nobody yet.</Text> : activity.viewers.map((v) => <Text key={v.viewer_id}>{nameOf(v.viewer_id, v.username)} · {ageLabel(v.viewed_at)}</Text>)}
            <Text variant="strong" style={{ marginTop: space.md }}>Likes and comments</Text>
            {activity.items.length === 0 ? <Text muted>None yet.</Text> : activity.items.map((a) => (
              <Text key={`${a.kind}-${a.id ?? a.user_id}`}>{a.kind === 'like' ? '♥ ' : '💬 '}{nameOf(a.user_id, a.username)}{a.content ? `: ${a.content}` : ' liked this'}</Text>
            ))}
          </ScrollView>
        )}
      </PickerModal>
    </SafeAreaView>
  );
}
