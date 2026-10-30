import { isBusyWith, setBusy } from './busy';
// 1-to-1 voice/video calls. This is a TypeScript port of the web app's CallManager (lib/calls.js) and speaks the SAME
// protocol over the same tables/RPCs (calls, call_signals, start_call, answer_call, ...), so a phone can call a browser
// and the other way round. WebRTC itself is injected (`rtc`), which is what makes this unit-testable.
//
// Differences from the web version (on purpose):
//  * no screen sharing from the phone (a phone cannot share its screen from JS); a screen shared BY the other person is shown;
//  * signals are also fetched by polling (pollSignals) because realtime can drop; duplicates are ignored by id and
//    signals are applied one at a time, in order.
import { UserError } from '@/lib/validation';
import type { CallApi, CallKind, CallRow, CallState, EndInfo, PcLike, Phase, Rtc, Signal, StreamLike } from './types';

export const RING_MS = 45_000;
export const CONNECT_MS = 25_000;
export const DROP_MS = 8_000;
const NO_ROUTE = 'Could not connect. Some networks (strict firewalls, some mobile networks) block direct calls.';

export function mediaError(e: unknown): UserError {
  const n = (e as { name?: string } | null)?.name;
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError')
    return new UserError('Microphone or camera access is off. Turn it on in your phone settings and try again.');
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return new UserError('No microphone or camera was found.');
  return new UserError('Could not start the microphone or camera.');
}

type Opts = {
  api: CallApi; meId: string; rtc: Rtc;
  loadIce: () => Promise<unknown[]>;
  onChange?: (s: CallState) => void; onEnded?: (e: EndInfo) => void;
  isForeground?: () => boolean;
};

export class CallManager {
  s: CallState = CallManager.blank();
  private api: CallApi; private meId: string; private rtc: Rtc; private loadIce: () => Promise<unknown[]>;
  private onChange?: (s: CallState) => void; private onEnded?: (e: EndInfo) => void; private isForeground: () => boolean;
  private ice: unknown[] = [];
  private pc: PcLike | null = null;
  private buffer: Signal[] = []; private cands: unknown[] = []; private seen = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private ready = false; private makingOffer = false; private polite = false;
  private mainId: string | null = null;
  private ringTimeout?: ReturnType<typeof setTimeout>; private connectTimer?: ReturnType<typeof setTimeout>; private dropTimer?: ReturnType<typeof setTimeout>;
  private dead = false;

  constructor(o: Opts) {
    this.api = o.api; this.meId = o.meId; this.rtc = o.rtc; this.loadIce = o.loadIce;
    this.onChange = o.onChange; this.onEnded = o.onEnded; this.isForeground = o.isForeground ?? (() => true);
  }

  static blank(): CallState {
    return { phase: 'idle', call: null, peerId: null, kind: null, muted: false, camOff: false, local: null, remote: null, remoteCam: false, remoteScreen: null, error: null, startedAt: null };
  }
  private get phase(): Phase { return this.s.phase; }   // re-read after awaits (TS would otherwise keep an old narrowing)
  private set(patch: Partial<CallState>) { this.s = { ...this.s, ...patch }; setBusy('one', this.s.phase !== 'idle'); this.onChange?.(this.s); }
  destroy() { this.dead = true; this.cleanup(); setBusy('one', false); }

  // ------------------------------------------------------------------ outgoing
  async start(peerId: string, kind: CallKind): Promise<void> {
    if (this.s.phase !== 'idle' || isBusyWith('group')) throw new UserError('You are already in a call.');
    this.set({ ...CallManager.blank(), phase: 'outgoing', peerId, kind });
    try {
      const local = await this.media(kind);
      if (this.phase !== 'outgoing') { local.getTracks().forEach((t) => t.stop()); return; }   // cancelled while the permission prompt was open
      this.ice = await this.loadIce();
      const id = await this.api.start(peerId, kind);
      if (this.phase !== 'outgoing') {   // cancelled while the server was creating the call: close it, do not bring the screen back
        local.getTracks().forEach((t) => t.stop()); await this.api.end(id).catch(() => {}); return;
      }
      const call = await this.api.getCall(id);
      if (!call) throw new UserError('Could not start the call.');
      if (call.status === 'busy') {
        this.s = { ...this.s, local };   // so cleanup() stops the tracks
        this.cleanup(); this.finish('busy', 'They are on another call.'); return;
      }
      this.set({ call, local });
      this.ringTimeout = setTimeout(() => { if (this.s.phase === 'outgoing') void this.hangup(); }, RING_MS);
    } catch (e) {
      const message = (e as { message?: string }).message ?? 'Could not start the call.';
      this.cleanup(); this.finish('error', message);
      throw e;
    }
  }

