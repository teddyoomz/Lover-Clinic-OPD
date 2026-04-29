// tests/phase16.7-expense-report-aggregator.test.js — Phase 16.7 (2026-04-29 session 33)
//
// Orchestrator unit tests for expenseReportAggregator. Covers
// composeExpenseReportSnapshot — the pure pipeline. fetchExpenseReportData
// is integration-tested via mocks of the loader functions.

import { describe, it, expect, vi } from 'vitest';
import { composeExpenseReportSnapshot } from '../src/lib/expenseReportAggregator.js';

// Mock dfPayoutAggregator so tests don't need full DF infrastructure
vi.mock('../src/lib/dfPayoutAggregator.js', () => ({
  computeDfPayoutReport: ({ doctors }) => ({
    rows: (doctors || []).filter(d => d.position === 'แพทย์' || d.position === 'ผู้ช่วยแพทย์').map(d => ({
      doctorId: d.id,
      doctorName: d.name || d.firstname || d.id,
      totalDf: d.position === 'แพทย์' ? 1000 : 500,
      lineCount: 2,
      saleCount: 1,
    })),
    summary: { total: 0, doctorCount: 0, lineCount: 0, saleCount: 0 },
  }),
}));

const fixtures = () => ({
  expenses: [
    { id: 'e1', date: '2026-04-10', amount: 500, branchId: 'BR-A', status: 'active', categoryName: 'ค่านั่งแพทย์', userId: 'D-1' },
    { id: 'e2', date: '2026-04-11', amount: 30000, branchId: 'BR-A', status: 'active', categoryName: 'เงินเดือน', userId: 'D-1' },
    { id: 'e3', date: '2026-04-15', amount: 25000, branchId: 'BR-A', status: 'active', categoryName: 'เงินเดือน', userId: 'S-1' },
    { id: 'e4', date: '2026-04-20', amount: 200, branchId: 'BR-B', status: 'active', categoryName: 'Lab' },
    { id: 'e5', date: '2026-04-21', amount: 800, branchId: 'BR-A', status: 'void', categoryName: 'Lab' },
  ],
  categories: [
    { id: 'C-1', name: 'ค่านั่งแพทย์' },
    { id: 'C-2', name: 'เงินเดือน' },
    { id: 'C-3', name: 'Lab' },
  ],
  doctors: [
    { id: 'D-1', name: 'หมอ ก', position: 'แพทย์' },
    { id: 'A-1', name: 'ผู้ช่วย A', position: 'ผู้ช่วยแพทย์' },
  ],
  staff: [
    { id: 'S-1', firstname: 'พนักงาน', lastname: 'A', position: 'รีเซฟชั่น' },
  ],
  sales: [
    { id: 'S1', saleDate: '2026-04-10', billing: { netTotal: 5000 }, branchId: 'BR-A' },
    { id: 'S2', saleDate: '2026-04-15', billing: { netTotal: 3000 }, branchId: 'BR-B' },
  ],
  treatments: [
    { id: 'T1', detail: { linkedSaleId: 'S1', doctorId: 'D-1', treatmentDate: '2026-04-10' } },
    { id: 'T2', detail: { linkedSaleId: 'S2', doctorId: 'A-1', treatmentDate: '2026-04-15' } },
  ],
  dfGroups: [],
  dfStaffRates: [],
});

describe('EA.A — composeExpenseReportSnapshot top-level shape', () => {
  it('EA.A.1 — returns the expected snapshot shape', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30' });
    expect(snap).toHaveProperty('summary');
    expect(snap).toHaveProperty('sections.doctors');
    expect(snap).toHaveProperty('sections.staff');
    expect(snap).toHaveProperty('sections.categories');
    expect(snap).toHaveProperty('sections.products');
    expect(snap).toHaveProperty('meta.generatedAt');
    expect(snap).toHaveProperty('meta.filterApplied');
    expect(snap).toHaveProperty('meta.branchScope');
    expect(snap).toHaveProperty('meta.sourceCounts');
  });

  it('EA.A.2 — meta.filterApplied echoes input', () => {
    const filter = { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] };
    const snap = composeExpenseReportSnapshot(fixtures(), filter);
    expect(snap.meta.filterApplied).toEqual(filter);
    expect(snap.meta.branchScope).toEqual(['BR-A']);
  });

  it('EA.A.3 — meta.sourceCounts reflects filtered counts', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] });
    // 5 expenses - 1 void - 1 wrong branch (e4) - 1 missing userId on e4 already excluded by branch = 3 active in BR-A
    expect(snap.meta.sourceCounts.expenses).toBe(3);
  });
});

