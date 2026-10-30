import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { BACKGROUNDS, IMAGE_ID, colorFor, resolveBackground, savePrefs, withChoice, withoutImage } from '@/features/appearance/backgrounds';
import { useBgPrefs } from '@/features/appearance/useBackground';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { ImageEditor } from './ImageEditor';
import { Banner, Button, Text } from './ui';

const DIM_NAMES = ['Normal', 'Dimmed', 'Darker'];

/** Choose a chat background. With roomId it applies to that chat only; without, it is the default for every chat. */
export function BackgroundPicker({ roomId }: { roomId?: string }) {
  const { colors, isDark } = useTheme();
  const prefs = useBgPrefs();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const own = roomId ? prefs.per[roomId] : undefined;
  const active = resolveBackground(prefs, roomId);
  const choose = (id: string | null) => void savePrefs(withChoice(prefs, roomId, id));
  const canImage = Platform.OS !== 'web';   // a picture must be kept on the device; browser blob links do not survive a reload

  async function pick() {
    setError(null);
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1, exif: false });
      if (!res.canceled && res.assets[0]) setEditing(res.assets[0].uri);
    } catch (e) { setError(friendlyError(e)); }
  }
  async function saved(uri: string) {
    setEditing(null);
    try {
      const dest = new FileSystem.File(FileSystem.Paths.document, `chat-bg-${Date.now()}.jpg`);
      new FileSystem.File(uri).copy(dest);
      const old = prefs.imageUri;
      await savePrefs(withChoice({ ...prefs, imageUri: dest.uri }, roomId, IMAGE_ID));
      if (old && old !== dest.uri) { try { new FileSystem.File(old).delete(); } catch { /* already gone */ } }
    } catch (e) { setError(friendlyError(e)); }
  }
  function removeImage() {
    const old = prefs.imageUri;
    void savePrefs(withoutImage(prefs));
    if (old) { try { new FileSystem.File(old).delete(); } catch { /* already gone */ } }
  }

  const swatch = (id: string, name: string, color: string | null, on: boolean) => (
    <Pressable key={id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={name} onPress={() => choose(id === 'default' && roomId ? null : id)}
      style={{ width: 64, alignItems: 'center', gap: 4 }}>
      <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: color ?? colors.bg, borderWidth: on ? 3 : 1, borderColor: on ? colors.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}>
        {color === null ? <Text variant="small" muted>Aa</Text> : null}
      </View>
      <Text variant="small" muted numberOfLines={1}>{name}</Text>
    </Pressable>
  );

  return (
    <View style={{ gap: space.sm, marginTop: space.lg }}>
      <Text variant="h2" accessibilityRole="header">Chat background</Text>
      <Text muted>{roomId ? (own ? 'This chat has its own background.' : 'Using your default background.') : 'Used in every chat unless a chat has its own.'}</Text>
      {error ? <Banner kind="error" text={error} /> : null}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {roomId ? swatch('default', 'Default', null, !own) : null}
        {BACKGROUNDS.filter((b) => roomId ? b.id !== 'default' : true).map((b) => swatch(b.id, b.name, colorFor(b.id, isDark), (roomId ? own : prefs.def) === b.id || (!roomId && prefs.def === 'default' && b.id === 'default')))}
        {prefs.imageUri ? (
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: active === IMAGE_ID && (!roomId || own === IMAGE_ID) }} accessibilityLabel="My picture" onPress={() => choose(IMAGE_ID)} style={{ width: 64, alignItems: 'center', gap: 4 }}>
            <View style={{ width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: active === IMAGE_ID ? 3 : 1, borderColor: active === IMAGE_ID ? colors.accent : colors.border, alignItems: 'center', justifyContent: 'center' }}><Text>🖼️</Text></View>
            <Text variant="small" muted>Picture</Text>
          </Pressable>
        ) : null}
      </View>
      {canImage ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          <Button title={prefs.imageUri ? 'Change picture' : 'Use my own picture'} variant="soft" onPress={pick} />
          {prefs.imageUri ? <Button title="Remove picture" variant="ghost" onPress={removeImage} /> : null}
        </View>
      ) : null}
      {prefs.imageUri ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', flexWrap: 'wrap' }}>
          <Text muted>Picture brightness</Text>
          {DIM_NAMES.map((n, i) => (
            <Pressable key={n} accessibilityRole="radio" accessibilityState={{ checked: prefs.dim === i }} accessibilityLabel={n} onPress={() => void savePrefs({ ...prefs, dim: i as 0 | 1 | 2 })}
              style={{ minHeight: MIN_TOUCH - 8, paddingHorizontal: space.md, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: prefs.dim === i ? colors.accentSoft : colors.surface2 }}>
              <Text variant="small" style={{ color: prefs.dim === i ? colors.accent : colors.text, fontWeight: '600' }}>{n}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <ImageEditor uri={editing} aspects={['9:16', '4:5', 'square']} title="Chat background" doneLabel="Use as background" onDone={(u) => void saved(u)} onCancel={() => setEditing(null)} />
    </View>
  );
}
