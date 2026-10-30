/** Stable colour slot (0-5) for a person/room id, so someone keeps the same colour everywhere. */
export function colorIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 6;
}
