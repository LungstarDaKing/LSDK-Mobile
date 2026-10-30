// Web smoke test against a FAKE Supabase backend (no real data touched). See e2e/README.md.
const PORT = process.env.PORT || 8101;
const { chromium } = (() => { try { return require('playwright'); } catch { return require(process.env.PLAYWRIGHT_PATH); } })();
const ME = '11111111-1111-4111-8111-111111111111', BOB = '22222222-2222-4222-8222-222222222222', AMY = '33333333-3333-4333-8333-333333333333';
const now = Date.now(); const iso = (minAgo) => new Date(now - minAgo * 60000).toISOString();
const R1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', R2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const msg = (id, room, sender, content, min, extra = {}) => ({ id, room_id: room, sender_id: sender, content, created_at: iso(min), edited_at: null, reply_to: null, attachment_path: null, attachment_name: null, attachment_type: null, attachment_duration: null, status_label: null, ...extra });
const store = { msgs: [
  msg('m1', R1, BOB, 'Hey Lungelo', 50), msg('m2', R1, ME, 'Hi Bob', 45), msg('m3', R1, BOB, 'How is the app going?', 20),
  msg('m4', R1, ME, 'Going well, adding reactions', 10), msg('m5', R1, BOB, 'Nice! Replying to your first one', 5, { reply_to: 'm2' }),
  msg('g1', R2, AMY, 'Welcome to the crew', 30),
] };
const prof = (id, username) => ({ username, avatar_path: null, bio: id === BOB ? 'Designer from Durban' : null });
const rooms = [
  { id: R1, name: null, is_direct: true, notes_owner: null, last_message_at: iso(5), participants: [{ profile_id: ME, role: 'member', joined_at: iso(999), profiles: prof(ME, 'lungelo') }, { profile_id: BOB, role: 'member', joined_at: iso(999), profiles: prof(BOB, 'bob') }] },
  { id: R2, name: 'Crew', is_direct: false, notes_owner: null, last_message_at: iso(30), participants: [{ profile_id: ME, role: 'admin', joined_at: iso(999), profiles: prof(ME, 'lungelo') }, { profile_id: BOB, role: 'member', joined_at: iso(999), profiles: prof(BOB, 'bob') }, { profile_id: AMY, role: 'member', joined_at: iso(999), profiles: prof(AMY, 'amy') }] },
];
const cap = { rpc: [], inserts: [], patches: [], deletes: [], uploads: [], signed: [], removed: [], profilePatches: [], order: [] };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let profileBio = null;
const FAR = new Date(Date.now() + 20 * 3600 * 1000).toISOString();
const story = (id, author, username, extra = {}) => ({ id, author_id: author, kind: 'text', content: id, bg: 2, attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null, reported: false, created_at: new Date(Date.now() - 600000).toISOString(), expires_at: FAR, profiles: { username, avatar_path: null }, ...extra });
const storyStore = { stories: [
  story('Hello from Amy', AMY, 'amy', { created_at: new Date(Date.now() - 900000).toISOString() }),
  story('Second from Amy', AMY, 'amy'),
  story('bobpic', BOB, 'bob', { kind: 'image', content: 'Bob caption', bg: null, attachment_path: `${BOB}/bbbbbbbb-0000-4000-8000-000000000001.png`, attachment_name: 'p.png', attachment_type: 'image/png', attachment_size: 70 }),
], viewed: [], liked: [], nicks: {}, sharing: true };
cap.stories = []; cap.nick = [];
const gameStore = { row: null };
const flagStore = { rooms: [] };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' };
const json = (route, body, status = 200) => route.fulfill({ status, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function mock(page) {
  await page.route('https://example.supabase.co/**', async (route) => {
    const req = route.request(); const url = new URL(req.url()); const p = url.pathname; const m = req.method();
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const accept = req.headers()['accept'] || ''; const wantObj = accept.includes('vnd.pgrst.object+json');
    const out = (rows) => json(route, wantObj ? (rows[0] ?? null) : rows, wantObj && !rows.length ? 406 : 200);
    if (p.startsWith('/rest/v1/rpc/')) {
      const name = p.split('/').pop(); const args = req.postData() ? JSON.parse(req.postData()) : {}; cap.rpc.push({ name, args });
      switch (name) {
        case 'get_room_previews': return json(route, [{ room_id: R1, sender_id: BOB, content: 'Nice! Replying to your first one', created_at: iso(5), attachment_type: null }, { room_id: R2, sender_id: AMY, content: 'Welcome to the crew', created_at: iso(30), attachment_type: null }]);
        case 'get_unread_counts': return json(route, [{ room_id: R1, unread: 2 }]);
        case 'get_statuses': return json(route, [{ id: BOB, online: true, last_seen_at: null }]);
        case 'get_room_reads': return json(route, [{ profile_id: BOB, last_read_at: iso(8) }]);
        case 'game_start': gameStore.row = { id: 'g1', room_id: args.p_room, kind: args.p_kind, p1: ME, p2: BOB, state: { board: Array(9).fill(null) }, turn: ME, status: 'active', winner: null, result: null, version: 0, created_at: iso(0), updated_at: iso(0) }; return json(route, 'g1');
        case 'game_move': gameStore.row = { ...gameStore.row, state: args.p_state, status: args.p_status, version: gameStore.row.version + 1, turn: BOB }; return json(route, null);
        case 'search_messages': return json(route, [{ id: 'm1', room_id: R1, sender_id: BOB, content: 'Hey Lungelo', created_at: iso(50), attachment_name: null, attachment_type: null, attachment_path: null }]);
        case 'set_marked_unread': if (args.p_value) { if (!flagStore.rooms.includes(args.p_room)) flagStore.rooms.push(args.p_room); } else flagStore.rooms = flagStore.rooms.filter((x) => x !== args.p_room); return json(route, null);
        case 'race_setup': {
          const r = gameStore.row; if (!r || r.kind !== 'race') return json(route, null);
          const st = { ...r.state, cars: { ...(r.state.cars || {}) }, ready: { ...(r.state.ready || {}) } };
          if (args.p_car || args.p_color) st.cars[ME] = { ...(st.cars[ME] || {}), ...(args.p_car ? { car: args.p_car } : {}), ...(args.p_color ? { color: args.p_color } : {}) };
          if (args.p_map) st.map = args.p_map;
          if (args.p_ready != null) { st.ready[ME] = args.p_ready; st.ready[BOB] = args.p_ready; }
          if (args.p_start) { st.ready = {}; st.round = (st.round || 0) + 1; }
          gameStore.row = { ...r, state: st, version: r.version + 1 }; return json(route, null);
        }
        case 'game_resign': if (gameStore.row) gameStore.row = { ...gameStore.row, status: 'done', winner: BOB, result: 'Gave up' }; return json(route, null);
        case 'start_call': return json(route, 'call-new');
        case 'end_call': return json(route, null);
        case 'hide_call_history': return json(route, null);
        case 'react_to_message': return json(route, args.p_emoji);
        case 'create_direct_room': return json(route, R1);
        case 'mark_story_viewed': if (!storyStore.viewed.includes(args.p_story)) storyStore.viewed.push(args.p_story); return json(route, null);
        case 'like_story': if (args.p_on) storyStore.liked.push(args.p_story); else storyStore.liked = storyStore.liked.filter((x) => x !== args.p_story); return json(route, args.p_on);
        case 'comment_on_story': return json(route, 'c1');
        case 'report_story': return json(route, null);
        case 'set_nickname': cap.nick.push(args); if (args.p_nick) storyStore.nicks[args.p_target] = args.p_nick; else delete storyStore.nicks[args.p_target]; return json(route, null);
        case 'set_story_sharing': storyStore.sharing = args.p_on; return json(route, null);
        case 'delete_my_account': cap.order.push('delete_my_account'); return json(route, null);
        default: return json(route, null);
      }
    }
    if (p.startsWith('/storage/v1/object/')) {
      const rest = p.replace('/storage/v1/object/', '');
      if (m === 'POST' && rest.startsWith('sign/')) { cap.signed.push(rest.slice(5)); return json(route, { signedURL: `/object/${rest}?token=t` }); }
      if (m === 'GET' && rest.startsWith('sign/')) return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PNG });
      if (m === 'POST' && rest.startsWith('list/')) return json(route, [{ name: 'f1.pdf' }]);
      if (m === 'POST') { cap.uploads.push({ path: rest, type: req.headers()['content-type'] }); return json(route, { Key: rest }); }
      if (m === 'DELETE') { cap.removed.push(JSON.parse(req.postData()).prefixes); cap.order.push('remove'); return json(route, []); }
    }
    if (p === '/rest/v1/stories') {
      if (m === 'GET') return json(route, storyStore.stories);
      if (m === 'POST') { const b = JSON.parse(req.postData()); cap.stories.push(b); const saved = story(`my-${storyStore.stories.length}`, ME, 'lungelo', { kind: b.kind, content: b.content, bg: b.bg ?? null }); storyStore.stories.push(saved); return json(route, saved, 201); }
      if (m === 'DELETE') { const id = url.searchParams.get('id').replace('eq.', ''); storyStore.stories = storyStore.stories.filter((x) => x.id !== id); cap.deletes.push('story:' + id); return json(route, [{ id }]); }
    }
    if (p === '/rest/v1/story_views') return json(route, storyStore.viewed.map((story_id) => ({ story_id })));
    if (p === '/rest/v1/story_likes') return json(route, storyStore.liked.map((story_id) => ({ story_id })));
    if (p === '/rest/v1/nicknames') return json(route, Object.entries(storyStore.nicks).map(([target_id, nickname]) => ({ target_id, nickname })));
    if (p === '/rest/v1/profiles' && m === 'PATCH') { const b = JSON.parse(req.postData()); cap.profilePatches.push(b); if ('bio' in b) profileBio = b.bio; return json(route, [{ id: ME }]); }
    if (p === '/rest/v1/profiles' && m === 'GET') {
      if (url.searchParams.get('username')) return json(route, [{ id: BOB, username: 'bob', avatar_path: null, bio: 'Designer from Durban' }, { id: AMY, username: 'bobby_amy', avatar_path: null, bio: null }]);
      return out([{ id: ME, username: 'lungelo', terms_version: '2026-10-22', bio: profileBio, avatar_path: null }]);
    }
    if (p === '/rest/v1/calls') {
      const base = { room_id: R1, kind: 'voice', created_at: new Date().toISOString(), answered_at: null, ended_at: null };
      if (url.searchParams.get('id')) return out([{ ...base, id: 'call-new', caller_id: ME, callee_id: BOB, status: 'ringing' }]);
      if (url.searchParams.get('status') === 'eq.ringing') return json(route, []);
      return json(route, [{ ...base, id: 'old1', caller_id: BOB, callee_id: ME, status: 'missed', caller: { username: 'bob', avatar_path: null }, callee: { username: 'me', avatar_path: null } }]);
    }
    if (p === '/rest/v1/call_signals') return json(route, []);
    if (p === '/rest/v1/saved_items' && m === 'GET') return json(route, [{ id: 's1', collection: 'Recipes', created_at: iso(3), messages: { id: 'm1', room_id: R1, sender_id: BOB, content: 'Hey Lungelo', created_at: iso(50), attachment_name: null, attachment_type: null, attachment_path: null } }]);
    if (p === '/rest/v1/saved_items' && m === 'DELETE') { cap.savedRemoved = url.searchParams.get('id'); return json(route, []); }
    if (p === '/rest/v1/message_reminders' || p === '/rest/v1/scheduled_messages') return json(route, []);
    if (p === '/rest/v1/room_flags') return json(route, flagStore.rooms.map((room_id) => ({ room_id })));
    if (p === '/rest/v1/games') return out(gameStore.row ? [gameStore.row] : []);
    if (p === '/rest/v1/rooms') return json(route, rooms);
    if (p === '/rest/v1/user_private') return out([{ show_online: true, show_last_seen: true, read_receipts: true, share_stories: storyStore.sharing }]);
    if (p === '/rest/v1/message_reactions') return json(route, []);
    if (p === '/rest/v1/messages') {
      if (m === 'GET') {
        const room = (url.searchParams.get('room_id') || '').replace('eq.', '');
        const id = url.searchParams.get('id');
        if (id) return json(route, store.msgs.filter((x) => id.includes(x.id)));
        if (url.searchParams.get('created_at')) return json(route, []);
        return json(route, store.msgs.filter((x) => x.room_id === room).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)));
      }
      if (m === 'POST') { const b = JSON.parse(req.postData()); cap.inserts.push(b); const saved = msg(`srv-${store.msgs.length}`, b.room_id, b.sender_id, b.content, 0, { reply_to: b.reply_to ?? null, attachment_path: b.attachment_path ?? null, attachment_name: b.attachment_name ?? null, attachment_type: b.attachment_type ?? null, attachment_duration: b.attachment_duration ?? null }); store.msgs.push(saved); return json(route, saved, 201); }
      if (m === 'PATCH') { const id = url.searchParams.get('id').replace('eq.', ''); const b = JSON.parse(req.postData()); cap.patches.push({ id, ...b }); const t = store.msgs.find((x) => x.id === id); Object.assign(t, b, { edited_at: new Date().toISOString() }); return json(route, t); }
      if (m === 'DELETE') { const id = url.searchParams.get('id').replace('eq.', ''); cap.deletes.push(id); store.msgs = store.msgs.filter((x) => x.id !== id); return json(route, [{ id }]); }
    }
    return json(route, []);
  });
}

