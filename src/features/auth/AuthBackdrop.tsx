import { useEffect, useRef, useState, type ElementRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type GestureResponderEvent } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { space } from '@/theme/tokens';
import { Konnect, type Pointer } from './Konnect';

const EMOJI = ['💬', '❤️', '😂', '🔥', '👍', '🎉', '📞', '✨'] as const;
const BUBBLE = [
  { left: 0.06, dur: 17000, delay: 2000 }, { left: 0.22, dur: 21000, delay: 9000 }, { left: 0.38, dur: 18000, delay: 14000 }, { left: 0.53, dur: 23000, delay: 5000 },
  { left: 0.66, dur: 16000, delay: 11000 }, { left: 0.79, dur: 22000, delay: 17000 }, { left: 0.9, dur: 19000, delay: 7000 }, { left: 0.46, dur: 25000, delay: 20000 },
];

function Bubble({ e, spec, h, w, calm }: { e: string; spec: (typeof BUBBLE)[number]; h: number; w: number; calm: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (calm || !h) return;
    v.setValue(0);
    const run = Animated.loop(Animated.timing(v, { toValue: 1, duration: spec.dur, easing: Easing.linear, useNativeDriver: true }));
    const t = setTimeout(() => run.start(), 0);
    // start part-way through the loop (the website uses negative delays) so the screen is never empty
    v.setValue((spec.delay % spec.dur) / spec.dur);
    return () => { clearTimeout(t); run.stop(); };
  }, [calm, h, spec, v]);
  if (calm || !h) return null;
  return (
    <Animated.View style={{
      position: 'absolute', left: spec.left * w, top: 0, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 16, borderBottomLeftRadius: 4,
      backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
      opacity: v.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 0.85, 0.85, 0] }),
      transform: [
        { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [h * 1.05, -h * 0.12] }) },
        { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 18, -14] }) },
        { rotate: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-6deg', '5deg', '-4deg'] }) },
      ],
    }}>
      <Animated.Text style={{ fontSize: 18 }}>{e}</Animated.Text>
    </Animated.View>
  );
}

function Orb({ top, left, color, dx, dy, dur, size, calm }: { top: number; left: number; color: string; dx: number; dy: number; dur: number; size: number; calm: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (calm) return;
    const run = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    run.start(); return () => run.stop();
  }, [calm, dur, v]);
  return (
    <Animated.View style={{
      position: 'absolute', top, left, width: size, height: size,
      transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) }, { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
    }}>
      <Svg width={size} height={size} opacity={0.3}>
        <Defs><RadialGradient id={`o${color}`} cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor={color} stopOpacity={1} /><Stop offset="0.68" stopColor={color} stopOpacity={0} /></RadialGradient></Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#o${color})`} />
      </Svg>
    </Animated.View>
  );
}

/** The sign-in / sign-up page background from the website: dark violet, drifting orbs, floating emoji "messages" and the Konnected network. Children sit on top. */
export function AuthBackdrop({ children }: { children: ReactNode }) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [calm, setCalm] = useState(false);
  const pointer: Pointer = useRef(null);
  const origin = useRef({ x: 0, y: 0 });
  const host = useRef<ElementRef<typeof View>>(null);

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {}); const s = AccessibilityInfo.addEventListener('reduceMotionChanged', setCalm); return () => s.remove(); }, []);
  const move = (e: GestureResponderEvent) => { pointer.current = { x: e.nativeEvent.pageX - origin.current.x, y: e.nativeEvent.pageY - origin.current.y }; };

  return (
    <View
      ref={host} style={{ flex: 1, backgroundColor: '#0b0719', overflow: 'hidden' }}
      onLayout={(e) => { setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }); host.current?.measureInWindow((x, y) => { origin.current = { x, y }; }); }}
      onTouchStart={move} onTouchMove={move} onTouchEnd={() => { pointer.current = null; }} onTouchCancel={() => { pointer.current = null; }}
    >
      <View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <Orb top={-box.h * 0.08} left={box.w * 0.45} size={Math.max(box.w, 200) * 0.9} color="#f5b83d" dx={-60} dy={70} dur={16000} calm={calm} />
        <Orb top={box.h * 0.55} left={-box.w * 0.15} size={Math.max(box.w, 200) * 0.9} color="#2dd4bf" dx={60} dy={-60} dur={20000} calm={calm} />
        {BUBBLE.map((s, i) => <Bubble key={i} e={EMOJI[i]} spec={s} h={box.h} w={box.w} calm={calm} />)}
        <Konnect pointer={pointer} />
      </View>
      <View style={{ flex: 1, padding: space.lg }}>{children}</View>
    </View>
  );
}
