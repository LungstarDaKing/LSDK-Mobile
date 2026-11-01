import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Defs, Line, Path, RadialGradient, Stop } from 'react-native-svg';
import { hudId, LOG, onAccess, SHOW_MS, WORDS } from './access';

// The website's futuristic HUD "ACCESS GRANTED" (src/lib/access.js + motion.css), redrawn for the phone:
// perspective grid, scan beam, corner brackets, spinning rings, ring + tick that draw themselves, glowing letters, status lines, progress bar.
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const CYAN = '#5eead4', ICE = '#e8fbff', VIOLET = '#a78bfa';
const DRAW = 2 * Math.PI * 58, CHECK = 80;
const t = (v: Animated.Value, to: number, duration: number, delay = 0, easing: (x: number) => number = Easing.out(Easing.cubic), native = true) =>
  Animated.timing(v, { toValue: to, duration, delay, easing, useNativeDriver: native });
const spin = (v: Animated.Value, ms: number) => Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: true }));

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
  if (calm === null) return <View style={styles.fill} />;
  return <Scene w={width} h={height} calm={calm} onDone={onDone} />;
}

function Scene({ w, h, calm, onDone }: { w: number; h: number; calm: boolean; onDone: () => void }) {
  const id = useMemo(() => hudId(), []);
  const v = useRef({
    fade: new Animated.Value(0), grid: new Animated.Value(0), beam: new Animated.Value(0), corner: new Animated.Value(0), tag: new Animated.Value(0),
    sOuter: new Animated.Value(0), sTicks: new Animated.Value(0), sArcs: new Animated.Value(0),
    draw: new Animated.Value(0), check: new Animated.Value(0), glow: new Animated.Value(0), bump: new Animated.Value(0),
    p1: new Animated.Value(0), p2: new Animated.Value(0),
    letters: [...WORDS.join('')].map(() => new Animated.Value(0)), sub: new Animated.Value(0),
    log: LOG.map(() => new Animated.Value(0)), bar: new Animated.Value(0), leave: new Animated.Value(0),
  }).current;
  const gone = useRef(false);
  const leaving = useRef(false);

  const leave = useCallback(() => {
    if (leaving.current) return; leaving.current = true;
    t(v.leave, 1, calm ? 300 : 750, 0, Easing.bezier(0.7, 0, 0.2, 1)).start(() => { if (!gone.current) { gone.current = true; onDone(); } });
  }, [calm, onDone, v]);

  useEffect(() => {
    const loops: Animated.CompositeAnimation[] = [];
    if (calm) {
      [v.fade, v.corner, v.tag, v.draw, v.check, v.glow, v.sub, v.bar, ...v.letters, ...v.log].forEach((x) => x.setValue(1));
      v.glow.setValue(0.2);
    } else {
      loops.push(spin(v.grid, 5000), spin(v.sOuter, 22000), spin(v.sTicks, 30000), spin(v.sArcs, 6000));
      loops.forEach((l) => l.start());
      Animated.parallel([
        t(v.fade, 1, 300),
        t(v.beam, 1, 1100, 100, Easing.inOut(Easing.cubic)),
        t(v.corner, 1, 500, 150), t(v.tag, 1, 600, 300),
        t(v.draw, 1, 900, 350, Easing.bezier(0.65, 0, 0.35, 1), false),
        t(v.check, 1, 450, 1200, Easing.bezier(0.65, 0, 0.35, 1), false),
        t(v.glow, 1, 700, 1200),
        t(v.bump, 1, 500, 1200, Easing.out(Easing.back(2))),
        t(v.p1, 1, 1300, 1200), t(v.p2, 1, 1300, 1400),
        ...v.letters.map((l, i) => t(l, 1, 400, 1300 + i * 55, Easing.out(Easing.back(1.5)))),
        t(v.sub, 1, 600, 1900),
        ...v.log.map((l, i) => t(l, 1, 350, 500 + i * 300)),
        t(v.bar, 1, 1300, 300, Easing.bezier(0.5, 0, 0.2, 1), false),
      ]).start();
    }
    const timer = setTimeout(leave, calm ? SHOW_MS.calm : SHOW_MS.normal);
    return () => { clearTimeout(timer); gone.current = true; loops.forEach((l) => l.stop()); };
  }, [calm, leave, v]);

  const rot = (a: Animated.Value, rev = false) => ({ transform: [{ rotate: a.interpolate({ inputRange: [0, 1], outputRange: rev ? ['360deg', '0deg'] : ['0deg', '360deg'] }) }] });
  const core = Math.max(150, Math.min(230, Math.min(w, h) * 0.34));
  const cell = 44, lines = Math.ceil(Math.max(w, h) * 1.3 / cell);
  const up = (a: Animated.Value, px = 14) => ({ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [px, 0] }) }] });
  const bigR = Math.hypot(w, h);

  return (
    <Animated.View
      accessibilityRole="alert" accessibilityLabel="Access granted"
      style={[styles.fill, { opacity: Animated.multiply(v.fade, v.leave.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] })) as unknown as Animated.Value, transform: [{ scale: v.leave.interpolate({ inputRange: [0, 1], outputRange: [1, calm ? 1 : 1.25] }) }] }]}
    >
      <Pressable accessibilityLabel="Skip" accessibilityRole="button" onPress={leave} style={StyleSheet.absoluteFill} />

      {/* background glow */}
      <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs><RadialGradient id="bg" cx={w / 2} cy={h * 0.42} r={bigR * 0.7} gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#0b2a44" /><Stop offset="0.52" stopColor="#07101f" /><Stop offset="1" stopColor="#03050c" />
        </RadialGradient></Defs>
        <Circle cx={w / 2} cy={h * 0.42} r={bigR} fill="url(#bg)" />
      </Svg>

      {/* perspective grid, scrolling toward you, faded out toward the edges */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}>
        <Animated.View style={{ position: 'absolute', left: -w * 0.2, top: h * 0.3, width: w * 1.4, height: h * 0.9, transform: [{ perspective: 700 }, { rotateX: '58deg' }, { translateY: v.grid.interpolate({ inputRange: [0, 1], outputRange: [0, cell] }) }], opacity: 0.55 }}>
          <Svg width={w * 1.4} height={h * 0.9 + cell}>
            {Array.from({ length: lines }, (_, i) => <Line key={`h${i}`} x1={0} x2={w * 1.4} y1={i * cell - cell} y2={i * cell - cell} stroke="#2dd4bf" strokeOpacity={0.35} strokeWidth={1} />)}
            {Array.from({ length: lines }, (_, i) => <Line key={`v${i}`} y1={0} y2={h * 0.9 + cell} x1={i * cell} x2={i * cell} stroke="#2dd4bf" strokeOpacity={0.35} strokeWidth={1} />)}
          </Svg>
        </Animated.View>
        <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
          <Defs><RadialGradient id="fadeGrid" cx={w / 2} cy={h * 0.45} r={Math.max(w, h) * 0.6} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#03050c" stopOpacity={0} /><Stop offset="0.6" stopColor="#03050c" stopOpacity={0.55} /><Stop offset="1" stopColor="#03050c" stopOpacity={1} />
          </RadialGradient></Defs>
          <Circle cx={w / 2} cy={h * 0.45} r={bigR} fill="url(#fadeGrid)" />
        </Svg>
      </View>

      {/* scan beam */}
      {!calm ? <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 140, opacity: v.beam.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }), transform: [{ translateY: v.beam.interpolate({ inputRange: [0, 1], outputRange: [-140, h] }) }] }}>
        <View style={{ flex: 1, backgroundColor: '#22d3ee22' }} /><View style={{ height: 3, backgroundColor: '#67e8f9aa' }} />
      </Animated.View> : null}

      {/* corner brackets */}
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <Animated.View key={c} pointerEvents="none" style={{
          position: 'absolute', width: 38, height: 38, borderColor: CYAN, opacity: v.corner.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
          top: c[0] === 't' ? 18 : undefined, bottom: c[0] === 'b' ? 18 : undefined, left: c[1] === 'l' ? 18 : undefined, right: c[1] === 'r' ? 18 : undefined,
          borderTopWidth: c[0] === 't' ? 2 : 0, borderBottomWidth: c[0] === 'b' ? 2 : 0, borderLeftWidth: c[1] === 'l' ? 2 : 0, borderRightWidth: c[1] === 'r' ? 2 : 0,
          transform: [{ scale: v.corner.interpolate({ inputRange: [0, 1], outputRange: [1.8, 1] }) }],
        }} />
      ))}

      {/* tags */}
      <Animated.View pointerEvents="none" style={[styles.tag, { top: 30 }, up(v.tag, 8)]}><Text style={styles.mono}>SECURE SIGN-IN</Text><Text style={styles.mono}>{id}</Text></Animated.View>
      <Animated.View pointerEvents="none" style={[styles.tag, { bottom: 30 }, up(v.tag, 8)]}><Text style={styles.mono}>TAP TO CONTINUE</Text><Text style={styles.mono}>100%</Text></Animated.View>

      {/* core: rings that spin, a ring that draws itself, then a tick */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: h * 0.42 - core / 2 - 40, alignItems: 'center' }}>
        <Animated.View style={{ width: core, height: core, transform: [{ scale: v.bump.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 1.1, 1] }) }] }}>
          <Animated.View style={[StyleSheet.absoluteFill, calm ? null : rot(v.sOuter)]}><Svg width={core} height={core} viewBox="0 0 200 200"><Circle cx={100} cy={100} r={92} stroke="#22d3ee66" strokeWidth={1.5} strokeDasharray="2 7" fill="none" /></Svg></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, calm ? null : rot(v.sTicks, true)]}><Svg width={core} height={core} viewBox="0 0 200 200"><Circle cx={100} cy={100} r={82} stroke="#67e8f94d" strokeWidth={7} strokeDasharray="1 5.2" fill="none" /></Svg></Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, calm ? null : rot(v.sArcs)]}><Svg width={core} height={core} viewBox="0 0 200 200">
            <Path d="M100 28 A72 72 0 0 1 172 100" stroke={VIOLET} strokeWidth={4} fill="none" strokeLinecap="round" />
            <Path d="M100 172 A72 72 0 0 1 28 100" stroke={VIOLET} strokeWidth={4} fill="none" strokeLinecap="round" />
            <Path d="M52 52 A72 72 0 0 1 80 31" stroke={VIOLET} strokeWidth={4} fill="none" strokeLinecap="round" />
          </Svg></Animated.View>
          <Svg width={core} height={core} viewBox="0 0 200 200" style={StyleSheet.absoluteFill}>
            <AnimatedCircle cx={100} cy={100} r={44} fill="#22d3ee" fillOpacity={v.glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] }) as unknown as number} />
            <Circle cx={100} cy={100} r={58} stroke="#ffffff1c" strokeWidth={5} fill="none" />
            <AnimatedCircle cx={100} cy={100} r={58} stroke={CYAN} strokeWidth={5} fill="none" strokeLinecap="round" rotation={-90} origin="100, 100"
              strokeDasharray={`${DRAW}`} strokeDashoffset={v.draw.interpolate({ inputRange: [0, 1], outputRange: [DRAW, 0] }) as unknown as number} />
            <AnimatedPath d="M76 102 L94 120 L128 80" stroke={ICE} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray={`${CHECK}`} strokeDashoffset={v.check.interpolate({ inputRange: [0, 1], outputRange: [CHECK, 0] }) as unknown as number} />
          </Svg>
          {!calm ? [v.p1, v.p2].map((p, i) => (
            <Animated.View key={i} style={{ position: 'absolute', left: core * 0.14, top: core * 0.14, right: core * 0.14, bottom: core * 0.14, borderRadius: core, borderWidth: 2, borderColor: CYAN,
              opacity: p.interpolate({ inputRange: [0, 0.001, 1], outputRange: [0, 0.9, 0] }), transform: [{ scale: p.interpolate({ inputRange: [0, 1], outputRange: [0.7, 2.6] }) }] }} />
          )) : null}
        </Animated.View>
      </View>

      {/* title, subtitle, status lines, progress */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 16, right: 16, top: h * 0.42 + core / 2 - 20, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {WORDS.map((word, k) => (
            <View key={word} style={{ flexDirection: 'row', marginHorizontal: 8 }}>
              {[...word].map((ch, i) => {
                const a = v.letters[k * 6 + i];
                return <Animated.Text key={i} style={{ color: '#f0fdff', fontSize: Math.min(40, w / 10), fontWeight: '800', letterSpacing: 3, textShadowColor: '#22d3eeaa', textShadowRadius: 16, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>{ch}</Animated.Text>;
              })}
            </View>
          ))}
        </View>
        <Animated.Text style={[{ marginTop: 6, color: '#9fe8f5c0', fontSize: 15, textAlign: 'center' }, up(v.sub)]}>Identity confirmed. Welcome back to LSDK Chat.</Animated.Text>
        <View style={{ marginTop: 12, gap: 4, alignSelf: 'center' }}>
          {LOG.map((line, i) => (
            <Animated.Text key={line} style={[styles.mono, { color: CYAN, fontSize: 11.5, textTransform: 'uppercase' }, up(v.log[i], 8)]}>
              <Text style={{ color: VIOLET }}>{'▸  '}</Text>{line}<Text style={{ color: '#86efac' }}>{'  OK'}</Text>
            </Animated.Text>
          ))}
        </View>
        <View style={{ width: Math.min(320, w * 0.7), height: 4, borderRadius: 4, backgroundColor: '#ffffff1a', overflow: 'hidden', marginTop: 14 }}>
          <Animated.View style={{ height: 4, width: '100%', backgroundColor: '#22d3ee', transform: [{ scaleX: v.bar }], transformOrigin: 'left' } as never} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#03050c', zIndex: 10000, elevation: 10000 },
  tag: { position: 'absolute', left: 64, right: 64, flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontFamily: MONO, fontWeight: '600', fontSize: 10.5, letterSpacing: 2.2, color: '#5eead4b0' },
});
