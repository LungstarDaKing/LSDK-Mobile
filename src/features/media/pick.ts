// Pickers: photo/video library, camera, documents. Images are re-encoded, which also removes EXIF (GPS location etc.).
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { ALLOWED, cleanName, extFor, resolveType, validateUpload } from './rules';
import type { Picked } from './storage';

export type Choice = { picked: Picked; mime: string; fallback: string };
export type PickResult = { choice: Choice } | { error: string } | null; // null = cancelled

const MAX_EDGE = 1600;

/** Re-encode a still image (drops EXIF/GPS) and cap its size. GIF/WebP are left alone so animation survives. */
async function cleanImage(uri: string, mime: string, width?: number): Promise<{ uri: string; mime: string }> {
  if (mime !== 'image/jpeg' && mime !== 'image/png') return { uri, mime };
  try {
    const actions = width && width > MAX_EDGE ? [{ resize: { width: MAX_EDGE } }] : [];
    const png = mime === 'image/png';
    const out = await manipulateAsync(uri, actions, { compress: 0.85, format: png ? SaveFormat.PNG : SaveFormat.JPEG });
    return { uri: out.uri, mime };
  } catch {
    return { uri, mime };   // keep the original rather than block sending
  }
}

async function fromImageAsset(a: ImagePicker.ImagePickerAsset, kind: 'photo' | 'video'): Promise<PickResult> {
  const mime = resolveType(a.fileName, a.mimeType) ?? (a.type === 'video' ? 'video/mp4' : 'image/jpeg');
  if (!ALLOWED.has(mime)) return { error: 'That file type is not supported.' };
  const early = validateUpload(a.fileSize ?? 1, mime);
  if (early) return { error: early };
  let uri = a.uri; let finalMime = mime;
  if (mime.startsWith('image/')) ({ uri, mime: finalMime } = await cleanImage(a.uri, mime, a.width));
  const fallback = `${kind}.${extFor(finalMime) || 'jpg'}`;
  return { choice: { picked: { uri, name: cleanName(a.fileName, fallback), mime: finalMime, size: a.fileSize ?? null }, mime: finalMime, fallback } };
}

export async function pickFromLibrary(): Promise<PickResult> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], allowsMultipleSelection: false, quality: 1, exif: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return fromImageAsset(a, a.type === 'video' ? 'video' : 'photo');
}

export async function takePhoto(): Promise<PickResult> {
  if (Platform.OS !== 'web') {
    // Android's camera intent needs no CAMERA permission, so a failing permission query must not block it.
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    if (perm && !perm.granted && !perm.canAskAgain) return { error: 'Camera access is off. You can turn it on in your phone settings.' };
    if (perm && !perm.granted && Platform.OS === 'ios') return { error: 'Camera access is off. You can turn it on in your phone settings.' };
  }
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false });
  if (res.canceled || !res.assets[0]) return null;
  return fromImageAsset(res.assets[0], 'photo');
}

export async function pickDocument(): Promise<PickResult> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: ['application/pdf', 'text/plain', 'audio/*', 'video/*', 'image/*'] });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const mime = resolveType(a.name, a.mimeType);
  const bad = validateUpload(a.size ?? 1, mime);
  if (bad || !mime) return { error: bad ?? 'That file type is not supported.' };
  const fallback = `file.${extFor(mime)}`;
  return { choice: { picked: { uri: a.uri, name: cleanName(a.name, fallback), mime, size: a.size ?? null }, mime, fallback } };
}

/** Choose a profile picture: centre-crop to a square, 256px, JPEG (the avatars bucket only accepts JPEG up to 1 MiB). */
export async function pickAvatar(): Promise<{ uri: string } | { error: string } | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1, exif: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  if (!a.width || !a.height) return { error: 'Could not read that picture.' };
  const side = Math.min(a.width, a.height);
  try {
    const out = await manipulateAsync(
      a.uri,
      [{ crop: { originX: Math.floor((a.width - side) / 2), originY: Math.floor((a.height - side) / 2), width: side, height: side } }, { resize: { width: 256, height: 256 } }],
      { compress: 0.8, format: SaveFormat.JPEG },
    );
    return { uri: out.uri };
  } catch {
    return { error: 'Could not process that picture. Try another one.' };
  }
}

// ---------------------------------------------------------------- status updates
/** A still picture to edit before posting (library or camera). The editor re-encodes it, which removes EXIF. */
export async function pickStoryImage(camera: boolean): Promise<{ uri: string } | { error: string } | null> {
  if (camera && Platform.OS !== 'web') {
    const perm = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    if (perm && !perm.granted && (Platform.OS === 'ios' || !perm.canAskAgain)) return { error: 'Camera access is off. You can turn it on in your phone settings.' };
  }
  const res = camera
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1, exif: false })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1, exif: false });
  if (res.canceled || !res.assets[0]) return null;
  return { uri: res.assets[0].uri };
}

export async function pickStoryVideo(): Promise<PickResult> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsMultipleSelection: false, quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const mime = resolveType(a.fileName, a.mimeType) ?? 'video/mp4';
  if (!mime.startsWith('video/') || !ALLOWED.has(mime)) return { error: 'That video format is not supported.' };
  const bad = validateUpload(a.fileSize ?? 1, mime);
  if (bad) return { error: bad };
  const fallback = `status.${extFor(mime) || 'mp4'}`;
  return { choice: { picked: { uri: a.uri, name: cleanName(a.fileName, fallback), mime, size: a.fileSize ?? null }, mime, fallback } };
}
