import fs from 'fs';
import path from 'path';
import {
  ALLOWED, AVATAR_PATH_RE, MAX_BYTES, MEDIA_PATH_RE, avatarPath, cleanName, extFor, fmtDuration, fmtSize,
  iosUnplayable, kindOf, mediaPath, resolveType, sniffOk, validateUpload,
} from '@/features/media/rules';

const U = '123e4567-e89b-42d3-a456-426614174000';
const b = (...n: number[]) => new Uint8Array(n);
const ascii = (s: string, at = 0, len = 16) => { const a = new Uint8Array(len); for (let i = 0; i < s.length; i++) a[at + i] = s.charCodeAt(i); return a; };

describe('resolveType', () => {
  it('accepts allowed mime, normalises aliases and parameters', () => {
    expect(resolveType('a.jpg', 'image/jpeg')).toBe('image/jpeg');
    expect(resolveType('a', 'image/jpg')).toBe('image/jpeg');
    expect(resolveType('v.m4a', 'audio/x-m4a')).toBe('audio/mp4');
    expect(resolveType('a.wav', 'audio/wav; codecs=1')).toBe('audio/wav');
  });
  it('falls back to the extension when the OS gives no/unknown mime', () => {
    expect(resolveType('clip.MOV', null)).toBe('video/quicktime');
    expect(resolveType('doc.pdf', 'application/octet-stream')).toBe('application/pdf');
  });
  it('rejects types the bucket does not allow', () => {
    expect(resolveType('x.exe', 'application/x-msdownload')).toBeNull();
    expect(resolveType('x.svg', 'image/svg+xml')).toBeNull();
    expect(resolveType('x.html', 'text/html')).toBeNull();
    expect(resolveType(null, null)).toBeNull();
  });
  it('every allowed type has an extension that satisfies the server path regex', () => {
    for (const m of ALLOWED) expect(MEDIA_PATH_RE.test(mediaPath(U, U, U, extFor(m)))).toBe(true);
  });
});

describe('server rules stay in sync with the SQL', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../backend-reference/supabase/update-v0.3.sql'), 'utf8');
  it('allow-list equals the media bucket allow-list', () => {
    const block = /\('media',\s*'media',\s*false,\s*20971520,\s*array\[([\s\S]*?)\]\)/.exec(sql)![1];
    const server = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    expect([...ALLOWED].sort()).toEqual(server);
  });
  it('size cap is 20 MiB', () => expect(MAX_BYTES).toBe(20971520));
});

describe('paths', () => {
  it('build paths that match the server shape', () => {
    expect(MEDIA_PATH_RE.test(mediaPath(U, U, U, 'jpg'))).toBe(true);
    expect(AVATAR_PATH_RE.test(avatarPath(U, U))).toBe(true);
    expect(MEDIA_PATH_RE.test(`${U}/${U}/${U}.j`)).toBe(false);
    expect(AVATAR_PATH_RE.test(`${U}/${U}.png`)).toBe(false);
  });
});

describe('sniffOk', () => {
  it('matches real signatures', () => {
    expect(sniffOk(b(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg')).toBe(true);
    expect(sniffOk(b(0x89, 0x50, 0x4e, 0x47), 'image/png')).toBe(true);
    expect(sniffOk(ascii('GIF89a'), 'image/gif')).toBe(true);
    expect(sniffOk(ascii('%PDF-1.7'), 'application/pdf')).toBe(true);
    expect(sniffOk(ascii('ftypM4A ', 4), 'audio/mp4')).toBe(true);
    const wav = ascii('RIFF'); wav.set(ascii('WAVE', 0, 4), 8);
    expect(sniffOk(wav, 'audio/wav')).toBe(true);
    const webp = ascii('RIFF'); webp.set(ascii('WEBP', 0, 4), 8);
    expect(sniffOk(webp, 'image/webp')).toBe(true);
    expect(sniffOk(new TextEncoder().encode('hello world'), 'text/plain')).toBe(true);
  });
  it('rejects mismatches and empties', () => {
    expect(sniffOk(ascii('%PDF-1.7'), 'image/jpeg')).toBe(false);
    expect(sniffOk(b(), 'image/jpeg')).toBe(false);
    expect(sniffOk(b(0x68, 0x00, 0x69), 'text/plain')).toBe(false);
    expect(sniffOk(ascii('anything'), 'application/zip')).toBe(false);
  });
});

describe('helpers', () => {
  it('cleanName strips separators/control chars and caps at 120 keeping the extension', () => {
    expect(cleanName('a/b\\c\u0000d.png', 'x')).toBe('a b c d.png');
    expect(cleanName('   ', 'photo.jpg')).toBe('photo.jpg');
    const long = cleanName('x'.repeat(300) + '.pdf', 'f');
    expect(long.length).toBe(120);
    expect(long.endsWith('.pdf')).toBe(true);
  });
  it('fmtSize / fmtDuration', () => {
    expect(fmtSize(500)).toBe('500 B'); expect(fmtSize(2048)).toBe('2.0 KB'); expect(fmtSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(fmtDuration(0)).toBe('0:00'); expect(fmtDuration(65_400)).toBe('1:05');
  });
  it('kindOf / iosUnplayable', () => {
    expect(kindOf('image/png')).toBe('image'); expect(kindOf('audio/mp4')).toBe('audio'); expect(kindOf('application/pdf')).toBe('file'); expect(kindOf(null)).toBe('file');
    expect(iosUnplayable('audio/webm')).toBe(true); expect(iosUnplayable('audio/mp4')).toBe(false);
  });
  it('validateUpload', () => {
    expect(validateUpload(100, 'image/png')).toBeNull();
    expect(validateUpload(100, null)).toMatch(/not supported/);
    expect(validateUpload(0, 'image/png')).toMatch(/empty/);
    expect(validateUpload(MAX_BYTES + 1, 'image/png')).toMatch(/20 MB/);
  });
});
