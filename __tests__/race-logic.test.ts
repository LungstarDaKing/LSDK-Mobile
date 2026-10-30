jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
import { carShapes } from '../src/features/games/race/carart';
import { CAR_IDS } from '../src/features/games/race/engine';
import { bothReady, fmtTime, getTrack, isAhead, lapsOf, lookOf, parseMsg, startsNewRound, statBars, winnerOnFinish } from '../src/features/games/race/logic';

describe('race logic', () => {
  it('draws every car as clean SVG shapes in any colour', () => {
    for (const id of CAR_IDS) {
      const shapes = carShapes(id, '#1e90ff');
      expect(shapes.length).toBeGreaterThan(8);
      for (const s of shapes) { expect(s.d).not.toMatch(/NaN|undefined/); expect(s.d.length).toBeGreaterThan(5); }
    }
  });
  it('formats times', () => {
    expect(fmtTime(null)).toBe('-');
    expect(fmtTime(65430)).toBe('1:05.43');
    expect(fmtTime(9000)).toBe('0:09.00');
  });
  it('reads a lobby look with safe fallbacks', () => {
    const st = { cars: { a: { car: 'rally', color: '#ff0000' }, b: { car: 'nope', color: 'red' } } };
    expect(lookOf(st, 'a', '#000000')).toEqual({ id: 'rally', color: '#ff0000', picked: true });
    expect(lookOf(st, 'b', '#123456')).toEqual({ id: 'coupe', color: '#123456', picked: false });
    expect(lookOf({}, 'z', '#123456').picked).toBe(false);
  });
  it('starts a run only for a newer round of an active game', () => {
    expect(startsNewRound({ round: 2 }, 1, 'active')).toBe(true);
    expect(startsNewRound({ round: 1 }, 1, 'active')).toBe(false);
    expect(startsNewRound({ round: 3 }, 1, 'done')).toBe(false);
  });
  it('knows when both are ready, and clamps laps', () => {
    expect(bothReady({ ready: { a: true, b: true } }, 'a', 'b')).toBe(true);
    expect(bothReady({ ready: { a: true } }, 'a', 'b')).toBe(false);
    expect(lapsOf({ laps: 5 })).toBe(5); expect(lapsOf({ laps: 99 })).toBe(3); expect(lapsOf({})).toBe(3);
  });
  it('decides the winner and position', () => {
    expect(winnerOnFinish('me', 'op', null, 70000)).toBe('me');
    expect(winnerOnFinish('me', 'op', 65000, 70000)).toBe('op');
    expect(isAhead(10, 5, null, null)).toBe(true);
    expect(isAhead(5, 10, null, null)).toBe(false);
    expect(isAhead(5, 10, null, 60000)).toBe(false);
    expect(isAhead(5, 10, 59000, 60000)).toBe(true);
  });
  it('rejects malformed or absurd live messages', () => {
    expect(parseMsg({ k: 'p', x: 1, y: 2, h: 0, vx: 3, vy: 4, tot: 5, b: 1 })).toEqual({ k: 'p', x: 1, y: 2, h: 0, vx: 3, vy: 4, tot: 5, b: 1 });
    expect(parseMsg({ k: 'p', x: '1', y: 2, h: 0, vx: 3, vy: 4, tot: 5 })).toBeNull();
    expect(parseMsg({ k: 'p', x: 1e9, y: 2, h: 0, vx: 3, vy: 4, tot: 5 })).toBeNull();
    expect(parseMsg({ k: 'p', x: NaN, y: 2, h: 0, vx: 3, vy: 4, tot: 5 })).toBeNull();
    expect(parseMsg({ k: 'f', ms: 70000 })).toEqual({ k: 'f', ms: 70000 });
    expect(parseMsg({ k: 'f', ms: -1 })).toBeNull();
    expect(parseMsg(null)).toBeNull(); expect(parseMsg({ k: 'x' })).toBeNull();
  });
  it('caches tracks and falls back to the first for an unknown map', () => {
    expect(getTrack('monza')).toBe(getTrack('monza'));
    expect(getTrack('???').id).toBe('kyalami');
  });
  it('gives bounded stat bars', () => { for (const [, v] of statBars({ top: 345, acc: 205, turn: 2.35, grip: 6.2, off: 0.42 })) { expect(v).toBeGreaterThanOrEqual(0.05); expect(v).toBeLessThanOrEqual(1); } });
});
