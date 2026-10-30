import { colorIndex } from '@/lib/hash';
it('is stable, in range, and spreads ids', () => {
  expect(colorIndex('abc')).toBe(colorIndex('abc'));
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) { const c = colorIndex(`user-${i}`); expect(c).toBeGreaterThanOrEqual(0); expect(c).toBeLessThan(6); seen.add(c); }
  expect(seen.size).toBe(6);
  expect(colorIndex('')).toBe(0);
});
