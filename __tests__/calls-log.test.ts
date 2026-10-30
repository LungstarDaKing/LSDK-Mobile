// group call log
import { describeGroupCall, type GroupLogRow } from '../src/features/calls/log';

const row = (o: Partial<GroupLogRow> = {}, g: Partial<NonNullable<GroupLogRow['group_calls']>> = {}): GroupLogRow => ({
  call_id: 'c1', state: 'joined', joined_at: '2026-01-01T10:00:00Z', left_at: '2026-01-01T10:05:30Z', invited_at: '2026-01-01T09:59:50Z',
  group_calls: { id: 'c1', room_id: 'r1', kind: 'voice', started_by: 'me', created_at: '2026-01-01T09:59:50Z', ended_at: '2026-01-01T10:06:00Z', rooms: { name: 'Crew' }, ...g }, ...o,
});
describe('group call log', () => {
  it('shows who started it, how long I was in, and the group name', () => {
    expect(describeGroupCall(row(), 'me')).toMatchObject({ peerName: 'Crew', label: 'Started · 5:30', missed: false, group: { roomId: 'r1', callId: 'c1' } });
    expect(describeGroupCall(row({}, { started_by: 'bob' }), 'me')?.label).toBe('Joined · 5:30');
  });
  it('flags missed and declined, and still-running calls', () => {
    expect(describeGroupCall(row({ state: 'missed' }), 'me')).toMatchObject({ label: 'Missed', missed: true });
    expect(describeGroupCall(row({ state: 'declined' }), 'me')?.label).toBe('You declined');
    expect(describeGroupCall(row({ left_at: null }, { ended_at: null }), 'me')?.label).toContain('still going');
  });
  it('ignores rows whose call is gone and tolerates a missing group name', () => {
    expect(describeGroupCall(row({ group_calls: null }), 'me')).toBeNull();
    expect(describeGroupCall(row({}, { rooms: null }), 'me')?.peerName).toBe('Group');
    expect(describeGroupCall(row({}, { rooms: [{ name: 'Arr' }] }), 'me')?.peerName).toBe('Arr');
  });
});
