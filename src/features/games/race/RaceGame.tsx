// Car race between two people: lobby (stored in the database) + the live race (see RaceRun). Shown from the game screen.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { Button, Text } from '@/components/ui';
import { ConfirmDialog } from '@/components/dialogs';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import type { Game } from '../logic';
import { openRaceChannel, raceApi, type RaceNet, type Setup } from './api';
import { CarArt } from './CarArt';
import { SPRITE_UNITS } from './carart';
import { CARS, CAR_IDS } from './engine';
import { bothReady, COLORS, FAIR_CAR, fmtTime, getTrack, LAP_CHOICES, lapsOf, lookOf, startsNewRound, statBars, TRACKS, winnerOnFinish, type RaceState } from './logic';
import { RaceRun, type RunResult } from './RaceRun';
import { trackOutline } from './World';

const Sprite = ({ id, color, w = 64, uid }: { id: string; color: string; w?: number; uid: string }) => (
  <Svg width={w} height={(w * SPRITE_UNITS.h) / SPRITE_UNITS.w} viewBox={`${-SPRITE_UNITS.w / 2} ${-SPRITE_UNITS.h / 2} ${SPRITE_UNITS.w} ${SPRITE_UNITS.h}`} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <CarArt id={id} color={color} uid={uid} />
  </Svg>
);
function Thumb({ id, color }: { id: string; color: string }) {
  const o = useMemo(() => trackOutline(getTrack(id), 140, 80, 10), [id]);
  const t = getTrack(id);
  return (
    <Svg width={140} height={80} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={o.d} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={8} strokeLinejoin="round" />
      <Path d={o.d} fill="none" stroke={color} strokeWidth={4} strokeLinejoin="round" />
      <Circle cx={o.X(t.x[0])} cy={o.Y(t.y[0])} r={5} fill="#e63946" />
    </Svg>
  );
}

type Props = { game: Game; me: string; who: (id: string) => string; onError: (m: string | null) => void; onChanged?: () => void; onGaveUp: () => void };

