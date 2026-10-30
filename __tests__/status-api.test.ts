const mockCalls: { op: string; args: unknown[] }[] = [];
type Res = { data: unknown; error: { message: string } | null };
let mockNext: Res = { data: null, error: null };
let mockLast = '';
const mockByOp: Record<string, Res> = {};   // result for a chain that ends in this operation (overrides mockNext)
const mockChain: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'then') return (res: (r: unknown) => void) => res(mockByOp[mockLast] ?? mockNext);
    return (...args: unknown[]) => { mockLast = prop; mockCalls.push({ op: prop, args }); return mockChain; };
  },
});
jest.mock('expo-crypto', () => ({ randomUUID: () => '123e4567-e89b-42d3-a456-426614174999' }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => { mockCalls.push({ op: 'from', args: a }); return mockChain; },
    rpc: (...a: unknown[]) => { mockCalls.push({ op: 'rpc', args: a }); return mockChain; },
    storage: { from: (b: string) => { mockCalls.push({ op: 'bucket', args: [b] }); return mockChain; } },
  },
}));

import * as api from '@/features/status/api';
import { loadNicknames, setNickname } from '@/features/chat/nicknames';
import { friendlyError } from '@/lib/validation';

const ME = '123e4567-e89b-42d3-a456-426614174002';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
beforeEach(() => {
  mockCalls.length = 0; mockNext = { data: null, error: null }; mockLast = '';
  for (const k of Object.keys(mockByOp)) delete mockByOp[k];
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ arrayBuffer: async () => jpeg.buffer.slice(0) }));
});
const find = (op: string) => mockCalls.find((c) => c.op === op);
const ops = () => mockCalls.map((c) => c.op);

