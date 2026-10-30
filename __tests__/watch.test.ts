import { applyPlayerMessage, DRIFT_SECONDS, embedUrl, expectedPos, localChange, matchAction, parseMediaLink, validMedia } from '@/features/watch/logic';

describe('parseMediaLink', () => {
  const ok = (u: string) => parseMediaLink(u);
  test('YouTube in all the usual shapes', () => {
    for (const u of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/embed/dQw4w9WgXcQ'])
      expect(ok(u)).toEqual({ provider: 'youtube', id: 'dQw4w9WgXcQ' });
  });
  test('Spotify, Apple Music, TikTok', () => {
    expect(ok('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x')).toEqual({ provider: 'spotify', id: 'track/4uLU6hMCjMI75M1A2tKUQC' });
    expect(ok('https://open.spotify.com/intl-za/album/1DFixLWuPkv3KT3TnV35m3')).toEqual({ provider: 'spotify', id: 'album/1DFixLWuPkv3KT3TnV35m3' });
    expect(ok('https://music.apple.com/za/album/some-name/1440935467?i=1440935470')).toEqual({ provider: 'apple', id: '/za/album/some-name/1440935467?i=1440935470' });
    expect(ok('https://www.tiktok.com/@user/video/7234567890123456789')).toEqual({ provider: 'tiktok', id: '7234567890123456789' });
  });
  test('rejects junk, wrong protocols, unknown sites, TikTok short links, near-miss ids', () => {
    for (const u of ['', 'hello', 'javascript:alert(1)', 'ftp://youtu.be/dQw4w9WgXcQ', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/short', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ%22%3E', 'https://open.spotify.com/user/abc']) expect('error' in ok(u)).toBe(true);
    expect((ok('https://vm.tiktok.com/ZMabc/') as { error: string }).error).toMatch(/short links/);
  });
});

test('embedUrl only builds from valid ids, and encodes the origin', () => {
  expect(embedUrl('youtube', 'dQw4w9WgXcQ', 'https://a.b')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?enablejsapi=1&playsinline=1&rel=0&origin=https%3A%2F%2Fa.b');
  expect(embedUrl('youtube', 'x" onload="evil', 'https://a.b')).toBeNull();
  expect(embedUrl('spotify', 'track/4uLU6hMCjMI75M1A2tKUQC')).toBe('https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
  expect(validMedia('tiktok', '123')).toBe(false);
});

describe('sync decisions', () => {
  const row = (playing: boolean, pos: number) => ({ playing, pos });
  test('expected position moves only while playing', () => { expect(expectedPos(row(true, 10), 1000, 6000)).toBe(15); expect(expectedPos(row(false, 10), 1000, 6000)).toBe(10); });
  test('follower: starts, pauses, seeks only when drifting more than the limit', () => {
    expect(matchAction(row(true, 10), 0, { playing: false, pos: 10 }, 0)).toBe('play');
    expect(matchAction(row(true, 10), 0, { playing: false, pos: 40 }, 0)).toBe('seek-play');
    expect(matchAction(row(false, 10), 0, { playing: true, pos: 10 }, 0)).toBe('pause');
    expect(matchAction(row(true, 10), 0, { playing: true, pos: 10 + DRIFT_SECONDS - 0.1 }, 0)).toBe('none');
    expect(matchAction(row(true, 10), 0, { playing: true, pos: 10 + DRIFT_SECONDS + 0.5 }, 0)).toBe('seek');
  });
  test('controller: own button presses become play / pause / seek', () => {
    expect(localChange(row(false, 5), 0, { playing: true, pos: 5 }, 0)).toEqual({ action: 'play', pos: 5 });
    expect(localChange(row(true, 5), 0, { playing: false, pos: 9 }, 0)).toEqual({ action: 'pause', pos: 9 });
    expect(localChange(row(true, 5), 0, { playing: true, pos: 30 }, 0)).toEqual({ action: 'seek', pos: 30 });
    expect(localChange(row(true, 5), 0, { playing: true, pos: 5.5 }, 0)).toBeNull();
  });
});

test('player messages update the report; junk is ignored', () => {
  const base = { playing: false, pos: 0, ready: false };
  expect(applyPlayerMessage(base, JSON.stringify({ event: 'onReady' }))).toMatchObject({ ready: true });
  expect(applyPlayerMessage(base, { event: 'onStateChange', info: 1 })).toMatchObject({ playing: true });
  expect(applyPlayerMessage(base, { event: 'onStateChange', info: 2 })).toMatchObject({ playing: false });
  expect(applyPlayerMessage(base, { event: 'infoDelivery', info: { currentTime: 12.5, playerState: 3 } })).toEqual({ ready: true, playing: true, pos: 12.5 });
  for (const junk of ['not json', null, 5, '{"event":"x"}']) { const r = applyPlayerMessage(base, junk as never); expect(r === null || (r.pos === 0 && !r.playing)).toBe(true); }
});
