// The small floating call window: drag it anywhere, tap it to open the full call screen, or use mute / hang up straight from it.
// Lets you keep using the app (read chats, send messages) during a call.
import { useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui';
import { Timer } from '@/components/GroupCallOverlay';
import { useCall } from '@/features/calls/CallProvider';
import { setMinimized, useMinimized } from '@/features/calls/callUi';
import { useGroupCall } from '@/features/calls/GroupCallProvider';
import { VideoView } from '@/features/calls/VideoView';
import { useChat } from '@/features/chat/ChatProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

const W = 190, H = 64;

export function CallMini() {
  const one = useCall(); const grp = useGroupCall(); const { rooms, room, nameOf } = useChat();
  const mini = useMinimized();
  const { width, height } = useWindowDimensions(); const ins = useSafeAreaInsets();
  const pos = useRef(new Animated.ValueXY({ x: width - W - 12, y: ins.top + 60 })).current;
  const base = useRef({ x: width - W - 12, y: ins.top + 60 }).current;
  const moved = useRef(false);

  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 6,
    onPanResponderGrant: () => { moved.current = false; pos.setOffset({ x: base.x, y: base.y }); pos.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: (_e, g) => { moved.current = true; pos.setValue({ x: g.dx, y: g.dy }); },
    onPanResponderRelease: (_e, g) => {
      pos.flattenOffset();
      base.x = Math.min(Math.max(0, base.x + g.dx), width - W); base.y = Math.min(Math.max(ins.top, base.y + g.dy), height - H - ins.bottom - 8);
      Animated.spring(pos, { toValue: { x: base.x, y: base.y }, useNativeDriver: false, friction: 8 }).start();
    },
  }), [pos, base, width, height, ins.top, ins.bottom]);

  const oneLive = one.state.phase === 'active' || one.state.phase === 'connecting' || one.state.phase === 'outgoing';
  const grpLive = grp.state.phase === 'active';
  if (!mini || (!oneLive && !grpLive)) return null;

  const people = rooms.flatMap((r) => r.participants);
  let label = 'Call'; let since: number | null = null; let muted = false; let remote = null as typeof one.state.remote;
  let toggleMute = one.toggleMute; let hangup = one.hangup;
  if (grpLive) {
    label = (grp.state.roomId && room(grp.state.roomId)?.name) || 'Group call'; since = grp.state.startedAt; muted = grp.state.muted; toggleMute = grp.toggleMute; hangup = grp.hangup;
  } else {
    const id = one.state.peerId; const u = people.find((p) => p.profile_id === id)?.profiles?.username;
    label = id ? nameOf(id, u ?? 'Someone') : 'Call'; since = one.state.phase === 'active' ? one.state.startedAt : null; muted = one.state.muted;
    remote = one.state.kind === 'video' ? one.state.remote : null;
  }
  const btn = { minWidth: MIN_TOUCH - 8, minHeight: MIN_TOUCH - 8, borderRadius: radius.pill, alignItems: 'center' as const, justifyContent: 'center' as const };

  return (
    <Animated.View {...pan.panHandlers} style={{ position: 'absolute', zIndex: 9999, elevation: 9999, left: 0, top: 0, width: W, height: H, transform: pos.getTranslateTransform() }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingLeft: space.sm, paddingRight: 4, borderRadius: radius.lg, backgroundColor: '#1b1537', borderWidth: 1, borderColor: '#ffffff33', overflow: 'hidden' }}>
        {remote ? <View style={{ width: 36, height: 48, borderRadius: 8, overflow: 'hidden' }}><VideoView stream={remote} style={{ width: 36, height: 48 }} /></View> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Return to the call screen`} onPress={() => { if (!moved.current) setMinimized(false); }} style={{ flex: 1, minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text variant="small" style={{ color: '#fff', fontWeight: '700' }} numberOfLines={1}>{label}</Text>
          {since ? <Timer since={since} /> : <Text variant="small" style={{ color: '#ffffffaa' }}>Connecting…</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={muted ? 'Unmute' : 'Mute'} onPress={toggleMute} style={[btn, { backgroundColor: muted ? '#fff' : '#ffffff22' }]}><Text style={{ fontSize: 16 }}>🎤</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Hang up" onPress={hangup} style={[btn, { backgroundColor: '#d64545' }]}><Text style={{ color: '#fff', fontSize: 16 }}>✕</Text></Pressable>
      </View>
    </Animated.View>
  );
}
