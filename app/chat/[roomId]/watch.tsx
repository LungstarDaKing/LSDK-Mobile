import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { ConfirmDialog, PromptDialog } from '@/components/dialogs';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useChat } from '@/features/chat/ChatProvider';
import { watchApi } from '@/features/watch/api';
import { EmbedPlayer } from '@/features/watch/EmbedPlayer';
import { localChange, matchAction, parseMediaLink, PROVIDERS, type Report } from '@/features/watch/logic';
import type { PlayerHandle } from '@/features/watch/players.types';
import { useWatch } from '@/features/watch/useWatch';
import { YouTubePlayer } from '@/features/watch/YouTubePlayer';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, space } from '@/theme/tokens';

export default function WatchScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { session } = useAuth(); const me = session!.user.id;
  const router = useRouter(); const { colors } = useTheme();
  const { room, nameOf } = useChat();
  const w = useWatch(roomId);
  const other = room(roomId)?.participants.find((p) => p.profile_id !== me);
  const otherName = other ? nameOf(other.profile_id, other.profiles?.username ?? 'Them') : 'them';
  const [adding, setAdding] = useState(false); const [stopping, setStopping] = useState(false);
  const row = w.row;
  const controller = !!row && row.controllers.includes(me);
  const host = !!row && row.host === me;
  const player = useRef<PlayerHandle>(null);
  const mutedUntil = useRef(0);       // after we move the player ourselves, ignore its reports for a moment (no echo loops)
  const lastReport = useRef<Report>({ playing: false, pos: 0, ready: false });

  const drive = useCallback((report: Report) => {
    if (!row || row.provider !== 'youtube' || !report.ready) return;
    if (controller) {
      if (Date.now() < mutedUntil.current) return;
      const c = localChange(row, w.receivedAt.current, report);
      if (c) void watchApi.control(roomId, c.action, c.pos).catch(() => {});
    }
  }, [row, controller, roomId, w.receivedAt]);

  // followers (and the controller after someone else's change) get nudged to match the shared state
  useEffect(() => {
    if (!row || row.provider !== 'youtube' || !player.current) return;
    const tick = () => {
      const r = lastReport.current; if (!r.ready) return;
      if (controller && Date.now() >= mutedUntil.current && !(row.version === 0)) return;   // the controller drives; only follow right after a change
      const a = matchAction(row, w.receivedAt.current, r);
      if (a === 'none') return;
      mutedUntil.current = Date.now() + 1500;
      const want = row.pos + (row.playing ? (Date.now() - w.receivedAt.current) / 1000 : 0);
      if (a === 'play') player.current?.play(); else if (a === 'pause') player.current?.pause();
      else if (a === 'seek') player.current?.seek(want); else { player.current?.seek(want); player.current?.play(); }
    };
    tick(); const t = setInterval(tick, 1500);
    return () => clearInterval(t);
  }, [row, controller, w.receivedAt]);

  // 3-2-1 countdown for the players that cannot be remote controlled
  const [count, setCount] = useState<number | null>(null); const lastCd = useRef<number | null>(null);
  useEffect(() => {
    if (!row || PROVIDERS[row.provider].synced) return;
    if (lastCd.current === null) { lastCd.current = row.cd; return; }
    if (row.cd !== lastCd.current) {
      lastCd.current = row.cd; setCount(3);
      const t1 = setTimeout(() => setCount(2), 1000), t2 = setTimeout(() => setCount(1), 2000), t3 = setTimeout(() => setCount(0), 3000), t4 = setTimeout(() => setCount(null), 4500);
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
    }
  }, [row?.cd]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen scroll>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, justifyContent: 'center' }}><Text variant="title" style={{ color: colors.accent }}>‹</Text></Pressable>
        <Text variant="title">Watch together</Text>
      </View>
      {w.error ? <Banner kind="error" text={w.error} /> : null}
      {!w.loaded ? <Text muted>Loading…</Text> : null}

      {w.loaded && !row ? (
        <View style={{ gap: space.md }}>
          <Text muted>Watch a video or listen to a song with {otherName}. YouTube plays and pauses together. Spotify, Apple Music and TikTok cannot be remote controlled, so you both see the same item and press play after a 3-2-1.</Text>
          <Button title="Paste a link" onPress={() => setAdding(true)} />
        </View>
      ) : null}

      {row ? (
        <View style={{ gap: space.md }}>
          <Text variant="strong">{PROVIDERS[row.provider].name}</Text>
          <View style={{ height: row.provider === 'youtube' || row.provider === 'tiktok' ? 260 : 180, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' }}>
            {row.provider === 'youtube'
              ? <YouTubePlayer ref={player} videoId={row.media_id} onReport={(r) => { lastReport.current = r; drive(r); }} />
              : <EmbedPlayer provider={row.provider} id={row.media_id} />}
            {count !== null ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000a' }}>
                <Text accessibilityLiveRegion="assertive" style={{ color: '#fff', fontSize: count === 0 ? 28 : 64, fontWeight: '800' }}>{count === 0 ? 'Press play now!' : String(count)}</Text>
              </View>
            ) : null}
          </View>
          <Text variant="small" muted>{controller ? 'You can control playback.' : `${nameOf(row.host, otherName)} controls playback.`}{PROVIDERS[row.provider].synced ? '' : ' Press play yourself when the countdown ends.'}</Text>

          {!PROVIDERS[row.provider].synced && controller ? <Button title="Count down 3-2-1 for both of us" onPress={() => void w.act(() => watchApi.control(roomId, 'countdown'))} /> : null}
          {!controller ? (row.requests.includes(me) ? <Text muted>Waiting for them to say yes…</Text> : <Button title="Ask for control" variant="soft" onPress={() => void w.act(() => watchApi.request(roomId))} />) : null}
          {host && row.requests.length ? row.requests.map((u) => (
            <View key={u} style={{ gap: space.sm }}>
              <Text>{nameOf(u, otherName)} wants control.</Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Button title="Allow" onPress={() => void w.act(() => watchApi.grant(roomId, u, true))} /><Button title="No" variant="soft" onPress={() => void w.act(() => watchApi.grant(roomId, u, false))} />
              </View>
            </View>
          )) : null}
          {host && other && row.controllers.includes(other.profile_id) ? <Button title="Take control back" variant="soft" onPress={() => void w.act(() => watchApi.grant(roomId, other.profile_id, false))} /> : null}
          <Button title="Change video" variant="soft" onPress={() => setAdding(true)} />
          <Button title="Stop watching" variant="soft" onPress={() => setStopping(true)} />
        </View>
      ) : null}

      <PromptDialog visible={adding} title="Paste a link" label="YouTube, Spotify, Apple Music or TikTok link" submitLabel="Start" maxLength={300}
        validate={(v) => { const r = parseMediaLink(v); return 'error' in r ? r.error : null; }}
        onSubmit={async (v) => { const r = parseMediaLink(v); if ('error' in r) return; await watchApi.start(roomId, r.provider, r.id).catch((e) => { throw new Error(e.message); }); await w.act(async () => {}); }}
        onClose={() => setAdding(false)} />
      <ConfirmDialog visible={stopping} title="Stop watching together?" body="This ends it for both of you." confirmLabel="Stop" destructive onClose={() => setStopping(false)} onConfirm={() => void w.act(() => watchApi.stop(roomId))} />
    </Screen>
  );
}
