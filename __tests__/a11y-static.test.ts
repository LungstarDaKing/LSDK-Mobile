import fs from 'fs';
import path from 'path';

function walk(d: string): string[] {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.tsx') ? [p] : [];
  });
}
const files = [...walk('app'), ...walk('src')];

describe('static accessibility rules (cannot replace VoiceOver/TalkBack testing)', () => {
  it('every TextInput has an accessibilityLabel (or spreads one in)', () => {
    const bad: string[] = [];
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8');
      for (const m of t.matchAll(/<TextInput\b([\s\S]*?)\/?>/g)) {
        if (!/accessibilityLabel/.test(m[1]) && !/\{\.\.\.p\}/.test(m[1])) bad.push(f);
      }
    }
    expect(bad).toEqual([]);
  });
  it('every Pressable has a label or role, except the documented swallow/tap-zone ones', () => {
    const bad: string[] = [];
    for (const f of files) {
      const t = fs.readFileSync(f, 'utf8');
      for (const m of t.matchAll(/<Pressable\b([^>]*?(?:=>[^>]*?)*)>/g)) {
        if (!/accessibilityLabel|accessibilityRole/.test(m[1])) bad.push(f);
      }
    }
    // status viewer tap zones (hidden from screen readers, buttons exist separately) + dialog inner swallow
    expect(bad.sort()).toEqual([path.join('app', 'status', '[authorId].tsx'), path.join('app', 'status', '[authorId].tsx'), path.join('src', 'components', 'dialogs.tsx')].sort());
  });
});
