// Only EXPO_PUBLIC_* values are inlined into the bundle. These are PUBLIC by design; never add secrets here.
const need = (v: string | undefined, name: string) => {
  if (!v) throw new Error(`Missing ${name}. Copy .env.example to .env and fill it in.`);
  return v;
};

export const env = {
  supabaseUrl: need(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'),
  supabaseKey: need(process.env.EXPO_PUBLIC_SUPABASE_KEY, 'EXPO_PUBLIC_SUPABASE_KEY'),
  // Fixed in code on purpose (not an env var): it must match the text in src/features/legal/docs.ts and the website's version.js.
  termsVersion: '2026-10-22',
  webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? '',
  turnUrl: process.env.EXPO_PUBLIC_TURN_URL ?? '',
  lunexUrl: process.env.EXPO_PUBLIC_LUNEX_URL ?? '',
};