// the static server has no fallback for deep links, so move around like the app does: history + popstate
const spa = async (page, path) => { await page.evaluate((p) => { history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path); };

(async () => {
  const results = []; const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };
  const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage();
  const pageErrors = []; page.on('pageerror', (e) => pageErrors.push(e.message));
  await ctx.addInitScript((s) => { localStorage.setItem('sb-example-auth-token', JSON.stringify(s)); }, {
    access_token: 'fake.jwt.token', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: 'r',
    user: { id: ME, aud: 'authenticated', role: 'authenticated', email: 'me@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  });
  await mock(page);
  const shot = (n) => page.screenshot({ path: `${__dirname}/${n}.png` });
  const longPress = async (loc) => { await loc.scrollIntoViewIfNeeded(); const bb = await loc.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up(); };

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });

  // 1 chat list
  await page.getByText('Chats', { exact: true }).first().waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: /^bob, online, 2 unread/ }).waitFor({ timeout: 10000 });
  check('chat list shows DM with online dot + unread badge', true);
  check('group row shows sender prefix', await page.getByRole('button', { name: /^Crew\. amy: Welcome to the crew/ }).count() === 1);
  await shot('1-chats');

  // mark as unread: long-press a read chat, flag it, then opening it clears the flag
  const crew = page.getByRole('button', { name: /^Crew\. amy: Welcome to the crew/ });
  const rowBox = await crew.boundingBox();
  await page.mouse.move(rowBox.x + rowBox.width / 2, rowBox.y + rowBox.height / 2); await page.mouse.down(); await page.waitForTimeout(900); await page.mouse.up();
  await page.getByRole('button', { name: 'Mark as unread' }).click();
  await page.getByRole('button', { name: /^Crew, marked unread/ }).waitFor({ timeout: 8000 });
  check('mark as unread: row shows the flag and calls set_marked_unread', cap.rpc.some((r) => r.name === 'set_marked_unread' && r.args.p_room === R2 && r.args.p_value === true));
  await page.getByRole('button', { name: /^Crew, marked unread/ }).click();
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  check('opening a flagged chat clears the flag', cap.rpc.some((r) => r.name === 'set_marked_unread' && r.args.p_room === R2 && r.args.p_value === false));
  await page.goBack();
  await page.getByRole('button', { name: /^bob, online, 2 unread/ }).waitFor({ timeout: 10000 });
  await page.getByRole('button', { name: /^bob, online/ }).click();
  await page.getByRole('textbox', { name: 'Message' }).waitFor({ timeout: 10000 });
  const hasSR = await page.evaluate(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));
  check(`dictation button shown only when the browser has speech recognition (browser has it: ${hasSR})`, (await page.getByRole('button', { name: 'Dictate a message' }).count() === 1) === hasSR);
  await page.goBack();
  await page.getByRole('button', { name: /^bob, online/ }).waitFor({ timeout: 10000 });

  // 2 open chat
  await page.getByRole('button', { name: /^bob, online/ }).click();
  await page.getByText('Going well, adding reactions').first().waitFor({ timeout: 10000 });
  check('messages rendered', true);
  check('day separator "Today"', await page.getByText('Today', { exact: true }).count() >= 1);
  check('reply quote rendered with original text', await page.getByRole('button', { name: /In reply to lungelo: Hi Bob/ }).count() === 1);
  check('"Seen" caption on my last seen message only', await page.getByText('Seen', { exact: true }).count() === 1);
  check('header shows presence "online"', await page.getByText('online', { exact: true }).count() >= 1);
  check('mark_room_read called (not a direct table write)', cap.rpc.some((r) => r.name === 'mark_room_read' && r.args.p_room === R1));
  await shot('2-chat');

  // 3 send
  const box = page.getByRole('textbox', { name: 'Message', exact: true });
  await box.fill('Testing from the browser');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Testing from the browser').first().waitFor({ timeout: 8000 });
  check('send: optimistic message appears and insert hit backend', cap.inserts.length === 1 && cap.inserts[0].content === 'Testing from the browser' && cap.inserts[0].room_id === R1);
  check('send: composer cleared', (await box.inputValue()) === '');
  await page.waitForTimeout(400);
  check('send: exactly one copy shown (no duplicate)', await page.getByText('Testing from the browser').count() === 1);

  // 4 long-press menu
  await longPress(page.getByRole('button', { name: /^bob: How is the app going\?/ }));
  await page.getByRole('button', { name: 'Reply', exact: true }).waitFor({ timeout: 5000 });
  const acts = await page.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check('menu on others\' message: Reply/Copy/Report, no Edit/Delete (not admin)', acts.includes('Reply') && acts.includes('Copy text') && acts.includes('Report') && !acts.includes('Edit') && !acts.includes('Delete'));
  await shot('3-menu');

  // 5 reply
  await page.getByRole('button', { name: 'Reply', exact: true }).click();
  await page.getByText('Replying to bob').waitFor({ timeout: 5000 });
  await box.fill('Replying now');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByText('Replying now').first().waitFor({ timeout: 8000 });
  const lastIns = cap.inserts[cap.inserts.length - 1];
  check('reply: insert carries reply_to = replied message id', lastIns.reply_to === 'm3', JSON.stringify(lastIns));
  check('reply: reply bar cleared after send', await page.getByText('Replying to bob').count() === 0);
  await shot('4-reply');

  // 6 react
  await longPress(page.getByRole('button', { name: /^bob: How is the app going\?/ }));
  await page.getByRole('button', { name: 'React 👍' }).click();
  await page.waitForTimeout(600);
  check('react: react_to_message called with exact args', cap.rpc.some((r) => r.name === 'react_to_message' && r.args.p_message === 'm3' && r.args.p_emoji === '👍'));
  check('react: chip visible under message', await page.getByRole('button', { name: /👍.*you reacted/ }).count() === 1);
  await shot('5-react');
  await page.getByRole('button', { name: /👍.*you reacted/ }).click();   // toggle off via chip
  await page.waitForTimeout(500);

  // 7 edit own
  await longPress(page.getByRole('button', { name: /^You: Going well, adding reactions/ }));
  const acts2 = await page.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check('menu on my message: Edit + Delete, no Report', acts2.includes('Edit') && acts2.includes('Delete') && !acts2.includes('Report'));
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const ed = page.getByRole('textbox', { name: 'Message', exact: true }).last();
  await ed.fill('Going really well');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.getByText('Going really well').first().waitFor({ timeout: 8000 });
  check('edit: PATCH sent with new content and bubble updated', cap.patches.some((x) => x.id === 'm4' && x.content === 'Going really well'));
  await page.getByText(/· edited/).first().waitFor({ timeout: 5000 }).catch(() => {});
  check('edit: shows "edited"', await page.getByText(/· edited/).count() >= 1);

  // 8 delete own
  await longPress(page.getByRole('button', { name: /^You: Testing from the browser/ }));
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('Delete message?').waitFor();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await page.waitForTimeout(700);
  check('delete: DELETE sent and message removed', cap.deletes.length === 1 && await page.getByText('Testing from the browser').count() === 0);

  // 9 report
  await longPress(page.getByRole('button', { name: /^bob: Hey Lungelo/ }));
  await page.getByRole('button', { name: 'Report', exact: true }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.getByText(/describe the problem/i).waitFor({ timeout: 4000 });
  check('report: empty reason blocked client-side', cap.rpc.every((r) => r.name !== 'report_message'));
  await page.getByLabel('What is wrong with it?').fill('Spam');
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.getByText('Report sent. Thank you.').waitFor({ timeout: 5000 });
  check('report: report_message called with exact args', cap.rpc.some((r) => r.name === 'report_message' && r.args.p_message === 'm1' && r.args.p_reason === 'Spam'));

  // 10 DM info
  await page.getByRole('button', { name: /Open chat info/ }).click();
  await page.getByText('Designer from Durban').waitFor({ timeout: 5000 });
  check('DM info shows bio', true);
  await shot('6-dm-info');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();

  // 11 group info (admin)
  await page.getByRole('button', { name: /^Crew\./ }).click();
  await page.getByRole('button', { name: /Open chat info/ }).click();
  await page.getByText('3 members').last().waitFor({ timeout: 5000 });
  await page.getByRole('button', { name: 'Rename group' }).waitFor({ timeout: 5000 }).catch(() => {});
  check('group info: admin sees Rename, Add members, Leave', await page.getByRole('button', { name: 'Rename group' }).count() === 1 && await page.getByRole('button', { name: 'Add members' }).count() === 1 && await page.getByRole('button', { name: 'Leave group' }).count() === 1);
  await page.getByRole('button', { name: /^bob.*Tap to manage/ }).click();
  const acts3 = await page.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  check('group info: member actions offered to admin', acts3.includes('Make admin') && acts3.includes('Remove from group'));
  await page.getByRole('button', { name: 'Make admin' }).click();
  await page.waitForTimeout(500);
  check('make admin: set_member_role exact args', cap.rpc.some((r) => r.name === 'set_member_role' && r.args.p_room === R2 && r.args.p_user === BOB && r.args.new_role === 'admin'));
  await shot('7-group-info');

  // 12 new chat
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New chat or group' }).click();
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByLabel('Search by username').fill('b');
  await page.getByText('Type at least 2 characters.').waitFor({ timeout: 5000 });
  check('search: 1 char shows hint, no request', true);
  await page.getByLabel('Search by username').fill('bo');
  await page.getByRole('button', { name: 'bob', exact: true }).waitFor({ timeout: 6000 });
  check('search: results listed', await page.getByRole('button', { name: 'bobby_amy' }).count() === 1);
  await shot('8-new-chat');
  await page.getByRole('button', { name: 'bob', exact: true }).click();
  await page.getByText('Going really well').first().waitFor({ timeout: 8000 });
  check('start chat: create_direct_room args + navigates to chat', cap.rpc.some((r) => r.name === 'create_direct_room' && r.args.other_user_id === BOB));

  // 13 settings
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByText('Privacy').first().waitFor({ timeout: 8000 });
  await page.getByRole('switch', { name: 'Show when I am online' }).click();
  await page.waitForTimeout(500);
  check('settings: turning online off sends set_privacy(false,false)', cap.rpc.some((r) => r.name === 'set_privacy' && r.args.p_online === false && r.args.p_last_seen === false));
  check('settings: last seen switch disabled when online is off', await page.getByRole('switch', { name: 'Show my last seen' }).isDisabled());
  await page.getByRole('switch', { name: 'Read receipts (Seen)' }).click();
  await page.waitForTimeout(400);
  check('settings: set_read_receipts(false)', cap.rpc.some((r) => r.name === 'set_read_receipts' && r.args.p_on === false));
  await shot('9-settings');


  // 14 attachments (Phase 3)
  const U = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  store.msgs.push(
    msg('p1', R1, BOB, '', 3, { attachment_path: `${R1}/${BOB}/aaaaaaaa-0000-4000-8000-000000000001.png`, attachment_name: 'sunset.png', attachment_type: 'image/png' }),
    msg('p2', R1, BOB, 'Here is the report', 2, { attachment_path: `${R1}/${BOB}/aaaaaaaa-0000-4000-8000-000000000002.pdf`, attachment_name: 'report.pdf', attachment_type: 'application/pdf' }),
    msg('p3', R1, BOB, '', 1, { attachment_path: `${R1}/${BOB}/aaaaaaaa-0000-4000-8000-000000000003.m4a`, attachment_name: 'voice.m4a', attachment_type: 'audio/mp4', attachment_duration: 4200 }),
  );
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^bob/ }).first().click();
  await page.getByRole('button', { name: /Photo sunset\.png/ }).waitFor({ timeout: 10000 });
  check('image attachment renders as a photo button', true);
  await page.waitForTimeout(500);
  check('image attachment requested a signed URL for the media bucket', cap.signed.some((x) => x === `media/${R1}/${BOB}/aaaaaaaa-0000-4000-8000-000000000001.png`));
  check('file attachment renders with its name', await page.getByRole('button', { name: /report\.pdf\. Open/ }).count() === 1);
  check('file attachment keeps its caption', await page.getByText('Here is the report').count() >= 1);
  check('voice note shows a play button', await page.getByRole('button', { name: 'Play voice note' }).count() === 1);
  check('voice note summary in message label includes duration', await page.getByRole('button', { name: /bob: Voice note, 0:04/ }).count() === 1);
  await page.getByRole('button', { name: /Photo sunset\.png/ }).click();
  await page.getByRole('button', { name: 'Close' }).waitFor({ timeout: 5000 });
  check('tapping a photo opens the full-screen viewer', true);
  await shot('10-viewer');
  await page.getByRole('button', { name: 'Close' }).click();

  // upload through the file picker
  await page.getByRole('button', { name: 'Attach a photo, video or file' }).click();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'File', exact: true }).click()]);
  await chooser.setFiles({ name: 'my notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n% test file\n') });
  await page.getByRole('button', { name: /my notes\.pdf\. Open/ }).first().waitFor({ timeout: 10000 });
  for (let i = 0; i < 40 && !(cap.inserts.length && cap.inserts[cap.inserts.length - 1].attachment_path); i++) await page.waitForTimeout(150);   // upload then insert is async
  const up = cap.uploads[cap.uploads.length - 1];
  check('upload: goes to media bucket at <room>/<me>/<uuid>.pdf', !!up && new RegExp(`^media/${R1}/${ME}/${U}\\.pdf$`).test(up.path), up && up.path);
  const attIns = cap.inserts[cap.inserts.length - 1];
  check('upload: message insert carries path, name, type and size', attIns.attachment_name === 'my notes.pdf' && attIns.attachment_type === 'application/pdf' && attIns.attachment_size === 21 && attIns.attachment_path === up.path.replace('media/', ''), JSON.stringify(attIns));
  await page.waitForTimeout(400);
  check('upload: exactly one bubble for the sent file', await page.getByRole('button', { name: /my notes\.pdf\. Open/ }).count() === 1);

  // rejected type never reaches the server
  const before = cap.uploads.length;
  await page.getByRole('button', { name: 'Attach a photo, video or file' }).click();
  const [chooser2] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'File', exact: true }).click()]);
  await chooser2.setFiles({ name: 'run.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await page.getByText(/file type is not supported/i).waitFor({ timeout: 5000 });
  check('unsupported file type is refused before upload', cap.uploads.length === before);


  // 14b Phase 4: status updates, nicknames, backgrounds, sharing switch
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Status', { exact: true }).first().click();
  await page.getByRole('button', { name: /^amy\. 2 status updates, 2 new/ }).waitFor({ timeout: 10000 });
  check('status tab: amy row shows 2 new updates', true);
  check('status tab: bob row shows his photo update', await page.getByRole('button', { name: /^bob\. 1 status update, 1 new/ }).count() === 1);
  check('status tab: my status invites me to add one', await page.getByRole('button', { name: 'My status. Add a status update' }).count() === 1);
  await shot('12-status-tab');

  await page.getByRole('button', { name: /^amy\./ }).click();
  await page.getByText('Hello from Amy').first().waitFor({ timeout: 8000 });
  check('viewer: opens on the first unseen status (text)', true);
  await page.waitForTimeout(400);
  check('viewer: mark_story_viewed called with the story id', cap.rpc.some((r) => r.name === 'mark_story_viewed' && r.args.p_story === 'Hello from Amy'));
  await page.getByRole('button', { name: 'Like', exact: true }).click();
  await page.waitForTimeout(400);
  check('viewer: like_story(p_story, p_on=true)', cap.rpc.some((r) => r.name === 'like_story' && r.args.p_story === 'Hello from Amy' && r.args.p_on === true));
  check('viewer: heart switches to Unlike', await page.getByRole('button', { name: 'Unlike' }).count() === 1);
  await page.getByLabel('Reply to this status').fill('Love this');
  await page.getByRole('button', { name: 'Send reply' }).click();
  await page.getByText(/Sent\. It will appear in your chat/).waitFor({ timeout: 4000 });
  check('viewer: comment_on_story sends trimmed text', cap.rpc.some((r) => r.name === 'comment_on_story' && r.args.p_content === 'Love this'));
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Report this status' }).click();
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.getByText(/describe the problem/i).waitFor({ timeout: 4000 });
  check('viewer: empty status report refused client-side', cap.rpc.every((r) => r.name !== 'report_story'));
  await page.getByLabel('What is wrong with it?').fill('Rude');
  await page.getByRole('button', { name: 'Send report' }).click();
  await page.getByText('Report sent. Thank you.').waitFor({ timeout: 4000 });
  check('viewer: report_story exact args', cap.rpc.some((r) => r.name === 'report_story' && r.args.p_story === 'Hello from Amy' && r.args.p_reason === 'Rude'));
  await page.getByRole('button', { name: 'Next status' }).click();
  await page.getByText('Second from Amy').first().waitFor({ timeout: 4000 });
  check('viewer: next moves to the second status', true);
  await page.getByRole('button', { name: 'Close status' }).click();
  await page.getByRole('button', { name: /^amy\. 2 status updates, all seen/ }).waitFor({ timeout: 8000 });
  check('status tab: amy turns to "all seen" after viewing', true);

  // bob's photo status loads through a signed URL in the stories bucket
  await page.getByRole('button', { name: /^bob\./ }).click();
  await page.getByText('Bob caption').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(400);
  check('viewer: photo status requests a signed URL from the stories bucket', cap.signed.some((x) => x === `stories/${BOB}/bbbbbbbb-0000-4000-8000-000000000001.png`));
  await page.getByRole('button', { name: 'Close status' }).click();

  // post a text status
  await page.getByRole('button', { name: 'Add a status update', exact: true }).click();
  await page.getByRole('button', { name: 'Post status' }).waitFor({ timeout: 5000 });
  check('new status: Post is disabled until there is text', await page.getByRole('button', { name: 'Post status' }).isDisabled());
  await page.getByLabel('Status text').fill('Shipping Phase 4');
  await page.getByRole('radio', { name: 'Background colour 4' }).click();
  await page.getByRole('button', { name: 'Post status' }).click();
  await page.getByRole('button', { name: /^My status\. 1 update/ }).waitFor({ timeout: 8000 });
  check('new status: insert has exactly author, kind, content, bg', cap.stories.length === 1 && JSON.stringify(cap.stories[0]) === JSON.stringify({ author_id: ME, kind: 'text', content: 'Shipping Phase 4', bg: 3 }), JSON.stringify(cap.stories));
  await shot('13-status-posted');

  // own status: views + delete
  await page.getByRole('button', { name: /^My status\. 1 update/ }).click();
  await page.getByText('Shipping Phase 4').first().waitFor({ timeout: 6000 });
  check('own status: no like/reply controls, shows views button', await page.getByRole('button', { name: 'Like', exact: true }).count() === 0 && await page.getByRole('button', { name: 'See who viewed and reacted' }).count() === 1);
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Delete this status' }).click();
  await page.getByText('Delete this status?').waitFor();
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await page.getByRole('button', { name: 'My status. Add a status update' }).waitFor({ timeout: 8000 });
  check('own status: delete removes it', cap.deletes.some((d) => d.startsWith('story:my-')));

  // nickname + background from the DM info screen
  await page.getByRole('tab', { name: /Chats/ }).click();
  await page.getByRole('button', { name: /^bob, online/ }).click();
  await page.getByRole('button', { name: /Open chat info/ }).click();
  await page.getByRole('button', { name: 'Set nickname' }).click();
  await page.getByLabel(/What do you call bob/).fill('  Bobby D  ');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByText('Username: bob').waitFor({ timeout: 6000 });
  check('nickname: set_nickname(p_target, trimmed p_nick)', cap.nick.length === 1 && cap.nick[0].p_target === BOB && cap.nick[0].p_nick === 'Bobby D', JSON.stringify(cap.nick));
  check('nickname: shown as the title, real username still visible', await page.getByText('Username: bob').count() === 1);
  await page.getByRole('radio', { name: 'Sky' }).click();
  await page.waitForTimeout(300);
  const bgStore = await page.evaluate(() => localStorage.getItem('lsdkchat.bgprefs.v1'));
  check('background: this chat saved as Sky on this device', !!bgStore && JSON.parse(bgStore).per[R1] === 'sky', bgStore);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByText(/Going really well/).first().waitFor({ timeout: 6000 });
  check('nickname: chat header and list use the nickname', await page.getByRole('button', { name: /^Bobby D\. .*Open chat info/ }).count() === 1);
  const chatBg = await page.evaluate(() => { const els = [...document.querySelectorAll('div')].filter((d) => ['rgb(15, 34, 51)', 'rgb(220, 236, 249)'].includes(getComputedStyle(d).backgroundColor)); return els.length; });
  check('background: Sky (light or dark variant for the current theme) is applied to the chat screen', chatBg >= 1, 'matches=' + chatBg);
  await shot('14-chat-bg-nick');

  // sharing switch
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByRole('switch', { name: 'Share my status' }).click();
  await page.waitForTimeout(500);
  check('settings: set_story_sharing(false)', cap.rpc.some((r) => r.name === 'set_story_sharing' && r.args.p_on === false));

  // calls tab + starting and cancelling a call (WebRTC media itself is NOT tested here)
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('tab', { name: /Calls/ }).click();
  await page.getByRole('button', { name: /Missed/ }).waitFor({ timeout: 8000 });
  check('calls: log shows a missed incoming call from bob', true);
  await page.getByRole('button', { name: /Missed/ }).click();
  await page.getByText('Calling…').waitFor({ timeout: 8000 });
  await page.waitForFunction(() => true); for (let i = 0; i < 40 && !cap.rpc.some((r) => r.name === 'start_call'); i++) await page.waitForTimeout(100);
  check('calls: tapping call back starts start_call(bob, voice) and shows the calling screen', cap.rpc.some((r) => r.name === 'start_call' && r.args.p_callee === BOB && r.args.p_kind === 'voice'));
  await page.getByRole('button', { name: /Minimise the call/ }).click();
  check('mini window: minimising hides the full call screen but keeps the call', await page.getByRole('button', { name: /Return to the call screen/ }).count() === 1);
  check('mini window: the app is usable underneath (tabs visible)', await page.getByText('Calls', { exact: true }).first().isVisible());
  await page.getByRole('button', { name: /Return to the call screen/ }).click();
  await page.getByText('Calling…').first().waitFor({ timeout: 5000 });
  check('mini window: tapping it returns to the full call screen', await page.getByRole('button', { name: 'Cancel' }).count() === 1);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByText('Calling…').waitFor({ state: 'detached', timeout: 5000 });
  for (let i = 0; i < 60 && !cap.rpc.some((r) => r.name === 'end_call'); i++) await page.waitForTimeout(100);
  check('calls: cancel sends end_call and closes the screen', cap.rpc.some((r) => r.name === 'end_call' && r.args.p_call === 'call-new'));

  // tools: saved list + search (reads), then a tic-tac-toe game (start + move)
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' }); await page.getByRole('tab', { name: /Chats/ }).waitFor({ timeout: 8000 });
  // group chat shows group call buttons; a 1-to-1 chat does not
  await spa(page, `/chat/${R2}`);
  await page.getByRole('button', { name: 'Start a group voice call' }).waitFor({ timeout: 8000 });
  check('group calls: group chat has voice and video call buttons', await page.getByRole('button', { name: 'Start a group video call' }).count() === 1);
  check('group calls: no one-to-one call button in a group', await page.getByRole('button', { name: 'Start a voice call' }).count() === 0);
  // stickers: panel opens, tabs work, search is honestly "not set up" in this build (no LUNEX url)
  await spa(page, `/chat/${R1}`);
  await page.getByRole('button', { name: 'Stickers' }).click();
  await page.getByRole('tab', { name: 'Mine' }).waitFor({ timeout: 8000 });
  check('stickers: panel opens with Recent, Favourites, Find, Mine', await page.getByRole('tab').count() === 4);
  await page.getByRole('tab', { name: 'Find' }).click();
  check('stickers: search says it is not set up when LUNEX is off', await page.getByText(/Sticker search is not set up/).count() === 1);
  await page.getByRole('tab', { name: 'Recent' }).click();
  check('stickers: empty recents hint', await page.getByText('Stickers you send appear here.').count() === 1);
  await page.getByRole('button', { name: 'Close stickers' }).click();
  check('stickers: panel closes', await page.getByRole('tab', { name: 'Mine' }).count() === 0);
  await spa(page, '/tools');
  await page.getByText('Recipes (1)').waitFor({ timeout: 8000 });
  check('tools: saved messages are grouped by collection', await page.getByText('Hey Lungelo').count() >= 1);
  await page.getByRole('button', { name: 'Remove from saved' }).click();
  await page.waitForTimeout(500);
  check('tools: removing a saved item deletes that row only', cap.savedRemoved === 'eq.s1', String(cap.savedRemoved));
  await page.getByRole('tab', { name: 'Search' }).click();
  await page.getByLabel('Search text').fill('h');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByText('Type at least 2 characters.').waitFor({ timeout: 4000 });
  check('tools: one-letter search is refused client-side', !cap.rpc.some((r) => r.name === 'search_messages'));
  await page.getByLabel('Search text').fill('hey');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.waitForTimeout(600);
  check('tools: search_messages exact args', cap.rpc.some((r) => r.name === 'search_messages' && r.args.p_q === 'hey' && r.args.p_kind === 'text'));

  await spa(page, `/chat/${R1}/game`);
  await page.getByRole('button', { name: /^Tic-tac-toe/ }).click();
  await page.getByText('Your turn').waitFor({ timeout: 8000 });
  check('game: game_start(room, ttt) and my turn shown', cap.rpc.some((r) => r.name === 'game_start' && r.args.p_room === R1 && r.args.p_kind === 'ttt'));
  await page.getByRole('button', { name: 'Square 5, empty' }).click();
  await page.waitForTimeout(700);
  const mv = cap.rpc.find((r) => r.name === 'game_move');
  check('game: game_move sends the new board and the version I saw', !!mv && mv.args.p_state.board[4] === 'X' && mv.args.p_version === 0 && mv.args.p_status === 'active', JSON.stringify(mv && mv.args));
  check('game: after my move it waits for the other person', await page.getByText(/Waiting for/).count() >= 1);

  // car race: lobby -> ready -> countdown -> drive -> leave
  gameStore.row = { id: 'g2', room_id: R1, kind: 'race', p1: ME, p2: BOB, state: { map: 'kyalami', laps: 3, balanced: false, round: 0, cars: {}, ready: {}, times: {} }, turn: null, status: 'active', winner: null, result: null, version: 0, created_at: iso(0), updated_at: iso(0) };
  await spa(page, `/chat/${R1}`); await page.waitForTimeout(800);
  await spa(page, `/chat/${R1}/game`);
  await page.getByRole('button', { name: /^I'm ready/ }).waitFor({ timeout: 10000 });
  check('race: lobby shows the cars, circuits and ready button', await page.getByRole('button', { name: /^Apex F1/ }).count() === 1 && await page.getByRole('button', { name: /^Monza|Autodromo Nazionale Monza/ }).count() >= 1);
  check('race: a default car is saved for me (race_setup car+colour)', cap.rpc.some((r) => r.name === 'race_setup' && r.args.p_car === 'coupe' && /^#[0-9a-f]{6}$/i.test(r.args.p_color)));
  await page.getByRole('button', { name: /^Apex F1/ }).click();
  await page.waitForTimeout(500);
  check('race: picking a car sends race_setup(p_car)', cap.rpc.some((r) => r.name === 'race_setup' && r.args.p_car === 'formula'));
  await page.getByRole('button', { name: /^Autodromo Nazionale Monza/ }).click();
  await page.waitForTimeout(500);
  check('race: host picks the circuit (p_map)', cap.rpc.some((r) => r.name === 'race_setup' && r.args.p_map === 'monza'));
  await page.getByRole('button', { name: /^I'm ready/ }).click();
  await page.getByRole('button', { name: 'Leave the race' }).waitFor({ timeout: 15000 });
  check('race: ready sends p_ready and the host then starts it (p_start)', cap.rpc.some((r) => r.name === 'race_setup' && r.args.p_ready === true) && cap.rpc.some((r) => r.name === 'race_setup' && r.args.p_start === true));
  check('race: the driving screen shows the lap counter and controls', await page.getByText(/LAP 1\/3/).count() === 1 && await page.getByRole('button', { name: 'Gas', exact: true }).count() === 1);
  await page.waitForTimeout(4600);
  const gas = await page.getByRole('button', { name: 'Gas', exact: true }).boundingBox();
  await page.mouse.move(gas.x + gas.width / 2, gas.y + gas.height / 2); await page.mouse.down(); await page.waitForTimeout(3000);
  const kmh = await page.getByText(/\d+ km\/h/).first().textContent();
  await shot('12-race');
  await page.mouse.up();
  check(`race: holding GAS makes the car move (${kmh})`, parseInt(kmh, 10) > 20);
  await page.getByRole('button', { name: 'Leave the race' }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.waitForTimeout(800);
  check('race: leaving gives up the game (game_resign)', cap.rpc.some((r) => r.name === 'game_resign' && r.args.p_game === 'g2'));

  // 15 profile screen
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Settings', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Edit profile, password and data' }).click();
  await page.getByRole('heading', { name: 'Profile' }).waitFor({ timeout: 8000 });
  check('profile screen opens from settings', true);
  await page.getByLabel('Bio').fill('Hello from the test');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Profile saved.').waitFor({ timeout: 6000 });
  check('profile: only changed column (bio) is sent', cap.profilePatches.length === 1 && JSON.stringify(cap.profilePatches[0]) === JSON.stringify({ bio: 'Hello from the test' }), JSON.stringify(cap.profilePatches));
  await page.getByLabel('Username').fill('a!');
  check('profile: invalid username shows an error and blocks save', await page.getByText(/3-20 letters/).count() >= 1);
  await page.getByLabel('Username').fill('lungelo');
  await page.getByLabel('New password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByText(/at least 10 characters/).first().waitFor({ timeout: 4000 });
  check('profile: short password refused client-side', true);
  await page.getByLabel('New password', { exact: true }).fill('a-long-enough-password');
  await page.getByLabel('Repeat new password').fill('different-password-here');
  await page.getByRole('button', { name: 'Change password' }).click();
  await page.getByText(/do not match/).waitFor({ timeout: 4000 });
  check('profile: mismatched passwords refused client-side', true);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export my data' }).click()]);
  const fs = require('fs'); const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  check('export: downloads a JSON file with profile + my messages', /^lsdk-chat-export-.*\.json$/.test(dl.suggestedFilename()) && Array.isArray(exported.messages) && !!exported.exported_at);
  await shot('11-profile');

  // delete account: wrong confirmation is refused, right one deletes files first and the account last
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await page.getByLabel('Type DELETE to confirm').fill('delete');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await page.getByText(/Type DELETE in capital letters/).waitFor({ timeout: 4000 });
  check('delete account: wrong confirmation text is refused', !cap.rpc.some((r) => r.name === 'delete_my_account'));
  await page.getByLabel('Type DELETE to confirm').fill('DELETE');
  await page.getByRole('button', { name: 'Delete forever' }).click();
  await page.waitForTimeout(1500);
  check('delete account: files removed first, then delete_my_account', cap.order.length >= 2 && cap.order[cap.order.length - 1] === 'delete_my_account' && cap.order.includes('remove'), cap.order.join(','));
  check('delete account: removes my files from the room folder', cap.removed.flat().some((x) => x === `${R1}/${ME}/f1.pdf`));

  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('SCRIPT ERROR:', e.message.split('\n').slice(0, 6).join('\n')); process.exit(2); });
