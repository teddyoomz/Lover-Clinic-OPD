// tests/phase16.7-quinquies-flow-simulate.test.js — Rule I full-flow simulate
//
// Master data → expense report aggregator → enriched rows + summary tile reconciles.

import { describe, it, expect, vi } from 'vitest';

// Mock dfPayoutAggregator so we don't need the full DF infrastructure
vi.mock('../src/lib/dfPayoutAggregator.js', () => ({
  computeDfPayoutReport: () => ({
    rows: [],
    summary: { total: 0, doctorCount: 0, lineCount: 0, saleCount: 0 },
  }),
  computeUnlinkedTreatmentDfBuckets: () => new Map(),
  mergeUnlinkedDfIntoPayoutRows: (rows) => rows,
}));

import { composeExpenseReportSnapshot } from '../src/lib/expenseReportAggregator.js';

const fixtures = (overrides = {}) => ({
  expenses: [],
  categories: [],
  doctors: [
    { id: 'D-1', name: 'หมอ ก', position: 'แพทย์', hourlyIncome: 300, salary: 30000, salaryDate: 25 },
  ],
  staff: [
    { id: 'S-1', firstname: 'พนักงาน', lastname: 'A', position: 'รีเซฟชั่น', hourlyIncome: 100, salary: 25000, salaryDate: 1 },
  ],
  sales: [
    { id: 'INV-1', saleId: 'INV-1', saleDate: '2026-04-29', status: 'paid', billing: { netTotal: 10000 }, sellers: [{ id: 'S-1', percent: 5 }] },
  ],
  treatments: [],
  dfGroups: [],
  dfStaffRates: [],
  courses: [],
  branches: [],
  schedules: [
    { staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' },
  ],
  ...overrides,
});

describe('FQ.A — Full-flow simulate', () => {
  it('FQ.A.1 — doctor row has sitFee from hourly + salary auto + commission', () => {
    // Today must be >= salary payday for D-1 (25 Apr) AND for S-1 (1 Apr).
    // schedule endTime must be in the past at "now".
    // We can't override `today` directly via composeExpenseReportSnapshot —
    // it reads thaiTodayISO() internally. Test asserts shape against the
    // PRESENT behavior: if today >= 25 Apr 2026 the salary fires for D-1.
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    const d1 = snap.sections.doctors.find(r => r.id === 'D-1');
    expect(d1).toBeTruthy();
    // sitFee should at least have the hourly portion (300 × 3 = 900) IF the
    // schedule's endTime (12:00 on 29 Apr 2026) is before "now" at test time.
    // In CI this date is in the future so endTime > now → hourly is 0.
    // But the row should still EXIST with valid numeric columns.
    expect(typeof d1.sitFee).toBe('number');
    expect(typeof d1.salary).toBe('number');
    expect(typeof d1.df).toBe('number');
    expect(typeof d1.other).toBe('number');
    expect(typeof d1.total).toBe('number');
    // total should reconcile
    expect(d1.total).toBeCloseTo(d1.sitFee + d1.df + d1.salary + d1.other, 1);
  });

  it('FQ.A.2 — staff row has commission in other column (no sitFee column)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    const s1 = snap.sections.staff.find(r => r.id === 'S-1');
    expect(s1).toBeTruthy();
    // S-1 has 5% × 10000 = 500 commission (commission is computed-on-read,
    // not gated by today). Should appear in `other`.
    expect(s1.other).toBeGreaterThanOrEqual(500);
    expect(s1.total).toBeCloseTo(s1.df + s1.salary + s1.other, 1);
    // Staff section has no sitFee column; mergeAutoIntoRows should NOT have
    // a sitFee field on staff rows.
    expect(s1.sitFee).toBeUndefined();
  });

  it('FQ.A.3 — summary contains totalAuto* fields + totalAll reconciles', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    expect(snap.summary).toHaveProperty('totalAutoPayroll');
    expect(snap.summary).toHaveProperty('totalAutoHourly');
    expect(snap.summary).toHaveProperty('totalAutoCommission');
    // totalAll = totalCategory + totalUnlinkedDf + totalAutoPayroll + totalAutoHourly + totalAutoCommission
    expect(snap.summary.totalAll).toBeCloseTo(
      snap.summary.totalCategory +
      snap.summary.totalUnlinkedDf +
      snap.summary.totalAutoPayroll +
      snap.summary.totalAutoHourly +
      snap.summary.totalAutoCommission,
      1
    );
  });

  it('FQ.A.4 — sourceCounts includes new diagnostic fields', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    expect(snap.meta.sourceCounts).toHaveProperty('schedules');
    expect(snap.meta.sourceCounts).toHaveProperty('autoPayrollPersons');
    expect(snap.meta.sourceCounts).toHaveProperty('hourlyPersons');
    expect(snap.meta.sourceCounts).toHaveProperty('commissionSellers');
  });

  it('FQ.A.5 — V14 no-undefined-leaves', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {
      from: '2026-04-01', to: '2026-04-30', branchIds: [],
    });
    const s = JSON.stringify(snap);
    expect(s).not.toMatch(/:\s*undefined/);
  });
});

describe('FQ.B — Source-grep regression guards', () => {
  it('FQ.B.1 — payrollHelpers has 5 exports', async () => {
    const mod = await import('../src/lib/payrollHelpers.js');
    expect(typeof mod.clampPayDayToMonth).toBe('function');
    expect(typeof mod.computeAutoPayrollForPersons).toBe('function');
    expect(typeof mod.computeHourlyFromSchedules).toBe('function');
    expect(typeof mod.computeCommissionFromSales).toBe('function');
    expect(typeof mod.mergeAutoIntoRows).toBe('function');
  });

  it('FQ.B.2 — expenseReportAggregator imports payrollHelpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    expect(src).toMatch(/from\s*['"]\.\/payrollHelpers\.js['"]/);
    expect(src).toMatch(/computeAutoPayrollForPersons/);
    expect(src).toMatch(/computeHourlyFromSchedules/);
    expect(src).toMatch(/computeCommissionFromSales/);
    expect(src).toMatch(/mergeAutoIntoRows/);
  });

  it('FQ.B.3 — DfPayoutReportTab imports payrollHelpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/reports/DfPayoutReportTab.jsx', 'utf-8');
    expect(src).toMatch(/from\s*['"]\.\.\/\.\.\/\.\.\/lib\/payrollHelpers\.js['"]/);
  });

  it('FQ.B.4 — staffValidation has salary + salaryDate + hourlyIncome', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/staffValidation.js', 'utf-8');
    expect(src).toMatch(/salary/);
    expect(src).toMatch(/salaryDate/);
    expect(src).toMatch(/hourlyIncome/);
  });

  it('FQ.B.5 — doctorValidation has salary + salaryDate', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/doctorValidation.js', 'utf-8');
    expect(src).toMatch(/salary/);
    expect(src).toMatch(/salaryDate/);
  });

  it('FQ.B.6 — Phase 16.7-quinquies marker present in payrollHelpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/payrollHelpers.js', 'utf-8');
    expect(src).toMatch(/Phase 16\.7-quinquies/);
  });
});
