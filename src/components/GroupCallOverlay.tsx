// Full-screen group call window: a grid with one tile per person. Shrinks to the floating mini window (CallMini).
import { useEffect, useState } from 'react';
import { Modal, Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Banner, Text } from '@/components/ui';
import { useChat } from '@/features/chat/ChatProvider';
import { setMinimized, useMinimized } from '@/features/calls/callUi';
import { useGroupCall } from '@/features/calls/GroupCallProvider';
import { MAX_GROUP, type PeerView } from '@/features/calls/groupTypes';
import { VideoView } from '@/features/calls/VideoView';
import type { StreamLike } from '@/features/calls/types';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

export function Round({ label, glyph, onPress, bg = '#ffffff22', active }: { label: string; glyph: string; onPress: () => void; bg?: string; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress}
      style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: active ? '#fff' : bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 24, color: active ? '#000' : '#fff' }}>{glyph}</Text>
      <Text variant="small" style={{ color: active ? '#000' : '#fff', fontSize: 10 }}>{label}</Text>
    </Pressable>
  );
}
export function Timer({ since }: { since: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <Text style={{ color: '#fff' }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</Text>;
}
const hasVideo = (s: StreamLike | null) => !!s?.getVideoTracks().some((t) => t.enabled !== false && t.readyState !== 'ended');

/** columns for n tiles: 1 -> 1, 2 -> 1 (stacked), 3-4 -> 2, 5-6 -> 2 */
export const gridCols = (n: number) => (n <= 2 ? 1 : 2);

function Tile({ name, userId, path, peer, local, w, h, muted, onRetry }: {
  name: string; userId: string; path: string | null; peer?: PeerView; local?: StreamLike | null; w: number; h: number; muted?: boolean; onRetry?: () => void;
}) {
  const stream = local ?? peer?.stream ?? null;
  const showVideo = hasVideo(stream) && (local ? true : peer?.state === 'connected');
  const status = local ? (muted ? 'You · muted' : 'You') : !peer || peer.state === 'connecting' ? `${name} · connecting…` : peer.state === 'failed' ? `${name} · could not connect` : name;
  const body = (
    <View accessible accessibilityLabel={status} style={{ width: w, height: h, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#1b1537', alignItems: 'center', justifyContent: 'center' }}>
      {showVideo && stream ? <VideoView stream={stream} mirror={!!local} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : <Avatar name={name} size={Math.min(72, h * 0.45)} index={userId.charCodeAt(0)} path={path} />}
      <View style={{ position: 'absolute', left: 6, bottom: 6, right: 6, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text variant="small" style={{ color: '#fff' }} numberOfLines={1}>{status}</Text>
      </View>
      {peer?.state === 'failed' ? <Text variant="small" style={{ color: '#fff', position: 'absolute', top: 6, textDecorationLine: 'underline' }}>Tap to try again</Text> : null}
    </View>
  );
  return peer?.state === 'failed' && onRetry
    ? <Pressable accessibilityRole="button" accessibilityLabel={`Try again to connect to ${name}`} onPress={onRetry}>{body}</Pressable>
    : body;
}

export function GroupCallOverlay() {
  const c = useGroupCall();
  const { rooms, room, nameOf } = useChat();
  const mini = useMinimized();
  const { width, height } = useWindowDimensions();
  const [err, setErr] = useState<string | null>(null);
  const s = c.state;
  useEffect(() => { if (s.phase === 'incoming') setMinimized(false); }, [s.phase]);
  if (s.phase === 'idle' || (mini && s.phase !== 'incoming')) return null;

  const people = rooms.flatMap((r) => r.participants);
  const prof = (id: string) => people.find((p) => p.profile_id === id)?.profiles;
  const nm = (id: string) => nameOf(id, prof(id)?.username ?? 'Someone');
  const title = (s.roomId && room(s.roomId)?.name) || 'Group call';
  const video = s.kind === 'video';
  const incoming = s.phase === 'incoming';
  const others = Object.keys(s.peers);
  const screenPeer = others.find((id) => s.peers[id].screen);
  const ringing = s.members.filter((m) => m.state === 'ringing').length;
  const tiles = others.length + 1;
  const cols = gridCols(tiles);
  const gap = 8, pad = space.lg;
  const gridH = height - 330;
  const rows = Math.ceil(tiles / cols);
  const tw = (width - pad * 2 - gap * (cols - 1)) / cols;
  const th = Math.max(90, Math.min(220, (gridH - gap * (rows - 1)) / rows));
  const status = incoming ? `Incoming group ${video ? 'video' : 'voice'} call from ${s.starterId ? nm(s.starterId) : 'someone'}`
    : s.phase === 'joining' ? 'Joining…' : ringing ? `Ringing ${ringing} more…` : '';

  return (
    <Modal visible animationType="fade" onRequestClose={() => (incoming ? c.decline() : setMinimized(true))}>
      <View style={{ flex: 1, backgroundColor: '#0e0a1e' }} accessibilityViewIsModal>
        <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', padding: pad }}>
          <View style={{ gap: space.xs }} accessibilityLiveRegion="polite">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="title" style={{ color: '#fff', flex: 1 }} numberOfLines={1}>{title}</Text>
              {s.phase === 'active' ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Minimise the call and keep using the app" onPress={() => setMinimized(true)} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 22 }}>⌄</Text>
                </Pressable>
              ) : null}
            </View>
            {status ? <Text style={{ color: '#ffffffcc' }}>{status}</Text> : <Timer since={s.startedAt} />}
            <Text variant="small" style={{ color: '#ffffffaa' }}>{others.length + 1} of up to {MAX_GROUP} in the call</Text>
          </View>

          {s.phase === 'active' ? (
            <View style={{ flex: 1, marginVertical: space.md }}>
              {screenPeer ? (
                <View style={{ height: 180, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000', marginBottom: gap }} accessible accessibilityLabel={`${nm(screenPeer)} is sharing their screen`}>
                  <VideoView stream={s.peers[screenPeer].screen} fit="contain" style={{ flex: 1 }} />
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap, justifyContent: 'center' }} accessibilityRole="list">
                <Tile name="You" userId="me" path={null} local={s.local && video && !s.camOff ? s.local : null} w={tw} h={th} muted={s.muted} />
                {others.map((id) => <Tile key={id} name={nm(id)} userId={id} path={prof(id)?.avatar_path ?? null} peer={s.peers[id]} w={tw} h={th} onRetry={() => c.retryPeer(id)} />)}
              </View>
            </View>
          ) : <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Avatar name={title} size={110} index={title.charCodeAt(0)} /></View>}

          <View style={{ gap: space.md }}>
            {err ? <Banner kind="error" text={err} /> : null}
            {incoming ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
                <Round label="Decline" glyph="✕" bg="#d64545" onPress={c.decline} />
                <Round label="Join" glyph="✓" bg="#2e9e5b" onPress={c.accept} />
              </View>
            ) : (
              <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', flexWrap: 'wrap', gap: space.md }}>
                <Round label={s.muted ? 'Unmute' : 'Mute'} glyph="🎤" active={s.muted} onPress={c.toggleMute} />
                {s.phase === 'active' ? (
                  video
                    ? <>
                        <Round label={s.camOff ? 'Camera on' : 'Camera off'} glyph="📷" active={s.camOff} onPress={c.toggleCamera} />
                        <Round label="Flip" glyph="🔄" onPress={c.flipCamera} />
                      </>
                    : <Round label="Video" glyph="🎥" onPress={async () => setErr(await c.enableVideo())} />
                ) : null}
                <Round label="Leave" glyph="✕" bg="#d64545" onPress={c.hangup} />
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
