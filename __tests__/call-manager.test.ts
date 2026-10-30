import { CallManager, RING_MS, CONNECT_MS, DROP_MS } from '@/features/calls/CallManager';
import type { CallApi, CallRow, EndInfo, PcLike, Rtc, Signal, StreamLike, TrackLike } from '@/features/calls/types';

const track = (kind: string): TrackLike => ({ kind, enabled: true, stop: jest.fn() });
const stream = (id: string, kinds: string[]): StreamLike => {
  const tr = kinds.map(track);
  return { id, getTracks: () => tr, getAudioTracks: () => tr.filter((t) => t.kind === 'audio'), getVideoTracks: () => tr.filter((t) => t.kind === 'video'), addTrack: (t) => { tr.push(t); } };
};
class FakePc implements PcLike {
  static all: FakePc[] = [];
  signalingState = 'stable'; remoteDescription: unknown = null; connectionState = 'new';
  ontrack = null as PcLike['ontrack']; onnegotiationneeded = null as PcLike['onnegotiationneeded']; onicecandidate = null as PcLike['onicecandidate']; onconnectionstatechange = null as PcLike['onconnectionstatechange'];
  added: TrackLike[] = []; remoteCands: unknown[] = []; closed = false; remoteSet: unknown[] = [];
  constructor(public cfg: unknown) { FakePc.all.push(this); }
  addTrack(t: TrackLike) { this.added.push(t); return {}; }
  async createOffer() { return { type: 'offer', sdp: 'o' }; }
  async createAnswer() { return { type: 'answer', sdp: 'a' }; }
  async setLocalDescription() {}
  async setRemoteDescription(d: unknown) { this.remoteDescription = d; this.remoteSet.push(d); }
  async addIceCandidate(c: unknown) { this.remoteCands.push(c); }
  close() { this.closed = true; }
  state(s: string) { this.connectionState = s; this.onconnectionstatechange?.(); }
}
const rtc = (mic: () => Promise<StreamLike>): Rtc => ({
  PeerConnection: FakePc as never,
  SessionDescription: class { constructor(public d: unknown) {} } as never,
  IceCandidate: class { constructor(public c: unknown) {} } as never,
  MediaStream: class { id = 'x'; tr: TrackLike[] = []; getTracks() { return this.tr; } getAudioTracks() { return []; } getVideoTracks() { return []; } addTrack(t: TrackLike) { this.tr.push(t); } } as never,
  getUserMedia: mic,
});

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const row = (o: Partial<CallRow> = {}): CallRow => ({ id: 'c1', caller_id: 'me', callee_id: 'bob', room_id: 'r', kind: 'voice', status: 'ringing', created_at: new Date().toISOString(), answered_at: null, ended_at: null, ...o });
function setup(meId = 'me', mic: () => Promise<StreamLike> = async () => stream('loc', ['audio'])) {
  FakePc.all = [];
  let current: CallRow | null = row();
  const api = {
    start: jest.fn(async () => 'c1'), answer: jest.fn(async () => {}), decline: jest.fn(async () => {}), end: jest.fn(async () => {}), signal: jest.fn(async () => {}),
    getCall: jest.fn(async () => current), ringingForMe: jest.fn(async () => [] as CallRow[]), pendingSignals: jest.fn(async () => [] as Signal[]),
  } as unknown as jest.Mocked<CallApi>;
  const ended: EndInfo[] = [];
  const m = new CallManager({ api, meId, rtc: rtc(mic), loadIce: async () => [{ urls: 'stun:x' }], onEnded: (e) => ended.push(e) });
  return { m, api, ended, setCall: (c: CallRow | null) => { current = c; } };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('outgoing call', () => {
  test('rings, then connects when the callee answers, sends an offer and goes active', async () => {
    const { m, api } = setup();
    await m.start('bob', 'voice');
    expect(m.s.phase).toBe('outgoing');
    expect(api.start).toHaveBeenCalledWith('bob', 'voice');
    m.onCallRow(row({ status: 'accepted' })); await flush();
    expect(m.s.phase).toBe('connecting');
    expect(api.signal).toHaveBeenCalledWith('c1', 'offer', { type: 'offer', sdp: 'o' });
    FakePc.all[0].state('connected');
    expect(m.s.phase).toBe('active');
  });
  test('busy: ends straight away with a message and releases the microphone', async () => {
    const { m, ended, setCall } = setup(); setCall(row({ status: 'busy' }));
    const local = stream('l', ['audio']); (m as never as { media: unknown }).media = async () => local;
    await m.start('bob', 'voice');
    expect(ended[0]).toMatchObject({ reason: 'busy', message: 'They are on another call.' });
    expect(local.getTracks()[0].stop).toHaveBeenCalled();
    expect(m.s.phase).toBe('idle');
  });
  test('nobody answers: hangs up after the ring timeout', async () => {
    const { m, api, ended } = setup();
    await m.start('bob', 'voice');
    jest.advanceTimersByTime(RING_MS + 1); await flush();
    expect(api.end).toHaveBeenCalledWith('c1');
    expect(ended[0].reason).toBe('cancelled');
  });
  test('microphone refused: friendly error, idle, nothing sent to the server', async () => {
    const { m, api, ended } = setup('me', async () => { throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); });
    await expect(m.start('bob', 'voice')).rejects.toThrow(/Microphone or camera access is off/);
    expect(api.start).not.toHaveBeenCalled();
    expect(ended[0].reason).toBe('error'); expect(m.s.phase).toBe('idle');
  });
  test('server refuses (rate limit etc.): error is surfaced and the call state is cleaned up', async () => {
    const { m, api, ended } = setup(); api.start.mockRejectedValueOnce(new Error('Too many calls'));
    await expect(m.start('bob', 'voice')).rejects.toThrow('Too many calls');
    expect(ended[0]).toMatchObject({ reason: 'error', message: 'Too many calls' });
  });
  test('cannot start a second call', async () => {
    const { m } = setup(); await m.start('bob', 'voice');
    await expect(m.start('cy', 'voice')).rejects.toThrow('already in a call');
  });
  test('cancelling while ringing ends the call', async () => {
    const { m, api, ended } = setup(); await m.start('bob', 'voice'); await m.hangup();
    expect(api.end).toHaveBeenCalledWith('c1'); expect(ended[0].reason).toBe('cancelled');
  });
  test('cancelled while the server is still creating the call: it is ended and the screen stays closed', async () => {
    const { m, api, ended } = setup();
    let release!: (id: string) => void;
    api.start.mockImplementationOnce(() => new Promise<string>((r) => { release = r; }));
    const starting = m.start('bob', 'voice'); await flush();
    await m.hangup(); expect(ended[0].reason).toBe('cancelled');
    release('c1'); await starting; await flush();
    expect(api.end).toHaveBeenCalledWith('c1'); expect(m.s.phase).toBe('idle'); expect(ended).toHaveLength(1);
  });
  test('callee declines: caller is told', async () => {
    const { m, ended } = setup(); await m.start('bob', 'voice');
    m.onCallRow(row({ status: 'declined' }));
    expect(ended[0]).toMatchObject({ reason: 'declined', message: 'They declined the call.' });
  });
});

