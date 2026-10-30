jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKGROUNDS, IMAGE_ID, colorFor, loadPrefs, parsePrefs, savePrefs, subscribePrefs, resolveBackground, withChoice, withoutImage, DEFAULTS } from '@/features/appearance/backgrounds';
import { ASPECTS, centerCrop } from '@/features/media/crop';

describe('background prefs', () => {
  it('falls back to defaults on missing / corrupt / hostile data', () => {
    expect(parsePrefs(null)).toEqual(DEFAULTS);
    expect(parsePrefs('{not json')).toEqual(DEFAULTS);
    expect(parsePrefs('"string"')).toEqual(DEFAULTS);
    const p = parsePrefs(JSON.stringify({ def: 'nope', per: { r1: 'sky', r2: 'evil', r3: IMAGE_ID }, imageUri: null, dim: 9 }));
    expect(p.def).toBe('default');
    expect(p.per).toEqual({ r1: 'sky' });          // unknown id and image-without-image are dropped
    expect(p.dim).toBe(1);
  });
  it('accepts the image id only when an image exists', () => {
    expect(parsePrefs(JSON.stringify({ def: IMAGE_ID, imageUri: 'file:///x.jpg' })).def).toBe(IMAGE_ID);
    expect(parsePrefs(JSON.stringify({ def: IMAGE_ID })).def).toBe('default');
  });
  it('a chat choice overrides the default; clearing falls back', () => {
    let p = withChoice(DEFAULTS, undefined, 'mint');
    expect(resolveBackground(p, 'r1')).toBe('mint');
    p = withChoice(p, 'r1', 'rose');
    expect(resolveBackground(p, 'r1')).toBe('rose');
    expect(resolveBackground(p, 'r2')).toBe('mint');
    p = withChoice(p, 'r1', null);
    expect(resolveBackground(p, 'r1')).toBe('mint');
  });
  it('removing the picture clears every reference to it', () => {
    const p = withoutImage({ def: IMAGE_ID, per: { a: IMAGE_ID, b: 'sky' }, imageUri: 'file:///x.jpg', dim: 1 });
    expect(p).toEqual({ def: 'default', per: { b: 'sky' }, imageUri: null, dim: 1 });
  });
  it('every preset has light+dark colours except default', () => {
    for (const b of BACKGROUNDS) { if (b.id === 'default') { expect(colorFor(b.id, true)).toBeNull(); continue; } expect(colorFor(b.id, false)).toMatch(/^#[0-9a-f]{6}$/); expect(colorFor(b.id, true)).toMatch(/^#[0-9a-f]{6}$/); }
  });
});

describe('centerCrop', () => {
  it('crops a wide image to square from the middle', () => {
    expect(centerCrop(400, 200, 1)).toEqual({ originX: 100, originY: 0, width: 200, height: 200 });
  });
  it('crops a tall image to 16:9', () => {
    const c = centerCrop(1000, 3000, 16 / 9);
    expect(c.width).toBe(1000); expect(c.height).toBe(562); expect(c.originY).toBe(Math.floor((3000 - 562) / 2));
  });
  it('never leaves the image and keeps the ratio within a pixel, for every preset and odd sizes', () => {
    for (const a of ASPECTS) for (const [w, h] of [[1, 1], [3, 7], [1081, 1919], [4032, 3024], [10, 1000]]) {
      const c = centerCrop(w, h, a.ratio);
      expect(c.originX).toBeGreaterThanOrEqual(0); expect(c.originY).toBeGreaterThanOrEqual(0);
      expect(c.originX + c.width).toBeLessThanOrEqual(w); expect(c.originY + c.height).toBeLessThanOrEqual(h);
      expect(c.width).toBeGreaterThanOrEqual(1); expect(c.height).toBeGreaterThanOrEqual(1);
      if (c.width > 20 && c.height > 20) expect(Math.abs(c.width / c.height - a.ratio)).toBeLessThan(0.06);
    }
  });
  it('is safe with garbage input', () => { expect(centerCrop(0, 0, 1).width).toBeGreaterThanOrEqual(1); expect(centerCrop(100, 100, NaN).width).toBe(100); });
});

describe('persistence', () => {
  it('saves, notifies subscribers and survives a corrupt stored value', async () => {
    const seen: string[] = [];
    const off = subscribePrefs((p) => seen.push(p.def));
    await savePrefs({ ...DEFAULTS, def: 'sky' });
    off();
    expect(seen).toEqual(['sky']);
    expect(JSON.parse((await AsyncStorage.getItem('lsdkchat.bgprefs.v1'))!).def).toBe('sky');
    expect((await loadPrefs()).def).toBe('sky');
  });
});
