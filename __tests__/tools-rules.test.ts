import { cleanCollection, groupByCollection, hoursFromNow, previewText, quickTimes, validateSearch, whenLabel } from '@/features/tools/rules';

describe('tools rules', () => {
  test('previewText: deleted, file, voice note, long text', () => {
    expect(previewText(null)).toBe('Message deleted');
    expect(previewText({ content: ' hi   there ' })).toBe('hi there');
    expect(previewText({ attachment_name: 'voice-note-1.m4a' })).toBe('🎤 Voice note');
    expect(previewText({ attachment_name: 'a.pdf', content: 'see' })).toBe('📎 a.pdf see');
    expect(previewText({ content: 'x'.repeat(200) }, 20)).toHaveLength(20);
    expect(previewText({ content: '' })).toBe('(empty)');
  });
  test('cleanCollection defaults and limits', () => {
    expect(cleanCollection('  ')).toEqual({ ok: true, value: 'Saved' });
    expect(cleanCollection('Recipes')).toEqual({ ok: true, value: 'Recipes' });
    expect(cleanCollection('x'.repeat(31)).ok).toBe(false);
  });
  test('validateSearch mirrors the SQL rules', () => {
    expect(validateSearch('a', 'text')).toMatch(/at least 2/);
    expect(validateSearch('', 'files')).toBeNull();
    expect(validateSearch('x'.repeat(101), 'links')).toMatch(/too long/);
    expect(validateSearch('ok', 'text')).toBeNull();
  });
  test('quickTimes: evening only offered before 17:00; all in the future', () => {
    const morning = new Date(2026, 9, 25, 9, 0); const night = new Date(2026, 9, 25, 20, 0);
    expect(quickTimes(morning).map((q) => q.label)).toEqual(['In 1 hour', 'This evening (18:00)', 'Tomorrow morning (08:00)']);
    expect(quickTimes(night).map((q) => q.label)).toEqual(['In 1 hour', 'Tomorrow morning (08:00)']);
    for (const q of quickTimes(morning)) expect(q.date.getTime()).toBeGreaterThan(morning.getTime());
    for (const q of quickTimes(night)) expect(q.date.getTime()).toBeGreaterThan(night.getTime());
    expect(quickTimes(night)[1].date.getDate()).toBe(26);
  });
  test('hoursFromNow accepts decimals and commas, rejects junk, zero, too far', () => {
    const now = new Date(2026, 9, 25, 9, 0);
    const r = hoursFromNow('1,5', now); expect(r.ok && r.date.getTime() - now.getTime()).toBe(5_400_000);
    for (const bad of ['', 'abc', '0', '-2', '0.001', '9000']) expect(hoursFromNow(bad, now).ok).toBe(false);
  });
  test('whenLabel', () => {
    const now = new Date(2026, 9, 25, 9, 0).getTime();
    expect(whenLabel(new Date(now - 1000).toISOString(), now)).toBe('Due now');
    expect(whenLabel(new Date(now + 3_600_000).toISOString(), now)).toMatch(/^Today \d\d:\d\d$/);
    expect(whenLabel(new Date(now + 30 * 3_600_000).toISOString(), now)).toMatch(/^Tomorrow /);
  });
  test('groupByCollection sorts names and keeps order inside', () => {
    const g = groupByCollection([{ collection: 'b', n: 1 }, { collection: 'a', n: 2 }, { collection: 'b', n: 3 }]);
    expect(g.map((x) => x.name)).toEqual(['a', 'b']); expect(g[1].items.map((i) => i.n)).toEqual([1, 3]);
  });
});
