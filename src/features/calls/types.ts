// Minimal structural types for WebRTC. Native (react-native-webrtc) and browsers both fit these, and tests use fakes.
export interface TrackLike { kind: string; enabled: boolean; readyState?: string; stop(): void; _switchCamera?: () => void; onended?: (() => void) | null; onmute?: (() => void) | null; onunmute?: (() => void) | null }
export interface StreamLike {
  id: string; getTracks(): TrackLike[]; getAudioTracks(): TrackLike[]; getVideoTracks(): TrackLike[];
  addTrack(t: TrackLike): void; toURL?: () => string;
}
export interface IceCandidateLike { toJSON(): unknown }
export interface PcLike {
  signalingState: string; remoteDescription: unknown | null; connectionState: string;
  addTrack(t: TrackLike, s: StreamLike): unknown;
  createOffer(): Promise<{ type: string; sdp?: string }>;
  createAnswer(): Promise<{ type: string; sdp?: string }>;
  setLocalDescription(d: unknown): Promise<void>;
  setRemoteDescription(d: unknown): Promise<void>;
  addIceCandidate(c: unknown): Promise<void>;
  close(): void;
  removeTrack?(sender: unknown): void;
  getSenders?(): { track: TrackLike | null; getParameters?(): any; setParameters?(p: unknown): Promise<unknown> }[];
  ontrack: ((e: { track: TrackLike; streams?: StreamLike[] }) => void) | null;
  onnegotiationneeded: (() => void) | null;
  onicecandidate: ((e: { candidate: IceCandidateLike | null }) => void) | null;
  onconnectionstatechange: (() => void) | null;
}
export interface Rtc {
  PeerConnection: new (cfg: { iceServers: unknown[] }) => PcLike;
  SessionDescription: new (d: { type: string; sdp?: string }) => unknown;
  IceCandidate: new (c: unknown) => unknown;
  MediaStream: new () => StreamLike;
  getUserMedia(c: { audio: unknown; video: unknown }): Promise<StreamLike>;
}

export type CallKind = 'voice' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'declined' | 'missed' | 'ended' | 'busy';
export type CallRow = {
  id: string; caller_id: string; callee_id: string; room_id: string | null; kind: CallKind; status: CallStatus;
  created_at: string; answered_at: string | null; ended_at: string | null;
};
export type Signal = { id: string; call_id: string; from_id: string; to_id: string; kind: 'offer' | 'answer' | 'candidate'; payload: unknown; created_at?: string };

export type Phase = 'idle' | 'outgoing' | 'incoming' | 'connecting' | 'active';
export type CallState = {
  phase: Phase; call: CallRow | null; peerId: string | null; kind: CallKind | null;
  muted: boolean; camOff: boolean; local: StreamLike | null; remote: StreamLike | null; remoteCam: boolean; remoteScreen: StreamLike | null;
  error: string | null; startedAt: number | null;
};
export type EndInfo = {
  reason: 'busy' | 'declined' | 'missed' | 'ended' | 'cancelled' | 'error'; message: string | null;
  call: CallRow | null; peerId: string | null; kind: CallKind | null; seconds: number;
};

export interface CallApi {
  start(callee: string, kind: CallKind): Promise<string>;
  answer(id: string): Promise<void>;
  decline(id: string): Promise<void>;
  end(id: string): Promise<void>;
  signal(id: string, kind: Signal['kind'], payload: unknown): Promise<void>;
  getCall(id: string): Promise<CallRow | null>;
  ringingForMe(): Promise<CallRow[]>;
  pendingSignals(callId: string): Promise<Signal[]>;
}
