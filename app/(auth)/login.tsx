import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Field, Text } from '@/components/ui';
import { LegalLinks } from '@/features/legal/LegalLinks';
import { AuthShell } from '@/features/auth/AuthShell';
import { armAccess, disarmAccess } from '@/features/auth/access';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { friendlyError, validateLogin } from '@/lib/validation';
import { space } from '@/theme/tokens';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const v = validateLogin({ email, password });
    if (v) return setError(v);
    setBusy(true); setError(null);
    armAccess();
    const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (e) {
      disarmAccess();
      if (/not confirmed/i.test(e.message)) {
        await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: env.webUrl || undefined } });
        setError('Please confirm your email first. We just sent a new confirmation link.');
      } else setError(friendlyError(e));
    }
    setBusy(false); // on success the auth gate swaps screens
  }

  return (
    <AuthShell hero={true}>
      <View style={{ gap: space.lg }}>
        <Text variant="title">Welcome back</Text>
        <Text muted>Sign in to LSDK Chat.</Text>
        {error ? <Banner kind="error" text={error} /> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label="Password" value={password} onChangeText={setPassword} secure autoComplete="current-password" textContentType="password" maxLength={128} onSubmitEditing={submit} />
        <Button title="Sign in" onPress={submit} loading={busy} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Link href="/(auth)/register"><Text style={{ fontWeight: '600' }}>Create an account</Text></Link>
          <Link href="/(auth)/forgot"><Text muted>Forgot password?</Text></Link>
        </View>
        <LegalLinks />
      </View>
    </AuthShell>
  );
}