describe('incoming call', () => {
  const incoming = () => row({ caller_id: 'bob', callee_id: 'me' });
  test('shows up, accept answers and waits for the offer, then replies with an answer', async () => {
    const { m, api } = setup();
    m.onCallRow(incoming());
    expect(m.s).toMatchObject({ phase: 'incoming', peerId: 'bob', kind: 'voice' });
    // offer arrives BEFORE we finished accepting -> buffered
    m.onSignal({ id: 's1', call_id: 'c1', from_id: 'bob', to_id: 'me', kind: 'offer', payload: { type: 'offer', sdp: 'o' } });
    await m.accept(); await flush();
    expect(api.answer).toHaveBeenCalledWith('c1');
    expect(m.s.phase).toBe('connecting');
    expect(api.signal).toHaveBeenCalledWith('c1', 'answer', { type: 'answer', sdp: 'a' });
  });
  test('ignores stale (>60 s), foreign, and second-while-busy calls', async () => {
    const { m } = setup();
    m.onCallRow(row({ caller_id: 'bob', callee_id: 'me', created_at: new Date(Date.now() - 120_000).toISOString() }));
    expect(m.s.phase).toBe('idle');
    m.onCallRow(row({ caller_id: 'x', callee_id: 'y' }));
    expect(m.s.phase).toBe('idle');
    m.onCallRow(incoming());
    m.onCallRow(row({ id: 'c2', caller_id: 'cy', callee_id: 'me' }));
    expect(m.s.call?.id).toBe('c1');
  });
  test('decline tells the server and goes idle', async () => {
    const { m, api, ended } = setup(); m.onCallRow(incoming()); await m.decline();
    expect(api.decline).toHaveBeenCalledWith('c1'); expect(ended[0].reason).toBe('declined'); expect(m.s.phase).toBe('idle');
  });
  test('caller cancels while it rings: ringing screen disappears', async () => {
    const { m, ended } = setup(); m.onCallRow(incoming()); m.onCallRow(row({ caller_id: 'bob', callee_id: 'me', status: 'missed' }));
    expect(m.s.phase).toBe('idle'); expect(ended[0].reason).toBe('missed');
  });
  test('answer fails: we decline and report, no stuck state', async () => {
    const { m, api, ended } = setup(); m.onCallRow(incoming()); api.answer.mockRejectedValueOnce(new Error('no longer ringing'));
    await m.accept();
    expect(api.decline).toHaveBeenCalled(); expect(ended[0].reason).toBe('error'); expect(m.s.phase).toBe('idle');
  });
  test('checkRinging picks up a call that arrived while the app was closed', async () => {
    const { m, api } = setup(); api.ringingForMe.mockResolvedValueOnce([incoming()]);
    await m.checkRinging(); expect(m.s.phase).toBe('incoming');
  });
});

