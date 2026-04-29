// tests/phase16.2-clinic-report-helpers.test.js — Phase 16.2 Clinic Report tests
import { describe, it, expect } from 'vitest';
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_MODULES,
} from '../src/lib/permissionGroupValidation.js';
import { TAB_PERMISSION_MAP } from '../src/lib/tabPermissions.js';

describe('P1 Clinic Report — permission key + tab gate', () => {
  it('P1.1 — report_clinic_summary key registered in รายงาน group', () => {
    const reportGroup = PERMISSION_MODULES.find(g => g.label === 'รายงาน');
    expect(reportGroup).toBeTruthy();
    const key = reportGroup.items.find(k => k.key === 'report_clinic_summary');
    expect(key).toBeTruthy();
    expect(key.label).toMatch(/รายงานคลินิก/);
  });

  it('P1.2 — report_clinic_summary appears in ALL_PERMISSION_KEYS', () => {
    expect(ALL_PERMISSION_KEYS).toContain('report_clinic_summary');
  });

  it('P1.3 — clinic-report tab gates on report_clinic_summary', () => {
    const gate = TAB_PERMISSION_MAP['clinic-report'];
    expect(gate).toBeTruthy();
    expect(gate.requires).toEqual(['report_clinic_summary']);
  });
});

import { computeKpiTiles } from '../src/lib/clinicReportHelpers.js';

describe('P2 computeKpiTiles', () => {
  // Fixture: 6 months sales, 2 branches
  const sales = [
    // 2025-11
    { id: 's1', saleDate: '2025-11-05', total: 5000, status: 'paid', branchId: 'BR-A', customerId: 'c1' },
    { id: 's2', saleDate: '2025-11-15', total: 3000, status: 'paid', branchId: 'BR-B', customerId: 'c2' },
    // 2025-12
    { id: 's3', saleDate: '2025-12-10', total: 8000, status: 'paid', branchId: 'BR-A', customerId: 'c1' },
    // 2026-04
    { id: 's4', saleDate: '2026-04-20', total: 12000, status: 'paid', branchId: 'BR-A', customerId: 'c3' },
    // cancelled — excluded
    { id: 's5', saleDate: '2026-04-22', total: 99999, status: 'cancelled', branchId: 'BR-A', customerId: 'c4' },
  ];
  const customers = [
    { id: 'c1', createdAt: '2025-11-01', branchId: 'BR-A' },
    { id: 'c2', createdAt: '2025-11-15', branchId: 'BR-B' },
    { id: 'c3', createdAt: '2026-04-19', branchId: 'BR-A' },
    { id: 'c4', createdAt: '2026-04-22', branchId: 'BR-A' },
  ];
  const expenses = [
    { id: 'e1', expenseDate: '2026-04-15', amount: 4000 },
  ];
  const filter = { from: '2025-11-01', to: '2026-04-30' };

  it('P2.1 — revenueYtd sums non-cancelled sales in range', () => {
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    // 5000 + 3000 + 8000 + 12000 = 28000 (s5 cancelled excluded)
    expect(t.revenueYtd).toBe(28000);
  });

  it('P2.2 — momGrowth = null when previous month has zero revenue', () => {
    // currentMonth = 2026-04 = 12000 ; prevMonth = 2026-03 = 0 → null per design
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.momGrowth).toBeNull();
  });

  it('P2.3 — newCustomersPerMonth = customers.createdAt in range / months', () => {
    // 4 customers in range across 6 months ≈ 0.67/month
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.newCustomersPerMonth).toBeCloseTo(4 / 6, 1);
  });

  it('P2.4 — avgTicket = revenue / non-cancelled sale count', () => {
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.avgTicket).toBeCloseTo(28000 / 4, 0);
  });

  it('P2.5 — expenseRatio = expenses / revenue × 100', () => {
    // expenses 4000 / revenue 28000 = 14.28%
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    expect(t.expenseRatio).toBeCloseTo(14.28, 1);
  });

  it('P2.6 — empty sales → tiles all zeros / null growth', () => {
    const t = computeKpiTiles({ sales: [], customers: [], expenses: [], filter });
    expect(t.revenueYtd).toBe(0);
    expect(t.avgTicket).toBe(0);
    expect(t.momGrowth).toBeNull();
    expect(t.expenseRatio).toBe(0);
  });

  it('P2.7 — branchIds filter clamps sales', () => {
    const t = computeKpiTiles({
      sales, customers, expenses,
      filter: { ...filter, branchIds: ['BR-A'] }
    });
    // Only BR-A: 5000 + 8000 + 12000 = 25000 (s2 BR-B excluded)
    expect(t.revenueYtd).toBe(25000);
  });

  it('P2.8 — never returns undefined values (V14 lock)', () => {
    const t = computeKpiTiles({ sales, customers, expenses, filter });
    for (const [k, v] of Object.entries(t)) {
      expect(v, `${k} must not be undefined`).not.toBeUndefined();
    }
  });

  it('P2.9 — derived fields with NaN coerce to 0 (V14 hardening)', () => {
    const t = computeKpiTiles({
      sales, customers, expenses, filter,
      derived: { retentionRate: NaN, courseUtilization: NaN, noShowRate: NaN },
    });
    expect(t.retentionRate).toBe(0);
    expect(t.courseUtilization).toBe(0);
    expect(t.noShowRate).toBe(0);
  });
});

