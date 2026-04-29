// tests/phase16.7-expense-report-flow-simulate.test.js — Phase 16.7 Rule I
//
// Full-flow simulate: master-data → filter rail → orchestrator → all 3
// rendered sections. Verifies branch isolation + reconciliation between
// section sums + summary tile values.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/dfPayoutAggregator.js', () => ({
  computeDfPayoutReport: ({ doctors }) => ({
    rows: (doctors || [])
      .filter(d => d.position === 'แพทย์' || d.position === 'ผู้ช่วยแพทย์')
      .map(d => ({
        doctorId: d.id,
        doctorName: d.name || d.id,
        totalDf: d.position === 'แพทย์' ? 1000 : 500,
        lineCount: 1,
        saleCount: 1,
      })),
    summary: { total: 0, doctorCount: 0, lineCount: 0, saleCount: 0 },
  }),
}));

import { composeExpenseReportSnapshot } from '../src/lib/expenseReportAggregator.js';

const fixturesMultibranch = () => ({
  expenses: [
    // BR-A
    { id: 'e1', date: '2026-04-10', amount: 500, branchId: 'BR-A', status: 'active', categoryName: 'ค่านั่งแพทย์', userId: 'D-1' },
    { id: 'e2', date: '2026-04-11', amount: 30000, branchId: 'BR-A', status: 'active', categoryName: 'เงินเดือน', userId: 'D-1' },
    { id: 'e3', date: '2026-04-15', amount: 25000, branchId: 'BR-A', status: 'active', categoryName: 'เงินเดือน', userId: 'S-1' },
    // BR-B
    { id: 'e4', date: '2026-04-20', amount: 200,  branchId: 'BR-B', status: 'active', categoryName: 'Lab' },
    { id: 'e5', date: '2026-04-22', amount: 1000, branchId: 'BR-B', status: 'active', categoryName: 'ค่ามือ', userId: 'A-2' },
  ],
  doctors: [
    { id: 'D-1', name: 'หมอ ก', position: 'แพทย์' },
    { id: 'A-1', name: 'ผู้ช่วย ก (BR-A)', position: 'ผู้ช่วยแพทย์' },
    { id: 'A-2', name: 'ผู้ช่วย ข (BR-B)', position: 'ผู้ช่วยแพทย์' },
  ],
  staff: [
    { id: 'S-1', firstname: 'พนักงาน', lastname: 'A', position: 'รีเซฟชั่น' },
  ],
  sales: [
    { id: 'S1', saleDate: '2026-04-10', billing: { netTotal: 5000 }, branchId: 'BR-A' },
    { id: 'S2', saleDate: '2026-04-22', billing: { netTotal: 8000 }, branchId: 'BR-B' },
  ],
  treatments: [
    { id: 'T1', detail: { linkedSaleId: 'S1', doctorId: 'D-1', treatmentDate: '2026-04-10' } },
    { id: 'T2', detail: { linkedSaleId: 'S2', doctorId: 'A-2', treatmentDate: '2026-04-22' } },
  ],
  categories: [],
  dfGroups: [],
  dfStaffRates: [],
});

describe('FE.A — global view (no branch filter)', () => {
  it('FE.A.1 — all 3 sections populated', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.sections.doctors.length).toBeGreaterThan(0);
    expect(snap.sections.staff.length).toBeGreaterThan(0);
    expect(snap.sections.categories.length).toBeGreaterThan(0);
  });

  it('FE.A.2 — summary tiles reconcile with section totals', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30' });
    const docTotal = snap.sections.doctors.reduce((s, r) => s + r.total, 0);
    expect(snap.summary.totalDoctor).toBe(docTotal);
    const staffTotal = snap.sections.staff.reduce((s, r) => s + r.total, 0);
    expect(snap.summary.totalStaff).toBe(staffTotal);
  });

  it('FE.A.3 — categories sum reconciles with totalAll', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30' });
    const catTotal = snap.sections.categories.reduce((s, r) => s + r.total, 0);
    expect(snap.summary.totalCategory).toBe(catTotal);
    expect(snap.summary.totalAll).toBe(catTotal);
  });
});

