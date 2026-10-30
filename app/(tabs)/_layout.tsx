import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

// Emoji glyphs are a stand-in until the icon set from src/ui/icons.js is ported.
const icon = (g: string) => ({ focused }: { focused: boolean }) => <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>{g}</Text>;

export default function TabsLayout() {
  const { colors } = useTheme();
  return (
    <Tabs screenOptions={{
      headerShown: false, tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted,
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Chats', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="calls" options={{ title: 'Calls', tabBarIcon: icon('📞') }} />
      <Tabs.Screen name="status" options={{ title: 'Status', tabBarIcon: icon('⭕') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
