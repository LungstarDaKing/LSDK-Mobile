export type CropBox = { originX: number; originY: number; width: number; height: number };

/** Largest centred box with the given aspect ratio (width / height) inside w x h. Integer pixels, never outside the image. */
export function centerCrop(w: number, h: number, ratio: number): CropBox {
  if (!(w > 0) || !(h > 0) || !(ratio > 0)) return { originX: 0, originY: 0, width: Math.max(1, Math.floor(w) || 1), height: Math.max(1, Math.floor(h) || 1) };
  let cw = w; let ch = w / ratio;
  if (ch > h) { ch = h; cw = h * ratio; }
  const width = Math.max(1, Math.min(Math.floor(w), Math.floor(cw)));
  const height = Math.max(1, Math.min(Math.floor(h), Math.floor(ch)));
  return { originX: Math.floor((w - width) / 2), originY: Math.floor((h - height) / 2), width, height };
}

export const ASPECTS = [
  { key: 'square', label: 'Square', ratio: 1 },
  { key: '4:5', label: '4:5', ratio: 4 / 5 },
  { key: '9:16', label: 'Tall 9:16', ratio: 9 / 16 },
  { key: '16:9', label: 'Wide 16:9', ratio: 16 / 9 },
] as const;
