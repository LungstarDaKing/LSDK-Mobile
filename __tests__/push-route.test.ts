import { routeFor } from '@/features/push/route';
const id = '123e4567-e89b-12d3-a456-426614174000';
describe('push routing', () => {
  test('message opens that chat (web hash format accepted)', () => {
    expect(routeFor({ kind: 'message', path: `#/chat/${id}` })).toEqual({ pathname: '/chat/[roomId]', params: { roomId: id } });
  });
  test('missed call opens the Calls tab, incoming call too if no room', () => {
    expect(routeFor({ kind: 'missed_call', path: `#/chat/${id}` })).toEqual({ pathname: '/(tabs)/calls' });
    expect(routeFor({ kind: 'call', path: '#/chat' })).toEqual({ pathname: '/(tabs)/calls' });
  });
  test('group call without a usable path goes to the chat list', () => { expect(routeFor({ kind: 'group_call', path: '#/chat' })).toEqual({ pathname: '/(tabs)' }); });
  test('junk, injected paths and non-objects are ignored', () => {
    for (const bad of [{ kind: 'hack', path: `#/chat/${id}` }, { path: 'javascript:alert(1)' }, {}, 'x', 5]) expect(routeFor(bad)).toBeNull();
    expect(routeFor({ kind: 'message', path: '/chat/../../etc' })).toEqual({ pathname: '/(tabs)' });
    expect(routeFor({ kind: 'hack', path: 'nope' })).toBeNull();
    expect(routeFor(null)).toBeNull();
  });
});
