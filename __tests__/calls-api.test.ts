import { describeCall } from '@/features/calls/log';
import type { LogRow } from '@/features/calls/api';

const base = { id: 'c', caller_id: 'me', callee_id: 'bob', room_id: 'r', kind: 'voice', status: 'ended', created_at: '2026-10-01T10:00:00Z', answered_at: '2026-10-01T10:00:05Z', ended_at: '2026-10-01T10:01:10Z',
  caller: { username: 'me', avatar_path: null }, callee: { username: 'bob', avatar_path: 'x/y.jpg' } } as unknown as LogRow;

describe('call log', () => {
  test('outgoing answered call shows the other person and duration', () => {
    expect(describeCall(base, 'me')).toMatchObject({ peerId: 'bob', peerName: 'bob', label: 'Outgoing · 1:05', missed: false, avatar: 'x/y.jpg' });
  });
  test('incoming missed call is flagged; outgoing unanswered is not', () => {
    const miss = { ...base, status: 'missed', caller_id: 'bob', callee_id: 'me', caller: base.callee, callee: base.caller } as LogRow;
    expect(describeCall(miss, 'me')).toMatchObject({ peerId: 'bob', label: 'Missed', missed: true });
    expect(describeCall({ ...base, status: 'missed' } as LogRow, 'me')).toMatchObject({ label: 'No answer', missed: false });
  });
  test('declined / busy wording depends on who you are', () => {
    expect(describeCall({ ...base, status: 'declined' } as LogRow, 'me').label).toBe('Declined by them');
    expect(describeCall({ ...base, status: 'declined' } as LogRow, 'bob').label).toBe('You declined');
    expect(describeCall({ ...base, status: 'busy' } as LogRow, 'me').label).toBe('They were busy');
  });
  test('a deleted account does not crash the list', () => {
    expect(describeCall({ ...base, callee: null } as LogRow, 'me').peerName).toBe('Former member');
  });
});
