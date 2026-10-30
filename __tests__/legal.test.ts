import fs from 'fs';
import { DOCS } from '../src/features/legal/docs';
process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_KEY = 'sb_publishable_test';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { env } = require('../src/lib/env') as typeof import('../src/lib/env');

describe('legal text', () => {
  for (const name of ['terms', 'privacy', 'disclosures'] as const) {
    it(`${name} has sections and no unfilled placeholders`, () => {
      const s = DOCS[name].body();
      expect(s.length).toBeGreaterThan(5);
      const all = JSON.stringify(s);
      expect(all).not.toMatch(/\[(operator name|contact email|jurisdiction|data region) not set\]|undefined|REPLACE_/);
      if (name !== 'disclosures') expect(all).toContain('mthethwalungelo43@gmail.com');
    });
  }
  it('mobile notes are part of privacy and disclosures', () => {
    expect(JSON.stringify(DOCS.privacy.body())).toContain('push token');
    expect(JSON.stringify(DOCS.disclosures.body())).toContain('push token');
  });
  it('terms version matches the website version.js when that file is present', () => {
    expect(env.termsVersion).toBe('2026-10-22');
    const web = '/tmp/claude-0/web/LSDKChat/src/version.js';
    if (fs.existsSync(web)) expect(fs.readFileSync(web, 'utf8')).toContain(env.termsVersion);
  });
});
