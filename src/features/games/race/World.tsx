import { memo, useMemo } from 'react';
import { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { nearest, type Track } from './engine';
import { THEMES } from './tracks';

const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7);

export type Scenery = { x: number; y: number; s: number; a: number; v: number; k: string };
export function makeScenery(t: Track, kind: string): Scenery[] {
  const r = rng(hash(t.id) + 11), items: Scenery[] = [];
  for (let i = 0; i < t.N; i += kind === 'buildings' ? 5 : 8) for (const side of [-1, 1]) {
    if (r() > (kind === 'buildings' ? 0.9 : 0.75)) continue;
    const off = t.wall + 50 + r() * (kind === 'buildings' ? 160 : 420), nx = -t.ty[i] * side, ny = t.tx[i] * side;
    const x = t.x[i] + nx * off, y = t.y[i] + ny * off;
    if (nearest(t, x, y, -1).dist < t.wall + 40) continue;
    items.push({ x, y, s: 24 + r() * 34, a: Math.atan2(t.ty[i], t.tx[i]), v: r(), k: kind });
  }
  for (const side of [-1, 1]) { const off = t.wall + 38, nx = -t.ty[0] * side, ny = t.tx[0] * side; items.push({ x: t.x[0] + nx * off, y: t.y[0] + ny * off, s: 110, a: Math.atan2(t.ty[0], t.tx[0]), v: 0.5, k: 'stand' }); }
  return items;
}
export function trackPath(t: Track, step = 2): string {
  let d = '';
  for (let i = 0; i < t.N; i += step) d += `${i ? 'L' : 'M'}${t.x[i].toFixed(1)} ${t.y[i].toFixed(1)}`;
  return d + 'Z';
}
const deg = (r: number) => (r * 180) / Math.PI;

function Item({ s }: { s: Scenery }) {
  const T = `translate(${s.x.toFixed(0)} ${s.y.toFixed(0)})`;
  if (s.k === 'trees' || s.k === 'palms') {
    const dark = s.v > 0.5 ? '#2f7a3a' : '#25683a';
    return (
      <G transform={T}>
        <Circle cx={5} cy={6} r={s.s * 0.62} fill="rgba(0,0,0,.22)" />
        <Circle r={s.s * 0.6} fill={dark} /><Circle cx={-s.s * 0.12} cy={-s.s * 0.16} r={s.s * 0.38} fill={s.v > 0.5 ? '#5fae52' : '#4a9a45'} />
      </G>
    );
  }
  if (s.k === 'bush') return <G transform={T}><Ellipse cx={4} cy={5} rx={s.s * 0.5} ry={s.s * 0.36} fill="rgba(0,0,0,.18)" /><Ellipse rx={s.s * 0.46} ry={s.s * 0.34} fill={s.v > 0.5 ? '#8c9a4a' : '#9b8b45'} /></G>;
  if (s.k === 'buildings') {
    const w = s.s * 2.2, h = s.s * 1.5, col = ['#c9b79c', '#b7c4cf', '#d8c3a5', '#a9b4a0'][Math.floor(s.v * 4) % 4];
    return <G transform={`${T} rotate(${deg(s.a)})`}><Rect x={-w / 2 + 8} y={-h / 2 + 8} width={w} height={h} fill="rgba(0,0,0,.28)" /><Rect x={-w / 2} y={-h / 2} width={w} height={h} fill={col} /><Rect x={-w / 2 + 6} y={-h / 2 + 6} width={w - 12} height={h - 12} fill="#8a8f96" /></G>;
  }
  if (s.k === 'stand') return <G transform={`${T} rotate(${deg(s.a)})`}><Rect x={-s.s * 2 + 6} y={-20} width={s.s * 4} height={52} fill="rgba(0,0,0,.25)" /><Rect x={-s.s * 2} y={-26} width={s.s * 4} height={52} fill="#7d7f88" /><Rect x={-s.s * 2 + 6} y={-20} width={s.s * 4 - 12} height={8} fill="#e63946" /><Rect x={-s.s * 2 + 6} y={-6} width={s.s * 4 - 12} height={8} fill="#f4a300" /><Rect x={-s.s * 2 + 6} y={8} width={s.s * 4 - 12} height={8} fill="#1e90ff" /></G>;
  return <G transform={`${T} rotate(${deg(s.a)})`}><Rect x={-s.s + 5} y={-9} width={s.s * 2} height={28} fill="rgba(0,0,0,.2)" /><Rect x={-s.s} y={-14} width={s.s * 2} height={28} fill={s.v > 0.5 ? '#a8adb5' : '#b9bdc4'} /></G>;
}

