// Browsers: a plain iframe plus postMessage, exactly like the website.
import { createElement, forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { applyPlayerMessage, embedUrl, PROVIDERS, type Report } from './logic';
import type { PlayerHandle, YouTubeProps } from './players.types';

export const YouTubePlayer = forwardRef<PlayerHandle, YouTubeProps>(function YouTubePlayer({ videoId, onReport }, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const report = useRef<Report>({ playing: false, pos: 0, ready: false });
  const origin = PROVIDERS.youtube.embed;
  const post = (m: unknown) => { try { frame.current?.contentWindow?.postMessage(JSON.stringify(m), origin); } catch { /* ignore */ } };
  useImperativeHandle(ref, () => ({ play: () => post({ event: 'command', func: 'playVideo', args: [] }), pause: () => post({ event: 'command', func: 'pauseVideo', args: [] }), seek: (s) => post({ event: 'command', func: 'seekTo', args: [s, true] }) }));
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== origin || e.source !== frame.current?.contentWindow) return;
      const next = applyPlayerMessage(report.current, e.data);
      if (next) { report.current = next; onReport({ ...next }); }
    };
    window.addEventListener('message', onMsg);
    const f = frame.current; let t: ReturnType<typeof setInterval> | undefined;
    const hello = () => post({ event: 'listening', id: 1, channel: 'widget' });
    const onLoad = () => { hello(); t = setInterval(() => { if (report.current.ready) clearInterval(t); else hello(); }, 700); };
    f?.addEventListener('load', onLoad);
    return () => { window.removeEventListener('message', onMsg); f?.removeEventListener('load', onLoad); if (t) clearInterval(t); };
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps
  const src = embedUrl('youtube', videoId, typeof window !== 'undefined' ? window.location.origin : '');
  if (!src) return null;
  return createElement('iframe', { ref: frame, src, title: 'YouTube player', allow: 'autoplay; encrypted-media; picture-in-picture', allowFullScreen: true, style: { width: '100%', height: '100%', border: 0, background: '#000' } });
});
