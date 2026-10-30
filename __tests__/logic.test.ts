import { setReaction, summarize, type ReactionMap } from '@/features/chat/reactions';
import { lastSeenMessageId, readersOf, seenCaption } from '@/features/chat/receipts';
import { statusText } from '@/features/chat/presence';
import type { Message, Participant } from '@/features/chat/api';

const msg = (id: string, sender: string, at: string): Message => ({
  id, room_id: 'r', sender_id: sender, content: id, created_at: at, edited_at: null, reply_to: null,
  attachment_path: null, attachment_name: null, attachment_type: null, attachment_duration: null, status_label: null,
});
const part = (id: string): Participant => ({ profile_id: id, role: 'member', joined_at: '2026-01-01T00:00:00Z', profiles: null });

describe('reactions', () => {
  it('sets, replaces and removes without mutating the old map', () => {
    const a: ReactionMap = new Map();
    const b = setReaction(a, 'm1', 'u1', '👍');
    expect(a.size).toBe(0);
    expect(b.get('m1')!.get('u1')).toBe('👍');
    const c = setReaction(b, 'm1', 'u1', '❤️');
    expect(c.get('m1')!.get('u1')).toBe('❤️');
    const d = setReaction(c, 'm1', 'u1', null);
    expect(d.has('m1')).toBe(false);
  });
  it('summarises most used first and flags mine', () => {
    let m: ReactionMap = new Map();
    m = setReaction(m, 'm', 'a', '👍'); m = setReaction(m, 'm', 'b', '❤️'); m = setReaction(m, 'm', 'c', '❤️');
    const chips = summarize(m.get('m'), 'a');
    expect(chips.map((c) => [c.emoji, c.count, c.mine])).toEqual([['❤️', 2, false], ['👍', 1, true]]);
    expect(summarize(undefined, 'a')).toEqual([]);
  });
});

describe('seen receipts', () => {
  const parts = [part('me'), part('bob'), part('amy')];
  const msgs = [msg('1', 'me', '2026-01-01T10:00:00Z'), msg('2', 'bob', '2026-01-01T10:01:00Z'), msg('3', 'me', '2026-01-01T10:02:00Z'), msg('4', 'me', '2026-01-01T10:03:00Z')];
  it('no reads -> nothing seen', () => expect(lastSeenMessageId(msgs, parts, 'me', new Map())).toBeNull());
  it('read time is inclusive and only my messages count', () => {
    const reads = new Map([['bob', new Date('2026-01-01T10:02:00Z')]]);
    expect(readersOf(msgs[2], parts, 'me', reads)).toEqual(['bob']);
    expect(lastSeenMessageId(msgs, parts, 'me', reads)).toBe('3'); // 4 is newer than bob's read
  });
  it('ignores my own read time', () => {
    expect(readersOf(msgs[0], parts, 'me', new Map([['me', new Date('2030-01-01')]]))).toEqual([]);
  });
  it('captions', () => { expect(seenCaption(true, 1)).toBe('Seen'); expect(seenCaption(false, 3)).toBe('Seen by 3'); });
});

describe('presence text', () => {
  const now = new Date(2026, 9, 21, 15, 0);
  it('hidden -> nothing', () => { expect(statusText(undefined, now)).toBeNull(); expect(statusText({ online: false, last_seen_at: null }, now)).toBeNull(); });
  it('online', () => expect(statusText({ online: true, last_seen_at: null }, now)).toBe('online'));
  it('today / yesterday / older', () => {
    expect(statusText({ online: false, last_seen_at: new Date(2026, 9, 21, 9, 5).toISOString() }, now)).toBe('last seen today at 09:05');
    expect(statusText({ online: false, last_seen_at: new Date(2026, 9, 20, 23, 59).toISOString() }, now)).toBe('last seen yesterday at 23:59');
    expect(statusText({ online: false, last_seen_at: new Date(2026, 8, 3, 8, 0).toISOString() }, now)).toBe('last seen 03/09/2026');
  });
  it('bad date -> nothing', () => expect(statusText({ online: false, last_seen_at: 'nope' }, now)).toBeNull());
});
