// tests/phase16.2-bis-branch-awareness-audit.test.js — Phase 16.2-bis (2026-04-29 session 33)
//
// Audit + regression guards for the 4 branch-awareness bugs fixed:
//   B1. courseUtilization global → branchIds 3rd arg respected
//   B2. expenseRatio global → filterExpensesForReport applies branchIds
//   B3. newCustomersTrend global → _bucketCustomersByMonth applies branchIds
//   B4. cashFlow expense leg global → filterExpensesForReport applies branchIds
//
// Plus B5 — TOP-10 DOCTORS via doctor-enrichment (separate test file
// covers helper unit; this file asserts orchestrator wiring).
//
// Source-grep regression guards lock the fix shape so future refactors
// can't silently revert these.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeCourseUtilizationFromCustomers,
  filterExpensesForReport,
  computeKpiTiles,
} from '../src/lib/clinicReportHelpers.js';

const HELPERS_PATH = join(process.cwd(), 'src/lib/clinicReportHelpers.js');
const AGGREGATOR_PATH = join(process.cwd(), 'src/lib/clinicReportAggregator.js');
const SPECS_PATH = join(process.cwd(), 'src/lib/clinicReportMetricSpecs.js');

const helpersSrc = readFileSync(HELPERS_PATH, 'utf-8');
const aggregatorSrc = readFileSync(AGGREGATOR_PATH, 'utf-8');
const specsSrc = readFileSync(SPECS_PATH, 'utf-8');

// ─── B1. computeCourseUtilizationFromCustomers — branchIds 3rd arg ─────────
describe('BA.B1 — courseUtilization branch awareness', () => {
  // simple parseQtyString stub: "<rem> / <total> <unit>"
  const parseQty = (s) => {
    const m = String(s || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (!m) return { remaining: 0, total: 0, unit: '' };
    return { remaining: Number(m[1]), total: Number(m[2]), unit: '' };
  };
  const customers = [
    { id: 'c1', branchId: 'BR-A', courses: [{ qty: '50 / 100' }] },
    { id: 'c2', branchId: 'BR-B', courses: [{ qty: '0 / 200' }] }, // 100% used
    { id: 'c3', branchId: 'BR-A', courses: [{ qty: '100 / 100' }] }, // 0% used
  ];

  it('BA.B1.1 — without branchIds: aggregates ALL branches', () => {
    const util = computeCourseUtilizationFromCustomers(customers, parseQty);
    // Total: 100+200+100=400; used: 50+200+0=250; pct: 62.5
    expect(util).toBe(62.5);
  });

  it('BA.B1.2 — branchIds=["BR-A"] excludes BR-B (drops 200/200 used)', () => {
    const util = computeCourseUtilizationFromCustomers(customers, parseQty, ['BR-A']);
    // BR-A only: 100+100=200 total, 50+0=50 used → 25%
    expect(util).toBe(25);
  });

  it('BA.B1.3 — branchIds=["BR-B"] gives the 100% used customer alone', () => {
    const util = computeCourseUtilizationFromCustomers(customers, parseQty, ['BR-B']);
    expect(util).toBe(100);
  });

  it('BA.B1.4 — branchIds with no match returns 0', () => {
    const util = computeCourseUtilizationFromCustomers(customers, parseQty, ['BR-NONEXISTENT']);
    expect(util).toBe(0);
  });

  it('BA.B1.5 — empty branchIds (length 0) treated as "no filter"', () => {
    const util = computeCourseUtilizationFromCustomers(customers, parseQty, []);
    expect(util).toBe(62.5); // same as no arg
  });

  it('BA.B1.6 — customer without branchId is excluded when branchIds non-empty', () => {
    const cust = [...customers, { id: 'c4', courses: [{ qty: '0 / 1000' }] }];
    const util = computeCourseUtilizationFromCustomers(cust, parseQty, ['BR-A']);
    // c4 has no branchId; rejected. Same as B1.2 result.
    expect(util).toBe(25);
  });
});

// ─── B2 + B4. filterExpensesForReport — date + branch + non-void ──────────
describe('BA.B2 — filterExpensesForReport (powers expenseRatio + cashFlow)', () => {
  const expenses = [
    { id: 'e1', date: '2026-04-15', amount: 1000, branchId: 'BR-A', status: 'active' },
    { id: 'e2', date: '2026-04-16', amount: 2000, branchId: 'BR-B', status: 'active' },
    { id: 'e3', date: '2026-04-17', amount: 9999, branchId: 'BR-A', status: 'void' }, // excluded
    { id: 'e4', date: '2025-12-31', amount: 500, branchId: 'BR-A', status: 'active' }, // out of range
  ];

  it('BA.B2.1 — date range only', () => {
    const out = filterExpensesForReport(expenses, { from: '2026-04-01', to: '2026-04-30' });
    expect(out.map(e => e.id)).toEqual(['e1', 'e2']);
  });

  it('BA.B2.2 — branchIds restricts', () => {
    const out = filterExpensesForReport(expenses, { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] });
    expect(out.map(e => e.id)).toEqual(['e1']);
  });

  it('BA.B2.3 — empty branchIds = no filter', () => {
    const out = filterExpensesForReport(expenses, { from: '2026-04-01', to: '2026-04-30', branchIds: [] });
    expect(out.map(e => e.id).sort()).toEqual(['e1', 'e2']);
  });

  it('BA.B2.4 — void excluded', () => {
    const out = filterExpensesForReport(expenses, { from: '2026-04-01', to: '2026-04-30' });
    const ids = out.map(e => e.id);
    expect(ids).not.toContain('e3');
  });

  it('BA.B2.5 — out-of-range excluded', () => {
    const out = filterExpensesForReport(expenses, { from: '2026-04-01', to: '2026-04-30' });
    const ids = out.map(e => e.id);
    expect(ids).not.toContain('e4');
  });

  it('BA.B2.6 — null input returns []', () => {
    expect(filterExpensesForReport(null, {})).toEqual([]);
  });
});