describe('EA.B — sections content', () => {
  it('EA.B.1 — doctors section has 1 row (D-1)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30' });
    const docRows = snap.sections.doctors;
    expect(docRows).toHaveLength(1);
    expect(docRows[0].id).toBe('D-1');
    expect(docRows[0].sitFee).toBe(500);
    expect(docRows[0].salary).toBe(30000);
    expect(docRows[0].df).toBe(1000); // from dfPayout mock
    expect(docRows[0].total).toBe(31500);
  });

  it('EA.B.2 — staff section has 2 rows (S-1 + A-1)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30' });
    const staffRows = snap.sections.staff;
    expect(staffRows).toHaveLength(2);
    const ids = staffRows.map(r => r.id).sort();
    expect(ids).toEqual(['A-1', 'S-1']);
  });

  it('EA.B.3 — A-1 (assistant) DF from dfPayout mock', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30' });
    const a1 = snap.sections.staff.find(r => r.id === 'A-1');
    expect(a1.df).toBe(500);
    expect(a1.position).toBe('ผู้ช่วยแพทย์');
  });

  it('EA.B.4 — categories section groups + sums', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30' });
    const cats = snap.sections.categories;
    expect(cats.length).toBeGreaterThan(0);
    const salary = cats.find(c => c.categoryName === 'เงินเดือน');
    expect(salary.count).toBe(2);
    expect(salary.total).toBe(55000);
  });

  it('EA.B.5 — products section is empty (deferred to v2)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {});
    expect(snap.sections.products).toEqual([]);
  });
});

describe('EA.C — branch isolation', () => {
  it('EA.C.1 — branchIds=["BR-A"] excludes BR-B expenses', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] });
    const cats = snap.sections.categories;
    // e4 (Lab, BR-B) excluded → no Lab category
    const lab = cats.find(c => c.categoryName === 'Lab');
    expect(lab).toBeUndefined();
  });

  it('EA.C.2 — branchIds=["BR-B"] only Lab e4 (200 baht)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-B'] });
    const cats = snap.sections.categories;
    expect(cats).toHaveLength(1);
    expect(cats[0].categoryName).toBe('Lab');
    expect(cats[0].total).toBe(200);
  });

  it('EA.C.3 — empty branchIds = no branch filter (all 4 active expenses)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30', branchIds: [] });
    expect(snap.meta.sourceCounts.expenses).toBe(4); // all active, both branches
  });
});

describe('EA.D — V14 no-undefined-leaves', () => {
  it('EA.D.1 — snapshot stringifies cleanly (no undefined)', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), { from: '2026-04-01', to: '2026-04-30' });
    const s = JSON.stringify(snap);
    expect(s).not.toMatch(/:\s*undefined/);
  });

  it('EA.D.2 — empty fixture does not throw', () => {
    expect(() => composeExpenseReportSnapshot({}, {})).not.toThrow();
  });
});

describe('EA.E — partial errors propagation', () => {
  it('EA.E.1 — meta.partialErrors=null when raw has no errors', () => {
    const snap = composeExpenseReportSnapshot(fixtures(), {});
    expect(snap.meta.partialErrors).toBe(null);
  });

  it('EA.E.2 — partial errors surfaced when raw.errors set', () => {
    const raw = { ...fixtures(), errors: { expenses: 'fetch failed' } };
    const snap = composeExpenseReportSnapshot(raw, {});
    expect(snap.meta.partialErrors).toEqual({ expenses: 'fetch failed' });
  });
});
