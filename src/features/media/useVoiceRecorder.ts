import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { MAX_VOICE_MS, MIN_VOICE_MS, resolveType } from './rules';
import type { Choice } from './pick';

export type VoiceState = { recording: boolean; elapsedMs: number; error: string | null };

/** Record a voice note. Native records m4a (audio/mp4, accepted by the server and playable on iOS + Android). */
export function useVoiceRecorder(onDone: (c: Choice & { durationMs: number }) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [state, setState] = useState<VoiceState>({ recording: false, elapsedMs: 0, error: null });
  const startedAt = useRef(0);
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const clearTimer = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };

  const finish = useCallback(async (send: boolean) => {
    if (!active.current) return;
    active.current = false; clearTimer();
    const durationMs = Date.now() - startedAt.current;
    setState({ recording: false, elapsedMs: 0, error: null });
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
      const uri = recorder.uri;
      if (!send || !uri) return;
      if (durationMs < MIN_VOICE_MS) { setState((s) => ({ ...s, error: 'Hold a little longer to record a voice note.' })); return; }
      let mime = 'audio/mp4';
      if (Platform.OS === 'web') {
        const blob = await (await fetch(uri)).blob();
        mime = resolveType(null, blob.type) ?? 'audio/webm';
      }
      doneRef.current({ picked: { uri, name: null, mime, size: null, durationMs: Math.min(durationMs, MAX_VOICE_MS) }, mime, fallback: `voice.${mime === 'audio/mp4' ? 'm4a' : mime === 'audio/ogg' ? 'ogg' : mime === 'audio/wav' ? 'wav' : 'webm'}`, durationMs: Math.min(durationMs, MAX_VOICE_MS) });
    } catch {
      setState((s) => ({ ...s, error: 'Could not save that recording.' }));
    }
  }, [recorder]);

  const start = useCallback(async () => {
    if (active.current) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) { setState({ recording: false, elapsedMs: 0, error: 'Microphone access is off. You can turn it on in your phone settings.' }); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      active.current = true; startedAt.current = Date.now();
      setState({ recording: true, elapsedMs: 0, error: null });
      timer.current = setInterval(() => {
        const e = Date.now() - startedAt.current;
        setState((s) => ({ ...s, elapsedMs: e }));
        if (e >= MAX_VOICE_MS) void finish(true);
      }, 250);
    } catch {
      active.current = false;
      setState({ recording: false, elapsedMs: 0, error: 'Could not start recording.' });
    }
  }, [recorder, finish]);

  useEffect(() => () => { clearTimer(); if (active.current) { active.current = false; void recorder.stop().catch(() => {}); } }, [recorder]);

  return { ...state, start, send: () => finish(true), cancel: () => finish(false), clearError: () => setState((s) => ({ ...s, error: null })) };
}