// ─── B3. expenseRatio integration via computeKpiTiles ────────────────────
describe('BA.B3 — expenseRatio respects branchIds (via computeKpiTiles)', () => {
  const sales = [
    { id: 's1', saleDate: '2026-04-10', billing: { netTotal: 10000 }, status: 'paid', branchId: 'BR-A', customerId: 'c1' },
    { id: 's2', saleDate: '2026-04-11', billing: { netTotal: 20000 }, status: 'paid', branchId: 'BR-B', customerId: 'c2' },
  ];
  const expenses = [
    { id: 'e1', date: '2026-04-15', amount: 2000, branchId: 'BR-A', status: 'active' },
    { id: 'e2', date: '2026-04-16', amount: 5000, branchId: 'BR-B', status: 'active' },
  ];
  const customers = [];
  const filter = { from: '2026-04-01', to: '2026-04-30' };

  it('BA.B3.1 — global: revenue=30000, expense=7000 → ratio≈23.33%', () => {
    const tiles = computeKpiTiles({ sales, customers, expenses, filter });
    expect(tiles.revenueYtd).toBe(30000);
    expect(tiles.expenseRatio).toBeCloseTo(23.33, 1);
  });

  it('BA.B3.2 — branchIds=["BR-A"]: revenue=10000, expense=2000 → ratio=20%', () => {
    const tiles = computeKpiTiles({
      sales, customers, expenses,
      filter: { ...filter, branchIds: ['BR-A'] },
    });
    expect(tiles.revenueYtd).toBe(10000);
    expect(tiles.expenseRatio).toBe(20);
  });

  it('BA.B3.3 — branchIds=["BR-B"]: revenue=20000, expense=5000 → ratio=25%', () => {
    const tiles = computeKpiTiles({
      sales, customers, expenses,
      filter: { ...filter, branchIds: ['BR-B'] },
    });
    expect(tiles.revenueYtd).toBe(20000);
    expect(tiles.expenseRatio).toBe(25);
  });
});

