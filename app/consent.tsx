import { useState } from 'react';
import { View } from 'react-native';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { LegalLinks } from '@/features/legal/LegalLinks';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/validation';
import { space } from '@/theme/tokens';

export default function Consent() {
  const { markTermsAccepted, refreshProfile, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc('accept_terms', { p_version: env.termsVersion });
    if (e) setError(friendlyError(e)); else { markTermsAccepted(env.termsVersion); void refreshProfile(); }
    setBusy(false);
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        <Text variant="title">Terms and Privacy</Text>
        <Text muted>To keep using LSDK Chat you must confirm you are 18 or older and accept the current Terms and Privacy Policy (version {env.termsVersion}).</Text>
        <Text>Please read them first:</Text>
        <LegalLinks />
        {error ? <Banner kind="error" text={error} /> : null}
        <Button title="I am 18+ and I accept" onPress={accept} loading={busy} />
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
