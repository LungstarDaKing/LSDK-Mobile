import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Field, Text } from '@/components/ui';
import { AuthShell } from '@/features/auth/AuthShell';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { validEmail } from '@/lib/validation';
import { space } from '@/theme/tokens';

// In the real app the link opens lsdkchat://reset. Add that address to Supabase > Authentication > URL Configuration > Redirect URLs.
// If it is not allowed (or in Expo Go) Supabase uses the Site URL, so the website's reset page still works.
function resetUrl() { return env.webUrl && process.env.EXPO_OS === 'web' ? env.webUrl : Linking.createURL('reset'); }

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!validEmail(email)) return setError('Enter a valid email address.');
    setBusy(true); setError(null);
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetUrl() });
    setBusy(false); setSent(true); // same message whether or not the account exists
  }

  return (
    <AuthShell hero={false}>
      <View style={{ gap: space.lg }}>
        <Text variant="title">Reset your password</Text>
        {sent ? <Banner kind="success" text="If that address has an account, a reset link is on its way." /> : null}
        {error ? <Banner kind="error" text={error} /> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Button title="Send reset link" onPress={submit} loading={busy} />
        <Link href="/(auth)/login"><Text muted>Back to sign in</Text></Link>
      </View>
    </AuthShell>
  );
}
