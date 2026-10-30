// Guards against calling a backend function that does not exist, or with wrong argument names.
// Parses the real SQL (backend-reference/supabase) and scans every .rpc() / .from() call in src/ and app/.
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(p, 'utf8');
const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? (['node_modules', '.expo', 'dist'].includes(e.name) ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);

const sqlDir = path.join(root, 'backend-reference/supabase');
const addDir = path.join(root, 'backend-additions');   // new SQL this mobile app asks you to run (additive only)
const sql = [sqlDir, addDir].flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.sql')).sort().map((f) => read(path.join(d, f)))).join('\n');

const fnParams = new Map<string, string[]>();
for (const m of sql.matchAll(/create (?:or replace )?function public\.(\w+)\(([^)]*)\)/gi)) {
  const params = m[2].split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean);
  fnParams.set(m[1], params);
}
const tables = new Set([...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]));

/** split on commas that are not nested in (), [] or {} */
function topLevelKeys(src: string): string[] {
  const keys: string[] = []; let depth = 0; let cur = '';
  for (const ch of src + ',') {
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) { const k = cur.split(':')[0].trim(); if (k) keys.push(k); cur = ''; } else cur += ch;
  }
  return keys;
}

const files = [...walk(path.join(root, 'src')), ...walk(path.join(root, 'app'))].filter((f) => /\.tsx?$/.test(f));
const code = files.map((f) => ({ f: path.relative(root, f), s: read(f) }));

describe('backend contract', () => {
  it('parsed the backend reference', () => {
    expect(fnParams.size).toBeGreaterThan(40);
    expect(tables.has('messages')).toBe(true);
  });

  it('every rpc() call targets a real function with real argument names', () => {
    let seen = 0; const problems: string[] = [];
    for (const { f, s } of code) {
      for (const m of s.matchAll(/\.rpc\(\s*'(\w+)'\s*(?:,\s*\{([^}]*)\})?/g)) {
        seen++;
        const params = fnParams.get(m[1]);
        if (!params) { problems.push(`${f}: rpc '${m[1]}' does not exist`); continue; }
        for (const k of m[2] ? topLevelKeys(m[2]) : []) if (!params.includes(k)) problems.push(`${f}: rpc '${m[1]}' has no parameter '${k}' (has: ${params.join(', ')})`);
      }
    }
    expect(seen).toBeGreaterThan(10);
    expect(problems).toEqual([]);
  });

  it('every from() call targets a real table', () => {
    let seen = 0; const problems: string[] = [];
    for (const { f, s } of code) {
      for (const m of s.matchAll(/(?<!storage)\.from\(\s*'(\w+)'\s*\)/g)) {
        seen++;
        if (!tables.has(m[1])) problems.push(`${f}: table '${m[1]}' not found`);
      }
    }
    expect(seen).toBeGreaterThan(5);
    expect(problems).toEqual([]);
  });

  it('never writes to room_reads directly (revoked; only mark_room_read works)', () => {
    for (const { f, s } of code) expect([f, /from\('room_reads'\)/.test(s)]).toEqual([f, false]);
  });

  it('reaction list matches the server allow-list exactly', () => {
    const m = sql.match(/reaction_allowed\(p_emoji text\)[\s\S]*?array\[([\s\S]*?)\]\s*\)/)!;
    const server = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ALLOWED_REACTIONS, QUICK_REACTIONS } = require('@/features/chat/emojis');
    expect(ALLOWED_REACTIONS).toEqual(server);
    for (const q of QUICK_REACTIONS) expect(server).toContain(q);
  });

  it('every storage bucket used exists, and profile updates only touch granted columns', () => {
    const buckets = new Set([...sql.matchAll(/insert into storage\.buckets[\s\S]*?values([\s\S]*?)on conflict/gi)]
      .flatMap((m) => [...m[1].matchAll(/\(\s*'(\w+)'\s*,/g)].map((x) => x[1])));
    expect([...buckets].sort()).toEqual(expect.arrayContaining(['avatars', 'media', 'stories']));
    const used: string[] = []; const problems: string[] = [];
    for (const { f, s } of code) for (const m of s.matchAll(/storage\.from\(\s*'(\w+)'\s*\)/g)) { used.push(m[1]); if (!buckets.has(m[1])) problems.push(`${f}: bucket '${m[1]}' not found`); }
    expect(used.length).toBeGreaterThan(3);
    expect(problems).toEqual([]);
    const grants = [...sql.matchAll(/grant update \(([^)]*)\) on public\.profiles/gi)];   // later migrations replace earlier grants
    const grant = grants.length ? grants[grants.length - 1][1].split(',').map((x) => x.trim()) : [];
    expect(grant).toEqual(expect.arrayContaining(['username', 'bio', 'avatar_path']));
    for (const { f, s } of code) for (const m of s.matchAll(/from\('profiles'\)\s*\.update\(\s*\{([^}]*)\}/g))
      for (const k of topLevelKeys(m[1])) if (!grant.includes(k.replace(/^\.\.\./, ''))) problems.push(`${f}: profiles.update column '${k}' is not granted`);
    expect(problems).toEqual([]);
  });

  it('column lists written to tables with column-level insert grants (stories) match the SQL', () => {
    const lastGrant = (table: string, verb: string) => {
      const all = [...sql.matchAll(new RegExp(`grant ${verb} \\(([^)]*)\\)\\s+on public\\.${table}`, 'gi'))];
      return all.length ? all[all.length - 1][1].split(',').map((x) => x.trim()) : [];
    };
    /** The text between the braces of the object literal that starts at `open` (balanced, so ${...} inside is fine). */
    const balanced = (src: string, open: number) => {
      let depth = 0;
      for (let k = open; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0) return src.slice(open + 1, k); }
      return '';
    };
    const problems: string[] = []; let checked = 0;
    for (const { f, s } of code) {
      for (const table of ['stories', 'messages']) {
        const granted = lastGrant(table, 'insert');
        if (!granted.length) continue;   // table-level grant (messages): row-level security decides, no column list to check
        for (const m of s.matchAll(new RegExp(`from\\('${table}'\\)\\s*\\.insert\\(\\s*(?=\\{)`, 'g'))) {
          const body = balanced(s, m.index! + m[0].length);
          for (const k of topLevelKeys(body)) { checked++; const key = k.replace(/^\.\.\./, ''); if (/^[a-z_]+$/.test(key) && !granted.includes(key)) problems.push(`${f}: ${table}.insert column '${key}' is not granted`); }
        }
      }
    }
    expect(lastGrant('stories', 'insert')).toEqual(expect.arrayContaining(['author_id', 'kind', 'content', 'bg', 'attachment_path']));
    expect(checked).toBeGreaterThan(8);
    expect(problems).toEqual([]);
  });
});
