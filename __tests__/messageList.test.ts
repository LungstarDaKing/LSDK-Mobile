import type { Message } from '@/features/chat/api';
import { applyUpdate, buildItems, dayLabel, listTime, markFailed, mergeIncoming, prependOlder, quoteText, replacePending, type ChatMsg } from '@/features/chat/messageList';

const m = (id: string, sender: string, at: string, over: Partial<Message> = {}): Message => ({
  id, room_id: 'r', sender_id: sender, content: id, created_at: at, edited_at: null, reply_to: null,
  attachment_path: null, attachment_name: null, attachment_type: null, attachment_duration: null, status_label: null, ...over,
});

describe('mergeIncoming', () => {
  it('appends new messages and keeps order', () => {
    const l = mergeIncoming([m('1', 'a', '2026-01-01T10:00:00Z')], m('2', 'b', '2026-01-01T10:01:00Z'), 'me');
    expect(l.map((x) => x.id)).toEqual(['1', '2']);
  });
  it('dedupes by id (realtime + response both arrive)', () => {
    const l = mergeIncoming([m('1', 'a', '2026-01-01T10:00:00Z')], m('1', 'a', '2026-01-01T10:00:00Z', { edited_at: 'x' }), 'me');
    expect(l.length).toBe(1);
    expect(l[0].edited_at).toBe('x');
  });
  it('removes my matching optimistic copy when the real one arrives', () => {
    const pending: ChatMsg = { ...m('tmp-1', 'me', '2026-01-01T10:00:00Z', { content: 'hi' }), _pending: true };
    const l = mergeIncoming([pending], m('real', 'me', '2026-01-01T10:00:01Z', { content: 'hi' }), 'me');
    expect(l.map((x) => x.id)).toEqual(['real']);
  });
  it('does not remove a pending copy when the content or reply differs', () => {
    const pending: ChatMsg = { ...m('tmp-1', 'me', '2026-01-01T10:00:00Z', { content: 'hi', reply_to: 'p' }), _pending: true };
    expect(mergeIncoming([pending], m('real', 'me', '2026-01-01T10:00:01Z', { content: 'hi' }), 'me').length).toBe(2);
    expect(mergeIncoming([pending], m('real', 'other', '2026-01-01T10:00:01Z', { content: 'hi', reply_to: 'p' }), 'me').length).toBe(2);
  });
  it('sorts when a message arrives out of order', () => {
    const l = mergeIncoming([m('2', 'a', '2026-01-01T10:05:00Z')], m('1', 'a', '2026-01-01T10:00:00Z'), 'me');
    expect(l.map((x) => x.id)).toEqual(['1', '2']);
  });
});

describe('send lifecycle', () => {
  const pending: ChatMsg = { ...m('tmp-1', 'me', '2026-01-01T10:00:00Z'), _pending: true };
  it('replacePending swaps tmp for real', () => expect(replacePending([pending], 'tmp-1', m('real', 'me', '2026-01-01T10:00:00Z')).map((x) => x.id)).toEqual(['real']));
  it('replacePending does not duplicate when realtime already delivered it', () => {
    const l = replacePending([pending, m('real', 'me', '2026-01-01T10:00:00Z')], 'tmp-1', m('real', 'me', '2026-01-01T10:00:00Z'));
    expect(l.map((x) => x.id)).toEqual(['real']);
  });
  it('markFailed flags the message', () => {
    const l = markFailed([pending], 'tmp-1');
    expect(l[0]._failed).toBe(true);
    expect(l[0]._pending).toBe(false);
  });
});

describe('update / older pages', () => {
  it('applyUpdate changes only the target', () => {
    const l = applyUpdate([m('1', 'a', '2026-01-01T10:00:00Z'), m('2', 'a', '2026-01-01T10:01:00Z')], m('2', 'a', '2026-01-01T10:01:00Z', { content: 'new', edited_at: 'e' }));
    expect(l.map((x) => x.content)).toEqual(['1', 'new']);
  });
  it('prependOlder skips ids already present', () => {
    const l = prependOlder([m('2', 'a', '2026-01-01T10:01:00Z')], [m('1', 'a', '2026-01-01T10:00:00Z'), m('2', 'a', '2026-01-01T10:01:00Z')]);
    expect(l.map((x) => x.id)).toEqual(['1', '2']);
  });
});

