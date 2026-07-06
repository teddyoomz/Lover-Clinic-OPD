// Perf harness — pure-helper unit tests (P0 Task 1+3, plan 2026-07-06-performance-audit-optimization)
// Locks: median math, surface catalog completeness (ids must match navConfig tab ids),
// per-metric median aggregation, pixel-diff ratio math.
import { describe, it, expect } from 'vitest';
import { median, SURFACES, aggregateRuns } from '../scripts/perf-lib.mjs';

describe('perf-lib', () => {
  it('median of odd/even/single', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([7])).toBe(7);
  });

  it('SURFACES covers every app area with real navConfig tab ids', () => {
    const ids = SURFACES.map((s) => s.id);
    for (const need of [
      'frontend-queue',
      'backend-home',
      'backend-tab-sales',
      'backend-tab-customers',
      'backend-tab-stock',
      'backend-tab-appointment-all',
      'backend-tab-reports',
      'link-schedule',
      'link-filler',
    ]) {
      expect(ids).toContain(need);
    }
    for (const s of SURFACES) {
      expect(s.url).toBeTypeOf('string');
      expect(typeof s.auth).toBe('boolean');
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
    }
    // no duplicate ids
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('SURFACES backend tab ids exist in navConfig (anti-drift)', async () => {
    const { readFileSync } = await import('fs');
    const nav = readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
    for (const s of SURFACES) {
      const m = s.url.match(/[?&]tab=([a-z0-9-]+)/);
      if (!m) continue;
      expect(nav, `tab id "${m[1]}" (surface ${s.id}) missing from navConfig.js`).toContain(`id: '${m[1]}'`);
    }
  });

  it('aggregateRuns takes per-metric median', () => {
    const out = aggregateRuns([
      { a: 1, b: 10 },
      { a: 3, b: 30 },
      { a: 2, b: 20 },
    ]);
    expect(out).toEqual({ a: 2, b: 20 });
  });

  it('aggregateRuns tolerates a missing metric in one run', () => {
    const out = aggregateRuns([{ a: 1 }, { a: 3, b: 30 }, { a: 2, b: 20 }]);
    expect(out.a).toBe(2);
    expect(out.b).toBe(20); // missing → 0, median of [0,30,20] = 20
  });
});

describe('perf-visual-parity diffRatio', () => {
  it('identical buffers → 0; one-channel jump > tol → counted', async () => {
    const { diffRatio } = await import('../scripts/perf-visual-parity.mjs');
    const w = 2, h = 1, ch = 3;
    const a = Buffer.from([10, 10, 10, 200, 200, 200]);
    const b = Buffer.from([10, 10, 10, 200, 200, 200]);
    expect(diffRatio(a, b, w, h, ch, 24)).toBe(0);
    const c = Buffer.from([10, 10, 10, 100, 200, 200]); // pixel 2 red Δ=100 > 24
    expect(diffRatio(a, c, w, h, ch, 24)).toBe(0.5);
  });

  it('sub-tolerance drift not counted (anti-aliasing allowance)', async () => {
    const { diffRatio } = await import('../scripts/perf-visual-parity.mjs');
    const a = Buffer.from([100, 100, 100]);
    const b = Buffer.from([110, 95, 108]); // all Δ ≤ 24
    expect(diffRatio(a, b, 1, 1, 3, 24)).toBe(0);
  });
});
