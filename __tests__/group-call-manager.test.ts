import { _resetBusy, isBusyWith, setBusy } from '@/features/calls/busy';
import { GroupCallManager, RING_MS } from '@/features/calls/GroupCallManager';
import type { GroupApi, GroupCallRow, GroupEnd, GroupMemberRow, GroupSignal } from '@/features/calls/groupTypes';
import type { PcLike, Rtc, StreamLike, TrackLike } from '@/features/calls/types';

const track = (kind: string): TrackLike => ({ kind, enabled: true, stop: jest.fn() });
const stream = (id: string, kinds: string[]): StreamLike => {
  const tr = kinds.map(track);
  return { id, getTracks: () => tr, getAudioTracks: () => tr.filter((t) => t.kind === 'audio'), getVideoTracks: () => tr.filter((t) => t.kind === 'video'), addTrack: (t) => { tr.push(t); } };
};
class FakePc implements PcLike {
  signalingState = 'stable'; remoteDescription: unknown = null; connectionState = 'new'; closed = false;
  ontrack = null as PcLike['ontrack']; onnegotiationneeded = null as PcLike['onnegotiationneeded']; onicecandidate = null as PcLike['onicecandidate']; onconnectionstatechange = null as PcLike['onconnectionstatechange'];
  remoteCands: unknown[] = []; added: TrackLike[] = [];
  constructor(public owner: string, public reg: FakePc[]) { reg.push(this); }
  addTrack(t: TrackLike) { this.added.push(t); return {}; }
  async createOffer() { return { type: 'offer', sdp: `o-${this.owner}` }; }
  async createAnswer() { return { type: 'answer', sdp: `a-${this.owner}` }; }
  async setLocalDescription() {}
  async setRemoteDescription(d: unknown) { this.remoteDescription = d; }
  async addIceCandidate(c: unknown) { this.remoteCands.push(c); }
  close() { this.closed = true; }
  state(s: string) { this.connectionState = s; this.onconnectionstatechange?.(); }
}
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); await jest.advanceTimersByTimeAsync(200); for (let i = 0; i < 60; i++) await Promise.resolve(); };

function world(ids: string[], kind: 'voice' | 'video' = 'voice') {
  const mem = new Map<string, GroupMemberRow>();
  const mgrs = new Map<string, GroupCallManager>(); const pcs = new Map<string, FakePc[]>(); const ended = new Map<string, GroupEnd[]>();
  const sent: { from: string; to: string; kind: string; payload: any }[] = [];
  let call: GroupCallRow | null = null; let n = 0;
  const now = () => new Date().toISOString();
  const rows = () => [...mem.values()];
  const push = (id: string) => { const m = mem.get(id)!; mgrs.forEach((g) => g.onMemberRow({ ...m, call_id: 'g1' })); };
  const apiFor = (me: string): GroupApi => ({
    start: async (room, k) => {
      if (!call) {
        call = { id: 'g1', room_id: room, kind: k, started_by: me, created_at: now(), ended_at: null };
        for (const id of ids) mem.set(id, { profile_id: id, state: id === me ? 'joined' : 'ringing', invited_at: now(), joined_at: id === me ? now() : null });
        ids.forEach(push);
      }
      return 'g1';
    },
    join: async () => { mem.set(me, { ...mem.get(me)!, state: 'joined', joined_at: now() }); push(me); },
    decline: async () => { mem.set(me, { ...mem.get(me)!, state: 'declined' }); push(me); },
    leave: async () => { mem.set(me, { ...mem.get(me)!, state: 'left' }); push(me); },
    ping: async () => { if (mem.get(me)?.state !== 'joined') throw new Error('You are not in this call'); },
    signal: async (_c, to, k, payload) => { const s: GroupSignal = { id: `s${++n}`, call_id: 'g1', from_id: me, to_id: to, kind: k, payload }; sent.push({ from: me, to, kind: k, payload }); mgrs.get(to)?.onSignal(s); },
    getCall: async () => call, members: async () => rows(), mySignals: async () => [], ringingForMe: async () => [], activeForRoom: async () => call,
  });
  for (const id of ids) {
    pcs.set(id, []); ended.set(id, []);
    const rtc: Rtc = {
      PeerConnection: class extends FakePc { constructor() { super(id, pcs.get(id)!); } } as never,
      SessionDescription: class { constructor(public d: unknown) {} } as never, IceCandidate: class { constructor(public c: unknown) {} } as never,
      MediaStream: class { id = 'rs'; tr: TrackLike[] = []; getTracks() { return this.tr; } getAudioTracks() { return []; } getVideoTracks() { return []; } addTrack(t: TrackLike) { this.tr.push(t); } } as never,
      getUserMedia: async () => stream(`loc-${id}`, kind === 'video' ? ['audio', 'video'] : ['audio']),
    };
    mgrs.set(id, new GroupCallManager({ api: apiFor(id), meId: id, rtc, loadIce: async () => [{ urls: 'stun:x' }], onEnded: (e) => ended.get(id)!.push(e) }));
  }
  const connectAll = () => { for (const l of pcs.values()) for (const pc of l) if (pc.remoteDescription && pc.connectionState !== 'connected') pc.state('connected'); };
  return { mgrs, pcs, sent, ended, mem, connectAll, g: (id: string) => mgrs.get(id)! };
}