describe('buildItems', () => {
  const now = new Date('2026-10-21T12:00:00');
  it('adds day separators and groups quick runs from one sender', () => {
    const items = buildItems([
      m('1', 'bob', '2026-10-20T10:00:00'), m('2', 'bob', '2026-10-20T10:01:00'), m('3', 'bob', '2026-10-20T10:20:00'),
      m('4', 'amy', '2026-10-21T09:00:00'),
    ], { me: 'me', isDirect: false, now });
    expect(items.map((i) => (i.kind === 'day' ? `D:${i.label}` : `${i.msg.id}${i.grouped ? 'g' : ''}${i.showName ? 'n' : ''}`))).toEqual(
      ['D:Yesterday', '1n', '2g', '3n', 'D:Today', '4n']);
  });
  it('never shows names in direct chats or for my own messages', () => {
    const items = buildItems([m('1', 'bob', '2026-10-21T09:00:00'), m('2', 'me', '2026-10-21T09:01:00')], { me: 'me', isDirect: true, now });
    expect(items.filter((i) => i.kind === 'msg').every((i) => i.kind === 'msg' && !i.showName)).toBe(true);
  });
  it('does not group across midnight', () => {
    const items = buildItems([m('1', 'bob', '2026-10-20T23:59:00'), m('2', 'bob', '2026-10-21T00:01:00')], { me: 'me', isDirect: false, now });
    expect(items.filter((i) => i.kind === 'msg' && i.grouped).length).toBe(0);
  });
});

describe('labels', () => {
  const now = new Date('2026-10-21T12:00:00');
  it('dayLabel', () => {
    expect(dayLabel('2026-10-21T01:00:00', now)).toBe('Today');
    expect(dayLabel('2026-10-20T23:00:00', now)).toBe('Yesterday');
    expect(dayLabel('2026-03-05T10:00:00', now)).toBe('5 Mar');
    expect(dayLabel('2025-03-05T10:00:00', now)).toBe('5 Mar 2025');
  });
  it('quoteText', () => {
    expect(quoteText(undefined)).toBe('Original message unavailable');
    expect(quoteText({ content: 'hello', attachment_type: null })).toBe('hello');
    expect(quoteText({ content: 'x'.repeat(200), attachment_type: null }).length).toBe(80);
    expect(quoteText({ content: '', attachment_type: 'image/png' })).toBe('Photo');
  });
});

describe('listTime', () => {
  const now = new Date('2026-10-21T12:00:00');
  it('clock today, label otherwise, empty for bad input', () => {
    expect(listTime('2026-10-21T09:05:00', now)).toBe('09:05');
    expect(listTime('2026-10-20T09:05:00', now)).toBe('Yesterday');
    expect(listTime('2026-01-02T09:05:00', now)).toBe('2 Jan');
    expect(listTime('garbage', now)).toBe('');
  });
});

describe('mergeIncoming with attachments', () => {
  const base = { room_id: 'r', sender_id: 'me', content: '', created_at: '2026-01-01T00:00:00Z', edited_at: null, reply_to: null, attachment_path: null, status_label: null, attachment_duration: null };
  it('only drops the optimistic copy whose attachment name/type match', () => {
    const a: ChatMsg = { ...base, id: 'tmp-a', attachment_name: 'a.jpg', attachment_type: 'image/jpeg', _pending: true };
    const b: ChatMsg = { ...base, id: 'tmp-b', attachment_name: 'b.jpg', attachment_type: 'image/jpeg', _pending: true };
    const real = { ...base, id: 'real-b', attachment_path: 'p', attachment_name: 'b.jpg', attachment_type: 'image/jpeg' };
    const out = mergeIncoming([a, b], real, 'me');
    expect(out.map((x) => x.id).sort()).toEqual(['real-b', 'tmp-a']);
  });
});
