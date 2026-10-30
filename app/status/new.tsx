import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { ImageEditor } from '@/components/ImageEditor';
import { Banner, Button, Screen, Text } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { pickStoryImage, pickStoryVideo, type Choice } from '@/features/media/pick';
import { fmtSize, MAX_STORY_TEXT } from '@/features/media/rules';
import { postMediaStory, postTextStory } from '@/features/status/api';
import { bgColor, STORY_BGS } from '@/features/status/stories';
import { friendlyError } from '@/lib/validation';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space, type } from '@/theme/tokens';

type Mode = 'text' | 'photo' | 'video';
const MODES: { key: Mode; label: string }[] = [{ key: 'text', label: 'Text' }, { key: 'photo', label: 'Photo' }, { key: 'video', label: 'Video' }];

export default function NewStatus() {
  const router = useRouter();
  const { colors } = useTheme();
  const { session } = useAuth();
  const me = session!.user.id;
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [bg, setBg] = useState(0);
  const [caption, setCaption] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [video, setVideo] = useState<Choice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = mode === 'text' ? text.trim().length > 0 : mode === 'photo' ? !!photo : !!video;

  async function choosePhoto(camera: boolean) {
    setError(null);
    try {
      const r = await pickStoryImage(camera);
      if (!r) return;
      if ('error' in r) return setError(r.error);
      setEditing(r.uri);
    } catch (e) { setError(friendlyError(e)); }
  }
  async function chooseVideo() {
    setError(null);
    try {
      const r = await pickStoryVideo();
      if (!r) return;
      if ('error' in r) return setError(r.error);
      setVideo(r.choice);
    } catch (e) { setError(friendlyError(e)); }
  }
  async function post() {
    if (!ready || busy) return;
    setBusy(true); setError(null);
    try {
      if (mode === 'text') await postTextStory(me, text, bg);
      else if (mode === 'photo') await postMediaStory(me, { uri: photo!, name: 'status.jpg', mime: 'image/jpeg', size: null }, 'image/jpeg', caption);
      else await postMediaStory(me, video!.picked, video!.mime, caption);
      router.back();
    } catch (e) { setError(friendlyError(e)); setBusy(false); }
  }

  const captionField = (
    <TextInput
      accessibilityLabel="Caption" value={caption} onChangeText={setCaption} maxLength={MAX_STORY_TEXT} placeholder="Add a caption (optional)" placeholderTextColor={colors.muted}
      style={[type.body, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: MIN_TOUCH }]}
    />
  );

  return (
    <Screen scroll>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel" onPress={() => router.back()} style={{ minHeight: MIN_TOUCH, justifyContent: 'center' }}>
            <Text style={{ color: colors.accent }}>Cancel</Text>
          </Pressable>
          <Text variant="h2" accessibilityRole="header" style={{ flex: 1, textAlign: 'center' }}>New status</Text>
          <View style={{ width: 56 }} />
        </View>

        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: space.sm }}>
          {MODES.map((m) => (
            <Pressable key={m.key} accessibilityRole="tab" accessibilityState={{ selected: mode === m.key }} accessibilityLabel={m.label} onPress={() => { setMode(m.key); setError(null); }}
              style={{ flex: 1, minHeight: MIN_TOUCH, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === m.key ? colors.accent : colors.surface2 }}>
              <Text style={{ color: mode === m.key ? colors.accentText : colors.text, fontWeight: '700' }}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {error ? <Banner kind="error" text={error} /> : null}

        {mode === 'text' ? (
          <>
            <View style={{ backgroundColor: bgColor(bg), borderRadius: radius.lg, minHeight: 280, padding: space.lg, justifyContent: 'center' }}>
              <TextInput
                accessibilityLabel="Status text" value={text} onChangeText={setText} maxLength={MAX_STORY_TEXT} multiline placeholder="Type a status" placeholderTextColor="rgba(255,255,255,0.7)"
                style={{ color: '#fff', fontSize: 26, fontWeight: '600', textAlign: 'center', minHeight: 120 }}
              />
            </View>
            <Text variant="small" muted style={{ alignSelf: 'flex-end' }}>{text.length}/{MAX_STORY_TEXT}</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, justifyContent: 'center' }}>
              {STORY_BGS.map((c, i) => (
                <Pressable key={c} accessibilityRole="radio" accessibilityState={{ checked: bg === i }} accessibilityLabel={`Background colour ${i + 1}`} onPress={() => setBg(i)}
                  style={{ width: MIN_TOUCH, height: MIN_TOUCH, borderRadius: MIN_TOUCH / 2, backgroundColor: c, borderWidth: bg === i ? 4 : 1, borderColor: bg === i ? colors.text : colors.border }} />
              ))}
            </View>
          </>
        ) : mode === 'photo' ? (
          <>
            {photo ? <Image source={{ uri: photo }} contentFit="contain" style={{ width: '100%', height: 320, borderRadius: radius.lg, backgroundColor: colors.surface2 }} accessibilityLabel="Status photo preview" /> : null}
            <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
              <Button title={photo ? 'Choose another' : 'Choose a photo'} variant="soft" onPress={() => void choosePhoto(false)} disabled={busy} />
              <Button title="Take a photo" variant="soft" onPress={() => void choosePhoto(true)} disabled={busy} />
              {photo ? <Button title="Edit" variant="ghost" onPress={() => setEditing(photo)} disabled={busy} /> : null}
            </View>
            {photo ? captionField : null}
          </>
        ) : (
          <>
            {video ? <Text>Video ready: {video.picked.name}{video.picked.size ? ` (${fmtSize(video.picked.size)})` : ''}</Text> : <Text muted>Videos can be up to 20 MB.</Text>}
            <Button title={video ? 'Choose another video' : 'Choose a video'} variant="soft" onPress={() => void chooseVideo()} disabled={busy} />
            {video ? captionField : null}
          </>
        )}

        <Text variant="small" muted>Visible for 24 hours to people you share a chat with. You can post up to 20 a day.</Text>
        <Button title="Post status" onPress={post} loading={busy} disabled={!ready} />
      </View>
      <ImageEditor uri={editing} aspects={['square', '4:5', '9:16']} title="Edit photo" doneLabel="Done" onDone={(u) => { setPhoto(u); setEditing(null); }} onCancel={() => setEditing(null)} />
    </Screen>
  );
}