describe('signalling', () => {
  async function connected() {
    const t = setup(); await t.m.start('bob', 'voice'); t.m.onCallRow(row({ status: 'accepted' })); await flush();
    return { ...t, pc: FakePc.all[0] };
  }
  test('duplicate signals are applied once; candidates wait for the remote description', async () => {
    const { m, pc } = await connected();
    const cand: Signal = { id: 'k1', call_id: 'c1', from_id: 'bob', to_id: 'me', kind: 'candidate', payload: { candidate: 'x' } };
    m.onSignal(cand); m.onSignal(cand); await flush();
    expect(pc.remoteCands).toHaveLength(0);                       // no answer yet
    m.onSignal({ id: 'a1', call_id: 'c1', from_id: 'bob', to_id: 'me', kind: 'answer', payload: { type: 'answer', sdp: 'a' } }); await flush();
    expect(pc.remoteCands).toHaveLength(1);
  });
  test('signals for other calls or other people are ignored', async () => {
    const { m, pc } = await connected();
    m.onSignal({ id: 'z', call_id: 'other', from_id: 'bob', to_id: 'me', kind: 'answer', payload: {} });
    m.onSignal({ id: 'y', call_id: 'c1', from_id: 'bob', to_id: 'someone', kind: 'answer', payload: {} }); await flush();
    expect(pc.remoteSet).toHaveLength(0);
  });
  test('polling feeds missed signals through the same path', async () => {
    const { m, api, pc } = await connected();
    api.pendingSignals.mockResolvedValueOnce([{ id: 'a1', call_id: 'c1', from_id: 'bob', to_id: 'me', kind: 'answer', payload: { type: 'answer' } }]);
    await m.pollSignals(); await flush();
    expect(pc.remoteSet).toHaveLength(1);
  });
  test('glare: the impolite caller ignores a colliding offer, the polite callee accepts it', async () => {
    const { m, pc } = await connected();
    pc.signalingState = 'have-local-offer';
    m.onSignal({ id: 'o', call_id: 'c1', from_id: 'bob', to_id: 'me', kind: 'offer', payload: { type: 'offer' } }); await flush();
    expect(pc.remoteSet).toHaveLength(0);
  });
});

