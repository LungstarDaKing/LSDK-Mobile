// Cross-platform dialogs. Alert.alert with buttons does NOT work on react-native-web, so everything uses <Modal>.
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';
import { Button, Text } from './ui';

function Backdrop({ onClose, children, bottom }: { onClose: () => void; children: ReactNode; bottom?: boolean }) {
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable accessibilityLabel="Close" accessibilityRole="button" onPress={onClose} style={[styles.backdrop, { justifyContent: bottom ? 'flex-end' : 'center' }]}>
          {/* inner Pressable swallows taps so touching the card does not close it */}
          <Pressable onPress={() => {}} style={{ width: '100%', alignItems: 'center' }}>{children}</Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean };

/** Bottom sheet with a list of actions. `header` renders above them (e.g. the reaction bar). */
export function ActionSheet({ visible, title, actions, header, onClose }: {
  visible: boolean; title?: string; actions: SheetAction[]; header?: ReactNode; onClose: () => void;
}) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Backdrop onClose={onClose} bottom>
      <View style={[styles.sheet, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {title ? <Text variant="small" muted style={{ textAlign: 'center', marginBottom: space.sm }} numberOfLines={1}>{title}</Text> : null}
        {header}
        {actions.map((a) => (
          <Pressable
            key={a.label} accessibilityRole="button" accessibilityLabel={a.label}
            onPress={() => { onClose(); a.onPress(); }}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surface2 : 'transparent' }]}
          >
            <Text variant="strong" style={{ color: a.destructive ? colors.danger : colors.text }}>{a.label}</Text>
          </Pressable>
        ))}
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={onClose} style={styles.row}>
          <Text variant="strong" muted>Cancel</Text>
        </Pressable>
      </View>
    </Backdrop>
  );
}

export function ConfirmDialog({ visible, title, body, confirmLabel, destructive, onConfirm, onClose }: {
  visible: boolean; title: string; body?: string; confirmLabel: string; destructive?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Backdrop onClose={onClose}>
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text variant="h2">{title}</Text>
        {body ? <Text muted style={{ marginTop: space.sm }}>{body}</Text> : null}
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          <Button title={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={() => { onClose(); onConfirm(); }} />
          <Button title="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Backdrop>
  );
}

/** Single text input dialog (edit message, report reason, rename group). */
export function PromptDialog({ visible, title, label, initial = '', submitLabel, maxLength, multiline, validate, onSubmit, onClose }: {
  visible: boolean; title: string; label: string; initial?: string; submitLabel: string; maxLength: number; multiline?: boolean;
  validate?: (v: string) => string | null; onSubmit: (v: string) => Promise<void> | void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setValue(initial); setError(null); setBusy(false); } }, [visible, initial]);
  if (!visible) return null;

  async function submit() {
    const bad = validate?.(value) ?? null;
    if (bad) return setError(bad);
    setBusy(true); setError(null);
    try { await onSubmit(value); onClose(); } catch (e) { setError((e as { message?: string }).message || 'Something went wrong.'); setBusy(false); }
  }

  return (
    <Backdrop onClose={busy ? () => {} : onClose}>
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text variant="h2">{title}</Text>
        <TextInput
          accessibilityLabel={label} value={value} onChangeText={setValue} maxLength={maxLength} multiline={multiline} autoFocus
          placeholder={label} placeholderTextColor={colors.muted}
          style={[type.body, { marginTop: space.md, minHeight: MIN_TOUCH + 4, maxHeight: 160, color: colors.text, backgroundColor: colors.bg, borderColor: error ? colors.danger : colors.border, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm }]}
        />
        {error ? <Text variant="small" style={{ color: colors.danger, marginTop: space.xs }}>{error}</Text> : null}
        <Text variant="small" muted style={{ alignSelf: 'flex-end', marginTop: space.xs }}>{value.length}/{maxLength}</Text>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <Button title={submitLabel} onPress={submit} loading={busy} />
          <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
        </View>
      </View>
    </Backdrop>
  );
}

/** Full-height modal sheet for pickers (add members, etc). */
export function PickerModal({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'ios' ? 54 : 24 }}>
        <View style={styles.pickerHead}>
          <Text variant="h2" style={{ flex: 1 }}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}>
            <Text variant="strong" style={{ color: colors.accent }}>Done</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.md }}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(8,4,24,0.55)', alignItems: 'center', padding: space.lg },
  sheet: { width: '100%', maxWidth: 520, borderRadius: radius.lg, borderWidth: 1, padding: space.md, marginBottom: space.md },
  card: { width: '100%', maxWidth: 420, borderRadius: radius.lg, borderWidth: 1, padding: space.xl },
  row: { minHeight: MIN_TOUCH + 4, justifyContent: 'center', alignItems: 'center', borderRadius: radius.md },
  pickerHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingBottom: space.sm },
});
