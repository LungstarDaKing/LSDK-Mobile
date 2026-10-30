import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, KeyboardAvoidingView, Platform, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';
import { AuthBackdrop } from './AuthBackdrop';

const WORDS = ['Let’s', 'stay', 'directly', 'Konnected.'];
const POINTS = ['Voice and video calls', 'Photos, voice notes and files', 'Reminders and messages that send later'];

function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {}); }, []);
  return calm;
}

/** Fade + rise, started after `delay` ms. Shown at once when "reduce motion" is on. */
function Rise({ delay, calm, children, dist = 14 }: { delay: number; calm: boolean; children: ReactNode; dist?: number }) {
  const v = useRef(new Animated.Value(calm ? 1 : 0)).current;
  useEffect(() => {
    if (calm) { v.setValue(1); return; }
    const a = Animated.timing(v, { toValue: 1, duration: 700, delay, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: true });
    a.start(); return () => a.stop();
  }, [calm, delay, v]);
  return <Animated.View style={{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [dist, 0] }) }] }}>{children}</Animated.View>;
}

function Hero({ calm }: { calm: boolean }) {
  return (
    <View style={{ gap: space.md, paddingTop: space.lg }} accessibilityRole="header">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Image source={require('../../../assets/icon.png')} style={{ width: 40, height: 40, borderRadius: 10 }} accessibilityIgnoresInvertColors accessible={false} />
        <RNText style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>LSDK Chat</RNText>
      </View>
      <View accessible accessibilityLabel="Let’s stay directly Konnected." style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8 }}>
        {WORDS.map((w, i) => (
          <Rise key={w} delay={150 + i * 120} calm={calm} dist={20}>
            <RNText style={{ fontSize: 30, fontWeight: '800', letterSpacing: -0.5, color: w.startsWith('Konnected') ? '#f5b83d' : '#fff' }}>{w}</RNText>
          </Rise>
        ))}
      </View>
      <Rise delay={900} calm={calm}><RNText style={{ color: '#ffffffcc', fontSize: 15 }}>Chats, voice notes, calls and statuses with the people who matter, in one place.</RNText></Rise>
      <View style={{ gap: 6 }}>
        {POINTS.map((p, i) => (
          <Rise key={p} delay={1150 + i * 110} calm={calm}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#f5b83d33', alignItems: 'center', justifyContent: 'center' }}><RNText style={{ color: '#f5b83d', fontSize: 11, fontWeight: '800' }}>✓</RNText></View>
              <RNText style={{ color: '#ffffffd9', fontSize: 14 }}>{p}</RNText>
            </View>
          </Rise>
        ))}
      </View>
    </View>
  );
}

/** The sign-in / sign-up / reset page frame: animated Konnected background, hero copy, and the form in a card. */
export function AuthShell({ children, hero = false }: { children: ReactNode; hero?: boolean }) {
  const { colors } = useTheme();
  const calm = useCalm();
  return (
    <AuthBackdrop>
      <SafeAreaView style={{ flex: 1, marginHorizontal: -space.lg }} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: space.lg, gap: space.xl, justifyContent: 'center' }}>
            {hero ? <Hero calm={calm} /> : null}
            <Rise delay={calm ? 0 : 150} calm={calm} dist={18}>
              <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.xl, gap: space.lg, borderWidth: 1, borderColor: colors.border }}>{children}</View>
            </Rise>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AuthBackdrop>
  );
}
