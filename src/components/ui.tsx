import { Image } from 'expo-image';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text as RNText,
  TextInput, View, type TextInputProps, type TextProps, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignedUrl } from '@/features/media/useSignedUrl';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';

export function Text({ variant = 'body', muted, style, ...p }: TextProps & { variant?: keyof typeof type; muted?: boolean }) {
  const { colors } = useTheme();
  return <RNText {...p} style={[type[variant], { color: muted ? colors.muted : colors.text }, style]} />;
}

/** Page container: safe areas, keyboard avoidance, optional scrolling, readable max width on web/tablets. */
export function Screen({ children, scroll, style }: { children: ReactNode; scroll?: boolean; style?: ViewStyle }) {
  const { colors } = useTheme();
  const inner = <View style={[styles.col, style]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>{inner}</ScrollView> : inner}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Button({ title, onPress, loading, disabled, variant = 'primary' }: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean; variant?: 'primary' | 'soft' | 'ghost' | 'danger';
}) {
  const { colors } = useTheme();
  const bg = variant === 'primary' ? colors.accent : variant === 'soft' ? colors.accentSoft : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'primary' ? colors.accentText : variant === 'danger' ? '#fff' : variant === 'soft' ? colors.accent : colors.muted;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }} accessibilityLabel={title}
      onPress={onPress} disabled={off}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <RNText style={[type.strong, { color: fg }]}>{title}</RNText>}
    </Pressable>
  );
}

export function Field({ label, hint, error, secure, ...p }: TextInputProps & { label: string; hint?: string; error?: string; secure?: boolean }) {
  const { colors } = useTheme();
  const [focus, setFocus] = useState(false);
  const [show, setShow] = useState(false);
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="small" muted style={{ fontWeight: '600' }}>{label}</Text>
      <View style={[styles.inputWrap, { backgroundColor: colors.surface, borderColor: error ? colors.danger : focus ? colors.accent : colors.border }]}>
        <TextInput
          {...p} accessibilityLabel={label} placeholderTextColor={colors.muted}
          secureTextEntry={secure && !show}
          onFocus={(e) => { setFocus(true); p.onFocus?.(e); }} onBlur={(e) => { setFocus(false); p.onBlur?.(e); }}
          style={[type.body, styles.input, { color: colors.text }]}
        />
        {secure ? (
          <Pressable accessibilityRole="button" accessibilityLabel={show ? 'Hide password' : 'Show password'} onPress={() => setShow((s) => !s)} style={styles.eye}>
            <Text variant="small" style={{ color: colors.accent, fontWeight: '600' }}>{show ? 'Hide' : 'Show'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text variant="small" style={{ color: colors.danger }}>{error}</Text> : hint ? <Text variant="small" muted>{hint}</Text> : null}
    </View>
  );
}

export function Banner({ kind, text }: { kind: 'error' | 'success'; text: string }) {
  const { colors } = useTheme();
  const c = kind === 'error' ? colors.danger : colors.success;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { borderColor: c, backgroundColor: colors.surface }]}>
      <Text variant="small" style={{ color: c }}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, size = 44, index = 0, path }: { name: string; size?: number; index?: number; path?: string | null }) {
  const { colors } = useTheme();
  const { url } = useSignedUrl('avatars', path);
  const bg = colors.nameColors[Math.abs(index) % colors.nameColors.length];
  return (
    <View accessibilityLabel={`${name} avatar`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url
        ? <Image source={{ uri: url }} contentFit="cover" transition={120} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
        : <RNText style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.4 }}>{(name[0] ?? '?').toUpperCase()}</RNText>}
    </View>
  );
}

export function Loading() {
  const { colors } = useTheme();
  return <View style={styles.center}><ActivityIndicator size="large" color={colors.accent} accessibilityLabel="Loading" /></View>;
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={styles.center}>
      <Text variant="h2" style={{ textAlign: 'center' }}>{title}</Text>
      {body ? <Text muted style={{ textAlign: 'center', marginTop: space.sm, maxWidth: 320 }}>{body}</Text> : null}
      {action ? <View style={{ marginTop: space.lg }}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center', padding: space.lg },
  btn: { minHeight: MIN_TOUCH + 4, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: radius.md },
  input: { flex: 1, minHeight: MIN_TOUCH + 4, paddingHorizontal: space.md },
  eye: { minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  banner: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
});