describe('connection health', () => {
  test('never connects -> fails after the connect timeout and tells the server', async () => {
    const { m, api, ended } = setup(); await m.start('bob', 'voice'); m.onCallRow(row({ status: 'accepted' })); await flush();
    jest.advanceTimersByTime(CONNECT_MS + 1);
    expect(api.end).toHaveBeenCalledWith('c1'); expect(ended[0].reason).toBe('error'); expect(ended[0].message).toMatch(/Could not connect/);
  });
  test('short drop recovers, long drop ends the call', async () => {
    const { m, ended } = setup(); await m.start('bob', 'voice'); m.onCallRow(row({ status: 'accepted' })); await flush();
    const pc = FakePc.all[0]; pc.state('connected');
    pc.state('disconnected'); jest.advanceTimersByTime(DROP_MS - 100); pc.state('connected'); jest.advanceTimersByTime(DROP_MS * 2);
    expect(m.s.phase).toBe('active');
    pc.state('disconnected'); jest.advanceTimersByTime(DROP_MS + 1);
    expect(ended[0]).toMatchObject({ reason: 'error', message: 'The connection was lost.' });
    expect(pc.closed).toBe(true);
  });
  test('the other side hanging up ends our call and releases the microphone', async () => {
    const { m, ended } = setup(); await m.start('bob', 'voice'); const local = m.s.local!; m.onCallRow(row({ status: 'accepted' })); await flush();
    FakePc.all[0].state('connected'); m.onCallRow(row({ status: 'ended' }));
    expect(ended[0].reason).toBe('ended'); expect(local.getTracks()[0].stop).toHaveBeenCalled();
  });
});

describe('controls', () => {
  test('mute and camera toggles flip the real tracks', async () => {
    const { m } = setup('me', async () => stream('l', ['audio', 'video'])); await m.start('bob', 'video');
    m.toggleMute(); expect(m.s.local!.getAudioTracks()[0].enabled).toBe(false); expect(m.s.muted).toBe(true);
    m.toggleCamera(); expect(m.s.local!.getVideoTracks()[0].enabled).toBe(false);
    m.toggleMute(); expect(m.s.local!.getAudioTracks()[0].enabled).toBe(true);
  });
  test('voice -> video adds a camera track to the connection', async () => {
    let n = 0;
    const { m } = setup('me', async () => (n++ === 0 ? stream('l', ['audio']) : stream('cam', ['video'])));
    await m.start('bob', 'voice'); m.onCallRow(row({ status: 'accepted' })); await flush(); FakePc.all[0].state('connected');
    await m.enableVideo();
    expect(m.s.kind).toBe('video'); expect(FakePc.all[0].added.some((t) => t.kind === 'video')).toBe(true);
  });
  test('a second remote stream is treated as a shared screen', async () => {
    const { m } = setup(); await m.start('bob', 'voice'); m.onCallRow(row({ status: 'accepted' })); await flush();
    const pc = FakePc.all[0];
    pc.ontrack!({ track: track('audio'), streams: [stream('main', ['audio'])] });
    pc.ontrack!({ track: track('video'), streams: [stream('screen', ['video'])] });
    expect(m.s.remote?.id).toBe('main'); expect(m.s.remoteScreen?.id).toBe('screen');
  });
});
