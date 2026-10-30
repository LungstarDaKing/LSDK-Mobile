# Web smoke test (76 checks)

Drives the real web build in Chromium against a fake Supabase (all requests are intercepted; nothing real is touched).
Realtime (WebSocket) is NOT exercised; incoming-message / typing / reaction events are covered by unit tests only.

```
npm i -D playwright            # once; then: npx playwright install chromium
npx expo export --platform web # needs EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co and any EXPO_PUBLIC_SUPABASE_KEY
npx http-server dist -p 8101 &  # or: python3 -m http.server 8101 --directory dist
node e2e/smoke-web.cjs
```
Env overrides: PORT, CHROMIUM_PATH, PLAYWRIGHT_PATH. Screenshots are written next to the script.
