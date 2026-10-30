import { createElement } from 'react';
import { embedUrl, PROVIDERS, type Provider } from './logic';

export function EmbedPlayer({ provider, id }: { provider: Provider; id: string }) {
  const url = embedUrl(provider, id);
  if (!url) return null;
  return createElement('iframe', { src: url, title: `${PROVIDERS[provider].name} player`, allow: 'autoplay; encrypted-media', allowFullScreen: true, style: { width: '100%', height: '100%', border: 0 } });
}
