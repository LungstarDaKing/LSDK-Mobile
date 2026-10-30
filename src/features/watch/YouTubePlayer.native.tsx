// Phones: the YouTube player runs inside a WebView page we build ourselves; the page forwards the player's messages
// to the app and the app sends commands back. (Needs react-native-webview: included in Expo Go and in builds.)
import { forwardRef, useImperativeHandle, useMemo, useRef, type ElementRef } from 'react';
import { WebView } from 'react-native-webview';
import { env } from '@/lib/env';
import { applyPlayerMessage, embedUrl, type Report } from './logic';
import type { PlayerHandle, YouTubeProps } from './players.types';

const ORIGIN = env.webUrl || 'https://www.youtube-nocookie.com';

export const YouTubePlayer = forwardRef<PlayerHandle, YouTubeProps>(function YouTubePlayer({ videoId, onReport }, ref) {
  const web = useRef<ElementRef<typeof WebView>>(null);
  const report = useRef<Report>({ playing: false, pos: 0, ready: false });
  const src = embedUrl('youtube', videoId, ORIGIN);
  const html = useMemo(() => (src ? `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#000"><iframe id="p" src="${src}" style="width:100%;height:100vh;border:0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
<script>
var f=document.getElementById('p');
function hello(){try{f.contentWindow.postMessage(JSON.stringify({event:'listening',id:1,channel:'widget'}),'*')}catch(e){}}
window.addEventListener('message',function(e){if(e.source!==f.contentWindow)return;window.ReactNativeWebView.postMessage(typeof e.data==='string'?e.data:JSON.stringify(e.data))});
f.addEventListener('load',function(){hello();setInterval(hello,700)});
window.__cmd=function(m){try{f.contentWindow.postMessage(JSON.stringify(m),'*')}catch(e){}};
</script></body></html>` : ''), [src]);
  const cmd = (func: string, args: unknown[] = []) => web.current?.injectJavaScript(`window.__cmd(${JSON.stringify({ event: 'command', func, args })});true;`);
  useImperativeHandle(ref, () => ({ play: () => cmd('playVideo'), pause: () => cmd('pauseVideo'), seek: (s) => cmd('seekTo', [s, true]) }));
  if (!src) return null;
  return (
    <WebView
      ref={web} source={{ html, baseUrl: ORIGIN }} originWhitelist={['*']} javaScriptEnabled domStorageEnabled
      allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(r) => r.url === 'about:blank' || r.url.startsWith(ORIGIN) || r.url.startsWith('https://www.youtube-nocookie.com/')}
      onMessage={(e) => { const next = applyPlayerMessage(report.current, e.nativeEvent.data); if (next) { report.current = next; onReport({ ...next }); } }}
      style={{ flex: 1, backgroundColor: '#000' }} accessibilityLabel="YouTube player"
    />
  );
});
