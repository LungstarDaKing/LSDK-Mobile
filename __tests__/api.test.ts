// Verifies what the data layer sends to the backend, using a fake Supabase client.
type Result = { data: unknown; error: { message: string } | null };
const mockCalls: { op: string; args: unknown[] }[] = [];
let mockNext: Result = { data: null, error: null };

const mockChain: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'then') return (res: (r: Result) => void) => res(mockNext);
    return (...args: unknown[]) => { mockCalls.push({ op: prop, args }); return mockChain; };
  },
});
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => { mockCalls.push({ op: 'from', args: a }); return mockChain; }, rpc: (...a: unknown[]) => { mockCalls.push({ op: 'rpc', args: a }); return mockChain; } } }));

import * as api from '@/features/chat/api';

beforeEach(() => { mockCalls.length = 0; mockNext = { data: null, error: null }; });
const find = (op: string) => mockCalls.find((c) => c.op === op);

describe('rooms', () => {
  it('createDirectRoom sends other_user_id and returns the id', async () => {
    mockNext = { data: 'room-1', error: null };
    expect(await api.createDirectRoom('u2')).toBe('room-1');
    expect(find('rpc')!.args).toEqual(['create_direct_room', { other_user_id: 'u2' }]);
  });
  it('createGroupRoom trims the name and validates before calling', async () => {
    mockNext = { data: 'g1', error: null };
    await api.createGroupRoom('  Crew  ', ['a', 'b']);
    expect(find('rpc')!.args).toEqual(['create_group_room', { room_name: 'Crew', member_ids: ['a', 'b'] }]);
    mockCalls.length = 0;
    await expect(api.createGroupRoom('   ', [])).rejects.toThrow(/1-60/);
    await expect(api.createGroupRoom('x'.repeat(61), [])).rejects.toThrow(/1-60/);
    await expect(api.createGroupRoom('ok', Array(50).fill('x'))).rejects.toThrow(/Too many/);
    expect(mockCalls.length).toBe(0); // never reached the server
  });
  it('member management uses the exact argument names', async () => {
    await api.renameRoom('r', ' New '); await api.addMember('r', 'u'); await api.removeMember('r', 'u');
    await api.setMemberRole('r', 'u', 'admin'); await api.leaveRoom('r');
    expect(mockCalls.filter((c) => c.op === 'rpc').map((c) => c.args)).toEqual([
      ['rename_room', { p_room: 'r', new_name: 'New' }],
      ['add_room_member', { p_room: 'r', p_user: 'u' }],
      ['remove_room_member', { p_room: 'r', p_user: 'u' }],
      ['set_member_role', { p_room: 'r', p_user: 'u', new_role: 'admin' }],
      ['leave_room', { p_room: 'r' }],
    ]);
  });
  it('server errors are thrown', async () => {
    mockNext = { data: null, error: { message: 'Only room admins can do that' } };
    await expect(api.addMember('r', 'u')).rejects.toMatchObject({ message: 'Only room admins can do that' });
  });
});

describe('searchUsers', () => {
  it('needs 2+ characters and does not hit the network otherwise', async () => {
    expect(await api.searchUsers(' a ', 'me')).toEqual([]);
    expect(mockCalls.length).toBe(0);
  });
  it('escapes LIKE wildcards and excludes me and already-added people', async () => {
    mockNext = { data: [{ id: 'a', username: 'a_1', avatar_path: null, bio: null }, { id: 'b', username: 'bb', avatar_path: null, bio: null }], error: null };
    const hits = await api.searchUsers('a_%', 'me', ['b']);
    expect(find('ilike')!.args).toEqual(['username', '%a\\_\\%%']);
    expect(find('neq')!.args).toEqual(['id', 'me']);
    expect(hits.map((h) => h.id)).toEqual(['a']);
  });
});

