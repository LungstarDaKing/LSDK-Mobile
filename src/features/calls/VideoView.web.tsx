import { createElement, useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet } from 'react-native';
import type { StreamLike } from './types';

export function VideoView({ stream, mirror, style, fit = 'cover', muted }: { stream: StreamLike | null; mirror?: boolean; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain'; muted?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => { if (ref.current) ref.current.srcObject = (stream as unknown as MediaStream) ?? null; }, [stream]);
  if (!stream) return null;
  const flat = StyleSheet.flatten(style) ?? {};
  return createElement('video', {
    ref, autoPlay: true, playsInline: true, muted: !!muted || !!mirror,   // our own preview is always muted (no echo)
    style: { ...flat, objectFit: fit, transform: mirror ? 'scaleX(-1)' : undefined },
  });
}
