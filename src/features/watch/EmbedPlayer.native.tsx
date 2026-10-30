import { WebView } from 'react-native-webview';
import { embedUrl, PROVIDERS, type Provider } from './logic';

/** Spotify / Apple Music / TikTok: shown in a WebView limited to that service's own address. */
export function EmbedPlayer({ provider, id }: { provider: Provider; id: string }) {
  const url = embedUrl(provider, id);
  if (!url) return null;
  const base = PROVIDERS[provider].embed;
  return <WebView source={{ uri: url }} setSupportMultipleWindows={false} allowsInlineMediaPlayback onShouldStartLoadWithRequest={(r) => r.url.startsWith(base)} style={{ flex: 1, backgroundColor: '#000' }} accessibilityLabel={`${PROVIDERS[provider].name} player`} />;
}
