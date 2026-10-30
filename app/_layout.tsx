import { useEffect, useRef } from 'react';
import { Stack, usePathname, useRootNavigationState, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccessGranted } from '@/features/auth/AccessGranted';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Loading } from '@/components/ui';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { CallMini } from '@/components/CallMini';
import { CallOverlay } from '@/components/CallOverlay';
import { GroupCallOverlay } from '@/components/GroupCallOverlay';
import { GroupCallProvider } from '@/features/calls/GroupCallProvider';
import { ReminderBoot } from '@/features/tools/ReminderBoot';
import { PushBoot } from '@/features/push/PushBoot';
import { CallProvider } from '@/features/calls/CallProvider';
import { ChatProvider } from '@/features/chat/ChatProvider';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function Routes() {
  const { loading, session, needsConsent } = useAuth();
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const navReady = !!useRootNavigationState()?.key;
  const prevDoor = useRef<string | null>(null);
  const signedIn = !!session;
  const active = signedIn && !needsConsent;
  const door = !signedIn ? 'auth' : needsConsent ? 'consent' : 'app';
  // When the front door changes (signed out / needs consent / ready), send the user there explicitly.
  // Without this the navigator falls back to whichever screen it likes (that was the Terms page).
  useEffect(() => {
    if (loading || !navReady) return;
    const changed = prevDoor.current !== null && prevDoor.current !== door;
    prevDoor.current = door;
    if (!changed) return;                                   // first load: the not-found redirect handles it
    if (pathname === '/reset') return;                      // password-reset link flow manages its own navigation
    if (door === 'auth') router.replace('/login');
    else if (door === 'consent') router.replace('/consent');
    else router.replace('/(tabs)');
  }, [door, loading, navReady, router, pathname]);
  if (loading) return <Loading />;
  return (
    <ChatProvider enabled={active}>
      <CallProvider enabled={active}>
      <GroupCallProvider enabled={active}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && needsConsent}>
          <Stack.Screen name="consent" />
        </Stack.Protected>
        <Stack.Protected guard={active}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="status" />
          <Stack.Screen name="tools" />
          <Stack.Screen name="lunex" />
          <Stack.Screen name="solo" />
          <Stack.Screen name="new-chat" options={{ presentation: 'modal' }} />
          <Stack.Screen name="new-group" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        {/* Always-available screens go LAST: the navigator falls back to the first available screen when a guard flips,
            so listing "legal" first used to dump people on the Terms page and trap them there. */}
        <Stack.Screen name="legal" />
        <Stack.Screen name="reset" />
      </Stack>
      {active ? <CallOverlay /> : null}
      {active ? <GroupCallOverlay /> : null}
      {active ? <CallMini /> : null}
      {active ? <PushBoot /> : null}
      {active ? <ReminderBoot /> : null}
      </GroupCallProvider>
      </CallProvider>
    </ChatProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <Routes />
            <AccessGranted />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}
