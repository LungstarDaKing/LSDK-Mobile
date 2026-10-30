import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { makeSparks, onAccess, SHOW_MS, TITLE } from './access';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const R = 52, CIRC = 2 * Math.PI * R;
const timing = (v: Animated.Value, to: number, duration: number, delay = 0, easing = Easing.out(Easing.cubic), native = true) =>
  Animated.timing(v, { toValue: to, duration, delay, easing, useNativeDriver: native });

/** Full-screen "Access granted" moment: scan line, the seal draws itself, shockwaves + sparks, letters pop in, then it irises away. Tap to skip. */
export function AccessGranted() {
  const [on, setOn] = useState(false);
  useEffect(() => onAccess(() => setOn(true)), []);
  return on ? <Moment onDone={() => setOn(false)} /> : null;
}

function Moment({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const [calm, setCalm] = useState<boolean | null>(null);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => setCalm(false)); }, []);
  useEffect(() => { if (calm) AccessibilityInfo.announceForAccessibility('Access granted'); }, [calm]);
  if (calm === null) return <View style={styles.fill} />;       // a blank dark frame for the few ms it takes to know
  return <Scene w={width} h={height} calm={calm} onDone={onDone} />;
}

function Scene({ w, h, calm, onDone }: { w: number; h: number; calm: boolean; onDone: () => void }) {
  const sparks = useMemo(() => makeSparks(), []);
  const v = useRef({
    fade: new Animated.Value(0), scan: new Animated.Value(0), rays: new Animated.Value(0), spin: new Animated.Value(0),
    ring: new Animated.Value(0), check: new Animated.Value(0), fill: new Animated.Value(0), bump: new Animated.Value(0),
    shock: [new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)], spark: new Animated.Value(0),
    letters: [...TITLE].map(() => new Animated.Value(0)), sub: new Animated.Value(0), leave: new Animated.Value(0),
  }).current;
  const gone = useRef(false);
  const leaving = useRef(false);

  const leave = useCallback(() => {
    if (leaving.current) return; leaving.current = true;
    timing(v.leave, 1, calm ? 300 : 750, 0, Easing.bezier(0.7, 0, 0.2, 1)).start(() => { if (!gone.current) { gone.current = true; onDone(); } });
  }, [calm, onDone, v]);

  useEffect(() => {
    if (calm) { v.fade.setValue(1); v.ring.setValue(1); v.check.setValue(1); v.fill.setValue(1); v.letters.forEach((l) => l.setValue(1)); v.sub.setValue(1); }
    else {
      Animated.parallel([
        timing(v.fade, 1, 250),
        timing(v.scan, 1, 850, 50, Easing.inOut(Easing.cubic)),
        timing(v.rays, 1, 1200, 850),
        Animated.loop(timing(v.spin, 1, 14000, 0, Easing.linear)),
        timing(v.ring, 1, 800, 200, Easing.inOut(Easing.cubic), false),
        timing(v.check, 1, 450, 950, Easing.inOut(Easing.cubic), false),
        timing(v.fill, 1, 600, 950),
        Animated.sequence([Animated.delay(950), timing(v.bump, 1, 500, 0, Easing.out(Easing.back(2)))]),
        ...v.shock.map((s, i) => timing(s, 1, 1200, 1000 + i * 180)),
        timing(v.spark, 1, 950, 1000, Easing.out(Easing.cubic)),
        ...v.letters.map((l, i) => timing(l, 1, 450, 1100 + i * 45, Easing.out(Easing.back(1.6)))),
        timing(v.sub, 1, 600, 1650),
      ]).start();
    }
    const t = setTimeout(leave, calm ? SHOW_MS.calm : SHOW_MS.normal);
    return () => { clearTimeout(t); gone.current = true; };
  }, [calm, leave, v]);

  const cx = w / 2, cy = h * 0.44, big = Math.hypot(w, h);
  return (
    <Animated.View
      accessibilityRole="alert" accessibilityLabel="Access granted"
      style={[styles.fill, { opacity: Animated.multiply(v.fade, v.leave.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] })) as unknown as Animated.Value, transform: [{ scale: v.leave.interpolate({ inputRange: [0, 1], outputRange: [1, calm ? 1 : 1.35] }) }] }]}
    >
      <Pressable accessibilityLabel="Skip" accessibilityRole="button" onPress={leave} style={StyleSheet.absoluteFill} />
      <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="bg" cx={cx} cy={cy} r={big * 0.75} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#3a2392" /><Stop offset="0.45" stopColor="#1a1240" /><Stop offset="1" stopColor="#0b0719" />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={big} fill="url(#bg)" />
      </Svg>

      {!calm ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 120, opacity: v.scan.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: v.scan.interpolate({ inputRange: [0, 1], outputRange: [-120, h] }) }] }}>
        <View style={{ flex: 1, backgroundColor: '#2dd4bf33' }} /><View style={{ height: 3, backgroundColor: '#2dd4bf99' }} />
      </Animated.View> : null}

      {!calm ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: cx - big / 2, top: cy - big / 2, width: big, height: big, opacity: v.rays, transform: [{ rotate: v.spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <Svg width={big} height={big}>
          <Defs><RadialGradient id="mask" cx="50%" cy="50%" r="50%"><Stop offset="0" stopColor="#f5b83d" stopOpacity={0.3} /><Stop offset="0.38" stopColor="#f5b83d" stopOpacity={0} /></RadialGradient></Defs>
          {Array.from({ length: 20 }, (_, i) => {
            const a0 = (i * 18) * Math.PI / 180, a1 = (i * 18 + 6) * Math.PI / 180, r = big / 2;
            return <Path key={i} d={`M${r} ${r} L${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} L${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`} fill="url(#mask)" />;
          })}
        </Svg>
      </Animated.View> : null}

      <View pointerEvents="none" style={{ position: 'absolute', left: cx - 75, top: cy - 75, width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ width: 150, height: 150, transform: [{ scale: v.bump.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.14, 1] }) }] }}>
          {!calm ? v.shock.map((s, i) => (
            <Animated.View key={i} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 75, borderWidth: 2, borderColor: '#f5b83d', opacity: s.interpolate({ inputRange: [0, 0.01, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: s.interpolate({ inputRange: [0, 1], outputRange: [0.8, 3.6] }) }] }} />
          )) : null}
          {!calm ? sparks.map((s, i) => (
            <Animated.View key={i} style={{
              position: 'absolute', left: 75 - s.size / 2, top: 75 - s.size / 2, width: s.size, height: s.size, borderRadius: s.size / 2, backgroundColor: s.color,
              opacity: v.spark.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 1, 0] }),
              transform: [{ translateX: v.spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(s.angle) * s.dist] }) }, { translateY: v.spark.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.cos(s.angle) * s.dist] }) }, { scale: v.spark.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) }],
            }} />
          )) : null}
          <Svg width={150} height={150} viewBox="0 0 120 120">
            <AnimatedCircle cx={60} cy={60} r={R} fill="#f5b83d" fillOpacity={v.fill.interpolate({ inputRange: [0, 1], outputRange: [0, 0.22] }) as unknown as number} />
            <Circle cx={60} cy={60} r={R} stroke="#ffffff22" strokeWidth={5} fill="none" />
            <AnimatedCircle cx={60} cy={60} r={R} stroke="#f5b83d" strokeWidth={5} fill="none" strokeLinecap="round" rotation={-90} origin="60, 60"
              strokeDasharray={`${CIRC}`} strokeDashoffset={v.ring.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] }) as unknown as number} />
            <AnimatedPath d="M38 62 L54 78 L84 44" stroke="#ffe29a" strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="70" strokeDashoffset={v.check.interpolate({ inputRange: [0, 1], outputRange: [70, 0] }) as unknown as number} />
          </Svg>
        </Animated.View>
      </View>

      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: cy + 100, alignItems: 'center', paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {[...TITLE].map((ch, i) => (
            <Animated.Text key={i} style={{ color: '#fff', fontSize: 34, fontWeight: '800', letterSpacing: -0.5, opacity: v.letters[i], transform: [{ translateY: v.letters[i].interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }, { scale: v.letters[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>{ch === ' ' ? ' ' : ch}</Animated.Text>
          ))}
        </View>
        <Animated.Text style={{ marginTop: 8, color: '#ffffffb8', fontSize: 16, opacity: v.sub, transform: [{ translateY: v.sub.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>Welcome back to LSDK Chat</Animated.Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#0b0719', zIndex: 10000, elevation: 10000 } });