describe('messages', () => {
  it('loadMessages reports hasMore and returns oldest-first', async () => {
    mockNext = { data: [{ id: '3' }, { id: '2' }, { id: '1' }], error: null }; // newest first, limit+1 rows
    const r = await api.loadMessages('r', 2);
    expect(r.hasMore).toBe(true);
    expect(r.messages.map((m) => m.id)).toEqual(['2', '3']);
    mockNext = { data: [{ id: '2' }, { id: '1' }], error: null };
    expect((await api.loadMessages('r', 2)).hasMore).toBe(false);
  });
  it('sendText ignores blank drafts and includes reply_to', async () => {
    expect(await api.sendText('r', 'me', '   ')).toBeNull();
    expect(mockCalls.length).toBe(0);
    mockNext = { data: { id: 'm' }, error: null };
    await api.sendText('r', 'me', ' hi ', 'parent');
    expect(find('insert')!.args[0]).toEqual({ room_id: 'r', sender_id: 'me', content: 'hi', reply_to: 'parent' });
  });
  it('editMessage fails when no row comes back (not the sender)', async () => {
    mockNext = { data: null, error: null };
    await expect(api.editMessage('m', 'x')).rejects.toThrow(/Could not edit/);
    await expect(api.editMessage('m', '  ')).rejects.toThrow(/1 to 1000/);
  });
  it('deleteMessage fails when zero rows were deleted (RLS hides the failure)', async () => {
    mockNext = { data: [], error: null };
    await expect(api.deleteMessage('m')).rejects.toThrow(/Could not delete/);
    mockNext = { data: [{ id: 'm' }], error: null };
    await expect(api.deleteMessage('m')).resolves.toBeUndefined();
  });
  it('reportMessage validates the reason', async () => {
    await expect(api.reportMessage('m', '  ')).rejects.toThrow(/describe/);
    await expect(api.reportMessage('m', 'x'.repeat(501))).rejects.toThrow(/500/);
    await api.reportMessage('m', ' spam ');
    expect(find('rpc')!.args).toEqual(['report_message', { p_message: 'm', p_reason: 'spam' }]);
  });
});

describe('read state / reactions / presence', () => {
  it('markRead goes through mark_room_read (room_reads is not writable directly)', async () => {
    await api.markRead('r');
    expect(find('rpc')!.args).toEqual(['mark_room_read', { p_room: 'r' }]);
    expect(find('from')).toBeUndefined();
  });
  it('loadReads converts timestamps to Dates', async () => {
    mockNext = { data: [{ profile_id: 'u', last_read_at: '2026-01-01T10:00:00Z' }], error: null };
    const m = await api.loadReads('r');
    expect(m.get('u')!.toISOString()).toBe('2026-01-01T10:00:00.000Z');
  });
  it('reactToMessage returns the toggled emoji', async () => {
    mockNext = { data: '👍', error: null };
    expect(await api.reactToMessage('m', '👍')).toBe('👍');
    expect(find('rpc')!.args).toEqual(['react_to_message', { p_message: 'm', p_emoji: '👍' }]);
  });
  it('getStatuses caps at 100 ids and skips empty mockCalls', async () => {
    expect((await api.getStatuses([])).size).toBe(0);
    expect(mockCalls.length).toBe(0);
    await api.getStatuses(Array.from({ length: 150 }, (_, i) => String(i)));
    expect((find('rpc')!.args[1] as { p_ids: string[] }).p_ids.length).toBe(100);
  });
  it('loadPrivacy defaults to everything on when no row exists', async () => {
    mockNext = { data: null, error: null };
    expect(await api.loadPrivacy('me')).toEqual({ show_online: true, show_last_seen: true, read_receipts: true });
  });
});

describe('helpers', () => {
  const room = (over: Partial<api.Room>): api.Room => ({ id: 'r', name: null, is_direct: true, notes_owner: null, last_message_at: '', participants: [], ...over });
  const p = (id: string, username: string, role = 'member'): api.Participant => ({ profile_id: id, role, joined_at: '', profiles: { username, avatar_path: null, bio: null } });
  it('roomTitle', () => {
    expect(api.roomTitle(room({ participants: [p('me', 'me'), p('bob', 'bob')] }), 'me')).toBe('bob');
    expect(api.roomTitle(room({ is_direct: false, name: 'Crew' }), 'me')).toBe('Crew');
    expect(api.roomTitle(room({ notes_owner: 'me' }), 'me')).toBe('Notes to self');
  });
  it('myRole', () => expect(api.myRole(room({ participants: [p('me', 'me', 'admin')] }), 'me')).toBe('admin'));
  it('previewText', () => {
    expect(api.previewText(undefined)).toBe('No messages yet');
    expect(api.previewText({ room_id: 'r', sender_id: 's', content: '', created_at: '', attachment_type: 'audio/webm' })).toBe('Voice message');
  });
});