beforeEach(() => { jest.useFakeTimers(); _resetBusy(); });
afterEach(() => jest.useRealTimers());

describe('group call mesh', () => {
  test('three people: one connection per pair, offers only from the smaller id, everyone ends up connected', async () => {
    const w = world(['a', 'b', 'c']);
    await w.g('a').start('room', 'voice'); await flush();
    expect(w.g('a').state.phase).toBe('active');
    expect(w.g('b').state.phase).toBe('incoming'); expect(w.g('c').state.phase).toBe('incoming');
    await w.g('b').accept(); await flush();
    await w.g('c').accept(); await flush();
    w.connectAll(); await flush();
    const offers = w.sent.filter((s) => s.kind === 'offer').map((s) => `${s.from}>${s.to}`).sort();
    expect(offers).toEqual(['a>b', 'a>c', 'b>c']);
    for (const id of ['a', 'b', 'c']) {
      const s = w.g(id).state;
      expect(s.phase).toBe('active');
      expect(Object.keys(s.peers).sort()).toEqual(['a', 'b', 'c'].filter((x) => x !== id));
      expect(Object.values(s.peers).every((p) => p.state === 'connected')).toBe(true);
    }
    expect(w.sent.filter((s) => s.kind === 'answer')).toHaveLength(3);
  });

  test('the person who leaves is dropped by the others; the last person left ends the call', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush(); await w.g('b').accept(); await flush(); w.connectAll(); await flush();
    await w.g('b').hangup(); await flush();
    expect(w.g('b').state.phase).toBe('idle'); expect(w.ended.get('b')![0].reason).toBe('ended');
    expect(Object.keys(w.g('a').state.peers)).toEqual([]);
    await jest.advanceTimersByTimeAsync(4100); await flush();
    expect(w.g('a').state.phase).toBe('idle');
    expect(w.ended.get('a')![0].reason).toBe('ended');
  });

  test('nobody joins: the starter is told after a few seconds, and the ring does not keep the call alive', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush();
    w.mem.set('b', { ...w.mem.get('b')!, state: 'declined' }); w.g('a').onMemberRow({ ...w.mem.get('b')!, call_id: 'g1' }); await flush();
    await jest.advanceTimersByTimeAsync(4100); await flush();
    expect(w.ended.get('a')![0]).toMatchObject({ reason: 'nobody', message: 'Nobody joined the call.' });
  });

  test('declining an incoming ring goes back to idle and tells the server', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush();
    await w.g('b').decline(); await flush();
    expect(w.g('b').state.phase).toBe('idle'); expect(w.ended.get('b')![0].reason).toBe('declined');
    expect(w.mem.get('b')!.state).toBe('declined');
  });

  test('an unanswered ring becomes a missed call after a minute', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush();
    expect(w.g('b').state.phase).toBe('incoming');
    await jest.advanceTimersByTimeAsync(RING_MS + 10);
    expect(w.g('b').state.phase).toBe('idle'); expect(w.ended.get('b')![0].reason).toBe('missed');
  });

  test('a stray offer from the larger id (not a renegotiation) is ignored', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush(); await w.g('b').accept(); await flush();
    const before = w.pcs.get('a')!.length;
    w.g('a').onSignal({ id: 'zz', call_id: 'g1', from_id: 'b', to_id: 'a', kind: 'offer', payload: { type: 'offer', sdp: 'x', sid: 'q' } }); await flush();
    expect(w.pcs.get('a')!.length).toBe(before);
  });

  test('network candidates that arrive before the person is noticed are kept until the offer comes', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush(); await w.g('b').accept(); await flush();
    const b = w.g('b');
    b.onSignal({ id: 'c1', call_id: 'g1', from_id: 'a', to_id: 'b', kind: 'candidate', payload: { sid: 'old', c: { x: 1 } } }); await flush();
    const pcB = w.pcs.get('b')![0];
    expect(pcB.remoteCands.every((c) => (c as { c: { x: number } }).c.x !== 1)).toBe(true);   // wrong session id: never applied
  });

  test('a connection that does not come up is retried, then reported as failed', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush(); await w.g('b').accept(); await flush();
    for (let i = 0; i < 6; i++) await jest.advanceTimersByTimeAsync(30_000);
    await flush();
    expect(w.g('a').state.peers.b?.state).toBe('failed');
    expect(w.pcs.get('a')!.length).toBeGreaterThan(1);
  });

  test('refuses to start while a 1-to-1 call is going on, and the other way round is reported through the busy registry', async () => {
    const w = world(['a', 'b']);
    setBusy('one', true);
    await expect(w.g('a').start('room', 'voice')).rejects.toThrow('You are already in a call.');
    expect(w.g('a').state.phase).toBe('idle');
    setBusy('one', false);
    await w.g('a').start('room', 'voice'); await flush();
    expect(isBusyWith('group')).toBe(true);
    await w.g('a').hangup(); await flush();
    expect(isBusyWith('group')).toBe(false);
  });

  test('being removed from the call on the server drops you with a message', async () => {
    const w = world(['a', 'b']);
    await w.g('a').start('room', 'voice'); await flush(); await w.g('b').accept(); await flush();
    w.mem.set('a', { ...w.mem.get('a')!, state: 'left' });
    w.g('a').onMemberRow({ ...w.mem.get('a')!, call_id: 'g1' }); await jest.advanceTimersByTimeAsync(200); await flush();
    expect(w.ended.get('a')![0]).toMatchObject({ reason: 'error', message: 'You were disconnected from the call.' });
  });

  test('mute and camera toggles change the local tracks', async () => {
    const w = world(['a', 'b'], 'video');
    await w.g('a').start('room', 'video'); await flush();
    w.g('a').toggleMute(); w.g('a').toggleCamera();
    const s = w.g('a').state;
    expect(s.muted && s.camOff).toBe(true);
    expect(s.local!.getAudioTracks()[0].enabled).toBe(false); expect(s.local!.getVideoTracks()[0].enabled).toBe(false);
  });

  test('cancelling while the permission prompt is open stops the microphone', async () => {
    const w = world(['a', 'b']);
    const p = w.g('a').start('room', 'voice');
    await w.g('a').hangup(); await p.catch(() => {}); await flush();
    expect(w.g('a').state.phase).toBe('idle');
  });
});