/** The unchanging part of the world: ground, scenery, the road, kerbs and the start line. Memoised: it never re-renders while driving. */
export const World = memo(function World({ track }: { track: Track }) {
  const th = THEMES[track.theme] ?? THEMES.forest;
  const d = useMemo(() => trackPath(track), [track]);
  const scenery = useMemo(() => makeScenery(track, th.scenery), [track, th.scenery]);
  const W = track.width, b = track.bbox, pad = 1200;
  const cols = 12, cw = W / cols, ang = deg(Math.atan2(track.ty[0], track.tx[0]));
  const line = [];
  for (let r = 0; r < 2; r++) for (let c = 0; c < cols; c++) line.push(<Rect key={`${r}-${c}`} x={r * 9 - 9} y={-W / 2 + c * cw} width={9} height={cw + 0.5} fill={(r + c) % 2 ? '#111' : '#f5f5f5'} />);
  return (
    <G>
      <Rect x={b.minX - pad} y={b.minY - pad} width={b.maxX - b.minX + pad * 2} height={b.maxY - b.minY + pad * 2} fill={th.ground} />
      {scenery.map((s, i) => <Item key={i} s={s} />)}
      <Path d={d} fill="none" stroke="#d94141" strokeWidth={W + 150} strokeLinejoin="round" />
      <Path d={d} fill="none" stroke="#f4f4f4" strokeWidth={W + 150} strokeLinejoin="round" strokeDasharray="22 22" />
      <Path d={d} fill="none" stroke={th.run} strokeWidth={W + 132} strokeLinejoin="round" />
      <Path d={d} fill="none" stroke="#d94141" strokeWidth={W + 18} strokeLinejoin="round" />
      <Path d={d} fill="none" stroke="#f4f4f4" strokeWidth={W + 18} strokeLinejoin="round" strokeDasharray="20 20" />
      <Path d={d} fill="none" stroke="#4b4e57" strokeWidth={W} strokeLinejoin="round" />
      <Path d={d} fill="none" stroke="rgba(30,30,36,.22)" strokeWidth={W * 0.42} strokeLinejoin="round" />
      <Path d={d} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth={3} strokeDasharray="26 34" strokeLinejoin="round" />
      <G transform={`translate(${track.x[0].toFixed(1)} ${track.y[0].toFixed(1)}) rotate(${ang})`}>{line}</G>
    </G>
  );
});

/** A small picture of a circuit for the map picker and the mini-map. */
export function trackOutline(t: Track, w: number, h: number, pad: number) {
  const b = t.bbox, s = Math.min((w - pad * 2) / (b.maxX - b.minX), (h - pad * 2) / (b.maxY - b.minY));
  const ox = (w - (b.maxX - b.minX) * s) / 2, oy = (h - (b.maxY - b.minY) * s) / 2;
  const X = (v: number) => ox + (v - b.minX) * s, Y = (v: number) => oy + (v - b.minY) * s;
  let d = '';
  for (let i = 0; i < t.N; i += 3) d += `${i ? 'L' : 'M'}${X(t.x[i]).toFixed(1)} ${Y(t.y[i]).toFixed(1)}`;
  return { d: d + 'Z', X, Y };
}
