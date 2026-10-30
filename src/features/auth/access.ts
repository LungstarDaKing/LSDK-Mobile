// "Access granted" moment after a successful sign-in (ported from the website's src/lib/access.js).
// The sign-in screen arms it just before signing in; AuthProvider plays it when Supabase confirms SIGNED_IN.
// Armed explicitly so it never fires on silent token refreshes or when the app returns from the background.
let armed = false;
const listeners = new Set<() => void>();
export const armAccess = () => { armed = true; };
export const disarmAccess = () => { armed = false; };
export const consumeAccess = () => { const a = armed; armed = false; return a; };
/** Called by AuthProvider on SIGNED_IN. Returns true if the animation was started. */
export function signedIn(): boolean {
  if (!consumeAccess()) return false;
  listeners.forEach((l) => l());
  return true;
}
export function onAccess(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export const SPARKS = 24;
export const SPARK_COLORS = ['#f5b83d', '#ffe29a', '#a996ff', '#2dd4bf', '#ffffff'] as const;
export const TITLE = 'Access granted';
export const SHOW_MS = { normal: 2100, calm: 900 } as const;

/** Spark directions/distances/sizes (deterministic when an rng is passed, for tests). */
export function makeSparks(rng: () => number = Math.random) {
  return Array.from({ length: SPARKS }, (_, i) => ({
    angle: ((360 / SPARKS) * i + (rng() * 10 - 5)) * (Math.PI / 180),
    dist: 90 + rng() * 110, size: 4 + rng() * 6, color: SPARK_COLORS[i % SPARK_COLORS.length],
  }));
}
