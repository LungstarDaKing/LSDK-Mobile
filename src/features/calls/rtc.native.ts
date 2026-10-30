// iOS / Android: react-native-webrtc (needs a development build; it is NOT in Expo Go).
// It is loaded lazily inside try/catch so the rest of the app still runs in Expo Go, with calls switched off.
import type { Rtc } from './types';

/* eslint-disable @typescript-eslint/no-require-imports */
let mod: typeof import('react-native-webrtc') | null = null;
try { mod = require('react-native-webrtc'); } catch { mod = null; }

const missing = () => { throw new Error('Calls need the development build of the app (they do not work in Expo Go).'); };
export const rtcAvailable = !!mod;
export const rtc: Rtc = mod ? {
  PeerConnection: mod.RTCPeerConnection as unknown as Rtc['PeerConnection'],
  SessionDescription: mod.RTCSessionDescription as unknown as Rtc['SessionDescription'],
  IceCandidate: mod.RTCIceCandidate as unknown as Rtc['IceCandidate'],
  MediaStream: mod.MediaStream as unknown as Rtc['MediaStream'],
  getUserMedia: (c) => mod!.mediaDevices.getUserMedia(c as never) as unknown as ReturnType<Rtc['getUserMedia']>,
} : {
  PeerConnection: missing as never, SessionDescription: missing as never, IceCandidate: missing as never, MediaStream: missing as never,
  getUserMedia: async () => missing(),
};
let registered = false;
export function initRtc(): void { if (mod && !registered) { registered = true; try { mod.registerGlobals(); } catch { /* optional */ } } }
