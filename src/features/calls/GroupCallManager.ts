// Group voice / video calls (up to 6 people), phone to phone as a WebRTC "mesh". Port of the website's src/lib/group-calls.js,
// so phones and browsers can be in the same call.
//   * Every pair of people has ONE connection. The person with the smaller user id always sends the first offer.
//   * Each connection has a random session id ("sid"), so leftovers of an old attempt can never confuse a new one.
//   * Changes during the call (camera added) are renegotiated with "rn" offers; the smaller id wins a clash.
import { setBusy, isBusyWith } from './busy';
import type { GroupApi, GroupCallRow, GroupEnd, GroupMemberRow, GroupSignal, GroupState, PeerView } from './groupTypes';
import type { CallKind, PcLike, Rtc, StreamLike } from './types';

export const RING_MS = 60_000;
const PING_MS = 15_000;
const POLL_MS = 6_000;
const CONNECT_MS = 25_000;
const MAX_RETRIES = 3;

type Rec = {
  id: string; pc: PcLike | null; localSid: string | null; remoteSid: string | null; cands: { sid: string; c: unknown }[];
  stream: StreamLike | null; screen: StreamLike | null; state: PeerView['state']; retries: number;
  timer?: ReturnType<typeof setTimeout>; dropT?: ReturnType<typeof setTimeout>;
  shell?: boolean; ready?: boolean; makingOffer?: boolean; ignoreOffer?: boolean; mainId?: string | null; screenId?: string | null;
};
export type GroupOpts = {
  api: GroupApi; meId: string; rtc: Rtc; loadIce: () => Promise<unknown[]>;
  isForeground?: () => boolean; onChange?: (s: GroupState) => void; onEnded?: (e: GroupEnd) => void; onFeed?: () => void;
};

const rnd = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const mediaMessage = (e: unknown): string => {
  const n = (e as { name?: string } | null)?.name;
  return n === 'NotAllowedError' || n === 'PermissionDeniedError' ? 'Microphone or camera access was blocked. Allow it in your phone settings and try again.'
    : n === 'NotFoundError' ? 'No microphone or camera was found.' : 'Could not start the microphone or camera.';
};

export class GroupCallManager {
  static blank(): GroupState {
    return { phase: 'idle', call: null, kind: null, roomId: null, starterId: null, members: [], peers: {}, local: null, muted: false, camOff: false, startedAt: null };
  }
  private s: GroupState = GroupCallManager.blank();
  private rec = new Map<string, Rec>();
  private buffer: GroupSignal[] = []; private seen = new Set<string>();
  private entered = false; private dead = false; private hadPeer = false;
  private sid = ''; private ice: unknown[] = [];
  private hb?: ReturnType<typeof setInterval>; private poll: ReturnType<typeof setInterval>;
  private ringTimer?: ReturnType<typeof setTimeout>; private aloneT: ReturnType<typeof setTimeout> | null = null; private refreshT?: ReturnType<typeof setTimeout>;
  private queue: Promise<void> = Promise.resolve();

  constructor(private o: GroupOpts) { this.poll = setInterval(() => this.tick(), POLL_MS); }
  get state(): GroupState { return this.s; }
  private set(patch: Partial<GroupState>) { this.s = { ...this.s, ...patch }; setBusy('group', this.s.phase !== 'idle'); this.o.onChange?.(this.s); }
  private get phase() { return this.s.phase; }
  destroy(): void { this.dead = true; clearInterval(this.poll); this.teardown(); setBusy('group', false); }

