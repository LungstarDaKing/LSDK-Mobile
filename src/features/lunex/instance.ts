import { fetch as expoFetch } from 'expo/fetch';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { LunexClient, type FetchLike } from './client';

// `expo/fetch` supports streaming responses on iOS, Android and web (React Native's own fetch does not).
export const lunex = new LunexClient({
  baseUrl: env.lunexUrl,
  getToken: async () => (await supabase.auth.getSession()).data.session?.access_token,
  fetch: expoFetch as unknown as FetchLike,
  locale: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : 'en',
  tz: typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC',
});
