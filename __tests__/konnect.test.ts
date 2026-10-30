import { createWorld, links, nodeCount, resize, step, touch } from '../src/features/auth/konnect';
import { makeSparks, SPARKS, armAccess, consumeAccess, signedIn, onAccess, disarmAccess } from '../src/features/auth/access';

function seeded(seed = 7) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

describe('Konnected background simulation', () => {
  it('node count scales with area within 14..36', () => {
    expect(nodeCount(100, 100)).toBe(14);
    expect(nodeCount(400, 800)).toBe(20);
    expect(nodeCount(2000, 2000)).toBe(36);
  });
  it('nodes drift, wrap at the edges and stay finite', () => {
    const w = createWorld(400, 800, seeded());
    for (let i = 0; i < 2000; i++) step(w, 0.05, seeded(i + 1));
    for (const n of w.nodes) {
      expect(Number.isFinite(n.x) && Number.isFinite(n.y)).toBe(true);
      expect(n.x).toBeGreaterThanOrEqual(-10.01); expect(n.x).toBeLessThanOrEqual(410.01);
      expect(n.y).toBeGreaterThanOrEqual(-10.01); expect(n.y).toBeLessThanOrEqual(810.01);
    }
  });
  it('pulses are capped and turn into ripples that expire', () => {
    const w = createWorld(400, 800, seeded(3)); const rng = seeded(9);
    let sawPulse = false, sawRipple = false;
    for (let i = 0; i < 1200; i++) { step(w, 0.05, rng); if (w.pulses.length) sawPulse = true; if (w.ripples.length) sawRipple = true; expect(w.pulses.length).toBeLessThanOrEqual(14); }
    expect(sawPulse && sawRipple).toBe(true);
    for (let i = 0; i < 40; i++) step(w, 0.05, () => 0.99);
    expect(w.ripples.every((r) => r.t < 1)).toBe(true);
  });
  it('the finger links to nearby nodes in gold and goes away on release', () => {
    const w = createWorld(400, 800, seeded());
    touch(w, w.nodes[0].x, w.nodes[0].y);
    expect(links(w).some((l) => l.gold)).toBe(true);
    touch(w, 0, null);
    expect(links(w).some((l) => l.gold)).toBe(false);
  });
  it('resize keeps nodes and drops pulses that point at removed nodes', () => {
    const w = createWorld(400, 800, seeded()); const rng = seeded(5);
    for (let i = 0; i < 200; i++) step(w, 0.05, rng);
    resize(w, 100, 100, seeded());
    expect(w.nodes.length).toBe(14);
    expect(w.pulses.every((p) => w.nodes.includes(p.a) && w.nodes.includes(p.b))).toBe(true);
    resize(w, 0, 0); expect(w.nodes.length).toBe(0);
  });
});

describe('Access granted arming', () => {
  it('plays only when armed, once', () => {
    let n = 0; const off = onAccess(() => { n++; });
    expect(signedIn()).toBe(false);          // silent token refresh / returning to the app
    armAccess(); expect(signedIn()).toBe(true); expect(signedIn()).toBe(false);
    armAccess(); disarmAccess(); expect(signedIn()).toBe(false);   // wrong password
    expect(n).toBe(1); off();
    armAccess(); expect(consumeAccess()).toBe(true); expect(consumeAccess()).toBe(false);
  });
  it('makes 24 sparks around the circle', () => {
    const s = makeSparks(seeded()); expect(s).toHaveLength(SPARKS);
    expect(s.every((x) => x.dist >= 90 && x.dist <= 200 && x.size >= 4 && x.size <= 10)).toBe(true);
  });
});
