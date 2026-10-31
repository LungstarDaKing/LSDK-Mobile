// The live race screen. Each phone drives its own car (same physics as the website) and broadcasts its position ~12 times a second;
// the other car is drawn gliding to the last position received. Drawing is SVG; the world is static and only the camera moves.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, Vibration, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/ui';
import { CAR_LEN, CARS, newCar, stepCar, wrapAngle, type Car, type Track } from './engine';
import { CarArt } from './CarArt';
import { FAIR_CAR, fmtTime, isAhead, type Look, type Msg } from './logic';
import type { RaceNet } from './api';
import { THEMES } from './tracks';
import { trackOutline, World } from './World';

type Opp = { x: number; y: number; h: number; tx: number; ty: number; th: number; vx: number; vy: number; seen: number; total: number; brake: boolean; init: boolean; fin: number | null };
type Keys = { left: boolean; right: boolean; gas: boolean; brake: boolean };
export type RunResult = { title: string; sub?: string; lines: [string, string][] } | null;
const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

type Props = {
  track: Track; laps: number; balanced: boolean; place: 0 | 1;
  me: Look; opp: Look; oppName: string; net: RaceNet;
  onFinished: (ms: number) => void; onOppFinished: (ms: number) => void;
  onLeave: () => void; onClose: () => void; result: RunResult;
};

const Chip = ({ children, big }: { children: React.ReactNode; big?: boolean }) => (
  <View style={{ backgroundColor: 'rgba(10,10,14,.62)', paddingHorizontal: 10, paddingVertical: big ? 6 : 4, borderRadius: 14 }}>
    <Text style={{ color: '#fff', fontWeight: '700', fontSize: big ? 22 : 15 }}>{children}</Text>
  </View>
);
function Hold({ label, a11y, keyName, keys, wide, color }: { label: string; a11y: string; keyName: keyof Keys; keys: React.MutableRefObject<Keys>; wide?: boolean; color: string }) {
  const [on, setOn] = useState(false);
  const set = (v: boolean) => { keys.current[keyName] = v; setOn(v); };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPressIn={() => set(true)} onPressOut={() => set(false)} hitSlop={6}
      style={{ minWidth: wide ? 84 : 50, height: wide ? 56 : 70, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? color : 'rgba(10,10,14,.55)', borderWidth: 2, borderColor: color }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: wide ? 14 : 24 }}>{label}</Text>
    </Pressable>
  );
}

const MAX_LOCK = 110;   // degrees the wheel turns each way
/** A steering wheel: put a finger on it and turn it like a real one. It springs back to centre when you let go. */
function Wheel({ wheel }: { wheel: React.MutableRefObject<number> }) {
  const [rot, setRot] = useState(0);
  const box = useRef<React.ComponentRef<typeof View>>(null);
  const st = useRef({ cx: 0, cy: 0, last: 0, rot: 0, timer: 0 as unknown as ReturnType<typeof setInterval> });
  const apply = (r: number) => { st.current.rot = r; wheel.current = r / MAX_LOCK; setRot(r); };
  const ang = (x: number, y: number) => (Math.atan2(y - st.current.cy, x - st.current.cx) * 180) / Math.PI;
  useEffect(() => () => { clearInterval(st.current.timer); wheel.current = 0; }, [wheel]);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      clearInterval(st.current.timer);
      box.current?.measureInWindow((x, y, w, h) => { st.current.cx = x + w / 2; st.current.cy = y + h / 2; st.current.last = ang(e.nativeEvent.pageX, e.nativeEvent.pageY); });
    },
    onPanResponderMove: (e) => {
      const a = ang(e.nativeEvent.pageX, e.nativeEvent.pageY);
      let d = a - st.current.last; if (d > 180) d -= 360; if (d < -180) d += 360;
      st.current.last = a;
      apply(Math.max(-MAX_LOCK, Math.min(MAX_LOCK, st.current.rot + d)));
    },
    onPanResponderRelease: () => release(), onPanResponderTerminate: () => release(),
  })).current;
  function release() {
    clearInterval(st.current.timer);
    st.current.timer = setInterval(() => { const r = st.current.rot * 0.72; if (Math.abs(r) < 1.5) { apply(0); clearInterval(st.current.timer); } else apply(r); }, 16);
  }
  return (
    <View ref={box} {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="Steering wheel. Turn with your finger." style={{ width: 118, height: 118 }}>
      <View style={{ width: 118, height: 118, transform: [{ rotate: `${rot}deg` }] }}>
        <Svg width={118} height={118} viewBox="-60 -60 120 120">
          <Circle r={54} fill="rgba(10,10,14,.45)" />
          <Circle r={50} fill="none" stroke="#2b2b33" strokeWidth={13} />
          <Circle r={50} fill="none" stroke="#7a5cff" strokeWidth={3} strokeDasharray="2 7" />
          <Path d="M-44 6H-14L-8 16H8L14 6H44" fill="none" stroke="#3a3a46" strokeWidth={9} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M0 -50V-36" stroke="#e63946" strokeWidth={6} strokeLinecap="round" />
          <Circle r={13} fill="#1d1d26" stroke="#7a5cff" strokeWidth={2} />
          <SvgText y={5} fill="#fff" fontSize={13} fontWeight="900" textAnchor="middle">L</SvgText>
        </Svg>
      </View>
    </View>
  );
}

