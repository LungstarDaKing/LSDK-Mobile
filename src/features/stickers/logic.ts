// Stickers, ported from the website (src/lib/stickers.js). A search sticker is sent as an ordinary message whose text is
//   [sticker]https://static.klipy.com/....webp
// so no database change is needed and the website shows the same sticker. "My stickers" are sent as a file named sticker.webp.
// Only https links on klipy.com are ever shown.
export const PREFIX = '[sticker]';
export const MAX_URL = 600;

export function safeStickerUrl(u: unknown): string | null {
  try {
    const s = String(u);
    const x = new URL(s);
    const host = x.hostname.toLowerCase();
    const ok = x.protocol === 'https:' && (host === 'klipy.com' || host.endsWith('.klipy.com')) && !x.username && !x.password && s.length <= MAX_URL;
    return ok ? x.href : null;
  } catch { return null; }
}
export const isStickerPreview = (c: unknown): boolean => typeof c === 'string' && c.startsWith(PREFIX);
export const stickerContent = (url: string): string => PREFIX + url;
export const stickerUrl = (content: unknown): string | null => (isStickerPreview(content) ? safeStickerUrl((content as string).slice(PREFIX.length).trim()) : null);
type FileMsg = { attachment_name?: string | null; attachment_type?: string | null; content?: string | null } | null | undefined;
export const isStickerFile = (m: FileMsg): boolean => m?.attachment_name === 'sticker.webp' && m?.attachment_type === 'image/webp';
export const isStickerMsg = (m: FileMsg): boolean => !!stickerUrl(m?.content) || isStickerFile(m);

export type StickerItem = { id: string; title: string; url: string; preview: string };

/** Keep only well-formed items with safe links (the server is trusted, but never the data in a message or in storage). */
export function parseItems(j: unknown): { items: StickerItem[]; hasNext: boolean } {
  const o = (j && typeof j === 'object' ? j : {}) as { items?: unknown; has_next?: unknown };
  const arr = Array.isArray(o.items) ? o.items : [];
  const items: StickerItem[] = [];
  for (const raw of arr) {
    const i = (raw ?? {}) as Record<string, unknown>;
    const url = safeStickerUrl(i.url); const preview = safeStickerUrl(i.preview) ?? url;
    if (url && preview) items.push({ id: String(i.id), title: String(i.title || 'Sticker').slice(0, 80), url, preview });
  }
  return { items, hasNext: !!o.has_next };
}

/** Sticker picture sizes for "My stickers": a square cropped to 512, or the whole picture scaled so its long side is 512. */
export const SIZE = 512;
export function fitSize(w: number, h: number, mode: 'fit' | 'fill'): { resize?: { width?: number; height?: number }; crop?: { originX: number; originY: number; width: number; height: number } } {
  if (!(w > 0 && h > 0)) return {};
  if (mode === 'fill') {
    const side = Math.min(w, h);
    return { crop: { originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: Math.floor(side), height: Math.floor(side) }, resize: { width: SIZE, height: SIZE } };
  }
  return w >= h ? { resize: { width: SIZE } } : { resize: { height: SIZE } };
}
