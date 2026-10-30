// Incoming-call ringtone (this device only, like the web app). Stock tones are short generated WAV files in assets/ringtones.
// v0.12: a default tone, an optional tone per person, and up to 5 of your own audio files (all kept on this phone only).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';
import { Vibration, Platform } from 'react-native';
import { forget, MAX_CUSTOM, parsePrefs, resolve, toneFor, validateTone, cleanToneName, type CustomTone, type Prefs } from './tonePrefs';

export const TONES = [
  { id: 'classic', label: 'Classic', src: require('../../../assets/ringtones/classic.wav') },
  { id: 'marimba', label: 'Marimba', src: require('../../../assets/ringtones/marimba.wav') },
  { id: 'chime', label: 'Chime', src: require('../../../assets/ringtones/chime.wav') },
  { id: 'pulse', label: 'Pulse', src: require('../../../assets/ringtones/pulse.wav') },
  { id: 'rise', label: 'Sunrise', src: require('../../../assets/ringtones/rise.wav') },
  { id: 'bubbles', label: 'Bubbles', src: require('../../../assets/ringtones/bubbles.wav') },
] as const;
export type ToneId = string;
export const DEFAULT_TONE: ToneId = 'classic';
const KEY_OLD = 'lsdkchat.ringtone.v1';       // v0.5-v0.10: one tone for everyone
const KEY = 'lsdkchat.ringtones.v2';
const KEY_CUSTOM = 'lsdkchat.tones.v1';

export async function loadPrefs(): Promise<Prefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return parsePrefs(JSON.parse(raw));
    const old = await AsyncStorage.getItem(KEY_OLD);
    return parsePrefs({ def: old });
  } catch { return parsePrefs({}); }
}
export async function savePrefs(p: Prefs): Promise<void> { try { await AsyncStorage.setItem(KEY, JSON.stringify(p)); } catch { /* keep the old one */ } }
export async function listCustom(): Promise<CustomTone[]> {
  try {
    const a = JSON.parse((await AsyncStorage.getItem(KEY_CUSTOM)) ?? '[]') as unknown;
    return Array.isArray(a) ? (a as CustomTone[]).filter((t) => t && typeof t.id === 'string' && typeof t.file === 'string').slice(0, MAX_CUSTOM) : [];
  } catch { return []; }
}
const tonesDir = () => new Directory(Paths.document, 'ringtones');
/** Copy a picked audio file into the app's own storage and remember it. */
export async function addCustom(src: { uri: string; name?: string | null; mimeType?: string | null; size?: number | null }): Promise<CustomTone> {
  const list = await listCustom();
  const bad = validateTone({ name: src.name, mime: src.mimeType, size: src.size }, list.length);
  if (bad) throw new Error(bad);
  const d = tonesDir(); d.create({ intermediates: true, idempotent: true });
  const ext = (src.name?.match(/\.(\w{2,4})$/)?.[1] ?? 'm4a').toLowerCase();
  const id = `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const dest = new File(d, `${id}.${ext}`);
  new File(src.uri).copy(dest);
  const tone: CustomTone = { id, name: cleanToneName(src.name), file: dest.uri };
  await AsyncStorage.setItem(KEY_CUSTOM, JSON.stringify([...list, tone]));
  return tone;
}
export async function removeCustom(id: string): Promise<void> {
  const list = await listCustom(); const gone = list.find((t) => t.id === id);
  try { if (gone) new File(gone.file).delete(); } catch { /* already gone */ }
  await AsyncStorage.setItem(KEY_CUSTOM, JSON.stringify(list.filter((t) => t.id !== id)));
  await savePrefs(forget(await loadPrefs(), id));
}
/** The tone to ring for this caller: their own tone if you picked one, otherwise your default. */
export async function toneForPeer(peerId?: string | null): Promise<ToneId> {
  const [p, custom] = await Promise.all([loadPrefs(), listCustom()]);
  return resolve(toneFor(p, peerId), custom);
}

let player: AudioPlayer | null = null;
/** Start ringing (looping) with the chosen tone. Safe to call twice. */
export async function startRinging(loop = true, id?: ToneId, peerId?: string | null): Promise<void> {
  stopRinging();
  try {
    const want = id ?? (await toneForPeer(peerId));
    const stock = TONES.find((t) => t.id === want);
    const custom = stock ? null : (await listCustom()).find((t) => t.id === want);
    await setAudioModeAsync({ playsInSilentMode: true });   // an incoming call should ring even with the silent switch on
    const p = createAudioPlayer(stock ? stock.src : custom ? { uri: custom.file } : TONES[0].src);
    p.loop = loop; p.play(); player = p;
  } catch { /* no sound is better than a crash */ }
  if (Platform.OS !== 'web' && loop) Vibration.vibrate([0, 800, 1200], true);
}
export function stopRinging(): void {
  try { player?.pause(); player?.remove(); } catch { /* already gone */ }
  player = null;
  if (Platform.OS !== 'web') Vibration.cancel();
}
