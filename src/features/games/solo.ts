// Games you play on your own (nothing is stored on a server; the best score stays on this phone).
// Content and rules are ported 1:1 from the website so scores feel the same.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Rng = () => number;
export function pick<T>(arr: readonly T[], n: number, rng: Rng = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}

export const bestScore = {
  async get(k: string): Promise<number> { try { return Number(await AsyncStorage.getItem('lsdkchat.best.' + k)) || 0; } catch { return 0; } },
  async set(k: string, v: number): Promise<void> { try { await AsyncStorage.setItem('lsdkchat.best.' + k, String(v)); } catch { /* ignore */ } },
};

/* ---------- emoji song challenge ---------- */
export const SONGS: readonly [string, string][] = [
  ['🙏🌍💃', 'Jerusalema'], ['🧟🕺🌕', 'Thriller'], ['😀☀️👏', 'Happy'], ['☔🌧️', 'Umbrella'], ['💡😵🌃', 'Blinding Lights'],
  ['⚽🕺🌍', 'Waka Waka'], ['🐒💃', 'Dance Monkey'], ['🐴🛣️🤠', 'Old Town Road'], ['🎆🔥', 'Firework'], ['🌴🇨🇺', 'Havana'],
  ['🦁😴🌙', 'The Lion Sleeps Tonight'], ['👋☎️', 'Hello'], ['😈🧑', 'Bad Guy'], ['🌊🛞🎲', 'Rolling in the Deep'], ['🫨🚫', 'Shake It Off'],
  ['🌍🌅🥁', 'Africa'], ['📖❤️👗', 'Love Story'], ['🦁🗣️', 'Roar'], ['🙇😔', 'Sorry'], ['🪲✨', 'Fireflies'],
  ['⬆️🏙️🕺', 'Uptown Funk'], ['🐢🎶', 'Despacito'], ['👣🖐️', 'Pata Pata'], ['🌫️🌊', 'Faded'], ['🪩🌙🚀', 'Starboy'],
];
export function songRound(rng: Rng = Math.random) {
  const [emoji, answer] = pick(SONGS, 1, rng)[0];
  const wrong = pick(SONGS.filter((s) => s[1] !== answer), 3, rng).map((s) => s[1]);
  return { emoji, answer, options: pick([answer, ...wrong], 4, rng) };
}

/* ---------- word puzzles (unscramble) ---------- */
export const WORDS: readonly [string, string][] = [
  ['UBUNTU', 'Philosophy: I am because we are'], ['SPRINGBOK', 'National rugby team'], ['BILTONG', 'Dried cured meat'], ['BRAAI', 'Weekend fire and meat'],
  ['KWAITO', 'Music born in Johannesburg'], ['AMAPIANO', 'Piano-driven dance music'], ['JOHANNESBURG', 'City of gold'], ['TABLEMOUNTAIN', 'Flat-topped landmark in Cape Town'],
  ['SOWETO', 'Township with a famous 1976 uprising'], ['LOADSHEDDING', 'Scheduled power cuts'], ['ROBBENISLAND', 'Where Mandela was held'], ['VUVUZELA', 'Loud football horn'],
  ['PROTEA', 'National flower'], ['KRUGER', 'Famous game park'], ['RAINBOW', 'Colourful arc, and a nation'], ['KEYBOARD', 'You are using one'], ['NETWORK', 'Connected computers'],
  ['DATABASE', 'Organised store of records'], ['BROWSER', 'Opens websites'], ['MESSAGE', 'What you send in a chat'], ['PASSWORD', 'Keep it secret'], ['CAMERA', 'Takes photos'],
  ['GUITAR', 'Six strings'], ['MELODY', 'The tune'], ['RHYTHM', 'The beat pattern'], ['HARMONY', 'Notes sounding together'], ['PLAYLIST', 'Songs lined up'],
  ['ELEPHANT', 'Largest land animal'], ['GIRAFFE', 'Tallest animal'], ['RHINOCEROS', 'Horned animal'], ['SPRINGBUCK', 'Leaping antelope'], ['PENGUIN', 'Flightless bird that swims'],
  ['UNIVERSITY', 'Where you study after school'], ['LECTURE', 'Class given by a professor'], ['ASSIGNMENT', 'Work to hand in'], ['SEMESTER', 'Half an academic year'], ['LIBRARY', 'Quiet place full of books'],
];
export function scramble(word: string, rng: Rng = Math.random): string {
  const letters = word.split('');
  for (let tries = 0; tries < 20; tries++) {
    for (let i = letters.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [letters[i], letters[j]] = [letters[j], letters[i]]; }
    if (letters.join('') !== word) break;
  }
  return letters.join('');
}
export const sameWord = (a: string, b: string) => String(a).trim().toUpperCase() === String(b).trim().toUpperCase();

/* ---------- stickman run (pure step so it can be tested) ---------- */
export type Obstacle = { x: number; w: number; h: number };
export type Stick = { t: number; y: number; vy: number; speed: number; obs: Obstacle[]; gap: number; score: number; dead: boolean; jumpReq: boolean; rng: Rng };
export const newStickman = (rng: Rng = Math.random): Stick => ({ t: 0, y: 0, vy: 0, speed: 300, obs: [], gap: 300, score: 0, dead: false, jumpReq: false, rng });
export function stickmanStep(st: Stick, dt: number): Stick {
  const g = 2600, jump = 900;
  if (st.dead) return st;
  st.t += dt; st.speed = 300 + Math.min(300, st.t * 12);
  if (st.jumpReq && st.y === 0) st.vy = jump;
  st.jumpReq = false;
  if (st.y > 0 || st.vy > 0) { st.vy -= g * dt; st.y = Math.max(0, st.y + st.vy * dt); if (st.y === 0) st.vy = 0; }
  for (const o of st.obs) o.x -= st.speed * dt;
  st.obs = st.obs.filter((o) => o.x + o.w > -10);
  st.gap -= st.speed * dt;
  if (st.gap <= 0) { st.obs.push({ x: 560, w: 18 + st.rng() * 16, h: 24 + st.rng() * 30 }); st.gap = 260 + st.rng() * 260; }
  st.score = Math.floor(st.t * 10);
  for (const o of st.obs) if (o.x < 70 && o.x + o.w > 50 && st.y < o.h) st.dead = true;   // stickman box: x 50..70, feet at y
  return st;
}
