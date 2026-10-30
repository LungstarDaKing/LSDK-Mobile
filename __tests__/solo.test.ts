jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { bestScore, newStickman, pick, sameWord, scramble, songRound, SONGS, stickmanStep, WORDS } from '@/features/games/solo';
import { BOARD_ORDER, dartScore, dartsPlay, type Game } from '@/features/games/logic';

const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

describe('solo games', () => {
  test('pick returns n distinct items without touching the source', () => {
    const src = [1, 2, 3, 4, 5]; const p = pick(src, 3, seeded()); expect(new Set(p).size).toBe(3); expect(src).toEqual([1, 2, 3, 4, 5]);
  });
  test('songRound: 4 distinct options, the answer is one of them and matches its emoji', () => {
    for (let s = 1; s < 40; s++) { const r = songRound(seeded(s)); expect(r.options).toHaveLength(4); expect(new Set(r.options).size).toBe(4); expect(r.options).toContain(r.answer); expect(SONGS.find((x) => x[1] === r.answer)![0]).toBe(r.emoji); }
  });
  test('scramble is a permutation and never the original word', () => {
    for (const [w] of WORDS) { const s = scramble(w, seeded(7)); expect(s.split('').sort().join('')).toBe(w.split('').sort().join('')); expect(s).not.toBe(w); }
  });
  test('sameWord ignores case and spaces', () => { expect(sameWord(' ubuntu ', 'UBUNTU')).toBe(true); expect(sameWord('ubuntuu', 'UBUNTU')).toBe(false); });
  test('all song and word entries are unique', () => { expect(new Set(SONGS.map((s) => s[1])).size).toBe(SONGS.length); expect(new Set(WORDS.map((w) => w[0])).size).toBe(WORDS.length); });
  test('stickman: running scores, a jump clears a crate, standing still hits it', () => {
    const run = (jumpAt: number | null) => {
      const st = newStickman(() => 0.5); st.obs.push({ x: 200, w: 20, h: 30 }); st.gap = 9999;
      for (let i = 0; i < 120 && !st.dead; i++) { if (jumpAt !== null && i === jumpAt) st.jumpReq = true; stickmanStep(st, 1 / 60); }
      return st;
    };
    expect(run(null).dead).toBe(true);
    const jumped = run(18); expect(jumped.dead).toBe(false); expect(jumped.score).toBeGreaterThan(0);
  });
  test('best score persists', async () => { await bestScore.set('word', 9); expect(await bestScore.get('word')).toBe(9); expect(await bestScore.get('none')).toBe(0); });
});

describe('darts', () => {
  const g = (o: Partial<Game> = {}) => ({ p1: 'a', p2: 'b', turn: 'a', status: 'active', state: { s1: 301, s2: 301, turns: [] }, ...o }) as Game;
  test('scoring: bull, 25, miss, singles/doubles/trebles and the clockwise order', () => {
    expect(dartScore(0, 0)).toMatchObject({ pts: 50, label: 'Bullseye' }); expect(dartScore(0.06, 0).pts).toBe(25); expect(dartScore(1.2, 0)).toMatchObject({ pts: 0, label: 'Miss' });
    expect(dartScore(0, -0.3)).toMatchObject({ pts: 20, label: '20' });            // straight up = 20
    expect(dartScore(0, -0.6)).toMatchObject({ pts: 60, label: 'T20' });
    expect(dartScore(0, -0.97)).toMatchObject({ pts: 40, label: 'D20' });
    expect(dartScore(0.3, 0)).toMatchObject({ seg: 6 });                           // straight right = 6
    expect(BOARD_ORDER).toHaveLength(20); expect(new Set(BOARD_ORDER).size).toBe(20);
  });
  test('a normal turn subtracts; fewer than 3 darts without finishing is refused', () => {
    expect(dartsPlay(g(), 'a', [{ pts: 20, label: '20' }])).toBeNull();
    const m = dartsPlay(g(), 'a', [{ pts: 20, label: '20' }, { pts: 60, label: 'T20' }, { pts: 1, label: '1' }])!;
    expect(m.state).toMatchObject({ s1: 220, s2: 301 }); expect(m.status).toBe('active');
  });
  test('bust keeps your score; exact finish wins; wrong turn refused', () => {
    const near = g({ state: { s1: 30, s2: 100, turns: [] } });
    const bust = dartsPlay(near, 'a', [{ pts: 20, label: '20' }, { pts: 20, label: '20' }])!; expect(bust.state.s1).toBe(30); expect((bust.state.turns as any[])[0].bust).toBe(true);
    const win = dartsPlay(near, 'a', [{ pts: 10, label: '10' }, { pts: 20, label: '20' }])!; expect(win).toMatchObject({ status: 'done', winner: 'a' });
    expect(dartsPlay(near, 'b', [{ pts: 1, label: '1' }])).toBeNull();
  });
});
