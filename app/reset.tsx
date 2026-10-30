import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Field, Text } from '@/components/ui';
import { AuthShell } from '@/features/auth/AuthShell';
import { supabase } from '@/lib/supabase';
import { friendlyError, MIN_PASSWORD } from '@/lib/validation';
import { space } from '@/theme/tokens';

/** Landing screen for the password-reset email link (lsdkchat://reset?code=...). The link signs you in with a short-lived recovery session; you then choose a new password. */
export default function Reset() {
  const { code, error_description } = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(error_description ? 'This reset link is not valid any more. Ask for a new one.' : null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (typeof code === 'string' && code) {
          const { error: e } = await supabase.auth.exchangeCodeForSession(code);
          if (e && alive) setError('This reset link is not valid any more. Ask for a new one.');
          else if (alive) setReady(true);
        } else {
          const { data } = await supabase.auth.getSession();
          if (alive) { if (data.session) setReady(true); else setError('Open the link from your reset email on this phone.'); }
        }
      } catch (e) { if (alive) setError(friendlyError(e)); }
    })();
    return () => { alive = false; };
  }, [code]);

  async function save() {
    if (pw.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`);
    if (pw !== pw2) return setError('The two passwords do not match.');
    setBusy(true); setError(null);
    const { error: e } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (e) return setError(friendlyError(e));
    router.replace('/');
  }

  return (
    <AuthShell>
      <View style={{ gap: space.lg }}>
        <Text variant="title" accessibilityRole="header">Choose a new password</Text>
        {error ? <Banner kind="error" text={error} /> : null}
        {ready ? (
          <>
            <Field label="New password" value={pw} onChangeText={setPw} secure autoComplete="new-password" maxLength={128} hint={`At least ${MIN_PASSWORD} characters`} />
            <Field label="Repeat new password" value={pw2} onChangeText={setPw2} secure autoComplete="new-password" maxLength={128} onSubmitEditing={save} />
            <Button title="Set new password" onPress={save} loading={busy} />
          </>
        ) : !error ? <Text muted>Checking your link…</Text> : <Button title="Back to sign in" variant="soft" onPress={() => router.replace('/login')} />}
      </View>
    </AuthShell>
  );
}
