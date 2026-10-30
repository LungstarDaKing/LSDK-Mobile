import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';
import { isWeb, secureStorage } from './secureStorage';

// Publishable key only. Access control is enforced by Row Level Security on the server.
export const supabase = createClient(env.supabaseUrl, env.supabaseKey, {
  auth: {
    ...(isWeb ? {} : { storage: secureStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: isWeb,
    flowType: 'pkce',
  },
});
