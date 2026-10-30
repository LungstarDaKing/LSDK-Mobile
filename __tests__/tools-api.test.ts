type Result = { data: unknown; error: { message: string; code?: string } | null };
const mockCalls: { op: string; args: unknown[] }[] = [];
let mockNext: Result = { data: null, error: null };
const mockChain: Record<string, unknown> = new Proxy({}, {
  get: (_t, prop: string) => {
    if (prop === 'then') return (res: (r: Result) => void) => res(mockNext);
    return (...args: unknown[]) => { mockCalls.push({ op: prop, args }); return mockChain; };
  },
});
jest.mock('@/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => { mockCalls.push({ op: 'from', args: a }); return mockChain; }, rpc: (...a: unknown[]) => { mockCalls.push({ op: 'rpc', args: a }); return mockChain; } } }));
import * as api from '@/features/tools/api';

beforeEach(() => { mockCalls.length = 0; mockNext = { data: null, error: null }; });
const rpc = () => mockCalls.find((c) => c.op === 'rpc')!.args;

describe('tools api', () => {
  test('exact RPC argument names', async () => {
    await api.saveMessage('m1', 'Recipes'); expect(rpc()).toEqual(['save_message', { p_message: 'm1', p_collection: 'Recipes' }]);
    mockCalls.length = 0; await api.setReminder('m1', new Date('2026-12-01T10:00:00Z')); expect(rpc()).toEqual(['set_reminder', { p_message: 'm1', p_when: '2026-12-01T10:00:00.000Z' }]);
    mockCalls.length = 0; await api.scheduleMessage({ room: 'r', content: 'hi', at: null, whenOnline: true });
    expect(rpc()).toEqual(['schedule_message', { p_room: 'r', p_content: 'hi', p_send_at: null, p_when_online: true, p_reply_to: null }]);
    mockCalls.length = 0; await api.searchMessages(' cat ', 'files'); expect(rpc()).toEqual(['search_messages', { p_q: 'cat', p_kind: 'files', p_before: null, p_limit: 40 }]);
  });
  test('messages written in SQL (P0001) reach the user; other errors stay generic', async () => {
    mockNext = { data: null, error: { message: 'You can have up to 100 reminders.', code: 'P0001' } };
    await expect(api.setReminder('m', new Date())).rejects.toThrow('You can have up to 100 reminders.');
    mockNext = { data: null, error: { message: 'relation "x" does not exist', code: '42P01' } };
    await expect(api.setReminder('m', new Date())).rejects.toThrow('Could not set the reminder.');
  });
  test('notes room returns the id, refuses a bad answer', async () => {
    mockNext = { data: 'room-9', error: null }; expect(await api.getNotesRoom()).toBe('room-9');
    mockNext = { data: null, error: null }; await expect(api.getNotesRoom()).rejects.toThrow('Could not open your notes.');
  });
  test('takeDueReminders deletes each row before reporting it', async () => {
    mockNext = { data: [{ id: 'a', remind_at: 'x', messages: null }], error: null };
    const got = await api.takeDueReminders();
    expect(got.map((r) => r.id)).toEqual(['a']);
    expect(mockCalls.some((c) => c.op === 'delete')).toBe(true);
  });
});
