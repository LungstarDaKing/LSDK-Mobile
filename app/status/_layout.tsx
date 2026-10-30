import { Stack } from 'expo-router';
import { useTheme } from '@/theme/ThemeProvider';

export default function StatusLayout() {
  const { colors } = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="[authorId]" options={{ animation: 'fade' }} />
    </Stack>
  );
}
