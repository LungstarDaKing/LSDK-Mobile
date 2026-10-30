import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';
import { parseMsg, type Msg } from './logic';

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  throw new UserError(error?.code === 'P0001' && error.message ? error.message : fallback);
}
export type Setup = { car?: string; color?: string; map?: string; laps?: number; balanced?: boolean; ready?: boolean; start?: boolean };

export const raceApi = (gameId: string) => ({
  async setup(o: Setup): Promise<void> {
    const { error } = await supabase.rpc('race_setup', {
      p_game: gameId, p_car: o.car ?? null, p_color: o.color ?? null, p_map: o.map ?? null, p_laps: o.laps ?? null,
      p_balanced: o.balanced ?? null, p_ready: o.ready ?? null, p_start: !!o.start,
    });
    if (error) fail(error, 'Could not update the race.');
  },
  async finish(winner: string, times: Record<string, number>): Promise<void> {
    const { error } = await supabase.rpc('race_finish', { p_game: gameId, p_winner: winner, p_times: times });
    if (error) fail(error, 'Could not save the race result.');
  },
});

/** Live position channel (Supabase Realtime broadcast). Nothing is stored while driving. */
export type RaceNet = { on: (f: (m: Msg) => void) => () => void; send: (m: Msg) => void; close: () => void };
export function openRaceChannel(name: string): RaceNet {
  const subs = new Set<(m: Msg) => void>();
  const ch = supabase.channel(name, { config: { broadcast: { self: false } } });
  ch.on('broadcast', { event: 'm' }, ({ payload }: { payload: unknown }) => { const m = parseMsg(payload); if (m) subs.forEach((f) => f(m)); }).subscribe();
  return {
    on: (f) => { subs.add(f); return () => { subs.delete(f); }; },
    send: (payload) => { try { void ch.send({ type: 'broadcast', event: 'm', payload }); } catch { /* ignore */ } },
    close: () => { try { void supabase.removeChannel(ch); } catch { /* ignore */ } },
  };
}
