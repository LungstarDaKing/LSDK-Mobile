import { Image } from 'expo-image';
import { FlipType, manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ASPECTS, centerCrop } from '@/features/media/crop';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { Text } from './ui';

type Dims = { uri: string; width: number; height: number };

/**
 * Crop (centred, preset shapes), rotate and flip. Each step is applied to the image straight away and
 * "Reset" goes back to the original. There are no colour filters: they cannot be baked into the file without a
 * graphics library, and a preview-only filter would mislead people.
 */
export function ImageEditor({ uri, aspects = ASPECTS.map((a) => a.key), title = 'Edit picture', doneLabel = 'Use picture', onDone, onCancel }: {
  uri: string | null; aspects?: string[]; title?: string; doneLabel?: string; onDone: (uri: string) => void; onCancel: () => void;
}) {
  const [orig, setOrig] = useState<Dims | null>(null);
  const [cur, setCur] = useState<Dims | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setOrig(null); setCur(null); setErr(null);
    if (!uri) return;
    manipulateAsync(uri, [], { format: SaveFormat.JPEG, compress: 1 })
      .then((r) => { if (alive) { setOrig(r); setCur(r); } })
      .catch(() => { if (alive) setErr('Could not open that picture.'); });
    return () => { alive = false; };
  }, [uri]);

  async function step(actions: Parameters<typeof manipulateAsync>[1]) {
    if (!cur || busy) return;
    setBusy(true); setErr(null);
    try { setCur(await manipulateAsync(cur.uri, actions, { format: SaveFormat.JPEG, compress: 1 })); }
    catch { setErr('That change did not work. Try again.'); }
    finally { setBusy(false); }
  }
  async function finish() {
    if (!cur || busy) return;
    setBusy(true);
    try { const out = await manipulateAsync(cur.uri, [], { format: SaveFormat.JPEG, compress: 0.85 }); onDone(out.uri); }
    catch { setErr('Could not save the picture.'); setBusy(false); }
  }

  const chip = (label: string, onPress: () => void, hint?: string) => (
    <Pressable key={label} accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} onPress={onPress} disabled={!cur || busy}
      style={{ minHeight: MIN_TOUCH, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.16)', justifyContent: 'center', opacity: !cur || busy ? 0.5 : 1 }}>
      <Text style={{ color: '#fff', fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={!!uri} animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} accessibilityViewIsModal>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: space.md, gap: space.md }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel editing" onPress={onCancel} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
            <Text style={{ color: '#fff' }}>Cancel</Text>
          </Pressable>
          <Text accessibilityRole="header" style={{ color: '#fff', flex: 1, textAlign: 'center', fontWeight: '700' }}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={doneLabel} onPress={finish} disabled={!cur || busy} style={{ minHeight: MIN_TOUCH, justifyContent: 'center', opacity: !cur || busy ? 0.5 : 1 }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{doneLabel}</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          {cur ? <Image source={{ uri: cur.uri }} contentFit="contain" style={{ width: '100%', height: '100%' }} accessibilityLabel="Picture preview" /> : err ? null : <ActivityIndicator color="#fff" accessibilityLabel="Loading picture" />}
          {busy ? <View style={{ position: 'absolute' }}><ActivityIndicator color="#fff" accessibilityLabel="Working" /></View> : null}
        </View>
        {err ? <Text style={{ color: '#fca5a5', textAlign: 'center', padding: space.sm }}>{err}</Text> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, padding: space.md, justifyContent: 'center' }}>
          {ASPECTS.filter((a) => aspects.includes(a.key)).map((a) => chip(`Crop ${a.label}`, () => { if (cur) void step([{ crop: centerCrop(cur.width, cur.height, a.ratio) }]); }, 'Crops from the middle'))}
          {chip('Rotate', () => void step([{ rotate: 90 }]))}
          {chip('Flip', () => void step([{ flip: FlipType.Horizontal }]))}
          {chip('Reset', () => setCur(orig))}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
