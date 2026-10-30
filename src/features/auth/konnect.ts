// The "Konnected" sign-in background, ported from the website (src/lib/konnect-bg.js).
// This file is the pure simulation (no React, no drawing) so it can be unit-tested; Konnect.tsx draws it.
export const COLORS = ['#f5b83d', '#a996ff', '#2dd4bf', '#ff7a8c', '#6fa0ff'] as const;

export type Node = { x: number; y: number; vx: number; vy: number; r: number; c: string; ph: number };
export type Pulse = { a: Node; b: Node; t: number };
export type Ripple = { x: number; y: number; t: number; c: string };
export type World = {
  w: number; h: number; link: number; nodes: Node[]; pulses: Pulse[]; ripples: Ripple[]; nextPulse: number;
  me: { x: number; y: number; on: boolean };
};
export type Rng = () => number;

export function nodeCount(w: number, h: number, max = 36): number {
  return Math.round(Math.min(max, Math.max(14, (w * h) / 16000)));
}

function spawn(w: number, h: number, rng: Rng): Node {
  const a = rng() * Math.PI * 2, s = 8 + rng() * 16;   // pixels per second
  return { x: rng() * w, y: rng() * h, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.6 + rng() * 2.2, c: COLORS[Math.floor(rng() * COLORS.length)], ph: rng() * 6.28 };
}

export function createWorld(w: number, h: number, rng: Rng = Math.random): World {
  const world: World = { w: 0, h: 0, link: 100, nodes: [], pulses: [], ripples: [], nextPulse: 0, me: { x: 0, y: 0, on: false } };
  resize(world, w, h, rng);
  return world;
}

export function resize(world: World, w: number, h: number, rng: Rng = Math.random): void {
  world.w = w; world.h = h;
  world.link = Math.min(150, Math.max(80, w / 6));
  const want = w > 0 && h > 0 ? nodeCount(w, h) : 0;
  while (world.nodes.length < want) world.nodes.push(spawn(w, h, rng));
  world.nodes.length = want;
  world.pulses = world.pulses.filter((p) => world.nodes.includes(p.a) && world.nodes.includes(p.b));
}

/** Advance by dt seconds (the caller caps dt, as the website does at 0.05). */
export function step(world: World, dt: number, rng: Rng = Math.random): void {
  const { w, h, nodes } = world;
  for (const n of nodes) {
    n.x += n.vx * dt; n.y += n.vy * dt;
    if (n.x < -10) n.x = w + 10; else if (n.x > w + 10) n.x = -10;
    if (n.y < -10) n.y = h + 10; else if (n.y > h + 10) n.y = -10;
  }
  world.nextPulse -= dt;
  if (world.nextPulse <= 0) {
    world.nextPulse = 0.35 + rng() * 0.5;
    const a = nodes[Math.floor(rng() * nodes.length)];
    if (a) {
      const near = nodes.filter((b) => b !== a && Math.hypot(a.x - b.x, a.y - b.y) < world.link);
      if (near.length && world.pulses.length < 14) world.pulses.push({ a, b: near[Math.floor(rng() * near.length)], t: 0 });
    }
  }
  for (const p of world.pulses) p.t += dt / 0.9;
  world.pulses = world.pulses.filter((p) => {
    if (p.t < 1) return true;
    world.ripples.push({ x: p.b.x, y: p.b.y, t: 0, c: p.b.c });
    return false;
  });
  for (const r of world.ripples) r.t += dt / 0.8;
  world.ripples = world.ripples.filter((r) => r.t < 1);
}

export type Link = { x1: number; y1: number; x2: number; y2: number; o: number; gold: boolean };
/** Lines between close nodes (violet) and from the finger to nearby nodes (gold). */
export function links(world: World): Link[] {
  const out: Link[] = [];
  const { nodes, link, me } = world;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < link) out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, o: (1 - d / link) * 0.32, gold: false });
    }
    if (me.on) {
      const d = Math.hypot(a.x - me.x, a.y - me.y);
      if (d < link * 1.4) out.push({ x1: a.x, y1: a.y, x2: me.x, y2: me.y, o: (1 - d / (link * 1.4)) * 0.7, gold: true });
    }
  }
  return out;
}

export function touch(world: World, x: number, y: number | null): void {
  if (y === null) { world.me.on = false; return; }
  world.me.x = x; world.me.y = y; world.me.on = true;
}
