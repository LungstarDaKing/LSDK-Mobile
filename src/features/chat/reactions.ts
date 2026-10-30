// Pure reaction helpers. State shape: messageId -> (userId -> emoji). One reaction per user per message.
export type ReactionMap = Map<string, Map<string, string>>;
export type ReactionChip = { emoji: string; count: number; users: string[]; mine: boolean };

/** Returns a NEW map (immutable update so React re-renders). emoji=null removes the user's reaction. */
export function setReaction(map: ReactionMap, messageId: string, userId: string, emoji: string | null): ReactionMap {
  const next: ReactionMap = new Map(map);
  const inner = new Map(next.get(messageId) ?? []);
  if (emoji) inner.set(userId, emoji); else inner.delete(userId);
  if (inner.size) next.set(messageId, inner); else next.delete(messageId);
  return next;
}

/** Chips for one message, most used first (ties keep first-seen order). */
export function summarize(byUser: Map<string, string> | undefined, me: string): ReactionChip[] {
  const groups = new Map<string, string[]>();
  for (const [uid, e] of byUser ?? []) {
    if (!groups.has(e)) groups.set(e, []);
    groups.get(e)!.push(uid);
  }
  return [...groups.entries()]
    .map(([emoji, users]) => ({ emoji, count: users.length, users, mine: users.includes(me) }))
    .sort((a, b) => b.count - a.count);
}
