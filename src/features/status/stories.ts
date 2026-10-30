// Pure helpers for status updates (stories): grouping, ordering, labels. Unit tested.
export type StoryKind = 'text' | 'image' | 'video' | 'audio';
export type Story = {
  id: string; author_id: string; kind: StoryKind; content: string; bg: number | null;
  attachment_path: string | null; attachment_name: string | null; attachment_type: string | null; attachment_size: number | null;
  reported: boolean; created_at: string; expires_at: string;
  profiles: { username: string; avatar_path: string | null } | null;
};
export type Group = {
  authorId: string; username: string; avatar_path: string | null; mine: boolean;
  stories: Story[]; unseen: number; latest: string;
};

/** Background colours for text statuses (index = `bg` column 0..7). All give >= 4.5:1 contrast with white text (tested). */
export const STORY_BGS = ['#6b46f5', '#0f766e', '#b91c1c', '#1d4ed8', '#9d174d', '#15803d', '#92400e', '#334155'] as const;
export const bgColor = (bg: number | null | undefined) => STORY_BGS[((bg ?? 0) % STORY_BGS.length + STORY_BGS.length) % STORY_BGS.length];

export const isLive = (s: Pick<Story, 'expires_at'>, now = Date.now()) => new Date(s.expires_at).getTime() > now;

/**
 * One group per author. Mine first (even when empty is handled by the caller), then people with unseen
 * statuses (newest first), then fully-seen people (newest first). Stories inside a group are oldest -> newest.
 */
export function groupStories(stories: Story[], me: string, viewed: ReadonlySet<string>, now = Date.now()): Group[] {
  const by = new Map<string, Group>();
  for (const s of [...stories].filter((x) => isLive(x, now)).sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    let g = by.get(s.author_id);
    if (!g) {
      g = { authorId: s.author_id, username: s.profiles?.username ?? 'Former member', avatar_path: s.profiles?.avatar_path ?? null, mine: s.author_id === me, stories: [], unseen: 0, latest: s.created_at };
      by.set(s.author_id, g);
    }
    g.stories.push(s);
    g.latest = s.created_at;
    if (s.author_id !== me && !viewed.has(s.id)) g.unseen++;
  }
  const rank = (g: Group) => (g.mine ? 0 : g.unseen > 0 ? 1 : 2);
  return [...by.values()].sort((a, b) => rank(a) - rank(b) || (a.latest < b.latest ? 1 : a.latest > b.latest ? -1 : 0));
}

/** Index to start playing from: the first story I have not seen, else 0. */
export function firstUnseen(g: Group, viewed: ReadonlySet<string>): number {
  if (g.mine) return 0;
  const i = g.stories.findIndex((s) => !viewed.has(s.id));
  return i < 0 ? 0 : i;
}

export function ageLabel(iso: string, now = Date.now()): string {
  const m = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'Just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ago`;
}

export function timeLeftLabel(expiresIso: string, now = Date.now()): string {
  const ms = new Date(expiresIso).getTime() - now;
  if (ms <= 0) return 'Expired';
  const m = Math.ceil(ms / 60000);
  return m < 60 ? `${m} min left` : `${Math.floor(m / 60)} h left`;
}

export const storySummary = (s: Pick<Story, 'kind' | 'content'>) =>
  s.kind === 'text' ? `"${s.content.slice(0, 40)}"` : s.kind === 'image' ? 'Photo' : s.kind === 'video' ? 'Video' : 'Voice status';

/** Auto-advance after this long for text / photo. Video and audio wait for the viewer. */
export const AUTO_ADVANCE_MS = 5000;
export const autoAdvances = (k: StoryKind) => k === 'text' || k === 'image';