  private async media(kind: CallKind): Promise<StreamLike> {
    try {
      return await this.rtc.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: kind === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false });
    } catch (e) { throw mediaError(e); }
  }

  // ------------------------------------------------------------------ incoming
  /** Look for a call that is ringing for me (used when the app opens or returns to the foreground). */
  async checkRinging(): Promise<void> {
    if (this.s.phase !== 'idle' || !this.isForeground()) return;
    try { for (const c of await this.api.ringingForMe()) this.onCallRow(c); } catch { /* try again next time */ }
  }

  async accept(): Promise<void> {
    const { call, kind, phase } = this.s;
    if (phase !== 'incoming' || !call || !kind) return;
    try {
      const local = await this.media(kind);
      if (this.phase !== 'incoming') { local.getTracks().forEach((t) => t.stop()); return; }
      this.ice = await this.loadIce();
      await this.api.answer(call.id);
      this.set({ phase: 'connecting', local });
      this.makePc(local, false);
    } catch (e) {
      const message = (e as { message?: string }).message ?? 'Could not answer the call.';
      await this.api.decline(call.id).catch(() => {});
      this.cleanup(); this.finish('error', message);
    }
  }

  async decline(): Promise<void> {
    const c = this.s.call; if (!c) return;
    await this.api.decline(c.id).catch(() => {});
    this.cleanup(); this.finish('declined');
  }

  async hangup(): Promise<void> {
    const c = this.s.call; const phase = this.s.phase;
    if (phase === 'idle') return;
    if (c) await this.api.end(c.id).catch(() => {});
    this.cleanup(); this.finish(phase === 'outgoing' ? 'cancelled' : 'ended');
  }

  // ------------------------------------------------------------------ events from the database
  onCallRow(c: CallRow): void {
    if (this.dead || (c.caller_id !== this.meId && c.callee_id !== this.meId)) return;
    const s = this.s;
    if (c.status === 'ringing' && c.callee_id === this.meId) {
      if (s.phase !== 'idle' || isBusyWith('group') || Date.now() - new Date(c.created_at).getTime() > 60_000) return;
      this.set({ ...CallManager.blank(), phase: 'incoming', call: c, peerId: c.caller_id, kind: c.kind });
      return;
    }
    if (!s.call || s.call.id !== c.id) return;
    if (c.status === 'accepted' && c.caller_id === this.meId && s.phase === 'outgoing') {
      clearTimeout(this.ringTimeout);
      if (!s.local) return;
      this.set({ phase: 'connecting', call: c });
      this.makePc(s.local, true);
    } else if (c.status === 'declined' || c.status === 'missed' || c.status === 'ended' || c.status === 'busy') {
      const wasActive = s.phase === 'connecting' || s.phase === 'active';
      this.cleanup();
      this.finish(c.status, c.status === 'declined' && !wasActive ? 'They declined the call.' : null);
    }
  }

  /** A signal arrived (realtime or polling). Duplicates are ignored; signals are applied one at a time, in order. */
  onSignal(sig: Signal): void {
    if (this.dead || sig.to_id !== this.meId || this.seen.has(sig.id)) return;
    this.seen.add(sig.id);
    if (!this.pc || this.s.call?.id !== sig.call_id) { this.buffer.push(sig); return; }
    this.queue = this.queue.then(() => this.applySignal(sig));
  }

  /** Fetch signals that realtime may have missed. Safe to call as often as you like. */
  async pollSignals(): Promise<void> {
    const call = this.s.call;
    if (!call || this.s.phase === 'idle') return;
    try { for (const sig of await this.api.pendingSignals(call.id)) this.onSignal(sig); } catch { /* next poll */ }
  }

  private async applySignal(sig: Signal): Promise<void> {
    const pc = this.pc;
    if (!pc || this.s.call?.id !== sig.call_id) return;
    try {
      if (sig.kind === 'offer' || sig.kind === 'answer') {
        // "Perfect negotiation": if both sides change the call at once, the callee (polite) yields.
        const collision = sig.kind === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
        if (!this.polite && collision) return;
        await pc.setRemoteDescription(new this.rtc.SessionDescription(sig.payload as { type: string; sdp?: string }));
        await this.flushCandidates();
        if (sig.kind === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await this.api.signal(sig.call_id, 'answer', { type: answer.type, sdp: answer.sdp });
        }
      } else if (sig.kind === 'candidate') {
        if (pc.remoteDescription) await pc.addIceCandidate(new this.rtc.IceCandidate(sig.payload)).catch(() => {});
        else this.cands.push(sig.payload);
      }
    } catch { this.fail('Could not connect the call.'); }
  }
  private async flushCandidates(): Promise<void> {
    const pc = this.pc; if (!pc) return;
    for (const c of this.cands.splice(0)) await pc.addIceCandidate(new this.rtc.IceCandidate(c)).catch(() => {});
  }

  // ------------------------------------------------------------------ WebRTC
  private makePc(local: StreamLike, isCaller: boolean): void {
    const call = this.s.call; if (!call) return;
    const pc = new this.rtc.PeerConnection({ iceServers: this.ice });
    this.pc = pc; this.cands = []; this.ready = false; this.makingOffer = false; this.mainId = null;
    this.polite = call.callee_id === this.meId;
    const callId = call.id;
    for (const t of local.getTracks()) pc.addTrack(t, local);

    pc.ontrack = (e) => {
      const st = e.streams?.[0];
      if (e.track.kind === 'audio' && !this.mainId) this.mainId = st?.id ?? 'main';
      // a stream that is not the person's own camera/microphone stream is their shared screen
      if (st && this.mainId && st.id !== this.mainId) { this.set({ remoteScreen: st }); return; }
      let remote = this.s.remote ?? st ?? new this.rtc.MediaStream();
      if (!st && !remote.getTracks().includes(e.track)) remote.addTrack(e.track);
      if (st) remote = st;
      this.set(e.track.kind === 'video' ? { remote, remoteCam: true, kind: 'video' } : { remote });
    };
    pc.onnegotiationneeded = async () => {
      if (!this.ready) return;
      try {
        this.makingOffer = true;
        const offer = await pc.createOffer();
        if (pc.signalingState !== 'stable') return;
        await pc.setLocalDescription(offer);
        await this.api.signal(callId, 'offer', { type: offer.type, sdp: offer.sdp });
      } catch { /* the next change tries again */ } finally { this.makingOffer = false; }
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.api.signal(callId, 'candidate', e.candidate.toJSON()).catch(() => {}); };
    pc.onconnectionstatechange = () => {
      if (this.pc !== pc) return;
      const st = pc.connectionState;
      if (st === 'connected') {
        clearTimeout(this.dropTimer); clearTimeout(this.connectTimer); this.ready = true;
        if (this.s.phase !== 'active') this.set({ phase: 'active', startedAt: Date.now() });
      } else if (st === 'disconnected') {
        clearTimeout(this.dropTimer);
        this.dropTimer = setTimeout(() => this.fail('The connection was lost.'), DROP_MS);
      } else if (st === 'failed') this.fail(NO_ROUTE);
    };
    this.connectTimer = setTimeout(() => { if (this.s.phase === 'connecting') this.fail(NO_ROUTE); }, CONNECT_MS);

    const mine = this.buffer.filter((b) => b.call_id === callId); this.buffer = [];
    this.queue = this.queue.then(async () => {
      if (isCaller) {
        try {
          this.makingOffer = true;
          const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
          await this.api.signal(callId, 'offer', { type: offer.type, sdp: offer.sdp });
        } catch { this.fail('Could not start the call.'); } finally { this.makingOffer = false; }
      }
      for (const m of mine) await this.applySignal(m);
    });
  }

  private fail(message: string): void {
    const c = this.s.call;
    if (c) this.api.end(c.id).catch(() => {});
    this.cleanup(); this.finish('error', message);
  }

  // ------------------------------------------------------------------ while the call runs
  get canChange(): boolean { return this.s.phase === 'active' && !!this.pc; }

  toggleMute(): void {
    const on = !this.s.muted;
    this.s.local?.getAudioTracks().forEach((t) => { t.enabled = !on; });
    this.set({ muted: on });
  }

  /** Voice -> video (or turn the camera back on). Adding a track makes the browser/native layer send a new offer. */
  async enableVideo(): Promise<void> {
    if (!this.canChange || !this.pc || !this.s.local) return;
    const local = this.s.local;
    const existing = local.getVideoTracks()[0];
    if (existing) { existing.enabled = true; this.set({ camOff: false, kind: 'video' }); return; }
    const cam = (await this.rtc.getUserMedia({ audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } }).catch((e) => { throw mediaError(e); })).getVideoTracks()[0];
    if (!cam) throw new UserError('No camera was found.');
    if (!this.canChange || !this.pc) { cam.stop(); return; }
    local.addTrack(cam);
    this.pc.addTrack(cam, local);
    this.set({ camOff: false, kind: 'video', local });
  }

  toggleCamera(): void {
    const off = !this.s.camOff;
    this.s.local?.getVideoTracks().forEach((t) => { t.enabled = !off; });
    this.set({ camOff: off });
  }

  flipCamera(): void { this.s.local?.getVideoTracks().forEach((t) => t._switchCamera?.()); }

  // ------------------------------------------------------------------ teardown
  private cleanup(): void {
    clearTimeout(this.ringTimeout); clearTimeout(this.connectTimer); clearTimeout(this.dropTimer);
    this.s.local?.getTracks().forEach((t) => { try { t.stop(); } catch { /* already stopped */ } });
    const pc = this.pc; this.pc = null;
    if (pc) { pc.ontrack = null; pc.onicecandidate = null; pc.onnegotiationneeded = null; pc.onconnectionstatechange = null; try { pc.close(); } catch { /* ignore */ } }
    this.cands = []; this.buffer = []; this.seen.clear(); this.queue = Promise.resolve(); this.mainId = null;
  }

  private finish(reason: EndInfo['reason'], message: string | null = null): void {
    const prev = this.s;
    this.s = CallManager.blank();
    this.onChange?.(this.s);
    this.onEnded?.({ reason, message, call: prev.call, peerId: prev.peerId, kind: prev.kind, seconds: prev.startedAt ? Math.round((Date.now() - prev.startedAt) / 1000) : 0 });
  }
}
export type { CallState, Phase };
