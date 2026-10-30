import { AUTO_ADVANCE_MS, STORY_BGS, ageLabel, autoAdvances, bgColor, firstUnseen, groupStories, isLive, timeLeftLabel, type Story } from '@/features/status/stories';

const NOW = Date.parse('2026-10-22T10:00:00Z');
const t = (minAgo: number) => new Date(NOW - minAgo * 60000).toISOString();
const st = (id: string, author: string, minAgo: number, over: Partial<Story> = {}): Story => ({
  id, author_id: author, kind: 'text', content: id, bg: 0, attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null,
  reported: false, created_at: t(minAgo), expires_at: new Date(NOW - minAgo * 60000 + 24 * 3600000).toISOString(), profiles: { username: author, avatar_path: null }, ...over,
});

describe('groupStories', () => {
  const list = [st('a1', 'amy', 300), st('b1', 'bob', 200), st('b2', 'bob', 20), st('m1', 'me', 100), st('c1', 'cy', 50)];
  it('puts me first, then people with unseen statuses, then seen ones', () => {
    const g = groupStories(list, 'me', new Set(['a1']), NOW);
    expect(g.map((x) => x.authorId)).toEqual(['me', 'bob', 'cy', 'amy']);   // unseen newest first (bob 20 min, cy 50 min), then amy (all seen)
  });
  it('orders stories oldest to newest inside a group and counts unseen', () => {
    const bob = groupStories(list, 'me', new Set(['b1']), NOW).find((x) => x.authorId === 'bob')!;
    expect(bob.stories.map((s) => s.id)).toEqual(['b1', 'b2']);
    expect(bob.unseen).toBe(1);
    expect(firstUnseen(bob, new Set(['b1']))).toBe(1);
  });
  it('never counts my own statuses as unseen and starts mine at 0', () => {
    const me = groupStories(list, 'me', new Set(), NOW)[0];
    expect(me.mine).toBe(true); expect(me.unseen).toBe(0); expect(firstUnseen(me, new Set())).toBe(0);
  });
  it('drops expired statuses', () => {
    const old = st('x', 'amy', 25 * 60);
    expect(isLive(old, NOW)).toBe(false);
    expect(groupStories([old], 'me', new Set(), NOW)).toEqual([]);
  });
  it('all seen starts from the first story', () => {
    const g = groupStories(list, 'me', new Set(['b1', 'b2']), NOW).find((x) => x.authorId === 'bob')!;
    expect(firstUnseen(g, new Set(['b1', 'b2']))).toBe(0);
  });
});

describe('labels and constants', () => {
  it('ageLabel', () => { expect(ageLabel(t(0), NOW)).toBe('Just now'); expect(ageLabel(t(5), NOW)).toBe('5 min ago'); expect(ageLabel(t(125), NOW)).toBe('2 h ago'); });
  it('timeLeftLabel', () => {
    expect(timeLeftLabel(new Date(NOW + 30 * 60000).toISOString(), NOW)).toBe('30 min left');
    expect(timeLeftLabel(new Date(NOW + 5 * 3600000).toISOString(), NOW)).toBe('5 h left');
    expect(timeLeftLabel(new Date(NOW - 1).toISOString(), NOW)).toBe('Expired');
  });
  it('bgColor wraps safely and 8 colours exist', () => { expect(STORY_BGS.length).toBe(8); expect(bgColor(null)).toBe(STORY_BGS[0]); expect(bgColor(9)).toBe(STORY_BGS[1]); expect(bgColor(-1)).toBe(STORY_BGS[7]); });
  it('every text-status background has >= 4.5:1 contrast with white text', () => {
    const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    for (const bg of STORY_BGS) expect(1.05 / (lum(bg) + 0.05)).toBeGreaterThanOrEqual(4.5);
  });
  it('only text and photos auto-advance', () => { expect(AUTO_ADVANCE_MS).toBe(5000); expect(autoAdvances('text') && autoAdvances('image')).toBe(true); expect(autoAdvances('video') || autoAdvances('audio')).toBe(false); });
});
