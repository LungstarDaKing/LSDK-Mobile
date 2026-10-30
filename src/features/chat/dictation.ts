// Dictation (speak to type). Web build: the browser's own speech recognition. Phones: expo-speech-recognition (needs a development build, not Expo Go).
// The audio is processed by the phone/browser maker's speech service, not by LSDK Chat.
import { Platform } from 'react-native';
import { isExpoGo } from '@/lib/runtime';

export type Dictation = { lang: string; onInterim?: (t: string) => void; onFinal?: (t: string) => void; onEnd?: () => void; onError?: (code: string) => void };

type NativeModule = {
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (o: Record<string, unknown>) => void;
  stop: () => void;
  addListener: (ev: string, cb: (e: never) => void) => { remove: () => void };
};
function nativeModule(): NativeModule | null {
  if (Platform.OS === 'web' || isExpoGo) return null;
  try { return (require('expo-speech-recognition') as { ExpoSpeechRecognitionModule: NativeModule }).ExpoSpeechRecognitionModule ?? null; } catch { return null; }
}
type WebSR = { lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number; start: () => void; stop: () => void; onresult: ((e: never) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
function webCtor(): (new () => WebSR) | null {
  if (Platform.OS !== 'web') return null;
  const g = globalThis as unknown as { SpeechRecognition?: new () => WebSR; webkitSpeechRecognition?: new () => WebSR };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

export const dictationAvailable = (): boolean => !!(webCtor() || nativeModule());

/** Starts listening; returns a stop function. Errors are reported through onError (never thrown). */
export function startDictation(o: Dictation): () => void {
  const Web = webCtor();
  if (Web) {
    const rec = new Web();
    rec.lang = o.lang; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const ev = e as unknown as { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] & { length: number } };
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        if (r.isFinal) o.onFinal?.(r[0].transcript.trim()); else interim += r[0].transcript;
      }
      o.onInterim?.(interim);
    };
    rec.onerror = (e) => o.onError?.(e.error);
    rec.onend = () => o.onEnd?.();
    try { rec.start(); } catch { o.onError?.('start-failed'); }
    return () => { try { rec.stop(); } catch { /* already stopped */ } };
  }
  const mod = nativeModule();
  if (!mod) { setTimeout(() => o.onError?.('not-supported'), 0); return () => {}; }
  const subs: { remove: () => void }[] = [];
  let stopped = false;
  const cleanup = () => { subs.splice(0).forEach((s) => s.remove()); };
  subs.push(mod.addListener('result', ((e: { isFinal: boolean; results: { transcript: string }[] }) => {
    const t = e.results?.[0]?.transcript ?? '';
    if (e.isFinal) o.onFinal?.(t.trim()); else o.onInterim?.(t);
  }) as never));
  subs.push(mod.addListener('error', ((e: { error: string }) => o.onError?.(e.error)) as never));
  subs.push(mod.addListener('end', (() => { cleanup(); o.onEnd?.(); }) as never));
  mod.requestPermissionsAsync().then((p) => {
    if (stopped) return cleanup();
    if (!p.granted) { cleanup(); o.onError?.('not-allowed'); o.onEnd?.(); return; }
    mod.start({ lang: o.lang, interimResults: true, continuous: true });
  }).catch(() => { cleanup(); o.onError?.('start-failed'); o.onEnd?.(); });
  return () => { stopped = true; try { mod.stop(); } catch { /* already stopped */ } };
}

/** Spoken commands (English): "send", "clear", "stop". Matches the website. */
export function commandOf(text: string): 'send' | 'clear' | 'stop' | null {
  const t = text.toLowerCase().replace(/[.,!?]/g, '').trim();
  if (/^(send|send it|send message|send the message)$/.test(t)) return 'send';
  if (/^(clear|clear message|clear it|delete that|cancel|never mind|start over)$/.test(t)) return 'clear';
  if (/^(stop|stop dictation|stop listening)$/.test(t)) return 'stop';
  return null;
}

const MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone or speech permission was refused. Allow it in your phone settings to dictate.',
  'service-not-allowed': 'Speech recognition is turned off on this device.',
  'language-not-supported': 'Dictation does not support that language on this device.',
  'not-supported': 'Dictation is not available here. Use a development build on a phone, or a browser that supports it.',
  network: 'Dictation needs an internet connection.',
};
export const dictationError = (code: string): string | null => (code === 'no-speech' || code === 'aborted' ? null : MESSAGES[code] ?? 'Dictation stopped. Try again.');

/** Join dictated text onto what is already typed, with one space between. */
export const appendSpoken = (draft: string, spoken: string): string => {
  const s = spoken.trim(); if (!s) return draft;
  return draft && !/\s$/.test(draft) ? `${draft} ${s}` : `${draft}${s}`;
};
