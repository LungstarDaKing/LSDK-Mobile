const mockRpc = jest.fn();
const mockEq = jest.fn();
jest.mock('../src/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => mockRpc(...a), from: () => ({ select: () => ({ eq: (...a: unknown[]) => mockEq(...a) }) }) } }));
import { loadMarkedUnread, setMarkedUnread } from '../src/features/tools/api';

describe('mark as unread', () => {
  beforeEach(() => { mockRpc.mockReset(); mockEq.mockReset(); });
  it('calls the database function', async () => {
    mockRpc.mockResolvedValue({ error: null });
    await setMarkedUnread('r1', true);
    expect(mockRpc).toHaveBeenCalledWith('set_marked_unread', { p_room: 'r1', p_value: true });
  });
  it('surfaces a friendly error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'boom' } });
    await expect(setMarkedUnread('r1', false)).rejects.toThrow('Could not update that chat.');
  });
  it('loads flagged rooms and tolerates a missing table', async () => {
    mockEq.mockResolvedValueOnce({ data: [{ room_id: 'a' }, { room_id: 'b' }], error: null });
    expect([...(await loadMarkedUnread())]).toEqual(['a', 'b']);
    mockEq.mockResolvedValueOnce({ data: null, error: { message: 'no table' } });
    expect((await loadMarkedUnread()).size).toBe(0);
  });
});
