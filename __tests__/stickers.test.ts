import { fitSize, isStickerFile, isStickerMsg, parseItems, safeStickerUrl, stickerContent, stickerUrl } from '../src/features/stickers/logic';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../src/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-file-system', () => ({ Directory: class {}, File: class {}, Paths: {} }));

describe('sticker links', () => {
  it('accepts only https klipy.com links without credentials', () => {
    expect(safeStickerUrl('https://static.klipy.com/a/b.webp')).toBe('https://static.klipy.com/a/b.webp');
    expect(safeStickerUrl('https://klipy.com/x.webp')).not.toBeNull();
    for (const bad of ['http://static.klipy.com/a.webp', 'https://evilklipy.com/a.webp', 'https://klipy.com.evil.io/a.webp', 'https://u:p@static.klipy.com/a.webp', 'javascript:alert(1)', 'not a url', '', null, undefined, 'https://static.klipy.com/' + 'a'.repeat(600)]) expect(safeStickerUrl(bad)).toBeNull();
  });
  it('round-trips message content and rejects tampered content', () => {
    const u = 'https://static.klipy.com/a/b.webp';
    expect(stickerUrl(stickerContent(u))).toBe(u);
    expect(stickerUrl('[sticker]https://evil.com/a.webp')).toBeNull();
    expect(stickerUrl('hello [sticker]https://static.klipy.com/a.webp')).toBeNull();
    expect(isStickerMsg({ content: stickerContent(u) })).toBe(true);
    expect(isStickerMsg({ content: 'hi' })).toBe(false);
  });
  it('recognises my-sticker files only by exact name and type', () => {
    expect(isStickerFile({ attachment_name: 'sticker.webp', attachment_type: 'image/webp' })).toBe(true);
    expect(isStickerFile({ attachment_name: 'photo.webp', attachment_type: 'image/webp' })).toBe(false);
    expect(isStickerFile({ attachment_name: 'sticker.webp', attachment_type: 'image/png' })).toBe(false);
  });
  it('drops unsafe or malformed items from the server answer', () => {
    const r = parseItems({ has_next: 1, items: [{ id: 1, title: 'ok', url: 'https://static.klipy.com/a.webp', preview: 'https://static.klipy.com/p.webp' }, { id: 2, url: 'https://evil.com/a.webp' }, null, 'x', { id: 3, url: 'https://static.klipy.com/c.webp' }] });
    expect(r.hasNext).toBe(true);
    expect(r.items.map((i) => i.id)).toEqual(['1', '3']);
    expect(r.items[1].preview).toBe('https://static.klipy.com/c.webp');
    expect(parseItems(null)).toEqual({ items: [], hasNext: false });
    expect(parseItems({ items: 'nope' }).items).toEqual([]);
  });
  it('shows "Sticker" in chat list and quotes', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { previewText } = require('../src/features/chat/api') as typeof import('../src/features/chat/api');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { quoteText } = require('../src/features/chat/messageList') as typeof import('../src/features/chat/messageList');
    const c = stickerContent('https://static.klipy.com/a.webp');
    expect(previewText({ room_id: 'r', sender_id: 's', content: c, created_at: '', attachment_type: null })).toBe('Sticker');
    expect(quoteText({ content: c, attachment_type: null })).toBe('Sticker');
  });
});

describe('making my own sticker', () => {
  it('square crop is centred; fit keeps the whole picture with a 512 long side', () => {
    expect(fitSize(1000, 600, 'fill')).toEqual({ crop: { originX: 200, originY: 0, width: 600, height: 600 }, resize: { width: 512, height: 512 } });
    expect(fitSize(600, 1000, 'fill').crop).toEqual({ originX: 0, originY: 200, width: 600, height: 600 });
    expect(fitSize(1000, 600, 'fit')).toEqual({ resize: { width: 512 } });
    expect(fitSize(600, 1000, 'fit')).toEqual({ resize: { height: 512 } });
    expect(fitSize(0, 0, 'fit')).toEqual({});
  });
});

describe('recents and favourites', () => {
  it('keep newest first, no duplicates, drop unsafe entries, and wipe at sign-out', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { addToList, loadList, removeFromList, wipeLists } = require('../src/features/stickers/store') as typeof import('../src/features/stickers/store');
    const mk = (n: number) => ({ id: String(n), title: 't', url: `https://static.klipy.com/${n}.webp`, preview: `https://static.klipy.com/${n}.webp` });
    await addToList('recent', 'u1', mk(1)); await addToList('recent', 'u1', mk(2)); await addToList('recent', 'u1', mk(1));
    expect((await loadList('recent', 'u1')).map((i) => i.id)).toEqual(['1', '2']);
    expect((await loadList('recent', 'u2'))).toEqual([]);
    expect((await removeFromList('recent', 'u1', mk(1).url)).map((i) => i.id)).toEqual(['2']);
    for (let i = 10; i < 50; i++) await addToList('recent', 'u1', mk(i));
    expect((await loadList('recent', 'u1')).length).toBe(30);
    await wipeLists();
    expect(await loadList('recent', 'u1')).toEqual([]);
  });
});
