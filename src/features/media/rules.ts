// Pure media rules. They mirror the server limits in backend-reference/supabase/update-v0.3.sql
// (bucket MIME allow-list, 20 MiB cap, path regexes). The server is still the authority; these
// checks exist to fail early with a clear message and to avoid wasted uploads.

export const MAX_BYTES = 20 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 1024 * 1024;
export const MAX_VOICE_MS = 600_000;
export const MIN_VOICE_MS = 300;

/** extension -> canonical MIME accepted by the `media` bucket. */
export const BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac',
  pdf: 'application/pdf', txt: 'text/plain',
};
// audio/webm is accepted by the bucket (web voice notes) but has no extension of its own here.
export const ALLOWED = new Set([...Object.values(BY_EXT), 'audio/webm']);
/** MIME aliases the OS/pickers report that map onto an allowed type. */
const ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg', 'audio/x-m4a': 'audio/mp4', 'audio/m4a': 'audio/mp4', 'audio/mp4a-latm': 'audio/mp4',
  'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav', 'audio/vnd.wave': 'audio/wav', 'audio/mp3': 'audio/mpeg',
  'video/x-m4v': 'video/mp4',
};
const EXT_OF: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'webm', 'audio/aac': 'aac',
  'application/pdf': 'pdf', 'text/plain': 'txt',
};

export const extOf = (name: string | null | undefined) => {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name ?? '');
  return m ? m[1].toLowerCase() : '';
};

/** Decide the MIME type to upload. Returns null when the type is not allowed. */
export function resolveType(name: string | null | undefined, mime: string | null | undefined): string | null {
  const m = (mime ?? '').toLowerCase().split(';')[0].trim();
  const aliased = ALIASES[m] ?? m;
  if (ALLOWED.has(aliased)) return aliased;
  const byExt = BY_EXT[extOf(name)];
  return byExt ?? null;
}

export const extFor = (mime: string) => EXT_OF[mime] ?? '';

/** Display name stored in attachment_name (1..120 chars, no path separators or control chars). */
export function cleanName(raw: string | null | undefined, fallback: string): string {
  // eslint-disable-next-line no-control-regex
  const s = (raw ?? '').replace(/[\u0000-\u001f\u007f/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = s || fallback;
  if (base.length <= 120) return base;
  const ext = extOf(base);
  return ext ? `${base.slice(0, 120 - ext.length - 1)}.${ext}` : base.slice(0, 120);
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const ascii = (b: Uint8Array, from: number, s: string) => s.split('').every((c, i) => b[from + i] === c.charCodeAt(0));

/** Check the file's first bytes really match the claimed type (stops a renamed file passing as an image). */
export function sniffOk(bytes: Uint8Array, mime: string): boolean {
  if (bytes.length === 0) return false;
  switch (mime) {
    case 'image/jpeg': return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png': return bytes[0] === 0x89 && ascii(bytes, 1, 'PNG');
    case 'image/gif': return ascii(bytes, 0, 'GIF8');
    case 'image/webp': return ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP');
    case 'application/pdf': return ascii(bytes, 0, '%PDF');
    case 'audio/wav': return ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE');
    case 'audio/ogg': return ascii(bytes, 0, 'OggS');
    case 'video/webm': case 'audio/webm': return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
    case 'video/mp4': case 'video/quicktime': case 'audio/mp4': return ascii(bytes, 4, 'ftyp');
    case 'audio/mpeg': return ascii(bytes, 0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case 'audio/aac': return (bytes[0] === 0xff && (bytes[1] & 0xf0) === 0xf0) || ascii(bytes, 0, 'ADIF') || ascii(bytes, 4, 'ftyp');
    case 'text/plain': return !bytes.subarray(0, 512).includes(0);
    default: return false;
  }
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const MEDIA_PATH_RE = new RegExp(`^${UUID}/${UUID}/${UUID}\\.[a-z0-9]{2,5}$`);
export const AVATAR_PATH_RE = new RegExp(`^${UUID}/${UUID}\\.jpg$`);

export const mediaPath = (roomId: string, userId: string, id: string, ext: string) => `${roomId}/${userId}/${id}.${ext}`;
export const avatarPath = (userId: string, id: string) => `${userId}/${id}.jpg`;

export type Kind = 'image' | 'video' | 'audio' | 'file';
export const kindOf = (mime: string | null | undefined): Kind => {
  const t = mime ?? '';
  return t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : 'file';
};

/** Types iOS cannot decode natively (web recordings). Show a download instead of a broken player. */
export const iosUnplayable = (mime: string | null | undefined) => mime === 'audio/webm' || mime === 'audio/ogg' || mime === 'video/webm';

/** Validate before upload. Returns an error message, or null when OK. */
export function validateUpload(size: number | null | undefined, mime: string | null): string | null {
  if (!mime) return 'That file type is not supported. You can send photos, videos, audio, PDFs and text files.';
  if (!size || size <= 0) return 'That file looks empty.';
  if (size > MAX_BYTES) return `That file is ${fmtSize(size)}. The limit is 20 MB.`;
  return null;
}

// ---------------------------------------------------------------- stories (bucket `stories`)
export const STORY_PATH_RE = new RegExp(`^${UUID}/${UUID}\\.[a-z0-9]{2,5}$`);
export const storyPath = (userId: string, id: string, ext: string) => `${userId}/${id}.${ext}`;
/** Stories accept images, video and audio only (no PDF / text), same 20 MiB cap. */
export const STORY_TYPES = new Set([...ALLOWED].filter((m) => m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/')));
export const MAX_STORY_TEXT = 300;
