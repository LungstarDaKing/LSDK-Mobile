// Full-screen incoming / outgoing / in-call UI. Rendered once at the root; shows only while a call exists.
import { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar, Banner, Text } from '@/components/ui';
import { useChat } from '@/features/chat/ChatProvider';
import { setMinimized, useMinimized } from '@/features/calls/callUi';
import { useCall } from '@/features/calls/CallProvider';
import { VideoView } from '@/features/calls/VideoView';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

function Round({ label, glyph, onPress, bg = '#ffffff22', active }: { label: string; glyph: string; onPress: () => void; bg?: string; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: !!active }} onPress={onPress}
      style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: active ? '#fff' : bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 26, color: active ? '#000' : '#fff' }}>{glyph}</Text>
      <Text variant="small" style={{ color: active ? '#000' : '#fff', fontSize: 10 }}>{label}</Text>
    </Pressable>
  );
}

function Timer({ since }: { since: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!since) return null;
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <Text style={{ color: '#fff' }}>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</Text>;
}

export function CallOverlay() {
  const c = useCall();
  const { rooms, nameOf } = useChat();
  const [err, setErr] = useState<string | null>(null);
  const s = c.state; const mini = useMinimized();
  useEffect(() => { if (s.phase === 'incoming' || s.phase === 'idle') setMinimized(false); }, [s.phase]);
  if (s.phase === 'idle' || (mini && s.phase !== 'incoming')) return null;

  const username = rooms.flatMap((r) => r.participants).find((p) => p.profile_id === s.peerId)?.profiles?.username;
  const path = rooms.flatMap((r) => r.participants).find((p) => p.profile_id === s.peerId)?.profiles?.avatar_path ?? null;
  const name = s.peerId ? nameOf(s.peerId, username ?? 'Someone') : 'Someone';
  const live = s.phase === 'active' || s.phase === 'connecting';
  const video = s.kind === 'video';
  const status = s.phase === 'incoming' ? `Incoming ${video ? 'video' : 'voice'} call`
    : s.phase === 'outgoing' ? 'Calling…' : s.phase === 'connecting' ? 'Connecting…' : '';

  return (
    <Modal visible animationType="fade" onRequestClose={() => (s.phase === 'incoming' ? c.decline() : c.hangup())}>
      <View style={{ flex: 1, backgroundColor: '#0e0a1e' }} accessibilityViewIsModal>
        {live && video && s.remote ? <VideoView stream={s.remote} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
        {live && s.remoteScreen ? <VideoView stream={s.remoteScreen} fit="contain" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }} /> : null}
        <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', padding: space.lg }}>
          <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.xl }} accessibilityLiveRegion="polite">
            {!(live && video && s.remote) ? <Avatar name={name} size={110} index={s.peerId ? s.peerId.charCodeAt(0) : 0} path={path} /> : null}
            <Text variant="title" style={{ color: '#fff' }}>{name}</Text>
            {s.phase !== 'incoming' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Minimise the call and keep using the app" onPress={() => setMinimized(true)} style={{ position: 'absolute', right: 0, top: -space.lg, minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 22 }}>⌄</Text>
              </Pressable>
            ) : null}
            {status ? <Text style={{ color: '#ffffffcc' }}>{status}</Text> : <Timer since={s.startedAt} />}
            {s.muted ? <Text variant="small" style={{ color: '#ffffffcc' }}>Your microphone is muted</Text> : null}
          </View>

          {live && video && s.local && !s.camOff ? (
            <View style={{ position: 'absolute', right: space.lg, top: 90, width: 100, height: 140, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' }}>
              <VideoView stream={s.local} mirror style={{ width: 100, height: 140 }} />
            </View>
          ) : null}

          <View style={{ gap: space.md }}>
            {err ? <Banner kind="error" text={err} /> : null}
            {s.phase === 'incoming' ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-evenly' }}>
                <Round label="Decline" glyph="✕" bg="#d64545" onPress={c.decline} />
                <Round label="Answer" glyph="✓" bg="#2e9e5b" onPress={c.accept} />
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
                <Round label={s.phase === 'outgoing' ? 'Cancel' : 'Hang up'} glyph="✕" bg="#d64545" onPress={c.hangup} />
              </View>
            )}
            <View style={{ minHeight: MIN_TOUCH / 2 }} />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
