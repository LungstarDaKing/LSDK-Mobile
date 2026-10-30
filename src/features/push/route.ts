// Turns the "path" the server puts in a push into a screen of THIS app. Anything unexpected -> null (nothing happens).
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const CHAT = new RegExp(`^#?/chat/(${UUID})$`);

export type Target = { pathname: '/chat/[roomId]'; params: { roomId: string } } | { pathname: '/(tabs)/calls' } | { pathname: '/(tabs)' };

export function routeFor(data: unknown): Target | null {
  if (!data || typeof data !== 'object') return null;
  const { kind, path } = data as { kind?: unknown; path?: unknown };
  if (typeof path === 'string') {
    const m = CHAT.exec(path);
    if (m && (kind === 'message' || kind === 'group_call' || kind === 'call')) return { pathname: '/chat/[roomId]', params: { roomId: m[1] } };
  }
  if (kind === 'missed_call' || kind === 'call') return { pathname: '/(tabs)/calls' };
  if (kind === 'message' || kind === 'group_call') return { pathname: '/(tabs)' };
  return null;
}
