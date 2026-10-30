import { useState } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { ALLOWED_REACTIONS, QUICK_REACTIONS } from '@/features/chat/emojis';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { Text } from './ui';

/** Quick row of 6 reactions plus a "more" grid of every reaction the server allows. */
export function ReactionBar({ current, onPick }: { current?: string; onPick: (emoji: string) => void }) {
  const { colors } = useTheme();
  const [more, setMore] = useState(false);
  const list = more ? ALLOWED_REACTIONS : QUICK_REACTIONS;
  return (
    <View style={{ marginBottom: space.sm }}>
      <ScrollView horizontal={!more} scrollEnabled={more} style={{ maxHeight: more ? 220 : undefined }} contentContainerStyle={{ flexDirection: 'row', flexWrap: more ? 'wrap' : 'nowrap', justifyContent: 'center', alignItems: 'center' }}>
        {list.map((e) => (
          <Pressable
            key={e} accessibilityRole="button" accessibilityLabel={`React ${e}`} accessibilityState={{ selected: current === e }}
            onPress={() => onPick(e)}
            style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: current === e ? colors.accentSoft : 'transparent' }}
          >
            <RNText style={{ fontSize: 24 }}>{e}</RNText>
          </Pressable>
        ))}
        {!more ? (
          <Pressable accessibilityRole="button" accessibilityLabel="More reactions" onPress={() => setMore(true)} style={{ width: MIN_TOUCH, height: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="h2" style={{ color: colors.accent }}>+</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}
