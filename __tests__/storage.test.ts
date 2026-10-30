const mockCalls: { op: string; args: unknown[] }[] = [];
let mockNext: { data: unknown; error: { message: string } | null } = { data: null, error: null };
const mockChain: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'then') return (res: (r: unknown) => void) => res(mockNext);
    return (...args: unknown[]) => { mockCalls.push({ op: prop, args }); return mockChain; };
  },
});
const mockBucket = (name: string) => { mockCalls.push({ op: 'bucket', args: [name] }); return mockChain; };
jest.mock('expo-crypto', () => ({ randomUUID: () => '123e4567-e89b-42d3-a456-426614174999' }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...a: unknown[]) => { mockCalls.push({ op: 'from', args: a }); return mockChain; },
    rpc: (...a: unknown[]) => { mockCalls.push({ op: 'rpc', args: a }); return mockChain; },
    storage: { from: (b: string) => mockBucket(b) },
    auth: { updateUser: (...a: unknown[]) => { mockCalls.push({ op: 'updateUser', args: a }); return mockChain; } },
  },
}));

import * as s from '@/features/media/storage';

const R = '123e4567-e89b-42d3-a456-426614174001';
const U = '123e4567-e89b-42d3-a456-426614174002';
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
beforeEach(() => {
  mockCalls.length = 0; mockNext = { data: null, error: null };
  (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ arrayBuffer: async () => jpeg.buffer.slice(0) }));
});
const ops = () => mockCalls.map((c) => c.op);

describe('uploadMedia', () => {
  it('uploads to media at <room>/<user>/<uuid>.<ext> with the right content type', async () => {
    const up = await s.uploadMedia(R, U, { uri: 'file:///a.jpg', name: 'a.jpg', mime: 'image/jpeg', size: 7 }, 'image/jpeg', 'photo.jpg');
    expect(up.path).toBe(`${R}/${U}/123e4567-e89b-42d3-a456-426614174999.jpg`);
    expect(up).toMatchObject({ type: 'image/jpeg', size: 7, name: 'a.jpg', durationMs: null });
    const u = mockCalls.find((c) => c.op === 'upload')!;
    expect(u.args[0]).toBe(up.path);
    expect(u.args[2]).toEqual({ contentType: 'image/jpeg', upsert: false });
  });
  it('refuses a file whose bytes do not match, without uploading', async () => {
    await expect(s.uploadMedia(R, U, { uri: 'x', name: 'a.png', mime: 'image/png', size: 7 }, 'image/png', 'photo.png')).rejects.toThrow(/does not match/);
    expect(ops()).not.toContain('upload');
  });
  it('refuses too-short voice notes and cleans the upload up', async () => {
    const m4a = new Uint8Array(16); m4a.set([0x66, 0x74, 0x79, 0x70], 4);
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ arrayBuffer: async () => m4a.buffer.slice(0) }));
    await expect(s.uploadMedia(R, U, { uri: 'x', name: null, mime: 'audio/mp4', size: 16, durationMs: 100 }, 'audio/mp4', 'voice.m4a')).rejects.toThrow(/too short/);
    expect(ops()).toContain('remove');
  });
  it('keeps voice duration for audio', async () => {
    const m4a = new Uint8Array(16); m4a.set([0x66, 0x74, 0x79, 0x70], 4);
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ arrayBuffer: async () => m4a.buffer.slice(0) }));
    const up = await s.uploadMedia(R, U, { uri: 'x', name: null, mime: 'audio/mp4', size: 16, durationMs: 4200 }, 'audio/mp4', 'voice.m4a');
    expect(up.durationMs).toBe(4200);
    expect(up.name).toBe('voice.m4a');
  });
});

describe('sendAttachment', () => {
  const up = { path: `${R}/${U}/x.jpg`, name: 'a.jpg', type: 'image/jpeg', size: 7, durationMs: null };
  it('inserts all attachment columns the server requires', async () => {
    mockNext = { data: { id: 'm1' }, error: null };
    await s.sendAttachment(R, U, up, ' hi ', null);
    const ins = mockCalls.find((c) => c.op === 'insert')!.args[0] as Record<string, unknown>;
    expect(ins).toMatchObject({ room_id: R, sender_id: U, content: 'hi', attachment_path: up.path, attachment_name: 'a.jpg', attachment_type: 'image/jpeg', attachment_size: 7 });
    expect('attachment_duration' in ins).toBe(false);
  });
  it('removes the uploaded file when the insert fails', async () => {
    mockNext = { data: null, error: { message: 'boom' } };
    await expect(s.sendAttachment(R, U, up, '', null)).rejects.toBeTruthy();
    expect(mockCalls.find((c) => c.op === 'remove')!.args[0]).toEqual([up.path]);
  });
});

describe('profile + account', () => {
  it('setAvatarPath updates and then deletes the previous file', async () => {
    mockNext = { data: [{ id: U }], error: null };
    await s.setAvatarPath(U, 'new', 'old');
    expect(mockCalls.find((c) => c.op === 'update')!.args[0]).toEqual({ avatar_path: 'new' });
    expect(mockCalls.find((c) => c.op === 'remove')!.args[0]).toEqual(['old']);
  });
  it('setAvatarPath throws (and removes nothing) when RLS matched 0 rows', async () => {
    mockNext = { data: [], error: null };
    await expect(s.setAvatarPath(U, 'new', 'old')).rejects.toThrow();
    expect(ops()).not.toContain('remove');
  });
  it('deleteAccountEverything deletes files first and the account last', async () => {
    mockNext = { data: [{ name: 'f1.jpg' }], error: null };
    await s.deleteAccountEverything(U, [R], 'avatar/path.jpg');
    const o = ops();
    expect(o.indexOf('remove')).toBeGreaterThan(-1);
    expect(o[o.length - 1]).toBe('rpc');
    expect(mockCalls[mockCalls.length - 1].args).toEqual(['delete_my_account']);
  });
  it('deleteAccountEverything does NOT delete the account if file removal fails', async () => {
    mockNext = { data: null, error: { message: 'nope' } };
    await expect(s.deleteAccountEverything(U, [], 'a.jpg')).rejects.toBeTruthy();
    expect(ops()).not.toContain('rpc');
  });
});
