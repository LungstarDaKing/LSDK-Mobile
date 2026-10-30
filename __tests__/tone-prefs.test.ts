import { cleanToneName, forget, MAX_CUSTOM, MAX_TONE_BYTES, parsePrefs, resolve, setDefault, setPerson, toneFor, validateTone } from '../src/features/calls/tonePrefs';

describe('ringtone preferences', () => {
  it('parses junk safely', () => {
    expect(parsePrefs(null)).toEqual({ def: 'classic', per: {} });
    expect(parsePrefs({ def: 5, per: { a: 'x', b: 3, c: '' } })).toEqual({ def: 'classic', per: { a: 'x' } });
  });
  it('uses the person tone, else the default', () => {
    const p = setPerson(setDefault(parsePrefs({}), 'rise'), 'u1', 'bubbles');
    expect(toneFor(p, 'u1')).toBe('bubbles');
    expect(toneFor(p, 'u2')).toBe('rise');
    expect(toneFor(p)).toBe('rise');
    expect(toneFor(setPerson(p, 'u1', null), 'u1')).toBe('rise');
  });
  it('forgetting a custom tone clears every use of it', () => {
    const p = forget({ def: 'c1', per: { a: 'c1', b: 'chime' } }, 'c1');
    expect(p).toEqual({ def: 'classic', per: { b: 'chime' } });
  });
  it('falls back to classic when a tone is gone', () => {
    expect(resolve('marimba', [])).toBe('marimba');
    expect(resolve('c9', [])).toBe('classic');
    expect(resolve('c9', [{ id: 'c9' }])).toBe('c9');
  });
  it('validates uploads', () => {
    expect(validateTone({ name: 'a.mp3', size: 1000 }, 0)).toBeNull();
    expect(validateTone({ name: 'a.mp3', size: 1000 }, MAX_CUSTOM)).toMatch(/up to/);
    expect(validateTone({ name: 'a.pdf', mime: 'application/pdf' }, 0)).toMatch(/audio/);
    expect(validateTone({ name: 'a.wav', size: MAX_TONE_BYTES + 1 }, 0)).toMatch(/too big/);
  });
  it('cleans names', () => {
    expect(cleanToneName('My song<>.mp3')).toBe('My song');
    expect(cleanToneName('')).toBe('My ringtone');
  });
});
