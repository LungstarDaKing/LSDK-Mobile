import { supabase } from '@/lib/supabase';
import { UserError } from '@/lib/validation';
import type { Provider, WatchRow } from './logic';

function fail(error: { message: string; code?: string } | null, fallback: string): never {
  throw new UserError(error?.code === 'P0001' && error.message ? error.message : fallback);
}
const run = async (name: string, args: Record<string, unknown>, fallback: string) => { const { error } = await supabase.rpc(name, args); if (error) fail(error, fallback); };
export const watchApi = {
  start: (room: string, provider: Provider, id: string) => run('watch_start', { p_room: room, p_provider: provider, p_media: id }, 'Could not start watching.'),
  control: (room: string, action: 'play' | 'pause' | 'seek' | 'countdown', pos = 0) => run('watch_control', { p_room: room, p_action: action, p_pos: pos }, 'Could not do that.'),
  request: (room: string) => run('watch_request', { p_room: room }, 'Could not ask for control.'),
  grant: (room: string, user: string, allow: boolean) => run('watch_grant', { p_room: room, p_user: user, p_allow: allow }, 'Could not change control.'),
  stop: (room: string) => run('watch_stop', { p_room: room }, 'Could not stop.'),
  async get(room: string): Promise<WatchRow | null> {
    const { data, error } = await supabase.from('watch_sessions').select('*').eq('room_id', room).maybeSingle();
    if (error) fail(error, 'Could not load the shared session.');
    return (data as WatchRow | null) ?? null;
  },
};
