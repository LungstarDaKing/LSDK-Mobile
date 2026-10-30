// Private nicknames: what *I* call someone. Only I (and they) can read the row; their real username never changes.
import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';

export const MAX_NICKNAME = 30;

export async function loadNicknames(me: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('nicknames').select('target_id, nickname').eq('owner_id', me);
  if (error) throw error;
  return new Map(((data ?? []) as { target_id: string; nickname: string }[]).map((r) => [r.target_id, r.nickname]));
}

/** Empty string removes the nickname. */
export async function setNickname(target: string, raw: string): Promise<void> {
  const nick = raw.trim();
  if (nick.length > MAX_NICKNAME) throw new UserError(`Nicknames are limited to ${MAX_NICKNAME} characters`);
  const { error } = await supabase.rpc('set_nickname', { p_target: target, p_nick: nick });
  if (error) throw error;
}

/** The name to show for a person: my nickname for them, else their username. */
export const nameFor = (nicks: ReadonlyMap<string, string>, id: string, username: string | null | undefined, fallback = 'Former member') =>
  nicks.get(id) ?? username ?? fallback;