import { computeRetentionCohort } from '../src/lib/clinicReportHelpers.js';

describe('P3 computeRetentionCohort', () => {
  // Cohort design:
  //   - rows = acquisition month (customer.createdAt → YYYY-MM)
  //   - cols = months-since-acquisition (0, 1, 2, 3, ...)
  //   - cell = % of cohort that made another sale in that offset month
  //   - cell at offset 0 = 100% by definition (acquisition sale)

  const customers = [
    { id: 'c1', createdAt: '2025-11-05', branchId: 'BR-A' }, // cohort 2025-11
    { id: 'c2', createdAt: '2025-11-20', branchId: 'BR-A' }, // cohort 2025-11
    { id: 'c3', createdAt: '2025-12-10', branchId: 'BR-A' }, // cohort 2025-12
    { id: 'c4', createdAt: '2026-01-05', branchId: 'BR-A' }, // cohort 2026-01
  ];

  const sales = [
    // c1 acquisition + 2 follow-ups
    { id: 's1', customerId: 'c1', saleDate: '2025-11-05', total: 5000, status: 'paid' },
    { id: 's2', customerId: 'c1', saleDate: '2025-12-15', total: 2000, status: 'paid' }, // offset 1
    { id: 's3', customerId: 'c1', saleDate: '2026-01-20', total: 3000, status: 'paid' }, // offset 2
    // c2 only acquisition
    { id: 's4', customerId: 'c2', saleDate: '2025-11-20', total: 4000, status: 'paid' },
    // c3 acquisition + 1 follow-up
    { id: 's5', customerId: 'c3', saleDate: '2025-12-10', total: 6000, status: 'paid' },
    { id: 's6', customerId: 'c3', saleDate: '2026-01-25', total: 1500, status: 'paid' }, // offset 1
    // c4 acquisition
    { id: 's7', customerId: 'c4', saleDate: '2026-01-05', total: 8000, status: 'paid' },
  ];

  it('P3.1 — cohort rows = unique acquisition months in range', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    expect(m.rows.map(r => r.cohort).sort()).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('P3.2 — offset-0 retention always 100%', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    for (const row of m.rows) {
      expect(row.cells[0]).toBe(100);
    }
  });

  it('P3.3 — 2025-11 cohort offset 1 = 50% (c1 returned, c2 did not)', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    const cohort = m.rows.find(r => r.cohort === '2025-11');
    expect(cohort.cells[1]).toBe(50);
  });

  it('P3.4 — 2025-12 cohort offset 1 = 100% (c3 returned)', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    const cohort = m.rows.find(r => r.cohort === '2025-12');
    expect(cohort.cells[1]).toBe(100);
  });

  it('P3.5 — overall retentionRate aggregate across all cohorts', () => {
    // Customers in cohorts where offset≥1 reachable (excludes 2026-01 because it has no offset-1 in data; but offset 1 = 2026-02 which IS within filter.to=2026-04-30 → reachable):
    // 2025-11: c1 has 2+ visits (returned), c2 has 1 visit (didn't return) → 1/2
    // 2025-12: c3 has 2+ visits (returned) → 1/1
    // 2026-01: c4 has 1 visit (didn't return) → 0/1
    // Total: 2 returned / 4 eligible = 50%
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    expect(m.overallRate).toBeCloseTo(50, 1);
  });

  it('P3.6 — empty inputs return empty matrix + overallRate 0', () => {
    const m = computeRetentionCohort({ sales: [], customers: [], filter: { from: '2025-11-01', to: '2026-04-30' } });
    expect(m.rows).toEqual([]);
    expect(m.overallRate).toBe(0);
  });

  it('P3.7 — cancelled sales never count as returning visit', () => {
    const cancelledFollowup = [
      ...sales,
      { id: 'sX', customerId: 'c2', saleDate: '2025-12-10', total: 999, status: 'cancelled' },
    ];
    const m = computeRetentionCohort({ sales: cancelledFollowup, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    const cohort = m.rows.find(r => r.cohort === '2025-11');
    expect(cohort.cells[1]).toBe(50); // c2's cancelled doesn't bump
  });

  it('P3.8 — V14 — no undefined leaves', () => {
    const m = computeRetentionCohort({ sales, customers, filter: { from: '2025-11-01', to: '2026-04-30' } });
    for (const row of m.rows) {
      expect(row.cohort).not.toBeUndefined();
      expect(row.cohortSize).not.toBeUndefined();
      for (const c of row.cells) {
        expect(c, `cell must be number, got ${c}`).not.toBeUndefined();
      }
    }
  });

  it('P3.9 — customer acquired in filter.to month is included in cohort (boundary regression)', () => {
    // Bug: cm + "-31" > to was incorrectly excluding April-2026 cohort when filter.to = "2026-04-30"
    // because "2026-04-31" > "2026-04-30" alphabetically. Fixed via YYYY-MM comparison.
    const aprilCustomers = [
      ...customers,
      { id: 'cApril', createdAt: '2026-04-15', branchId: 'BR-A' },
    ];
    const aprilSales = [
      ...sales,
      { id: 'sApril', customerId: 'cApril', saleDate: '2026-04-15', total: 1000, status: 'paid' },
    ];
    const m = computeRetentionCohort({
      sales: aprilSales,
      customers: aprilCustomers,
      filter: { from: '2025-11-01', to: '2026-04-30' },
    });
    // April cohort must now exist
    const aprilCohort = m.rows.find(r => r.cohort === '2026-04');
    expect(aprilCohort).toBeTruthy();
    expect(aprilCohort.cohortSize).toBe(1);
    expect(aprilCohort.cells[0]).toBe(100); // acquisition sale in same month
  });
});

