// tests/phase16.7-quater-seller-percent-fix.test.js — Phase 16.7-quater (2026-04-29 session 33)
//
// dfPayoutAggregator fallback path schema robustness:
//   1. Accept seller.id ALONGSIDE seller.sellerId (production data uses .id;
//      pre-fix the filter `s && s.sellerId` rejected every such seller).
//   2. Accept seller.share (0..1) ALONGSIDE seller.percent (0..100).
//   3. When the sum of explicit percents/shares is ZERO but sellers exist,
//      fall back to EQUAL SPLIT (1/N) — 43 of 57 April sales had all-zero
//      percents in the user's preview_eval-verified data.
//
// These changes are PREVENTIVE — improve the aggregator's robustness without
// changing the user's specific scenario (sellers in their data are be_staff
// who don't have DF rates configured at all). Test bank locks the fix shape
// so future master-data drift can't silently regress to ฿0 fallback.

import { describe, it, expect } from 'vitest';
import { computeDfPayoutReport } from '../src/lib/dfPayoutAggregator.js';

const baseDoctor = (id, name) => ({ id, name, defaultDfGroupId: 'GRP-A' });
const baseGroup = (rates) => ({ id: 'GRP-A', rates });

describe('SP.A — seller.id recognized as alternative to seller.sellerId', () => {
  const doctors = [baseDoctor('D-1', 'หมอ A')];
  const groups = [baseGroup([{ courseId: 'C-1', value: 10, type: 'percent' }])];

  it('SP.A.1 — sale.sellers[].id (no sellerId) resolves DF', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      status: 'paid',
      sellers: [{ id: 'D-1', percent: 100 }],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].doctorId).toBe('D-1');
    expect(out.rows[0].totalDf).toBeCloseTo(100, 1); // 10% of 1000
  });

  it('SP.A.2 — both sellerId AND id present → sellerId wins', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      sellers: [{ sellerId: 'D-1', id: 'OTHER', percent: 100 }],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows[0].doctorId).toBe('D-1');
  });
});

describe('SP.B — equal-split fallback when percents sum to 0', () => {
  const doctors = [baseDoctor('D-1', 'หมอ A'), baseDoctor('D-2', 'หมอ B')];
  const groups = [baseGroup([{ courseId: 'C-1', value: 10, type: 'percent' }])];

  it('SP.B.1 — single seller with percent="0" → 100% to that seller', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      sellers: [{ id: 'D-1', percent: '0' }],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows[0].doctorId).toBe('D-1');
    expect(out.rows[0].totalDf).toBeCloseTo(100, 1); // full 10% of 1000 (1/1 share)
  });

  it('SP.B.2 — two sellers with percent="0" each → equal split (50% each)', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      sellers: [
        { id: 'D-1', percent: 0 },
        { id: 'D-2', percent: 0 },
      ],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows).toHaveLength(2);
    // 10% of 1000 = 100; split 50/50 = 50 each
    const d1 = out.rows.find(r => r.doctorId === 'D-1');
    const d2 = out.rows.find(r => r.doctorId === 'D-2');
    expect(d1.totalDf).toBeCloseTo(50, 1);
    expect(d2.totalDf).toBeCloseTo(50, 1);
  });

  it('SP.B.3 — explicit non-zero percents respected (no equal split fallback)', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      sellers: [
        { id: 'D-1', percent: 75 },
        { id: 'D-2', percent: 25 },
      ],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    const d1 = out.rows.find(r => r.doctorId === 'D-1');
    const d2 = out.rows.find(r => r.doctorId === 'D-2');
    expect(d1.totalDf).toBeCloseTo(75, 1); // 75% of 100 = 75
    expect(d2.totalDf).toBeCloseTo(25, 1);
  });
});

describe('SP.C — seller.share (0..1) accepted alongside seller.percent (0..100)', () => {
  const doctors = [baseDoctor('D-1', 'หมอ A')];
  const groups = [baseGroup([{ courseId: 'C-1', value: 10, type: 'percent' }])];

  it('SP.C.1 — share=1.0 maps to 100% share (DF same as percent=100)', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      sellers: [{ id: 'D-1', share: 1.0 }],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows[0].totalDf).toBeCloseTo(100, 1);
  });

  it('SP.C.2 — share=0.5 → 50% share', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      sellers: [{ id: 'D-1', share: 0.5 }],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows[0].totalDf).toBeCloseTo(50, 1);
  });
});

describe('SP.D — sellers without recognizable id are skipped', () => {
  const doctors = [baseDoctor('D-1', 'หมอ A')];
  const groups = [baseGroup([{ courseId: 'C-1', value: 10, type: 'percent' }])];

  it('SP.D.1 — sellers with neither sellerId nor id are dropped (fallback to sale.doctorId if any)', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      doctorId: 'D-1', // legacy fallback
      sellers: [{ name: 'no id field', percent: 50 }],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].doctorId).toBe('D-1'); // came from sale.doctorId fallback
    expect(out.rows[0].totalDf).toBeCloseTo(100, 1);
  });

  it('SP.D.2 — empty sellers AND no doctorId → sale skipped', () => {
    const sales = [{
      saleId: 'S-1',
      saleDate: '2026-04-15',
      sellers: [],
      items: { courses: [{ courseId: 'C-1', qty: 1, price: 1000 }] },
    }];
    const out = computeDfPayoutReport({ sales, doctors, groups, startDate: '2026-04-01', endDate: '2026-04-30' });
    expect(out.rows).toHaveLength(0);
  });
});

describe('SP.E — Source-grep regression guards', () => {
  it('SP.E.1 — fallback accepts s.sellerId || s.id', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/dfPayoutAggregator.js', 'utf-8');
    expect(src).toMatch(/s\.sellerId\s*\|\|\s*s\.id/);
  });

  it('SP.E.2 — explicitShares supports both percent + share', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/dfPayoutAggregator.js', 'utf-8');
    expect(src).toMatch(/Number\(s\.percent\)/);
    expect(src).toMatch(/Number\(s\.share\)/);
  });

  it('SP.E.3 — equal-split branch when sumShare === 0', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/dfPayoutAggregator.js', 'utf-8');
    expect(src).toMatch(/evenShare\s*=\s*1\s*\/\s*validSellers\.length/);
  });

  it('SP.E.4 — Phase 16.7-quater institutional-memory marker present', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/dfPayoutAggregator.js', 'utf-8');
    expect(src).toMatch(/Phase 16\.7-quater/);
  });
});
