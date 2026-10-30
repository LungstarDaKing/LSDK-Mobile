import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';
import type { Game, GameKind, Move } from './logic';

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  throw new UserError(error?.code === 'P0001' && error.message ? error.message : fallback);
}
export const gameApi = {
  async start(room: string, kind: GameKind, secret: string | null = null): Promise<string> {
    const { data, error } = await supabase.rpc('game_start', { p_room: room, p_kind: kind, p_secret: secret });
    if (error || typeof data !== 'string') fail(error, 'Could not start the game.');
    return data;
  },
  async move(game: Game, m: Move): Promise<void> {
    const { error } = await supabase.rpc('game_move', { p_game: game.id, p_version: game.version, p_state: m.state, p_status: m.status, p_winner: m.winner, p_result: m.result });
    if (error) fail(error, 'Could not make that move.');
  },
  async guess(id: string, letter: string): Promise<void> {
    const { error } = await supabase.rpc('game_guess', { p_game: id, p_letter: letter });
    if (error) fail(error, 'Could not send that letter.');
  },
  async resign(id: string): Promise<void> {
    const { error } = await supabase.rpc('game_resign', { p_game: id });
    if (error) fail(error, 'Could not end the game.');
  },
  async secret(id: string): Promise<string | null> {
    const { data, error } = await supabase.rpc('game_secret', { p_game: id });
    if (error) fail(error, 'Could not load the secret.');
    return typeof data === 'string' ? data : null;
  },
  async latest(room: string): Promise<Game | null> {
    const { data, error } = await supabase.from('games').select('*').eq('room_id', room).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) fail(error, 'Could not load the game.');
    return (data as Game | null) ?? null;
  },
};