export function RaceGame({ game, me, who, onError, onChanged, onGaveUp }: Props) {
  const { colors } = useTheme();
  const st = (game.state ?? {}) as RaceState;
  const host = game.p1 === me, oppId = host ? game.p2 : game.p1;
  const api = useMemo(() => raceApi(game.id), [game.id]);
  const netRef = useRef<RaceNet | null>(null);
  const [net, setNet] = useState<RaceNet | null>(null);
  const [run, setRun] = useState<null | { round: number }>(null);
  const [leave, setLeave] = useState(false);
  const seenRound = useRef<number | null>(null);
  const myFin = useRef<number | null>(null), oppFin = useRef<number | null>(null);
  const gameRef = useRef(game); gameRef.current = game;
  const sentDefault = useRef(false), starting = useRef(false);

  useEffect(() => { const n = openRaceChannel(`race-${game.id}`); netRef.current = n; setNet(n); return () => { n.close(); netRef.current = null; }; }, [game.id]);

  const set = useCallback((o: Setup) => { api.setup(o).then(() => onChanged?.()).catch((e) => onError(e instanceof Error ? e.message : 'Could not update the race.')); }, [api, onError, onChanged]);

  // a newer round means the host started a race: both phones start at the same moment
  useEffect(() => {
    const round = st.round ?? 0;
    if (seenRound.current == null) seenRound.current = round;
    else if (startsNewRound(st, seenRound.current, game.status)) { seenRound.current = round; myFin.current = null; oppFin.current = null; setRun({ round }); }
  }, [st, game.status]);

  useEffect(() => { if (!sentDefault.current && game.status === 'active' && !st.cars?.[me]) { sentDefault.current = true; set({ car: FAIR_CAR, color: COLORS[host ? 0 : 4] }); } }, [st.cars, game.status, me, host, set]);
  useEffect(() => {
    if (!run && game.status === 'active' && host && bothReady(st, me, oppId) && !starting.current) {
      starting.current = true; api.setup({ start: true }).then(() => onChanged?.()).catch(() => {}).finally(() => { starting.current = false; });
    }
  }, [run, game.status, host, st, me, oppId, api, onChanged]);

  const iFinished = useCallback((ms: number) => {
    myFin.current = ms; netRef.current?.send({ k: 'f', ms });
    const times: Record<string, number> = { [me]: ms }; if (oppFin.current != null) times[oppId] = oppFin.current;
    if (oppFin.current == null) api.finish(me, times).catch(() => {});              // I crossed first
    else setTimeout(() => { if (gameRef.current.status === 'active') api.finish(winnerOnFinish(me, oppId, oppFin.current, ms), times).catch(() => {}); }, 5000);   // they were first: they report it; this is the backup
  }, [api, me, oppId]);

  const times = st.times ?? {};
  const myLook = lookOf(st, me, COLORS[host ? 0 : 4]), oppLook = lookOf(st, oppId, COLORS[host ? 4 : 0]);
  const done = game.status === 'done';
  const result: RunResult = done ? {
    title: game.winner === me ? 'You won! 🏆' : game.winner ? `${who(game.winner)} won` : 'Race over',
    sub: game.result === 'Gave up' ? 'The race ended early.' : undefined,
    lines: [['You', fmtTime(times[me] ?? myFin.current)], [who(oppId), fmtTime(times[oppId] ?? oppFin.current)]],
  } : null;

  if (run && net) {
    return (
      <View style={{ height: 640, minHeight: 420, borderRadius: radius.lg, overflow: 'hidden' }}>
        <RaceRun key={run.round} track={getTrack(st.map)} laps={lapsOf(st)} balanced={!!st.balanced} place={host ? 0 : 1} me={myLook} opp={oppLook} oppName={who(oppId)} net={net}
          onFinished={iFinished} onOppFinished={(ms) => { oppFin.current = ms; }} onLeave={() => setLeave(true)} onClose={() => setRun(null)} result={result} />
        <ConfirmDialog visible={leave} title="Leave the race?" body="Leaving counts as giving up, and your friend wins." confirmLabel="Leave" destructive onConfirm={() => { setRun(null); onGaveUp(); }} onClose={() => setLeave(false)} />
      </View>
    );
  }

  const ready = st.ready ?? {}, myReady = !!ready[me], spec = CARS[myLook.id];
  const Card = ({ on, children, onPress, label, disabled }: { on: boolean; children: React.ReactNode; onPress: () => void; label: string; disabled?: boolean }) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on, disabled: !!disabled }} disabled={disabled} onPress={onPress}
      style={{ minHeight: MIN_TOUCH, padding: space.sm, borderRadius: radius.md, borderWidth: 2, borderColor: on ? colors.accent : colors.border, backgroundColor: colors.surface, alignItems: 'center', opacity: disabled ? 0.55 : 1 }}>
      {children}
    </Pressable>
  );
  const driver = (name: string, look: { id: string; color: string }, isReady: boolean, picked: boolean, uid: string) => (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Sprite id={look.id} color={look.color} w={92} uid={uid} />
      <Text variant="strong" numberOfLines={1}>{name}</Text>
      <Text variant="small" muted>{picked ? CARS[look.id].name : 'choosing…'}</Text>
      <Text variant="small" style={{ color: isReady ? '#2ec27e' : colors.muted, fontWeight: '700' }}>{isReady ? 'Ready' : 'Not ready'}</Text>
    </View>
  );

  return (
    <View style={{ gap: space.md }}>
      {done ? (
        <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 4 }} accessibilityLiveRegion="polite">
          <Text variant="strong">{result?.title}</Text>
          {result?.lines.map(([n, v]) => <Text key={n}>{n}: {v}</Text>)}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {driver('You', myLook, !!ready[me], true, 'lob-me')}
        <Text variant="strong" muted>VS</Text>
        {driver(who(oppId), oppLook, !!ready[oppId], oppLook.picked, 'lob-opp')}
      </View>

      <Text variant="strong" accessibilityRole="header">Your car</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {CAR_IDS.map((id) => (
          <View key={id} style={{ width: '48%' }}>
            <Card on={myLook.id === id} disabled={done} label={`${CARS[id].name}, ${CARS[id].kind}`} onPress={() => set({ car: id })}>
              <Sprite id={id} color={myLook.color} w={84} uid={`opt-${id}`} /><Text variant="small" numberOfLines={1}>{CARS[id].name}</Text>
            </Card>
          </View>
        ))}
      </View>
      <View style={{ padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 }}>
        <Text variant="strong">{spec.name} <Text variant="small" muted>{spec.kind}</Text></Text>
        <Text variant="small" muted>{spec.blurb}</Text>
        {statBars(st.balanced ? CARS[FAIR_CAR] : spec).map(([n, v]) => (
          <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }} accessible accessibilityLabel={`${n} ${Math.round(v * 100)} percent`}>
            <Text variant="small" style={{ width: 70 }}>{n}</Text>
            <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface2 }}><View style={{ width: `${Math.round(v * 100)}%`, height: 8, borderRadius: 4, backgroundColor: colors.accent }} /></View>
          </View>
        ))}
      </View>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {COLORS.map((c) => (
          <Pressable key={c} accessibilityRole="radio" accessibilityLabel={`Paint ${c}`} accessibilityState={{ selected: myLook.color === c, disabled: done }} disabled={done} onPress={() => set({ color: c })}
            style={{ width: MIN_TOUCH - 6, height: MIN_TOUCH - 6, borderRadius: 999, backgroundColor: c, borderWidth: 3, borderColor: myLook.color === c ? colors.accent : colors.border }} />
        ))}
      </View>

      <Text variant="strong" accessibilityRole="header">{host ? 'Pick the circuit' : `Circuit (${who(oppId)} picks)`}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
        {TRACKS.map((t) => (
          <View key={t.id} style={{ width: 170 }}>
            <Card on={st.map === t.id || (!st.map && t.id === TRACKS[0].id)} disabled={done || !host} label={`${t.name}, ${t.country}, ${t.km} kilometres`} onPress={() => set({ map: t.id })}>
              <Thumb id={t.id} color="#eef0f7" /><Text variant="small" numberOfLines={1} style={{ fontWeight: '700' }}>{t.name}</Text><Text variant="small" muted>{t.country} · {t.km} km</Text>
            </Card>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
        <Text>Laps</Text>
        {LAP_CHOICES.map((n) => (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} lap${n > 1 ? 's' : ''}`} accessibilityState={{ selected: lapsOf(st) === n, disabled: done || !host }} disabled={done || !host} onPress={() => set({ laps: n })}
            style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: lapsOf(st) === n ? colors.accent : colors.surface2, opacity: !host ? 0.6 : 1 }}>
            <Text style={{ color: lapsOf(st) === n ? colors.accentText : colors.text, fontWeight: '700' }}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Switch accessibilityLabel="Fair race: every car performs the same" value={!!st.balanced} disabled={done || !host} onValueChange={(v) => set({ balanced: v })} />
        <Text style={{ flex: 1 }}>Fair race (every car performs the same)</Text>
      </View>
      <Text variant="small" muted>Layouts are simplified drawings of the real circuits. Hold the on-screen buttons to steer, brake and use the gas, or switch on AUTO gas.</Text>
      {done ? null : <Button title={myReady ? (ready[oppId] ? 'Starting…' : `Waiting for ${who(oppId)}… (tap to cancel)`) : "I'm ready"} onPress={() => set({ ready: !myReady })} />}
    </View>
  );
}
