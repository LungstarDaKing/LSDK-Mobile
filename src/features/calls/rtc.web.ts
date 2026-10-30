// Browsers: the built-in WebRTC objects.
import type { Rtc } from './types';

const g = globalThis as unknown as Record<string, any>;
export const rtcAvailable = typeof g.RTCPeerConnection === 'function' && !!g.navigator?.mediaDevices?.getUserMedia;
export const rtc: Rtc = {
  PeerConnection: g.RTCPeerConnection,
  SessionDescription: g.RTCSessionDescription,
  IceCandidate: g.RTCIceCandidate,
  MediaStream: g.MediaStream,
  getUserMedia: (c) => g.navigator.mediaDevices.getUserMedia(c),
};
export function initRtc(): void {}
