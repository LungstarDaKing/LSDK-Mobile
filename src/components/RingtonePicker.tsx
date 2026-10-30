import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Banner, Button, Text } from '@/components/ui';
import { addCustom, listCustom, loadPrefs, removeCustom, savePrefs, startRinging, stopRinging, TONES } from '@/features/calls/ringtone';
import { MAX_CUSTOM, setDefault, setPerson, type CustomTone, type Prefs } from '@/features/calls/tonePrefs';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';

function useTones() {
  const [prefs, setPrefs] = useState<Prefs | null>(null); const [custom, setCustom] = useState<CustomTone[]>([]);
  const reload = useCallback(async () => { setPrefs(await loadPrefs()); setCustom(await listCustom()); }, []);
  useEffect(() => { void reload(); return () => stopRinging(); }, [reload]);
  return { prefs, custom, reload, setPrefs, setCustom };
}

function Row({ label, selected, onPress, onRemove }: { label: string; selected: boolean; onPress: () => void; onRemove?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Pressable accessibilityRole="radio" accessibilityState={{ selected }} accessibilityLabel={`${label} ringtone`} onPress={onPress}
        style={{ flex: 1, minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: selected ? colors.accent : colors.border }}>
        <Text>{selected ? '●' : '○'}</Text><Text style={{ flex: 1 }} numberOfLines={1}>{label}</Text>
      </Pressable>
      {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={onRemove} style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.danger }}>✕</Text></Pressable> : null}
    </View>
  );
}

/** Choose the default incoming-call ringtone, or add your own audio file (this phone only). Tapping a tone plays it once. */
export function RingtonePicker() {
  const t = useTones(); const [error, setError] = useState<string | null>(null);
  if (!t.prefs) return null;
  const prefs = t.prefs;
  async function pick(id: string) { const next = setDefault(prefs, id); t.setPrefs(next); await savePrefs(next); void startRinging(false, id); }
  async function add() {
    setError(null);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true, multiple: false });
      if (r.canceled || !r.assets[0]) return;
      const a = r.assets[0];
      const tone = await addCustom({ uri: a.uri, name: a.name, mimeType: a.mimeType, size: a.size });
      await t.reload(); await pick(tone.id);
    } catch (e) { setError(friendlyError(e)); }
  }
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="strong">Ringtone</Text>
      <Text variant="small" muted>Plays when someone calls you. This phone only. You can pick a different one for each person in their chat info.</Text>
      {error ? <Banner kind="error" text={error} /> : null}
      {TONES.map((x) => <Row key={x.id} label={x.label} selected={prefs.def === x.id} onPress={() => void pick(x.id)} />)}
      {t.custom.map((x) => <Row key={x.id} label={x.name} selected={prefs.def === x.id} onPress={() => void pick(x.id)} onRemove={() => void removeCustom(x.id).then(t.reload)} />)}
      {t.custom.length < MAX_CUSTOM ? <Button title="Add my own ringtone" variant="soft" onPress={add} /> : <Text variant="small" muted>You have {MAX_CUSTOM} of your own ringtones. Remove one to add another.</Text>}
      <Text variant="small" muted>Audio files up to 3 MB and 30 seconds. They stay on this phone.</Text>
    </View>
  );
}

/** A ringtone for one person (falls back to your default). */
export function PersonRingtone({ personId, name }: { personId: string; name: string }) {
  const t = useTones();
  if (!t.prefs) return null;
  const prefs = t.prefs; const mine = prefs.per[personId] ?? null;
  async function pick(id: string | null) { const next = setPerson(prefs, personId, id); t.setPrefs(next); await savePrefs(next); if (id) void startRinging(false, id); else stopRinging(); }
  return (
    <View style={{ gap: space.sm }}>
      <Text variant="strong">Ringtone for {name}</Text>
      <Row label="Use my default" selected={!mine} onPress={() => void pick(null)} />
      {TONES.map((x) => <Row key={x.id} label={x.label} selected={mine === x.id} onPress={() => void pick(x.id)} />)}
      {t.custom.map((x) => <Row key={x.id} label={x.name} selected={mine === x.id} onPress={() => void pick(x.id)} />)}
    </View>
  );
}