describe('FE.B — branch filter isolation', () => {
  it('FE.B.1 — branchIds=["BR-A"] excludes BR-B expenses', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] });
    // BR-A expenses: e1 (500) + e2 (30000) + e3 (25000) = 55,500
    expect(snap.summary.totalCategory).toBe(55500);
    // No Lab category (Lab was BR-B only)
    expect(snap.sections.categories.find(c => c.categoryName === 'Lab')).toBeUndefined();
  });

  it('FE.B.2 — branchIds=["BR-B"] only Lab + ค่ามือ', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-B'] });
    expect(snap.summary.totalCategory).toBe(1200); // 200 + 1000
    expect(snap.sections.categories).toHaveLength(2);
  });

  it('FE.B.3 — A-2 (BR-B assistant) has DF + manual ค่ามือ when filtered to BR-B', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-B'] });
    const a2 = snap.sections.staff.find(r => r.id === 'A-2');
    expect(a2.df).toBe(1500); // 500 (dfPayout mock) + 1000 (e5 ค่ามือ)
  });
});

describe('FE.C — adversarial inputs', () => {
  it('FE.C.1 — empty fixtures → all empty sections, all zero summary', () => {
    const snap = composeExpenseReportSnapshot({}, {});
    expect(snap.sections.doctors).toEqual([]);
    expect(snap.sections.staff).toEqual([]);
    expect(snap.sections.categories).toEqual([]);
    expect(snap.summary.totalAll).toBe(0);
  });

  it('FE.C.2 — null filter does not throw', () => {
    expect(() => composeExpenseReportSnapshot(fixturesMultibranch())).not.toThrow();
  });

  it('FE.C.3 — void expenses excluded from all sections', () => {
    const fix = fixturesMultibranch();
    fix.expenses.push({ id: 'eVOID', date: '2026-04-25', amount: 99999, branchId: 'BR-A', status: 'void', categoryName: 'Lab', userId: 'D-1' });
    const snap = composeExpenseReportSnapshot(fix, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.summary.totalAll).not.toContain(99999);
    expect(snap.sections.categories.find(c => c.categoryName === 'Lab')?.total || 0).toBe(200);
  });

  it('FE.C.4 — out-of-range date excluded', () => {
    const fix = fixturesMultibranch();
    fix.expenses.push({ id: 'eOLD', date: '2025-01-01', amount: 99999, branchId: 'BR-A', status: 'active', categoryName: 'Old', userId: 'D-1' });
    const snap = composeExpenseReportSnapshot(fix, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.sections.categories.find(c => c.categoryName === 'Old')).toBeUndefined();
  });
});

describe('FE.D — V14 invariants + meta', () => {
  it('FE.D.1 — no undefined leaves', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30' });
    const s = JSON.stringify(snap);
    expect(s).not.toMatch(/:\s*undefined/);
  });

  it('FE.D.2 — meta.sourceCounts present', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.meta.sourceCounts).toBeTruthy();
    expect(snap.meta.sourceCounts.expenses).toBeGreaterThan(0);
  });

  it('FE.D.3 — sections sorted desc by total / count', () => {
    const snap = composeExpenseReportSnapshot(fixturesMultibranch(), { from: '2026-04-01', to: '2026-04-30' });
    for (let i = 0; i < snap.sections.doctors.length - 1; i++) {
      expect(snap.sections.doctors[i].total).toBeGreaterThanOrEqual(snap.sections.doctors[i + 1].total);
    }
    for (let i = 0; i < snap.sections.staff.length - 1; i++) {
      expect(snap.sections.staff[i].total).toBeGreaterThanOrEqual(snap.sections.staff[i + 1].total);
    }
    for (let i = 0; i < snap.sections.categories.length - 1; i++) {
      expect(snap.sections.categories[i].total).toBeGreaterThanOrEqual(snap.sections.categories[i + 1].total);
    }
  });
});

describe('FE.E — Source-grep regression guards', () => {
  it('FE.E.1 — aggregator imports loadTreatmentsByDateRange (DF needs treatments)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    expect(src).toMatch(/loadTreatmentsByDateRange/);
  });

  it('FE.E.2 — aggregator does not import master_data', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    expect(src).not.toMatch(/master_data/);
  });

  it('FE.E.3 — aggregator does not import brokerClient', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    expect(src).not.toMatch(/brokerClient/);
  });

  it('FE.E.4 — helpers stay pure (no firestore imports)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportHelpers.js', 'utf-8');
    expect(src).not.toMatch(/firebase\/firestore/);
    expect(src).not.toMatch(/from ['"]\.\.\/firebase\.js['"]/);
  });

  it('FE.E.5 — useExpenseReport hook exists with cache pattern', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/hooks/useExpenseReport.js', 'utf-8');
    expect(src).toMatch(/cacheRef\s*=\s*useRef/);
    expect(src).toMatch(/expenseReportAggregator/);
  });
});
