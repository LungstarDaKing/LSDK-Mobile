// Watch together. Ported from the website's watch.js: same rules as update-v0.13.sql, same sync decisions.
export type Provider = 'youtube' | 'spotify' | 'apple' | 'tiktok';
export type WatchRow = {
  room_id: string; provider: Provider; media_id: string; host: string; controllers: string[]; requests: string[];
  playing: boolean; pos: number; cd: number; version: number; updated_at: string;
};
export const PROVIDERS: Record<Provider, { name: string; synced: boolean; embed: string }> = {
  youtube: { name: 'YouTube', synced: true, embed: 'https://www.youtube-nocookie.com' },
  spotify: { name: 'Spotify', synced: false, embed: 'https://open.spotify.com' },
  apple: { name: 'Apple Music', synced: false, embed: 'https://embed.music.apple.com' },
  tiktok: { name: 'TikTok', synced: false, embed: 'https://www.tiktok.com' },
};
// the same checks the database makes
export const ID_RULES: Record<Provider, RegExp> = {
  youtube: /^[A-Za-z0-9_-]{11}$/,
  spotify: /^(track|album|playlist|episode|show|artist)\/[A-Za-z0-9]{10,30}$/,
  apple: /^\/[a-z]{2}\/(album|playlist|song|artist|music-video|station)\/[A-Za-z0-9_~%-]{1,100}(\/[A-Za-z0-9_~%-]{1,60}){0,2}(\?i=[0-9]{5,15})?$/,
  tiktok: /^[0-9]{5,25}$/,
};
export const validMedia = (provider: Provider, id: string) => !!ID_RULES[provider]?.test(String(id ?? ''));

/** Turns whatever link was pasted into { provider, id } or { error }. */
export function parseMediaLink(text: string): { provider: Provider; id: string } | { error: string } {
  let u: URL;
  try { u = new URL(String(text ?? '').trim()); } catch { return { error: 'Paste a full link that starts with https://' }; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Paste a full link that starts with https://' };
  const host = u.hostname.replace(/^www\.|^m\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const ok = (provider: Provider, id: string | undefined | null) => (id && validMedia(provider, id) ? { provider, id } : null);
  if (host === 'youtu.be') { const r = ok('youtube', parts[0]); if (r) return r; }
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v'); const r = ok('youtube', v || (['shorts', 'embed', 'live', 'v'].includes(parts[0]) ? parts[1] : ''));
    if (r) return r;
  }
  if (host === 'open.spotify.com') {
    const i = parts.findIndex((p) => ['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(p));
    const r = i >= 0 ? ok('spotify', `${parts[i]}/${parts[i + 1]}`) : null; if (r) return r;
  }
  if (host === 'music.apple.com') {
    const path = u.pathname.replace(/\/+$/, ''); const i = u.searchParams.get('i');
    const r = ok('apple', path + (i ? `?i=${i}` : '')); if (r) return r;
  }
  if (host === 'tiktok.com') { const i = parts.indexOf('video'); const r = i >= 0 ? ok('tiktok', parts[i + 1]) : null; if (r) return r; }
  if (host === 'vm.tiktok.com' || host === 'vt.tiktok.com' || (host === 'tiktok.com' && parts[0] === 't')) return { error: 'TikTok short links do not work. Open the video, tap Share, Copy link, and paste the long link that contains /video/ and a number.' };
  return { error: 'That link is not supported. Paste a YouTube, Spotify, Apple Music or TikTok link.' };
}

/** The address that goes into the player (only built from a checked id, never from raw text). */
export function embedUrl(provider: Provider, id: string, origin = ''): string | null {
  if (!validMedia(provider, id)) return null;
  const base = PROVIDERS[provider].embed;
  if (provider === 'youtube') return `${base}/embed/${id}?enablejsapi=1&playsinline=1&rel=0&origin=${encodeURIComponent(origin)}`;
  if (provider === 'spotify') return `${base}/embed/${id}`;
  if (provider === 'apple') return `${base}${id}`;
  return `${base}/embed/v2/${id}`;
}

/* ---------- keeping two YouTube players in step (pure decisions) ---------- */
export const DRIFT_SECONDS = 2.5;
export type Report = { playing: boolean; pos: number; ready: boolean };
export const expectedPos = (row: Pick<WatchRow, 'pos' | 'playing'>, receivedAt: number, now = Date.now()) => row.pos + (row.playing ? Math.max(0, (now - receivedAt) / 1000) : 0);
/** What THIS player should do to match the shared state. */
export function matchAction(row: Pick<WatchRow, 'pos' | 'playing'>, receivedAt: number, report: Pick<Report, 'playing' | 'pos'>, now = Date.now()): 'none' | 'seek' | 'play' | 'pause' | 'seek-play' {
  const want = expectedPos(row, receivedAt, now);
  if (row.playing && !report.playing) return Math.abs(report.pos - want) > DRIFT_SECONDS ? 'seek-play' : 'play';
  if (!row.playing && report.playing) return 'pause';
  if (Math.abs(report.pos - want) > DRIFT_SECONDS) return 'seek';
  return 'none';
}
/** A person with control used the player's own buttons: what should we tell the others? */
export function localChange(row: Pick<WatchRow, 'pos' | 'playing'>, receivedAt: number, report: Pick<Report, 'playing' | 'pos'>, now = Date.now()): { action: 'play' | 'pause' | 'seek'; pos: number } | null {
  const want = expectedPos(row, receivedAt, now);
  if (report.playing !== row.playing) return { action: report.playing ? 'play' : 'pause', pos: report.pos };
  if (Math.abs(report.pos - want) > DRIFT_SECONDS) return { action: 'seek', pos: report.pos };
  return null;
}
/** Reads what the YouTube iframe API says (a JSON string or object) and updates the report. Returns null if it is not a player message. */
export function applyPlayerMessage(prev: Report, raw: unknown): Report | null {
  let d: any;
  try { d = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
  if (!d || typeof d !== 'object') return null;
  const r = { ...prev }; const info = d.info;
  if (d.event === 'onReady') r.ready = true;
  if (d.event === 'onStateChange' && typeof info === 'number') r.playing = info === 1 || info === 3;
  if ((d.event === 'infoDelivery' || d.event === 'initialDelivery') && info && typeof info === 'object') {
    r.ready = true;
    if (typeof info.currentTime === 'number') r.pos = info.currentTime;
    if (typeof info.playerState === 'number') r.playing = info.playerState === 1 || info.playerState === 3;
  }
  return r;
}
export const PlayerCmd = { play: { func: 'playVideo', args: [] as unknown[] }, pause: { func: 'pauseVideo', args: [] as unknown[] }, seek: (s: number) => ({ func: 'seekTo', args: [s, true] as unknown[] }) };
