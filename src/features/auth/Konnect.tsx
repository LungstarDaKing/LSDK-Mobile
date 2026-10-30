import { memo, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { createWorld, links, resize, step, touch, type World } from './konnect';

const FPS_MS = 1000 / 30;   // 30 drawn frames a second is plenty for slow drifting dots and saves battery

type Frame = { tick: number };


const Scene = memo(function Scene({ world, now }: { world: World; now: number; tick: number }) {
  const ls = links(world);
  return (
    <Svg width={world.w} height={world.h}>
      <Defs>
        <RadialGradient id="pulse" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#ffecaa" stopOpacity={0.95} /><Stop offset="1" stopColor="#f5b83d" stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {ls.map((l, i) => <Line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={l.gold ? '#f5b83d' : '#beaaff'} strokeOpacity={l.o} strokeWidth={1} />)}
      {world.ripples.map((r, i) => <Circle key={`r${i}`} cx={r.x} cy={r.y} r={4 + r.t * 26} stroke={r.c} strokeOpacity={(1 - r.t) * 0.7} strokeWidth={1} fill="none" />)}
      {world.pulses.map((p, i) => <Circle key={`p${i}`} cx={p.a.x + (p.b.x - p.a.x) * p.t} cy={p.a.y + (p.b.y - p.a.y) * p.t} r={9} fill="url(#pulse)" />)}
      {world.nodes.map((n, i) => {
        const tw = 0.65 + 0.35 * Math.sin(now / 700 + n.ph);
        return (
          <View key={`n${i}`}>
            <Circle cx={n.x} cy={n.y} r={n.r * 3.2} fill={n.c} fillOpacity={0.22 * tw} />
            <Circle cx={n.x} cy={n.y} r={n.r} fill={n.c} fillOpacity={0.5 + 0.5 * tw} />
          </View>
        );
      })}
      {world.me.on ? <Circle cx={world.me.x} cy={world.me.y} r={4.5} fill="#f5b83d" /> : null}
    </Svg>
  );
});

/** Glowing people-dots drift, link up when close and pass message pulses. Touch the area to join the network. Still picture if the phone's "reduce motion" is on. */
export type Pointer = MutableRefObject<{ x: number; y: number } | null>;

export function Konnect({ pointer }: { pointer?: Pointer }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [, setFrame] = useState<Frame>({ tick: 0 });
  const [calm, setCalm] = useState(false);
  const world = useRef<World | null>(null);
  const tick = useRef(0);

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {}); const s = AccessibilityInfo.addEventListener('reduceMotionChanged', setCalm); return () => s.remove(); }, []);

  if (size.w > 0 && size.h > 0) {
    if (!world.current) world.current = createWorld(size.w, size.h);
    else if (world.current.w !== size.w || world.current.h !== size.h) resize(world.current, size.w, size.h);
  }

  useEffect(() => {
    if (calm || !world.current) return;
    let raf = 0, last = 0, drawn = 0;
    const loop = (t: number) => {
      const dt = Math.min((t - (last || t)) / 1000, 0.05); last = t;
      if (world.current) { const p = pointer?.current; touch(world.current, p ? p.x : 0, p ? p.y : null); step(world.current, dt); }
      if (t - drawn >= FPS_MS) { drawn = t; tick.current += 1; setFrame({ tick: tick.current }); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [calm, size.w, size.h, pointer]);

  return (
    <View
      pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      onLayout={(e) => setSize({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) })}
    >
      {world.current ? <Scene world={world.current} now={Date.now()} tick={tick.current} /> : null}
    </View>
  );
}