import { computeBranchComparison } from '../src/lib/clinicReportHelpers.js';

describe('P4 computeBranchComparison', () => {
  const sales = [
    { id: 's1', branchId: 'BR-A', total: 10000, status: 'paid', saleDate: '2026-04-15', customerId: 'c1' },
    { id: 's2', branchId: 'BR-A', total: 5000, status: 'paid', saleDate: '2026-04-20', customerId: 'c2' },
    { id: 's3', branchId: 'BR-B', total: 8000, status: 'paid', saleDate: '2026-04-18', customerId: 'c3' },
    { id: 's4', branchId: 'BR-B', total: 99999, status: 'cancelled', saleDate: '2026-04-22', customerId: 'c4' },
  ];
  const branches = [
    { id: 'BR-A', name: 'ชลบุรี' },
    { id: 'BR-B', name: 'ปทุมธานี' },
    { id: 'BR-C', name: 'ระยอง' }, // no sales — should still appear with zeros
  ];
  const filter = { from: '2026-04-01', to: '2026-04-30' };

  it('P4.1 — one row per branch', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows).toHaveLength(3);
    expect(r.rows.map(x => x.branchId).sort()).toEqual(['BR-A', 'BR-B', 'BR-C']);
  });

  it('P4.2 — branchName resolved from branches lookup', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    const a = r.rows.find(x => x.branchId === 'BR-A');
    expect(a.branchName).toBe('ชลบุรี');
  });

  it('P4.3 — revenue sums non-cancelled sales per branch', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows.find(x => x.branchId === 'BR-A').revenue).toBe(15000);
    expect(r.rows.find(x => x.branchId === 'BR-B').revenue).toBe(8000); // s4 cancelled excluded
    expect(r.rows.find(x => x.branchId === 'BR-C').revenue).toBe(0);
  });

  it('P4.4 — saleCount = non-cancelled count', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows.find(x => x.branchId === 'BR-A').saleCount).toBe(2);
    expect(r.rows.find(x => x.branchId === 'BR-B').saleCount).toBe(1);
    expect(r.rows.find(x => x.branchId === 'BR-C').saleCount).toBe(0);
  });

  it('P4.5 — branchIds filter clamps to subset', () => {
    const r = computeBranchComparison({ sales, branches, filter: { ...filter, branchIds: ['BR-A'] } });
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].branchId).toBe('BR-A');
  });

  it('P4.6 — top branch by revenue at row 0', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    expect(r.rows[0].branchId).toBe('BR-A'); // 15000 > 8000 > 0
  });

  it('P4.7 — V14 — no undefined leaves', () => {
    const r = computeBranchComparison({ sales, branches, filter });
    for (const row of r.rows) {
      expect(row.branchId).not.toBeUndefined();
      expect(row.branchName).not.toBeUndefined();
      expect(row.revenue).not.toBeUndefined();
      expect(row.saleCount).not.toBeUndefined();
    }
  });
});
