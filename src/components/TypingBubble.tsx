import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, space } from '@/theme/tokens';

/** Three bouncing dots. Static when the system "reduce motion" setting is on. */
export function TypingBubble() {
  const { colors } = useTheme();
  const [reduce, setReduce] = useState(false);
  const vals = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => { AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {}); }, []);
  useEffect(() => {
    if (reduce) { vals.forEach((v) => v.setValue(0.6)); return; }
    const loops = vals.map((v, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 160),
      Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
      Animated.delay(480 - i * 160),
    ])));
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [reduce, vals]);

  return (
    <View accessibilityLabel="Typing" accessibilityRole="text" style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 5, backgroundColor: colors.other, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: space.lg, marginVertical: space.xs }}>
      {vals.map((v, i) => <Animated.View key={i} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.muted, opacity: v }} />)}
    </View>
  );
}
