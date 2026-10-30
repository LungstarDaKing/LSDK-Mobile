// LUNEX assistant client (port of the website's lunex.js). Talks to the LUNEX server over HTTPS with the user's
// Supabase access token; the reply streams in as server-sent events. No secrets live in the app.
export class LunexError extends Error {
  status: number; retryAfter: number;
  constructor(message: string, status = 0, retryAfter = 0) { super(message); this.name = 'LunexError'; this.status = status; this.retryAfter = retryAfter; }
}
export type Turn = { role: 'user' | 'assistant'; text: string; sources?: Source[] };
export type Source = { title: string; url?: string };
export type Answer = { reply: string; skill: string; sources: Source[]; remainingToday: number | null };

type ReaderLike = { read(): Promise<{ value?: Uint8Array; done: boolean }> };
type ResponseLike = { ok: boolean; status: number; headers: { get(k: string): string | null }; json(): Promise<any>; body: { getReader(): ReaderLike } | null };
export type FetchLike = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<ResponseLike>;

export const MAX_MESSAGE = 2000;
export const toHistory = (turns: Turn[], max = 12) => turns.slice(-max).map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.text ?? '').slice(0, 2000) }));
export const chatContext = (messages: { sender_id: string; content: string | null; deleted_at?: string | null }[], nameOf: (id: string) => string, max = 150) => ({
  messages: messages.filter((m) => m.content && !m.deleted_at).slice(-max).map((m) => ({ author: nameOf(m.sender_id) || 'Someone', text: String(m.content).slice(0, 1000) })),
});

/** Safe to open? Only http(s) links from the server are shown as links. */
export function safeHref(u: unknown): string | null {
  try { const x = new URL(String(u)); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null; } catch { return null; }
}

/** Splits a text stream into server-sent events; calls onEvent for each complete `data:` JSON block. */
export async function readEvents(reader: ReaderLike, onEvent: (ev: any) => void): Promise<void> {
  const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      const data = block.split('\n').find((l) => l.startsWith('data: '));
      if (!data) continue;
      let ev: unknown; try { ev = JSON.parse(data.slice(6)); } catch { continue; }
      onEvent(ev);
    }
  }
}

export class LunexClient {
  private baseUrl: string;
  constructor(private o: { baseUrl: string; getToken: () => Promise<string | undefined>; fetch: FetchLike; timeoutMs?: number; locale?: string; tz?: string }) {
    this.baseUrl = (o.baseUrl || '').replace(/\/$/, '');
  }
  get configured() { return !!this.baseUrl; }

  private async headers() {
    const token = await this.o.getToken();
    if (!token) throw new LunexError('Please sign in to use LUNEX.', 401);
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  }
  private async fail(res: ResponseLike) {
    let msg = 'LUNEX is not available right now.';
    try { const j = await res.json(); msg = typeof j.detail === 'string' ? j.detail : (j.detail?.[0]?.msg ? 'That message could not be sent (too long?).' : msg); } catch { /* keep default */ }
    return new LunexError(msg, res.status, Number(res.headers.get('retry-after')) || 0);
  }

  async ask(message: string, opts: { history?: Turn[]; skill?: string; context?: unknown; signal?: AbortSignal; onStatus?: (t: string) => void; onDelta?: (t: string) => void } = {}): Promise<Answer> {
    if (!this.configured) throw new LunexError('LUNEX is not set up in this version of the app.', 0);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.o.timeoutMs ?? 60_000);
    opts.signal?.addEventListener('abort', () => ctl.abort());
    try {
      const res = await this.o.fetch(`${this.baseUrl}/v1/chat/stream`, {
        method: 'POST', headers: await this.headers(), signal: ctl.signal,
        body: JSON.stringify({ message, history: toHistory(opts.history ?? []), skill: opts.skill, context: opts.context, locale: this.o.locale ?? 'en', tz: this.o.tz ?? 'UTC' }),
      });
      if (!res.ok) throw await this.fail(res);
      if (!res.body) throw new LunexError('Could not reach LUNEX. Check your connection.', 0);
      let reply = ''; let done: { skill: string; sources: Source[]; remaining_today: number | null } = { skill: 'chat', sources: [], remaining_today: null };
      let failed: LunexError | null = null;
      await readEvents(res.body.getReader(), (ev) => {
        if (ev.type === 'status') opts.onStatus?.(String(ev.text));
        else if (ev.type === 'delta') { reply += String(ev.text); opts.onDelta?.(String(ev.text)); }
        else if (ev.type === 'done') done = ev;
        else if (ev.type === 'error') failed = new LunexError(String(ev.message ?? 'LUNEX had a problem.'), 503);
      });
      if (failed) throw failed;
      return { reply: reply.trim(), skill: done.skill, sources: (done.sources ?? []).slice(0, 6), remainingToday: done.remaining_today ?? null };
    } catch (e) {
      if (e instanceof LunexError) throw e;
      throw new LunexError((e as { name?: string })?.name === 'AbortError' ? 'LUNEX took too long. Please try again.' : 'Could not reach LUNEX. Check your connection.', 0);
    } finally { clearTimeout(timer); }
  }

  /** Wakes the (free) server if it is asleep so the first real message is quicker. Never throws. */
  wake(): void { if (!this.baseUrl) return; try { void (this.o.fetch(`${this.baseUrl}/health`, {}) as Promise<unknown>).catch(() => {}); } catch { /* ignore */ } }
}
