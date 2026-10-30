jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
import { LunexClient, LunexError, chatContext, readEvents, safeHref, toHistory, type FetchLike } from '@/features/lunex/client';
import { validTurn } from '@/features/lunex/store';

const enc = new TextEncoder();
const sse = (...evs: object[]) => evs.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
function reader(chunks: string[]) { let i = 0; return { read: async () => (i < chunks.length ? { value: enc.encode(chunks[i++]), done: false } : { value: undefined, done: true }) }; }
const okRes = (chunks: string[]) => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), body: { getReader: () => reader(chunks) } });
const client = (f: FetchLike, token: string | null = 'tok') => new LunexClient({ baseUrl: 'https://lx.example/', getToken: async () => token ?? undefined, fetch: f });

describe('LUNEX client', () => {
  test('streams status + deltas, returns the full reply, sources and quota; sends the bearer token and trimmed history', async () => {
    const f = jest.fn(async () => okRes([sse({ type: 'status', text: 'Thinking' }, { type: 'delta', text: 'Hel' }), sse({ type: 'delta', text: 'lo ' }, { type: 'done', skill: 'chat', sources: [{ title: 'S', url: 'https://x.y' }], remaining_today: 7 })]));
    const status: string[] = [], deltas: string[] = [];
    const r = await client(f as never).ask('hi', { history: [{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }], onStatus: (t) => status.push(t), onDelta: (t) => deltas.push(t) });
    expect(r).toEqual({ reply: 'Hello', skill: 'chat', sources: [{ title: 'S', url: 'https://x.y' }], remainingToday: 7 });
    expect(status).toEqual(['Thinking']); expect(deltas.join('')).toBe('Hello ');
    const [url, init] = f.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('https://lx.example/v1/chat/stream'); expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body).history).toEqual([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }]);
  });
  test('events split across chunks (even mid-JSON) are reassembled; junk blocks are skipped', async () => {
    const a = sse({ type: 'delta', text: 'A' }), b = sse({ type: 'delta', text: 'B' });
    const got: string[] = [];
    await readEvents(reader([a.slice(0, 10), a.slice(10) + 'data: {not json}\n\n' + b.slice(0, 7), b.slice(7)]), (e) => got.push(e.text));
    expect(got).toEqual(['A', 'B']);
  });
  test('errors: not signed in, HTTP detail text, rate-limit retry-after, server error event, network, timeout', async () => {
    await expect(client((async () => okRes([])) as never, null).ask('x')).rejects.toMatchObject({ status: 401 });
    const bad = (status: number, detail: unknown, ra: string | null = null) => (async () => ({ ok: false, status, headers: { get: () => ra }, json: async () => ({ detail }), body: null })) as never;
    await expect(client(bad(429, 'Daily limit reached', '60')).ask('x')).rejects.toMatchObject({ message: 'Daily limit reached', status: 429, retryAfter: 60 });
    await expect(client(bad(422, [{ msg: 'too long' }])).ask('x')).rejects.toThrow(/too long/);
    await expect(client((async () => okRes([sse({ type: 'error', message: 'Model down' })])) as never).ask('x')).rejects.toMatchObject({ message: 'Model down', status: 503 });
    await expect(client((async () => { throw new TypeError('network'); }) as never).ask('x')).rejects.toThrow('Could not reach LUNEX');
    const abort = (async (_u: string, i: { signal: AbortSignal }) => new Promise((_r, rej) => i.signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))))) as never;
    await expect(new LunexClient({ baseUrl: 'https://x', getToken: async () => 't', fetch: abort, timeoutMs: 20 }).ask('x')).rejects.toThrow('took too long');
  });
  test('not configured (no URL) fails clearly without a request', async () => {
    const f = jest.fn(); await expect(new LunexClient({ baseUrl: '', getToken: async () => 't', fetch: f as never }).ask('x')).rejects.toBeInstanceOf(LunexError); expect(f).not.toHaveBeenCalled();
  });
});

test('helpers', () => {
  expect(toHistory(Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, text: String(i) }))).length).toBe(12);
  expect(chatContext([{ sender_id: 'a', content: 'hi' }, { sender_id: 'a', content: null }, { sender_id: 'b', content: 'x', deleted_at: 'd' }], (id) => (id === 'a' ? 'Ann' : '')).messages).toEqual([{ author: 'Ann', text: 'hi' }]);
  expect(safeHref('https://a.b/c')).toBe('https://a.b/c'); expect(safeHref('javascript:alert(1)')).toBeNull(); expect(safeHref('nope')).toBeNull();
  expect(validTurn({ role: 'user', text: 'x' })).toBe(true); expect(validTurn({ role: 'system', text: 'x' })).toBe(false); expect(validTurn(null)).toBe(false);
});

import { loadTurns, saveTurns, wipeTurns } from '@/features/lunex/store';
test('conversation is stored per user, capped, filtered, and wiped on sign-out', async () => {
  await saveTurns('u1', Array.from({ length: 130 }, (_, i) => ({ role: 'user' as const, text: String(i) })));
  await saveTurns('u2', [{ role: 'user', text: 'mine' }]);
  expect((await loadTurns('u1')).length).toBe(100); expect((await loadTurns('u1'))[0].text).toBe('30');
  await wipeTurns();
  expect(await loadTurns('u1')).toEqual([]); expect(await loadTurns('u2')).toEqual([]);
});
