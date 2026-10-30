import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH } from '@/theme/tokens';

const ITEMS = [['terms', 'Terms'], ['privacy', 'Privacy'], ['disclosures', 'Disclosures']] as const;

export function LegalLinks() {
  const router = useRouter(); const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
      {ITEMS.map(([doc, label]) => (
        <Pressable key={doc} accessibilityRole="link" accessibilityLabel={label} onPress={() => router.push({ pathname: '/legal', params: { doc } })} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
          <Text variant="small" style={{ color: colors.accent }}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
