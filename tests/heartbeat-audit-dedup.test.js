// ─── heartbeat-audit-dedup (2026-07-21) ─────────────────────────────────────
// The two high-frequency sweeps (chart-edit */15 + opd-cleanup */30) wrote a
// RANDOM-ID be_admin_audit doc on every run — 144 heartbeat docs/day with no
// retention (~9.5k docs observed on prod after ~2 months), every one re-read
// by the nightly whole-system backup (V122 headroom-erosion class). Both now
// use the deterministic per-day doc-ID pattern recon-daily / infra-health
// already use: one doc/day, counters accumulate via FieldValue.increment.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('HB — per-day deterministic heartbeat docs', () => {
  it('HB1.1 chart-edit-session-sweep: per-day doc id + increment counters, random id gone', () => {
    const src = read('api/cron/chart-edit-session-sweep.js');
    expect(src).toMatch(/doc\(`chart-edit-session-sweep-\$\{dayKey\}`\)/);
    expect(src).toMatch(/runsToday: FieldValue\.increment\(1\)/);
    expect(src).toMatch(/\{ merge: true \}/);
    expect(src).not.toMatch(/randomBytes/);
  });

  it('HB1.2 opd-session-cleanup-sweep: per-day doc id + generic numeric increments, random id gone', () => {
    const src = read('api/cron/opd-session-cleanup-sweep.js');
    expect(src).toMatch(/doc\(`opd-session-cleanup-sweep-\$\{dayKey\}`\)/);
    expect(src).toMatch(/FieldValue\.increment\(v\)/);
    expect(src).not.toMatch(/opd-session-cleanup-sweep-\$\{Date\.now\(\)\}/);
  });

  it('HB1.3 dayKey is Bangkok-anchored (+7h) in both sweeps — no UTC day-boundary split', () => {
    for (const f of ['api/cron/chart-edit-session-sweep.js', 'api/cron/opd-session-cleanup-sweep.js']) {
      expect(read(f)).toMatch(/Date\.now\(\) \+ 7 \* 3600 \* 1000/);
    }
  });

  it('HB1.4 classifier — no OTHER cron writes random-ID heartbeat audit docs on a sub-hourly schedule', () => {
    // Sub-hourly crons (the noise generators) must not mint `${Date.now()}-${randomBytes...}`
    // audit ids. Daily crons writing one audit doc/run are fine (≤1/day each).
    const vercel = JSON.parse(read('vercel.json'));
    const subHourly = (vercel.crons || [])
      .filter((c) => /\*\/\d+ \* \* \* \*/.test(c.schedule)) // e.g. */5, */15, */30 every hour
      .map((c) => c.path.replace('/api/cron/', 'api/cron/') + '.js');
    const offenders = [];
    for (const f of subHourly) {
      let src = '';
      try { src = read(f); } catch { continue; }
      if (/be_admin_audit/.test(src) && /\$\{Date\.now\(\)\}-\$\{randomBytes/.test(src)) offenders.push(f);
    }
    expect(offenders, `sub-hourly crons minting random-ID audit docs: ${offenders.join(', ')}`).toEqual([]);
  });
});
