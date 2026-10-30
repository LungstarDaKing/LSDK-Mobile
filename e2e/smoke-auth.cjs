// Signed-out flows: front door, hero, validation, failed sign-in, and the "Access granted" moment. Fake Supabase via page.route.
const { chromium } = (() => { try { return require('playwright'); } catch { return require(process.env.PLAYWRIGHT_PATH); } })();
const PORT = process.env.PORT || 8101;
(async () => {
  const results = []; const check = (n, ok) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`); };
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  let mode = 'bad'; const session = { access_token: 'fake.jwt', token_type: 'bearer', expires_in: 36000, expires_at: Math.floor(Date.now() / 1000) + 36000, refresh_token: 'r',
    user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'me@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } };
  await page.route('**/*', (route) => {
    const u = route.request().url(); const j = (s, body) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (!u.includes('example.supabase.co')) return route.continue();
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (u.includes('/auth/v1/token')) return mode === 'bad' ? j(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) : j(200, session);
    if (u.includes('/auth/v1/user')) return j(200, session.user);
    return j(200, []);
  });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Welcome back').first().waitFor({ timeout: 15000 });
  check('signed out at "/" lands on the sign-in screen (no Unmatched Route)', true);
  check('hero headline present', await page.getByLabel('Let’s stay directly Konnected.').count() === 1);
  check('hero points present', await page.getByText('Voice and video calls').count() === 1);
  await page.getByRole('button', { name: 'Sign in' }).click();
  check('empty form is refused client-side', await page.getByText(/email/i).first().isVisible());
  await page.getByRole('textbox', { name: 'Email' }).fill('me@example.com'); await page.getByRole('textbox', { name: 'Password' }).fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByText(/wrong email or password/i).first().waitFor({ timeout: 8000 });
  check('wrong password shows an error', true);
  check('failed sign-in does not play Access granted', await page.getByLabel('Access granted').count() === 0);
  mode = 'good';
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByLabel('Access granted').first().waitFor({ timeout: 8000 });
  check('successful sign-in plays Access granted', true);
  await page.getByLabel('Access granted').first().waitFor({ state: 'detached', timeout: 8000 });
  check('Access granted goes away on its own', true);
  check('no uncaught page errors', errs.length === 0 || (console.log(errs), false));
  await b.close();
  const ok = results.filter(Boolean).length; console.log(`${ok}/${results.length} checks passed`); process.exit(ok === results.length ? 0 : 1);
})();
