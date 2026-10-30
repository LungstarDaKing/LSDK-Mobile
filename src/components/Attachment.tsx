import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, View } from 'react-native';
import type { ChatMsg } from '@/features/chat/messageList';
import { isStickerFile } from '@/features/stickers/logic';
import { fmtDuration, iosUnplayable, kindOf } from '@/features/media/rules';
import { useSignedUrl } from '@/features/media/useSignedUrl';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TOUCH, radius, space } from '@/theme/tokens';
import { Text } from './ui';

const SIZE = 220;

function openExternally(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else void Linking.openURL(url);
}

/** Full-screen viewer for images and videos. */
function Viewer({ kind, url, name, onClose }: { kind: 'image' | 'video'; url: string; name: string; onClose: () => void }) {
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }} accessibilityViewIsModal>
        {kind === 'image'
          ? <Image source={{ uri: url }} contentFit="contain" style={{ flex: 1 }} accessibilityLabel={name} />
          : <VideoBox url={url} />}
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose}
          style={{ position: 'absolute', top: 48, right: 16, minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 26, lineHeight: 30 }}>×</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open or download original" onPress={() => openExternally(url)}
          style={{ position: 'absolute', bottom: 40, alignSelf: 'center', minHeight: MIN_TOUCH, paddingHorizontal: 20, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>Open original</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

export function VideoBox({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url }, (p) => { p.loop = false; p.play(); });
  return <VideoView player={player} nativeControls contentFit="contain" style={{ flex: 1 }} />;
}

export function VoicePlayer({ url, durationMs, mine }: { url: string; durationMs: number | null; mine: boolean }) {
  const { colors } = useTheme();
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const fg = mine ? colors.ownText : colors.otherText;
  const total = status.duration > 0 ? status.duration * 1000 : (durationMs ?? 0);
  const pos = status.currentTime * 1000;
  const pct = total > 0 ? Math.min(1, pos / total) : 0;
  function toggle() {
    if (status.playing) { player.pause(); return; }
    if (status.didJustFinish || (total > 0 && pos >= total - 100)) void player.seekTo(0);
    player.play();
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, width: SIZE }}>
      <Pressable accessibilityRole="button" accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'} onPress={toggle}
        style={{ minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: fg, fontSize: 18 }}>{status.playing ? '❚❚' : '▶'}</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden' }}>
          <View style={{ width: `${pct * 100}%`, height: 4, backgroundColor: fg }} />
        </View>
        <Text variant="small" style={{ color: fg, opacity: 0.85, marginTop: 4 }}>{fmtDuration(status.playing || pos > 0 ? pos : total)}{status.playing || pos > 0 ? ` / ${fmtDuration(total)}` : ''}</Text>
      </View>
    </View>
  );
}

function FileRow({ msg, url, mine }: { msg: ChatMsg; url: string | null; mine: boolean }) {
  const { colors } = useTheme();
  const fg = mine ? colors.ownText : colors.otherText;
  const ext = (msg.attachment_name?.split('.').pop() ?? 'file').slice(0, 4).toUpperCase();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${msg.attachment_name ?? 'File'}. Open`} disabled={!url} onPress={() => url && openExternally(url)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, width: SIZE, minHeight: MIN_TOUCH, opacity: url ? 1 : 0.6 }}>
      <View style={{ width: 40, height: 48, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="small" style={{ color: fg, fontWeight: '700' }}>{ext}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: fg }} numberOfLines={2}>{msg.attachment_name ?? 'File'}</Text>
        <Text variant="small" style={{ color: fg, opacity: 0.75 }}>{url ? 'Tap to open' : 'Loading…'}</Text>
      </View>
    </Pressable>
  );
}

function A({ msg, mine }: { msg: ChatMsg; mine: boolean }) {
  const { colors } = useTheme();
  const kind = kindOf(msg.attachment_type);
  const sending = !!msg._pending && !msg.attachment_path;
  const { url: signed, failed } = useSignedUrl('media', msg.attachment_path);
  const [open, setOpen] = useState(false);
  const url = signed ?? (msg._localUri && kind !== 'file' ? msg._localUri : null);
  const name = msg.attachment_name ?? 'Attachment';

  if (kind === 'audio') {
    if (iosUnplayable(msg.attachment_type) && Platform.OS === 'ios') {
      return <FileRow msg={{ ...msg, attachment_name: name }} url={signed} mine={mine} />;   // iOS cannot decode webm/ogg: offer download
    }
    return url ? <VoicePlayer url={url} durationMs={msg.attachment_duration} mine={mine} /> : <Loader failed={failed} label="voice note" />;
  }
  if (kind === 'image' && isStickerFile(msg)) {
    return url
      ? <Image source={{ uri: url }} contentFit="contain" style={{ width: 150, height: 150 }} accessibilityLabel="Sticker" />
      : <Loader failed={failed} label="sticker" box />;
  }
  if (kind === 'image') {
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel={`Photo ${name}. Open full screen`} disabled={!url} onPress={() => setOpen(true)}>
          {url
            ? <Image source={{ uri: url }} contentFit="cover" transition={150} style={{ width: SIZE, height: SIZE * 0.75, borderRadius: radius.md, backgroundColor: colors.surface2 }} accessibilityLabel={name} />
            : <Loader failed={failed} label="photo" box />}
          {sending ? <Overlay /> : null}
        </Pressable>
        {open && url ? <Viewer kind="image" url={url} name={name} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }
  if (kind === 'video') {
    return (
      <>
        <Pressable accessibilityRole="button" accessibilityLabel={`Video ${name}. Play`} disabled={!signed} onPress={() => setOpen(true)}
          style={{ width: SIZE, height: SIZE * 0.6, borderRadius: radius.md, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 22 }}>▶</Text>
          </View>
          <Text variant="small" style={{ color: '#fff', position: 'absolute', bottom: 6, left: 8 }} numberOfLines={1}>{name}{msg.attachment_path ? '' : ' · sending'}</Text>
          {sending ? <Overlay /> : null}
        </Pressable>
        {open && signed ? <Viewer kind="video" url={signed} name={name} onClose={() => setOpen(false)} /> : null}
      </>
    );
  }
  return <FileRow msg={msg} url={signed} mine={mine} />;
}

function Overlay() {
  return <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" accessibilityLabel="Uploading" /></View>;
}
function Loader({ failed, label, box }: { failed: boolean; label: string; box?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: box ? SIZE : undefined, height: box ? SIZE * 0.75 : undefined, borderRadius: radius.md, backgroundColor: box ? colors.surface2 : undefined, alignItems: 'center', justifyContent: 'center', padding: space.sm }}>
      {failed ? <Text variant="small" muted>Could not load {label}</Text> : <ActivityIndicator accessibilityLabel={`Loading ${label}`} color={colors.accent} />}
    </View>
  );
}

export const Attachment = memo(A);
export const attachmentSummary = (msg: ChatMsg) => {
  if (isStickerFile(msg)) return 'Sticker';
  const k = kindOf(msg.attachment_type);
  const base = k === 'image' ? 'Photo' : k === 'video' ? 'Video' : k === 'audio' ? (msg.attachment_duration ? `Voice note, ${fmtDuration(msg.attachment_duration)}` : 'Audio') : `File ${msg.attachment_name ?? ''}`.trim();
  return base;
};