/** Round speedometer with needle, digital speed and gear. */
const Speedo = memo(function Speedo({ kmh, top, gear }: { kmh: number; top: number; gear: string }) {
  const max = Math.ceil((top * 1.05) / 50) * 50, a0 = -210, a1 = 30;          // sweep in degrees (0 = right, clockwise)
  const frac = Math.max(0, Math.min(1, kmh / max)), a = a0 + (a1 - a0) * frac;
  const P = (r: number, deg: number) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
  const ticks = []; for (let v = 0; v <= max; v += 50) { const d = a0 + (a1 - a0) * (v / max), [x1, y1] = P(44, d), [x2, y2] = P(36, d); ticks.push(<Path key={v} d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`} stroke={v > top ? '#e63946' : '#cfcfe0'} strokeWidth={2} />); }
  const [nx, ny] = P(40, a), [sx, sy] = P(44, a0), [ex, ey] = P(44, a);
  return (
    <Svg width={116} height={116} viewBox="-58 -58 116 116" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Circle r={55} fill="rgba(10,10,14,.7)" stroke="#3a3a46" strokeWidth={2} />
      {ticks}
      <Path d={`M${sx.toFixed(1)} ${sy.toFixed(1)}A44 44 0 ${frac > 0.67 ? 1 : 0} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`} fill="none" stroke="#7a5cff" strokeWidth={4} strokeLinecap="round" opacity={0.85} />
      <Path d={`M0 0L${nx.toFixed(1)} ${ny.toFixed(1)}`} stroke="#ff4d4d" strokeWidth={3} strokeLinecap="round" />
      <Circle r={5} fill="#ddd" />
      <SvgText y={26} fill="#fff" fontSize={22} fontWeight="900" textAnchor="middle">{String(kmh)}</SvgText>
      <SvgText y={38} fill="#aaa" fontSize={9} fontWeight="700" textAnchor="middle">km/h</SvgText>
      <SvgText x={0} y={-14} fill="#F5B83D" fontSize={16} fontWeight="900" textAnchor="middle">{gear}</SvgText>
    </Svg>
  );
});

const MiniMap = memo(function MiniMap({ track, dots }: { track: Track; dots: { x: number; y: number; c: string }[] }) {
  const o = useMemo(() => trackOutline(track, 110, 76, 8), [track]);
  return (
    <Svg width={110} height={76} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={o.d} fill="none" stroke="rgba(0,0,0,.55)" strokeWidth={6} strokeLinejoin="round" />
      <Path d={o.d} fill="none" stroke="#e9e9f2" strokeWidth={3} strokeLinejoin="round" />
      {dots.map((d, i) => <Circle key={i} cx={o.X(d.x)} cy={o.Y(d.y)} r={5} fill={d.c} stroke="#fff" strokeWidth={2} />)}
    </Svg>
  );
});

export function RaceRun(p: Props) {
  const [box, setBox] = useState({ w: 360, h: 640 });
  const [, setTick] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [autoGas, setAutoGas] = useState(false);
  const keys = useRef<Keys>({ left: false, right: false, gas: false, brake: false });
  const wheel = useRef(0);
  const autoRef = useRef(false); autoRef.current = autoGas;
  const cb = useRef(p); cb.current = p;
  const boxRef = useRef(box); boxRef.current = box;
  const th = THEMES[p.track.theme];

  const sim = useRef<null | {
    me: Car; opp: Opp; phase: 'countdown' | 'racing'; cdStart: number; t0: number; finished: boolean; acc: number; last: number; steer: number;
    cam: { x: number; y: number }; zoom: number; shake: number; hitLatch: boolean; sendAt: number; skids: number[]; parts: { x: number; y: number; vx: number; vy: number; life: number; r: number }[];
    ms: number; countdown: string; sp: number; frame: number;
  }>(null);
  if (!sim.current) {
    const me = newCar(p.track, p.place, p.me.id); me.spec = p.balanced ? CARS[FAIR_CAR] : CARS[p.me.id] ?? CARS[FAIR_CAR];
    const o = newCar(p.track, 1 - p.place, p.opp.id);
    sim.current = { me, opp: { x: o.x, y: o.y, h: o.h, tx: o.x, ty: o.y, th: o.h, vx: 0, vy: 0, seen: 0, total: 0, brake: false, init: false, fin: null }, phase: 'countdown', cdStart: now(), t0: 0, finished: false, acc: 0, last: now(),
      steer: 0, cam: { x: me.x, y: me.y }, zoom: 1, shake: 0, hitLatch: false, sendAt: 0, skids: [], parts: [], ms: 0, countdown: '3', sp: 0, frame: 0 };
  }

  // keyboard (web build)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const map: Record<string, keyof Keys> = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'gas', w: 'gas', W: 'gas', ArrowDown: 'brake', s: 'brake', S: 'brake', ' ': 'brake' };
    const kd = (e: KeyboardEvent) => { const k = map[e.key]; if (k) { e.preventDefault(); keys.current[k] = true; } };
    const ku = (e: KeyboardEvent) => { const k = map[e.key]; if (k) { e.preventDefault(); keys.current[k] = false; } };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  // messages from the other driver
  useEffect(() => p.net.on((m: Msg) => {
    const s = sim.current!, o = s.opp;
    if (m.k === 'p') { o.tx = m.x; o.ty = m.y; o.th = m.h; o.vx = m.vx; o.vy = m.vy; o.total = m.tot; o.seen = now(); o.brake = !!m.b; if (!o.init) { o.x = m.x; o.y = m.y; o.h = m.h; o.init = true; } }
    else { o.fin = m.ms; cb.current.onOppFinished(m.ms); if (!s.finished) setNote(`${cb.current.oppName} finished! Keep going…`); }
  }), [p.net]);

  // the main loop
  useEffect(() => {
    let raf = 0, alive = true;
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      const s = sim.current!, c = cb.current, t = c.track, me = s.me, o = s.opp, tm = now();
      const dt = Math.min(0.1, (tm - s.last) / 1000); s.last = tm;
      if (s.phase === 'countdown') {
        const left = 3.8 - (tm - s.cdStart) / 1000;
        if (left > 0.8) s.countdown = String(Math.max(1, Math.ceil(left - 0.8)));
        else { s.phase = 'racing'; s.t0 = tm; s.countdown = 'GO!'; setTimeout(() => { if (sim.current && sim.current.countdown === 'GO!') sim.current.countdown = ''; }, 900); }
      }
      const racing = s.phase === 'racing'; s.ms = racing ? tm - s.t0 : 0;
      if (o.init) {
        const age = Math.min(0.3, (tm - o.seen) / 1000), k = 1 - Math.exp(-12 * dt);
        o.x += (o.tx + o.vx * age - o.x) * k; o.y += (o.ty + o.vy * age - o.y) * k; o.h = wrapAngle(o.h + wrapAngle(o.th - o.h) * k);
        if (racing && o.fin == null && tm - o.seen > 8000) setNote((n) => n ?? `Waiting for ${c.oppName}… connection lost?`);
        else setNote((n) => (n && n.startsWith('Waiting') ? null : n));
      }
      const step = 1 / 120; s.acc += dt;
      while (s.acc >= step) {
        s.acc -= step;
        if (!racing || s.finished) { if (s.finished) stepCar(me, { gas: 0, brake: 1, steer: 0 }, t, step, []); continue; }
        const k = keys.current, target = Math.max(-1, Math.min(1, (k.right ? 1 : 0) - (k.left ? 1 : 0) + wheel.current));
        s.steer += (target - s.steer) * Math.min(1, step * 9);
        stepCar(me, { steer: s.steer, gas: k.gas || (autoRef.current && !k.brake) ? 1 : 0, brake: k.brake ? 1 : 0 }, t, step, o.init ? [o] : []);
      }
      const sp = Math.hypot(me.vx, me.vy); s.sp = sp;
      if (racing && (me.onGrass || me.drift > 0.3 || me.brake) && (me.drift > 0.3 || me.brake)) {
        const fx = Math.cos(me.h), fy = Math.sin(me.h);
        for (const sd of [-1, 1]) s.skids.push(+(me.x - fx * 13 - fy * sd * 9).toFixed(0), +(me.y - fy * 13 + fx * sd * 9).toFixed(0));
        if (s.skids.length > 400) s.skids.splice(0, s.skids.length - 400);
      }
      if (me.hit > 0.55 && !s.hitLatch) { s.hitLatch = true; s.shake = 6; if (Platform.OS !== 'web') Vibration.vibrate(25); } else if (me.hit < 0.2) s.hitLatch = false;
      s.shake *= Math.exp(-9 * dt);
      if (racing && !s.finished && me.total >= c.laps * t.N) { s.finished = true; me.finishMs = s.ms; c.onFinished(s.ms); setNote(`Finished! ${fmtTime(s.ms)}`); }
      if (tm - s.sendAt > 80) { s.sendAt = tm; c.net.send({ k: 'p', x: +me.x.toFixed(1), y: +me.y.toFixed(1), h: +me.h.toFixed(3), vx: +me.vx.toFixed(1), vy: +me.vy.toFixed(1), tot: me.total, b: me.brake ? 1 : 0 }); }
      if (racing && sp > 40 && (me.onGrass || me.drift > 0.3) && s.parts.length < 40 && Math.random() < 0.5) s.parts.push({ x: me.x - Math.cos(me.h) * 18, y: me.y - Math.sin(me.h) * 18, vx: -me.vx * 0.1 + (Math.random() - 0.5) * 30, vy: -me.vy * 0.1 + (Math.random() - 0.5) * 30, life: 0.5, r: 3 });
      for (const q of s.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt; q.r += dt * 14; }
      s.parts = s.parts.filter((q) => q.life > 0);
      s.cam.x += (me.x + me.vx * 0.3 - s.cam.x) * (1 - Math.exp(-6 * dt)); s.cam.y += (me.y + me.vy * 0.3 - s.cam.y) * (1 - Math.exp(-6 * dt));
      s.zoom += ((1 - 0.2 * Math.min(1, sp / me.spec.top)) - s.zoom) * (1 - Math.exp(-2 * dt));
      if ((s.frame++ & 1) === 0) setTick((n) => (n + 1) % 1e6); // draw at about 30 frames a second
    };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, []);

  const s = sim.current!, me = s.me, o = s.opp, t = p.track;
  const { w, h } = box, k = (Math.min(w, h) / 560) * s.zoom;
  const sx = s.shake * (Math.random() - 0.5), sy = s.shake * (Math.random() - 0.5);
  const lap = Math.min(p.laps, Math.max(1, Math.floor(me.total / t.N) + 1));
  const ahead = isAhead(me.total, o.total, s.finished ? me.finishMs : null, o.fin);
  const fwd = me.vx * Math.cos(me.h) + me.vy * Math.sin(me.h);
  const gear = fwd < -3 ? 'R' : s.sp < 2 ? 'N' : String(Math.max(1, Math.min(6, Math.ceil(Math.min(1, s.sp / me.spec.top) * 6))));
  let sk = ''; for (let i = 0; i < s.skids.length; i += 2) sk += `M${s.skids[i]} ${s.skids[i + 1]}h0.1`;
  const drawCar = (c: { x: number; y: number; h: number }, look: Look, brake: boolean, uid: string, name?: string) => (
    <G key={uid} transform={`translate(${c.x.toFixed(1)} ${c.y.toFixed(1)})`}>
      <G transform={`rotate(${((c.h * 180) / Math.PI).toFixed(2)})`}>
        <CarArt id={look.id} color={look.color} uid={uid} />
        {brake ? <><Circle cx={-CAR_LEN / 2 - 1} cy={-8} r={3.4} fill="rgba(255,40,40,.95)" /><Circle cx={-CAR_LEN / 2 - 1} cy={8} r={3.4} fill="rgba(255,40,40,.95)" /></> : null}
      </G>
      {name ? <SvgText x={0} y={-34} fill="#fff" stroke="rgba(0,0,0,.65)" strokeWidth={4} fontSize={15} fontWeight="700" textAnchor="middle">{name}</SvgText> : null}
      {name ? <SvgText x={0} y={-34} fill="#fff" fontSize={15} fontWeight="700" textAnchor="middle">{name}</SvgText> : null}
    </G>
  );

  return (
    <View style={{ flex: 1, backgroundColor: th.ground }} onLayout={(e) => setBox({ w: Math.max(200, e.nativeEvent.layout.width), h: Math.max(200, e.nativeEvent.layout.height) })}
      accessibilityLabel="Car race" accessibilityRole="none">
      <Svg width={w} height={h} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <G transform={`translate(${(w / 2 + sx).toFixed(1)} ${(h / 2 + sy).toFixed(1)}) scale(${k.toFixed(4)}) translate(${(-s.cam.x).toFixed(1)} ${(-s.cam.y).toFixed(1)})`}>
          <World track={t} />
          {sk ? <Path d={sk} stroke="rgba(15,15,18,.4)" strokeWidth={4.4} strokeLinecap="round" /> : null}
          {o.init ? drawCar(o, p.opp, o.brake, 'opp', p.oppName) : null}
          {drawCar(me, p.me, me.brake, 'me')}
          {s.parts.map((q, i) => <Circle key={i} cx={q.x} cy={q.y} r={q.r} fill={me.onGrass ? th.run : '#d8d8d8'} opacity={Math.max(0, q.life) * 0.9} />)}
        </G>
      </Svg>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 10, right: 10, top: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave the race" onPress={p.onLeave} style={{ backgroundColor: 'rgba(10,10,14,.62)', paddingHorizontal: 12, minHeight: 44, borderRadius: 14, justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>✕ Leave</Text>
        </Pressable>
        <Chip>LAP {lap}/{p.laps}</Chip>
        <Chip>{fmtTime(s.finished ? me.finishMs : s.ms)}</Chip>
        <View style={{ flex: 1 }} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', right: 10, top: 62 }}>
        <MiniMap track={t} dots={[...(o.init ? [{ x: o.x, y: o.y, c: p.opp.color }] : []), { x: me.x, y: me.y, c: p.me.color }]} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 10, right: 10, top: 62, alignItems: 'flex-start', flexDirection: 'row', gap: 8 }}>
        <Chip big>{ahead ? '1st' : '2nd'}</Chip>
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: 6, top: 108 }}>
        <Speedo kmh={Math.round(s.sp)} top={me.spec.top} gear={gear} />
      </View>
      {s.countdown ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '28%', alignItems: 'center' }} accessibilityLiveRegion="assertive">
        <Text style={{ color: s.countdown === 'GO!' ? '#2ec27e' : '#fff', fontSize: 84, fontWeight: '900', textShadowColor: 'rgba(0,0,0,.7)', textShadowRadius: 8 }}>{s.countdown}</Text></View> : null}
      {note ? <View pointerEvents="none" style={{ position: 'absolute', left: 20, right: 20, top: '45%', alignItems: 'center' }}><View style={{ backgroundColor: 'rgba(10,10,14,.75)', padding: 10, borderRadius: 12 }}><Text style={{ color: '#fff', textAlign: 'center' }} accessibilityLiveRegion="polite">{note}</Text></View></View> : null}

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 8, right: 8, bottom: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Hold label="◀" a11y="Steer left" keyName="left" keys={keys} color="#7a5cff" />
          <Wheel wheel={wheel} />
          <Hold label="▶" a11y="Steer right" keyName="right" keys={keys} color="#7a5cff" />
        </View>
        <View style={{ gap: 8, alignItems: 'flex-end' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Automatic gas" accessibilityState={{ selected: autoGas }} onPress={() => setAutoGas((v) => !v)}
            style={{ paddingHorizontal: 12, minHeight: 40, borderRadius: 14, justifyContent: 'center', backgroundColor: autoGas ? '#2ec27e' : 'rgba(10,10,14,.55)', borderWidth: 2, borderColor: '#2ec27e' }}>
            <Text style={{ color: '#fff', fontWeight: '800' }}>AUTO</Text>
          </Pressable>
          <Hold label="GAS" a11y="Gas" keyName="gas" keys={keys} wide color="#2ec27e" />
          <Hold label="BRAKE" a11y="Brake" keyName="brake" keys={keys} wide color="#e63946" />
        </View>
      </View>

      {p.result ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#1d1d26', borderRadius: 20, padding: 22, width: '100%', maxWidth: 360, gap: 10 }} accessibilityViewIsModal>
            <Text variant="title" accessibilityRole="header" style={{ color: '#fff', textAlign: 'center' }}>{p.result.title}</Text>
            {p.result.sub ? <Text style={{ color: '#bbb', textAlign: 'center' }}>{p.result.sub}</Text> : null}
            {p.result.lines.map(([n, v]) => <View key={n} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: '#ddd' }}>{n}</Text><Text style={{ color: '#fff', fontWeight: '700' }}>{v}</Text></View>)}
            <Pressable accessibilityRole="button" accessibilityLabel="Continue" onPress={p.onClose} style={{ backgroundColor: '#7a5cff', minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
              <Text style={{ color: '#fff', fontWeight: '800' }}>Continue</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
