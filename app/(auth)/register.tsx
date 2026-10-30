import { Link } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Field, Text } from '@/components/ui';
import { LegalLinks } from '@/features/legal/LegalLinks';
import { AuthShell } from '@/features/auth/AuthShell';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { friendlyError, MIN_PASSWORD, validateRegister } from '@/lib/validation';
import { space } from '@/theme/tokens';

export default function Register() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    const v = validateRegister({ email, username, password });
    if (v) return setError(v);
    setBusy(true); setError(null);
    const { data, error: e } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: env.webUrl || undefined, data: { username, terms_version: env.termsVersion } },
    });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    // An existing address returns a user with no identities; do not reveal that, just show the same message.
    if (!data.session) setDone(true);
  }

  if (done) {
    return (
      <AuthShell>
        <View style={{ gap: space.lg }}>
          <Text variant="title">Check your email</Text>
          <Text muted>If this address can be registered, a confirmation link is on its way. Open it, then sign in.</Text>
          <Link href="/(auth)/login"><Text style={{ fontWeight: '600' }}>Back to sign in</Text></Link>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell hero={true}>
      <View style={{ gap: space.lg }}>
        <Text variant="title">Create your account</Text>
        <Text muted>You must be 18 or older. You'll review the Terms and Privacy Policy after signing in.</Text>
        {error ? <Banner kind="error" text={error} /> : null}
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
        <Field label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} maxLength={20} hint="Visible to other users. 3-20 letters, numbers or _" />
        <Field label="Password" value={password} onChangeText={setPassword} secure autoComplete="new-password" maxLength={128} hint={`At least ${MIN_PASSWORD} characters`} />
        <Button title="Create account" onPress={submit} loading={busy} />
        <Text variant="small" muted>By creating an account you confirm you are 18 or older and agree to these documents:</Text>
        <LegalLinks />
        <Link href="/(auth)/login"><Text muted>Already have an account? Sign in</Text></Link>
      </View>
    </AuthShell>
  );
}