// ─── BA.S — Source-grep regression guards ────────────────────────────────
describe('BA.S — source-grep regression guards', () => {
  it('BA.S.1 — clinicReportHelpers exports filterExpensesForReport', () => {
    expect(helpersSrc).toMatch(/^export function filterExpensesForReport/m);
  });

  it('BA.S.2 — computeKpiTiles routes through filterExpensesForReport', () => {
    // Locate computeKpiTiles function body — match through the closing brace
    // BEFORE the next top-level `export` (or end-of-file). Greedy [\s\S]*?\n\}
    // ends at the first newline+brace which can be a nested block. Use a
    // forward-looking pattern.
    const startIdx = helpersSrc.indexOf('export function computeKpiTiles');
    expect(startIdx).toBeGreaterThan(-1);
    const nextExportIdx = helpersSrc.indexOf('\nexport ', startIdx + 1);
    const body = helpersSrc.slice(startIdx, nextExportIdx > 0 ? nextExportIdx : undefined);
    expect(body).toMatch(/filterExpensesForReport\s*\(/);
  });

  it('BA.S.3 — computeCourseUtilizationFromCustomers signature has 3rd arg branchIds', () => {
    expect(helpersSrc).toMatch(
      /export function computeCourseUtilizationFromCustomers\(customers,\s*parseQtyString,\s*branchIds\)/
    );
  });

  it('BA.S.4 — orchestrator passes filter.branchIds to courseUtilization helper', () => {
    expect(aggregatorSrc).toMatch(
      /computeCourseUtilizationFromCustomers\(customers,\s*parseQtyString,\s*filter\.branchIds\)/
    );
  });

  it('BA.S.5 — orchestrator imports filterExpensesForReport', () => {
    expect(aggregatorSrc).toMatch(/import\s*\{[^}]*filterExpensesForReport[^}]*\}\s*from\s*['"]\.\/clinicReportHelpers\.js['"]/);
  });

  it('BA.S.6 — _bucketCashFlowByMonth uses filterExpensesForReport for expense leg', () => {
    const m = aggregatorSrc.match(/function _bucketCashFlowByMonth[\s\S]*?\n\}/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/filterExpensesForReport\s*\(\s*expenses,\s*filter\s*\)/);
  });

  it('BA.S.7 — _bucketCustomersByMonth respects filter.branchIds', () => {
    const m = aggregatorSrc.match(/function _bucketCustomersByMonth[\s\S]*?\n\}/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/branchIds/);
    expect(m[0]).toMatch(/branchSet/);
  });

  it('BA.S.8 — orchestrator imports loadTreatmentsByDateRange (Phase 16.2-bis enrichment)', () => {
    expect(aggregatorSrc).toMatch(/import\s*\{\s*loadTreatmentsByDateRange\s*\}\s*from\s*['"]\.\/reportsLoaders\.js['"]/);
  });

  it('BA.S.9 — fetchClinicReportData includes treatments fetcher', () => {
    expect(aggregatorSrc).toMatch(/\['treatments',\s*\(\)\s*=>\s*loadTreatmentsByDateRange/);
  });

  it('BA.S.10 — composeClinicReportSnapshot calls enrichSalesWithDoctorIdFromTreatments BEFORE staff sales', () => {
    const enrichIdx = aggregatorSrc.indexOf('enrichSalesWithDoctorIdFromTreatments(sales, treatments)');
    // After Phase 16.2-bis bugfix the orchestrator calls aggregateStaffSales
    // with `branchFilteredEnrichedSales` (pre-filter for branch isolation).
    // Match either literal so the test survives future refactors that adjust
    // the local variable name.
    const aggIdx = (() => {
      const a = aggregatorSrc.indexOf('aggregateStaffSales(branchFilteredEnrichedSales');
      if (a >= 0) return a;
      return aggregatorSrc.indexOf('aggregateStaffSales(enrichedSales');
    })();
    expect(enrichIdx).toBeGreaterThan(0);
    expect(aggIdx).toBeGreaterThan(enrichIdx);
  });

  it('BA.S.11 — enrichSalesWithDoctorIdFromTreatments is exported', () => {
    expect(aggregatorSrc).toMatch(/^export function enrichSalesWithDoctorIdFromTreatments/m);
  });

  it('BA.S.12 — V14 anti-undefined leaves: no `: undefined,` in clinicReportMetricSpecs', () => {
    expect(specsSrc).not.toMatch(/:\s*undefined\b/);
  });

  it('BA.S.13 — clinicReportMetricSpecs is frozen via Object.freeze', () => {
    expect(specsSrc).toMatch(/Object\.freeze\(\s*\{/);
  });
});
