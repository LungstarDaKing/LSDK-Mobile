// Lobby + result rules for the car race. Pure, so it is unit-tested. The race itself is driven live (see RaceGame.tsx).
import { CARS, CAR_IDS, type Track, buildTrack } from './engine';
import { TRACKS, TRACK_BY_ID } from './tracks';

export const COLORS = ['#e63946', '#f4a300', '#f1fa3b', '#2ec27e', '#1e90ff', '#7a5cff', '#ff5fa2', '#f2f2f2', '#2b2b33', '#ff7a1a'];
export const LAP_CHOICES = [1, 2, 3, 5];
export const FAIR_CAR = 'coupe';

export type Look = { id: string; color: string };
export type RaceState = {
  map?: string; laps?: number; balanced?: boolean; round?: number;
  cars?: Record<string, { car?: string; color?: string }>; ready?: Record<string, boolean>; times?: Record<string, number>;
};

const trackCache = new Map<string, Track>();
export function getTrack(id: string | undefined): Track {
  const def = (id && TRACK_BY_ID[id]) || TRACKS[0];
  let t = trackCache.get(def.id);
  if (!t) { t = buildTrack(def); trackCache.set(def.id, t); }
  return t;
}

export function fmtTime(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '-';
  const s = ms / 1000, m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
}

/** How a player is shown in the lobby: their saved car or a default. `picked` = they chose one yet. */
export function lookOf(st: RaceState, who: string, fallbackColor: string): Look & { picked: boolean } {
  const c = st.cars?.[who] ?? {};
  const id = c.car && CARS[c.car] ? c.car : FAIR_CAR;
  const color = c.color && /^#[0-9a-fA-F]{6}$/.test(c.color) ? c.color : fallbackColor;
  return { id, color, picked: !!(c.car && CARS[c.car]) };
}

export const startsNewRound = (st: RaceState, seenRound: number, status: string): boolean => status === 'active' && (st.round ?? 0) > seenRound;
export const bothReady = (st: RaceState, a: string, b: string): boolean => !!st.ready?.[a] && !!st.ready?.[b];
export const lapsOf = (st: RaceState): number => (LAP_CHOICES.includes(st.laps ?? 0) ? (st.laps as number) : 3);

/** Whom to report as the winner: I finished first if the other player has not crossed the line yet. */
export function winnerOnFinish(me: string, opp: string, oppFinishMs: number | null, myMs: number): string {
  return oppFinishMs == null || myMs <= oppFinishMs ? me : opp;
}

/** Position label: ahead if I have gone further (or finished earlier). */
export function isAhead(myTotal: number, oppTotal: number, myFinishMs: number | null, oppFinishMs: number | null): boolean {
  if (myFinishMs != null) return myFinishMs <= (oppFinishMs ?? Infinity);
  if (oppFinishMs != null) return false;
  return myTotal >= oppTotal;
}

/** Messages sent over the live channel (about 12 a second). */
export type Msg = { k: 'p'; x: number; y: number; h: number; vx: number; vy: number; tot: number; b: 0 | 1 } | { k: 'f'; ms: number };
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Never trust the other side's numbers: drop anything malformed or absurd. */
export function parseMsg(raw: unknown): Msg | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (m.k === 'p' && fin(m.x) && fin(m.y) && fin(m.h) && fin(m.vx) && fin(m.vy) && fin(m.tot)) {
    if (Math.abs(m.x) > 1e6 || Math.abs(m.y) > 1e6 || Math.abs(m.vx) > 2000 || Math.abs(m.vy) > 2000) return null;
    return { k: 'p', x: m.x, y: m.y, h: m.h, vx: m.vx, vy: m.vy, tot: m.tot, b: m.b ? 1 : 0 };
  }
  if (m.k === 'f' && fin(m.ms) && m.ms > 0 && m.ms < 3_600_000) return { k: 'f', ms: m.ms };
  return null;
}

export const statBars = (spec: { top: number; acc: number; turn: number; grip: number; off: number }): [string, number][] => {
  const c = (v: number) => Math.max(0.05, Math.min(1, v));
  return [['Speed', c((spec.top - 240) / 120)], ['Accel', c((spec.acc - 140) / 100)], ['Handling', c((spec.turn - 1.9) / 1.1)], ['Grip', c((spec.grip - 4.5) / 5)], ['Off-road', c((spec.off - 0.3) / 0.55)]];
};
export { CARS, CAR_IDS, TRACKS };
