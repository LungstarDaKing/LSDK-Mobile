import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { parseItems, type StickerItem } from './logic';

export type Page = { items: StickerItem[]; hasNext: boolean };

/** Sticker search goes through your LUNEX server (it holds the KLIPY key). Disabled when EXPO_PUBLIC_LUNEX_URL is empty. */
export class StickerApi {
  constructor(private base = env.lunexUrl.replace(/\/$/, ''), private f: typeof fetch = fetch) {}
  get enabled() { return !!this.base; }
  wake() { if (this.base) void this.f(`${this.base}/health`, { cache: 'no-store' } as RequestInit).catch(() => {}); }
  private async get(path: string, params: Record<string, string | number>): Promise<Page> {
    const token = (await supabase.auth.getSession()).data.session?.access_token;
    if (!token) throw new Error('Please sign in again to use stickers.');
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);   // a sleeping free server can take a while
    try {
      const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      const res = await this.f(`${this.base}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctl.signal });
      if (!res.ok) {
        let msg = 'Stickers are unavailable right now.';
        try { const j = (await res.json()) as { detail?: unknown }; if (typeof j.detail === 'string' && j.detail.length < 160) msg = j.detail; } catch { /* keep default */ }
        throw new Error(msg);
      }
      return parseItems(await res.json());
    } catch (e) {
      const err = e as { name?: string };
      if (err.name === 'AbortError') throw new Error('Stickers took too long to load. Try again.');
      if (e instanceof TypeError) throw new Error('Could not reach the sticker service. Check your connection.');
      throw e;
    } finally { clearTimeout(t); }
  }
  trending(page = 1) { return this.get('/v1/stickers/trending', { page }); }
  search(q: string, page = 1) { return this.get('/v1/stickers/search', { q, page }); }
}
export const stickerApi = new StickerApi();
