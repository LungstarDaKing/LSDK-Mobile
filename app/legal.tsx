import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { DOCS, type DocName } from '@/features/legal/docs';
import { env } from '@/lib/env';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, space } from '@/theme/tokens';

/** Terms of Use / Privacy Policy / Disclosures. Reachable signed out (from sign-up) and signed in (from Settings and the consent screen). */
export default function Legal() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const name: DocName = doc === 'privacy' || doc === 'disclosures' ? doc : 'terms';
  const d = DOCS[name]; const router = useRouter(); const { colors } = useTheme(); const { session, needsConsent } = useAuth();
  const home = !session ? '/login' : needsConsent ? '/consent' : '/(tabs)';
  const others = (['terms', 'privacy', 'disclosures'] as DocName[]).filter((n) => n !== name);
  return (
    <Screen scroll>
      <View style={{ gap: space.md }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace(home))} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text style={{ color: colors.accent, fontWeight: '600' }}>‹ Back</Text>
        </Pressable>
        <Text variant="title" accessibilityRole="header">{d.title}</Text>
        <Text variant="small" muted>Version {env.termsVersion} · Operator: Lungelo Mthethwa</Text>
        {d.body().map((s) => (
          <View key={s.h} style={{ gap: space.sm }}>
            <Text variant="h2" accessibilityRole="header">{s.h}</Text>
            {(s.p ?? []).map((t, i) => <Text key={i}>{t}</Text>)}
            {(s.ul ?? []).map((t, i) => <View key={i} style={{ flexDirection: 'row', gap: space.sm }}><Text>•</Text><Text style={{ flex: 1 }}>{t}</Text></View>)}
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: space.lg, paddingVertical: space.lg }}>
          {others.map((n) => (
            <Pressable key={n} accessibilityRole="link" accessibilityLabel={DOCS[n].title} onPress={() => router.replace({ pathname: '/legal', params: { doc: n } })} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
              <Text style={{ color: colors.accent }}>{DOCS[n].title}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