  /* ----- starting / joining ----- */
  private guard() {
    if (this.s.phase !== 'idle' || isBusyWith('one')) throw new Error('You are already in a call.');
  }
  private async media(kind: CallKind): Promise<StreamLike> {
    try {
      return await this.o.rtc.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: kind === 'video' ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 }, facingMode: 'user' } : false,
      });
    } catch (e) { throw new Error(mediaMessage(e)); }
  }

  async start(roomId: string, kind: CallKind): Promise<void> {
    this.guard();
    this.set({ ...GroupCallManager.blank(), phase: 'joining', kind, roomId });
    try {
      const local = await this.media(kind);
      if (this.phase !== 'joining') { local.getTracks().forEach((t) => t.stop()); return; }
      this.set({ local });
      const id = await this.o.api.start(roomId, kind);       // returns the call already running in this chat, if any
      await this.enter(id, local, kind);
    } catch (e) { this.abort((e as Error).message || 'Could not start the call.'); }
  }
  async join(callId: string): Promise<void> {
    this.guard();
    this.set({ ...GroupCallManager.blank(), phase: 'joining' });
    try {
      const call = await this.o.api.getCall(callId);
      if (!call || call.ended_at) throw new Error('This call has ended.');
      this.set({ kind: call.kind, roomId: call.room_id, call });
      const local = await this.media(call.kind);
      if (this.phase !== 'joining') { local.getTracks().forEach((t) => t.stop()); return; }
      this.set({ local });
      await this.enter(callId, local, call.kind);
    } catch (e) { this.abort((e as Error).message || 'Could not join the call.'); }
  }
  async accept(): Promise<void> {
    const call = this.s.call;
    if (this.phase !== 'incoming' || !call) return;
    clearTimeout(this.ringTimer);
    this.set({ phase: 'joining' });
    try {
      const local = await this.media(call.kind);
      this.set({ local });
      await this.enter(call.id, local, call.kind);
    } catch (e) { await this.o.api.decline(call.id).catch(() => {}); this.abort((e as Error).message || 'Could not join the call.'); }
  }
  async decline(): Promise<void> {
    const call = this.s.call;
    clearTimeout(this.ringTimer);
    this.teardown(); this.finish('declined');            // first, so the database's own "you declined" row is not mistaken for something else
    if (call) await this.o.api.decline(call.id).catch(() => {});
  }
  private async enter(id: string, local: StreamLike, wanted: CallKind): Promise<void> {
    await this.o.api.join(id);
    const call = await this.o.api.getCall(id);
    if (!call) throw new Error('This call is no longer available.');
    if (this.phase !== 'joining') { local.getTracks().forEach((t) => t.stop()); await this.o.api.leave(id).catch(() => {}); return; }   // cancelled while joining
    if (call.kind !== wanted) { local.getTracks().forEach((t) => t.stop()); local = await this.media(call.kind); }
    this.ice = await this.o.loadIce();
    const members = await this.o.api.members(id);
    this.sid = rnd(); this.entered = true;
    this.set({ phase: 'active', call, kind: call.kind, roomId: call.room_id, starterId: call.started_by, members, local, startedAt: Date.now() });
    this.hb = setInterval(() => void this.ping(), PING_MS);
    this.reconcile(members);
    const early = this.buffer.filter((b) => b.call_id === id); this.buffer = [];
    for (const sig of early) this.onSignal(sig, true);
    void this.pullSignals();
  }
  async hangup(): Promise<void> {
    const { phase, call } = this.s;
    if (phase === 'idle') return;
    if (phase === 'incoming') return this.decline();
    if (call) await this.o.api.leave(call.id).catch(() => {});
    this.teardown(); this.finish('ended');
  }

  /* ----- incoming rings ----- */
  async checkRinging(): Promise<void> {
    if (this.dead || this.s.phase !== 'idle' || isBusyWith('one') || this.o.isForeground?.() === false) return;
    try { for (const m of await this.o.api.ringingForMe()) { await this.showIncoming(m.call_id); if (this.phase !== 'idle') break; } } catch { /* next tick */ }
  }
  private async showIncoming(callId: string): Promise<void> {
    if (this.s.phase !== 'idle' || isBusyWith('one')) return;
    const call = await this.o.api.getCall(callId);
    if (!call || call.ended_at || call.started_by === this.o.meId) return;
    if (this.s.phase !== 'idle' || isBusyWith('one')) return;
    this.set({ ...GroupCallManager.blank(), phase: 'incoming', call, kind: call.kind, roomId: call.room_id, starterId: call.started_by });
    clearTimeout(this.ringTimer);
    this.ringTimer = setTimeout(() => { if (this.phase === 'incoming') { this.teardown(); this.finish('missed'); } }, RING_MS);
  }

  /* ----- events from the database ----- */
  onMemberRow(m: GroupMemberRow & { call_id: string }): void {
    if (this.dead) return;
    this.o.onFeed?.();
    if (m.profile_id === this.o.meId) {
      if (m.state === 'ringing' && this.phase === 'idle' && Date.now() - new Date(m.invited_at).getTime() < RING_MS) void this.showIncoming(m.call_id);
      else if (this.phase === 'incoming' && this.s.call?.id === m.call_id && m.state !== 'ringing') { clearTimeout(this.ringTimer); this.teardown(); this.finish('ended'); }
    }
    if (this.entered && this.s.call?.id === m.call_id) this.refreshSoon();
  }
  onCallRow(c: GroupCallRow): void {
    if (this.dead) return;
    this.o.onFeed?.();
    if (c.ended_at && this.s.call?.id === c.id) {
      if (this.phase === 'incoming') { clearTimeout(this.ringTimer); this.teardown(); this.finish('missed'); }
      else if (this.entered) this.refreshSoon();
    }
  }
  private refreshSoon() { clearTimeout(this.refreshT); this.refreshT = setTimeout(() => void this.refresh(), 150); }
  async refresh(): Promise<void> {
    const call = this.s.call;
    if (!this.entered || !call) return;
    try {
      const members = await this.o.api.members(call.id);
      if (!this.entered || this.s.call?.id !== call.id) return;
      this.reconcile(members);
    } catch { /* next tick */ }
  }
  private tick() {
    if (this.dead) return;
    if (this.phase === 'idle') void this.checkRinging();
    else if (this.entered) { void this.refresh(); void this.pullSignals(); }
  }
  /** The app came back to the foreground: tell the server we are still here, and look for rings. */
  onForeground(): void { if (this.entered) void this.ping(); else void this.checkRinging(); }
  private async ping(): Promise<void> {
    const call = this.s.call;
    if (!this.entered || !call) return;
    try { await this.o.api.ping(call.id); }
    catch (e) { if (/not in this call/i.test((e as Error)?.message ?? '')) this.dropped('You were disconnected from the call.'); }
  }
  private dropped(message: string) { if (!this.entered) return; this.teardown(); this.finish('error', message); }

  /* ----- who should be connected to whom ----- */
  private reconcile(members: GroupMemberRow[]): void {
    const me = members.find((m) => m.profile_id === this.o.meId);
    if (me && me.state !== 'joined') return this.dropped('You were disconnected from the call.');
    const joined = new Set(members.filter((m) => m.state === 'joined' && m.profile_id !== this.o.meId).map((m) => m.profile_id));
    for (const id of [...this.rec.keys()]) if (!joined.has(id)) this.dropPeer(id);
    for (const id of joined) {
      const r = this.rec.get(id);
      if (!r) this.ensurePeer(id);
      else if (r.shell) { delete r.shell; this.arm(r); if (this.o.meId < id) void this.initiate(r); }
    }
    this.s = { ...this.s, members };
    this.publish();
    const ringing = members.some((m) => m.state === 'ringing');
    if (!joined.size && !ringing) { if (!this.aloneT) this.aloneT = setTimeout(() => void this.endAlone(), 4000); }
    else if (this.aloneT) { clearTimeout(this.aloneT); this.aloneT = null; }
  }
  private async endAlone(): Promise<void> {
    this.aloneT = null;
    if (!this.entered || this.rec.size) return;
    const never = !this.hadPeer, call = this.s.call;
    if (call) await this.o.api.leave(call.id).catch(() => {});
    this.teardown();
    this.finish(never ? 'nobody' : 'ended', never ? 'Nobody joined the call.' : 'Everyone has left the call.');
  }

  /* ----- one connection per person ----- */
  private ensurePeer(id: string): Rec {
    const rec: Rec = { id, pc: null, localSid: null, remoteSid: null, cands: [], stream: null, screen: null, state: 'connecting', retries: 0 };
    this.rec.set(id, rec);
    this.arm(rec);
    if (this.o.meId < id) void this.initiate(rec);
    return rec;
  }
  private arm(rec: Rec) { clearTimeout(rec.timer); rec.timer = setTimeout(() => { if (rec.state !== 'connected') this.retry(rec); }, CONNECT_MS); }
  private dropPeer(id: string) {
    const rec = this.rec.get(id); if (!rec) return;
    clearTimeout(rec.timer); clearTimeout(rec.dropT);
    try { rec.pc?.close(); } catch { /* ignore */ }
    this.rec.delete(id);
  }
  private resetPc(rec: Rec) {
    clearTimeout(rec.timer); clearTimeout(rec.dropT);
    try { rec.pc?.close(); } catch { /* ignore */ }
    rec.pc = null; rec.remoteSid = null; rec.stream = null; rec.screen = null; rec.mainId = null; rec.screenId = null; rec.ready = false; rec.makingOffer = false; rec.state = 'connecting';
  }
  private retry(rec: Rec) {
    clearTimeout(rec.timer);
    if (this.rec.get(rec.id) !== rec || !this.entered) return;
    if (rec.retries >= MAX_RETRIES) { rec.state = 'failed'; this.publish(); return; }
    rec.retries++;
    this.resetPc(rec); this.publish();
    setTimeout(() => {
      if (this.rec.get(rec.id) !== rec || !this.entered) return;
      this.arm(rec);
      if (this.o.meId < rec.id) void this.initiate(rec);
    }, 1500 + Math.random() * 600);
  }
  /** "Try again" for a person whose connection failed. */
  retryPeer(id: string) {
    const rec = this.rec.get(id); if (!rec) return;
    rec.retries = 0; rec.state = 'connecting'; this.resetPc(rec); this.arm(rec); this.publish();
    if (this.o.meId < id) void this.initiate(rec);
  }

  private createPc(rec: Rec): PcLike {
    const pc = new this.o.rtc.PeerConnection({ iceServers: this.ice });
    rec.pc = pc; rec.localSid = rnd(); rec.stream = new this.o.rtc.MediaStream();
    const callId = this.s.call!.id, sid = rec.localSid, local = this.s.local;
    rec.ready = false; rec.makingOffer = false; rec.ignoreOffer = false; rec.mainId = null; rec.screenId = null; rec.screen = null;
    for (const t of local?.getTracks() ?? []) pc.addTrack(t, local!);
    pc.ontrack = (e) => {
      if (rec.pc !== pc) return;
      const st = e.streams?.[0];
      if (e.track.kind === 'audio' && !rec.mainId) rec.mainId = st?.id || 'main';
      // anything outside the person's camera/microphone stream is their shared screen
      if (st && (st.id === rec.screenId || (rec.mainId && st.id !== rec.mainId))) {
        rec.screenId = st.id; rec.screen = st;
        e.track.onended = () => { if (rec.screen === st && !st.getTracks().some((t) => t.readyState === 'live')) { rec.screen = null; this.publish(); } };
        this.publish(); return;
      }
      if (st) rec.stream = st; else rec.stream?.addTrack(e.track);
      if (e.track.kind === 'video' && this.s.kind !== 'video') this.set({ kind: 'video' });
      e.track.onmute = e.track.onunmute = () => this.publish();
      this.publish();
    };
    pc.onnegotiationneeded = async () => {            // a camera was added or removed during the call
      if (!rec.ready || rec.pc !== pc) return;
      try {
        rec.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable' || rec.pc !== pc) return;
        await pc.setLocalDescription(offer);
        await this.o.api.signal(callId, rec.id, 'offer', { type: offer.type, sdp: offer.sdp, sid: rec.localSid, rn: 1, scr: null });
      } catch { /* the next change tries again */ } finally { rec.makingOffer = false; }
    };
    pc.onicecandidate = (e) => { if (e.candidate && rec.pc === pc) void this.o.api.signal(callId, rec.id, 'candidate', { c: e.candidate.toJSON(), sid }).catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (rec.pc !== pc) return;
      const st = pc.connectionState;
      if (st === 'connected') {
        clearTimeout(rec.timer); clearTimeout(rec.dropT); rec.state = 'connected'; rec.retries = 0; this.hadPeer = true; rec.ready = true;
        this.capBitrate(pc); this.publish();
      } else if (st === 'disconnected') {
        clearTimeout(rec.dropT); rec.dropT = setTimeout(() => { if (rec.pc === pc && pc.connectionState !== 'connected') this.retry(rec); }, 8000);
      } else if (st === 'failed') this.retry(rec);
    };
    return pc;
  }
  private capBitrate(pc: PcLike) {   // keeps six phones from flooding each other
    try {
      for (const sender of pc.getSenders?.() ?? []) {
        if (sender.track?.kind !== 'video' || !sender.getParameters || !sender.setParameters) continue;
        const p = sender.getParameters(); if (!p.encodings?.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = 450_000;
        void sender.setParameters(p).catch(() => {});
      }
    } catch { /* optional */ }
  }
  private async initiate(rec: Rec): Promise<void> {
    try {
      const pc = this.createPc(rec);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
      await this.o.api.signal(this.s.call!.id, rec.id, 'offer', { type: offer.type, sdp: offer.sdp, sid: rec.localSid, scr: null });
    } catch { this.retry(rec); }
  }

  /* ----- connection set-up messages (handled one at a time, in order) ----- */
  onSignal(sig: GroupSignal, fromBuffer = false): void {
    if (this.dead || sig.to_id !== this.o.meId || this.seen.has(sig.id)) return;
    if (!this.entered) { if (this.phase === 'joining' && !fromBuffer) this.buffer.push(sig); return; }
    if (sig.call_id !== this.s.call?.id) return;
    this.seen.add(sig.id);
    this.queue = this.queue.then(() => this.apply(sig)).catch(() => {});
  }
  private async apply(sig: GroupSignal): Promise<void> {
    if (!this.entered || sig.call_id !== this.s.call?.id) return;
    const rec = this.rec.get(sig.from_id);
    const p = (sig.payload ?? {}) as Record<string, any>;
    const me = this.o.meId, R = this.o.rtc;
    try {
      if (sig.kind === 'candidate') {
        const r = rec ?? this.ensureShell(sig.from_id);
        r.cands.push({ sid: p.sid, c: p.c }); await this.flush(r);
      } else if (sig.kind === 'offer') {
        const isRn = !!p.rn && !!rec?.pc && rec.remoteSid === p.sid;
        if (!isRn && me < sig.from_id) return;          // the first offer only comes from the smaller id
        const r = rec ?? this.ensurePeer(sig.from_id);
        delete r.shell;
        if (isRn) {
          const collision = r.makingOffer || r.pc!.signalingState !== 'stable';
          r.ignoreOffer = me < sig.from_id && collision;     // the smaller id wins a clash, the other side gives way
          if (r.ignoreOffer) return;
        } else if (!r.pc || r.remoteSid !== p.sid) { this.resetPc(r); this.createPc(r); r.remoteSid = p.sid; this.arm(r); }
        r.screenId = p.scr || null;
        if (!p.scr && r.screen) { r.screen = null; this.publish(); }
        await r.pc!.setRemoteDescription(new R.SessionDescription({ type: p.type, sdp: p.sdp }));
        await this.flush(r);
        const answer = await r.pc!.createAnswer(); await r.pc!.setLocalDescription(answer);
        await this.o.api.signal(sig.call_id, r.id, 'answer', { type: answer.type, sdp: answer.sdp, sid: r.localSid, re: p.sid });
      } else if (sig.kind === 'answer') {
        if (!rec || !rec.pc || p.re !== rec.localSid) return;
        rec.remoteSid = p.sid;
        await rec.pc.setRemoteDescription(new R.SessionDescription({ type: p.type, sdp: p.sdp }));
        await this.flush(rec);
      }
    } catch { if (rec) this.retry(rec); }
  }
  private ensureShell(id: string): Rec {   // a network candidate can arrive before we have noticed the person joined
    if (!this.rec.has(id)) this.rec.set(id, { id, pc: null, localSid: null, remoteSid: null, cands: [], stream: null, screen: null, state: 'connecting', retries: 0, shell: true });
    return this.rec.get(id)!;
  }
  private async flush(rec: Rec): Promise<void> {
    if (!rec.pc?.remoteDescription || !rec.remoteSid) return;
    for (const x of rec.cands.splice(0)) if (x.sid === rec.remoteSid && x.c) await rec.pc.addIceCandidate(new this.o.rtc.IceCandidate(x.c)).catch(() => {});
  }
  async pullSignals(): Promise<void> {   // safety net in case the live feed missed a message
    const call = this.s.call;
    if (!this.entered || !call) return;
    try { for (const sig of await this.o.api.mySignals(call.id)) this.onSignal(sig); } catch { /* next tick */ }
  }

  /* ----- controls ----- */
  toggleMute(): void { const on = !this.s.muted; this.s.local?.getAudioTracks().forEach((t) => { t.enabled = !on; }); this.set({ muted: on }); }
  toggleCamera(): void { const off = !this.s.camOff; this.s.local?.getVideoTracks().forEach((t) => { t.enabled = !off; }); this.set({ camOff: off }); }
  flipCamera(): void { const t = this.s.local?.getVideoTracks()[0]; t?._switchCamera?.(); }
  /** Voice call -> video (or camera back on). */
  async enableVideo(): Promise<void> {
    if (!this.entered || this.phase !== 'active' || !this.s.local) return;
    const local = this.s.local;
    const existing = local.getVideoTracks()[0];
    if (existing) { existing.enabled = true; this.set({ camOff: false, kind: 'video' }); return; }
    let cam: StreamLike;
    try { cam = await this.o.rtc.getUserMedia({ audio: false, video: { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 }, facingMode: 'user' } }); }
    catch (e) { throw new Error(mediaMessage(e)); }
    const track = cam.getVideoTracks()[0];
    if (!this.entered) { track.stop(); return; }
    local.addTrack(track);
    for (const r of this.rec.values()) r.pc?.addTrack(track, local);
    this.set({ camOff: false, kind: 'video', local });
  }

  /* ----- state published to the screen ----- */
  private publish(): void {
    const peers: Record<string, PeerView> = {};
    for (const [id, r] of this.rec) peers[id] = { state: r.state, stream: r.stream, screen: r.screen };
    this.set({ peers });
  }

  /* ----- cleanup ----- */
  private teardown(): void {
    clearInterval(this.hb); clearTimeout(this.ringTimer); clearTimeout(this.aloneT ?? undefined); clearTimeout(this.refreshT);
    this.aloneT = null; this.hb = undefined;
    this.s.local?.getTracks().forEach((t) => t.stop());
    for (const id of [...this.rec.keys()]) this.dropPeer(id);
    this.entered = false; this.buffer = []; this.seen.clear(); this.hadPeer = false;
  }
  private abort(message: string): void {
    this.teardown();
    this.s = GroupCallManager.blank(); setBusy('group', false); this.o.onChange?.(this.s);
    this.o.onEnded?.({ reason: 'error', message, call: null, kind: null, roomId: null, seconds: 0 });
  }
  private finish(reason: GroupEnd['reason'], message: string | null = null): void {
    const prev = this.s;
    this.s = GroupCallManager.blank(); setBusy('group', false); this.o.onChange?.(this.s);
    this.o.onEnded?.({ reason, message, call: prev.call, kind: prev.kind, roomId: prev.roomId, seconds: prev.startedAt ? Math.round((Date.now() - prev.startedAt) / 1000) : 0 });
  }
}
