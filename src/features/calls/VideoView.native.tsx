import type { StyleProp, ViewStyle } from 'react-native';
import type { StreamLike } from './types';

/* eslint-disable @typescript-eslint/no-require-imports */
let RTCView: any = null;
try { RTCView = require('react-native-webrtc').RTCView; } catch { RTCView = null; }

export function VideoView({ stream, mirror, style, fit = 'cover' }: { stream: StreamLike | null; mirror?: boolean; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain' }) {
  if (!RTCView || !stream?.toURL) return null;
  return <RTCView streamURL={stream.toURL()} mirror={mirror} objectFit={fit} style={style} />;
}