describe('stories', () => {
  it('loadStories only asks for statuses that have not expired', async () => {
    mockNext = { data: [], error: null };
    await api.loadStories();
    expect(find('from')!.args).toEqual(['stories']);
    const gt = find('gt')!.args;
    expect(gt[0]).toBe('expires_at');
    expect(Math.abs(Date.parse(gt[1] as string) - Date.now())).toBeLessThan(5000);
  });

  it('postTextStory trims, validates and inserts only text columns', async () => {
    mockNext = { data: { id: 's1' }, error: null };
    await api.postTextStory(ME, '  hello  ', 3);
    expect(find('insert')!.args[0]).toEqual({ author_id: ME, kind: 'text', content: 'hello', bg: 3 });
    mockCalls.length = 0;
    await expect(api.postTextStory(ME, '   ', 0)).rejects.toThrow(/1 to 300/);
    await expect(api.postTextStory(ME, 'x'.repeat(301), 0)).rejects.toThrow(/1 to 300/);
    await expect(api.postTextStory(ME, 'ok', 8)).rejects.toThrow(/colour/);
    await expect(api.postTextStory(ME, 'ok', 1.5)).rejects.toThrow(/colour/);
    expect(mockCalls.length).toBe(0);   // nothing reached the server
  });

  it('postMediaStory uploads to the stories bucket at <me>/<uuid>.<ext>, then inserts matching columns', async () => {
    mockNext = { data: { id: 's2' }, error: null };
    await api.postMediaStory(ME, { uri: 'file:///a.jpg', name: 'a.jpg', mime: 'image/jpeg', size: 7 }, 'image/jpeg', ' hi ');
    expect(mockCalls.find((c) => c.op === 'bucket')!.args[0]).toBe('stories');
    const up = find('upload')!;
    expect(up.args[0]).toBe(`${ME}/123e4567-e89b-42d3-a456-426614174999.jpg`);
    expect(up.args[2]).toEqual({ contentType: 'image/jpeg', upsert: false });
    expect(find('insert')!.args[0]).toEqual({
      author_id: ME, kind: 'image', content: 'hi', attachment_path: up.args[0], attachment_name: 'a.jpg', attachment_type: 'image/jpeg', attachment_size: 7,
    });
    expect(ops().indexOf('upload')).toBeLessThan(ops().indexOf('insert'));   // the server requires the file to exist first
  });

  it('postMediaStory refuses PDFs, mismatched bytes and long captions before uploading', async () => {
    await expect(api.postMediaStory(ME, { uri: 'x', name: 'a.pdf', mime: 'application/pdf', size: 1 }, 'application/pdf', '')).rejects.toThrow(/photos, videos or audio/);
    await expect(api.postMediaStory(ME, { uri: 'x', name: 'a.png', mime: 'image/png', size: 7 }, 'image/png', '')).rejects.toThrow(/does not match/);
    await expect(api.postMediaStory(ME, { uri: 'x', name: 'a.jpg', mime: 'image/jpeg', size: 7 }, 'image/jpeg', 'c'.repeat(301))).rejects.toThrow(/300/);
    expect(ops()).not.toContain('upload');
  });

  it('postMediaStory removes the uploaded file if the insert fails (e.g. the 20-a-day limit)', async () => {
    mockByOp.single = { data: null, error: { message: 'You can post at most 20 status updates per day.' } };   // upload succeeds, insert is refused
    let err: unknown;
    await api.postMediaStory(ME, { uri: 'x', name: 'a.jpg', mime: 'image/jpeg', size: 7 }, 'image/jpeg', '').catch((e) => { err = e; });
    expect(find('remove')!.args[0]).toEqual([`${ME}/123e4567-e89b-42d3-a456-426614174999.jpg`]);
    expect(friendlyError(err)).toBe('You can post at most 20 status updates per day.');
  });

  it('deleteStory verifies a row was deleted, then removes the file', async () => {
    mockNext = { data: [{ id: 's1' }], error: null };
    await api.deleteStory({ id: 's1', attachment_path: 'p/x.jpg' });
    expect(find('remove')!.args[0]).toEqual(['p/x.jpg']);
    mockCalls.length = 0; mockNext = { data: [], error: null };
    await expect(api.deleteStory({ id: 's1', attachment_path: 'p/x.jpg' })).rejects.toThrow(/Could not delete/);
    expect(ops()).not.toContain('remove');   // never delete the file if the row is still there
  });

  it('RPC calls use the exact server argument names', async () => {
    await api.markViewed('s'); await api.likeStory('s', true); await api.commentOnStory('s', ' nice '); await api.reportStory('s', ' spam ');
    await api.getViewers('s'); await api.getActivity('s'); await api.setSharing(false);
    expect(mockCalls.filter((c) => c.op === 'rpc').map((c) => c.args)).toEqual([
      ['mark_story_viewed', { p_story: 's' }], ['like_story', { p_story: 's', p_on: true }], ['comment_on_story', { p_story: 's', p_content: 'nice' }],
      ['report_story', { p_story: 's', p_reason: 'spam' }], ['get_story_viewers', { p_story: 's' }], ['get_story_activity', { p_story: 's' }], ['set_story_sharing', { p_on: false }],
    ]);
    await expect(api.commentOnStory('s', '   ')).rejects.toThrow(/1-300/);
  });

  it('views and likes come back as sets of ids', async () => {
    mockNext = { data: [{ story_id: 'a' }, { story_id: 'b' }], error: null };
    expect([...(await api.loadMyViews())]).toEqual(['a', 'b']);
    expect([...(await api.loadMyLikes(ME))]).toEqual(['a', 'b']);
    expect(mockCalls.some((c) => c.op === 'eq' && c.args[0] === 'user_id' && c.args[1] === ME)).toBe(true);
  });
  it('loadSharing defaults to on when there is no row', async () => {
    mockNext = { data: null, error: null };
    expect(await api.loadSharing(ME)).toBe(true);
  });
});

describe('nicknames', () => {
  it('loads only my nicknames', async () => {
    mockNext = { data: [{ target_id: 'bob', nickname: 'Bobby' }], error: null };
    const m = await loadNicknames(ME);
    expect(m.get('bob')).toBe('Bobby');
    expect(mockCalls.some((c) => c.op === 'eq' && c.args[0] === 'owner_id' && c.args[1] === ME)).toBe(true);
  });
  it('setNickname trims, allows empty (removes) and rejects > 30 before calling', async () => {
    await setNickname('bob', '  Bobby  ');
    expect(find('rpc')!.args).toEqual(['set_nickname', { p_target: 'bob', p_nick: 'Bobby' }]);
    mockCalls.length = 0;
    await setNickname('bob', '   ');
    expect(find('rpc')!.args).toEqual(['set_nickname', { p_target: 'bob', p_nick: '' }]);
    mockCalls.length = 0;
    await expect(setNickname('bob', 'x'.repeat(31))).rejects.toThrow(/30 characters/);
    expect(mockCalls.length).toBe(0);
  });
});
