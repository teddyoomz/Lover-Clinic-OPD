// tests/phase16.2-bis-flow-simulate.test.js — Phase 16.2-bis Rule I flow-simulate
//
// Full-flow simulate: master-data → filter rail → orchestrator → 16 widgets.
//
// Confirms 5 fixes work end-to-end:
//   F1. TOP-10 DOCTORS populates after enrichment
//   F2. courseUtilization respects branchIds
//   F3. expenseRatio respects branchIds (via filterExpensesForReport)
//   F4. newCustomersTrend respects branchIds
//   F5. cashFlow expense leg respects branchIds
//
// All 5 fixes verified through the orchestrator end-to-end (not just helper
// units) — Rule I item (a) pure simulate mirrors. Item (b) preview_eval
// against real Firestore is the user's responsibility post-deploy.

import { describe, it, expect } from 'vitest';
import { composeClinicReportSnapshot } from '../src/lib/clinicReportAggregator.js';

const fixtures = () => ({
  sales: [
    // BR-A: 2 sales spanning 2 months
    { id: 'S1', saleDate: '2026-03-15', billing: { netTotal: 10000 }, status: 'paid', branchId: 'BR-A', customerId: 'C1', sellers: [{ id: 'STAFF-1', name: 'พนักงาน A' }] },
    { id: 'S2', saleDate: '2026-04-15', billing: { netTotal: 15000 }, status: 'paid', branchId: 'BR-A', customerId: 'C1', sellers: [{ id: 'STAFF-1', name: 'พนักงาน A' }] },
    // BR-B: 2 sales
    { id: 'S3', saleDate: '2026-03-20', billing: { netTotal: 5000 },  status: 'paid', branchId: 'BR-B', customerId: 'C2', sellers: [{ id: 'STAFF-2', name: 'พนักงาน B' }] },
    { id: 'S4', saleDate: '2026-04-20', billing: { netTotal: 8000 },  status: 'paid', branchId: 'BR-B', customerId: 'C2', sellers: [{ id: 'STAFF-2', name: 'พนักงาน B' }] },
  ],
  customers: [
    { id: 'C1', branchId: 'BR-A', createdAt: '2026-03-01', courses: [{ qty: '50 / 100', status: 'active' }] },
    { id: 'C2', branchId: 'BR-B', createdAt: '2026-03-05', courses: [{ qty: '0 / 200',  status: 'active' }] },
    { id: 'C3', branchId: 'BR-A', createdAt: '2026-04-10', courses: [{ qty: '100 / 100', status: 'active' }] },
  ],
  expenses: [
    { id: 'E1', date: '2026-03-25', amount: 1000, branchId: 'BR-A', status: 'active', categoryName: 'Lab' },
    { id: 'E2', date: '2026-04-25', amount: 2000, branchId: 'BR-B', status: 'active', categoryName: 'Lab' },
  ],
  treatments: [
    // T1 → S1 (DOC-A treats C1)
    { id: 'T1', detail: { linkedSaleId: 'S1', doctorId: 'DOC-A', doctorName: 'หมอ ก', treatmentDate: '2026-03-15' } },
    // T2 → S2 (DOC-A again)
    { id: 'T2', detail: { linkedSaleId: 'S2', doctorId: 'DOC-A', doctorName: 'หมอ ก', treatmentDate: '2026-04-15' } },
    // T3 → S3 (DOC-B treats C2)
    { id: 'T3', detail: { linkedSaleId: 'S3', doctorId: 'DOC-B', doctorName: 'หมอ ข', treatmentDate: '2026-03-20' } },
    // T4 → S4 (DOC-B)
    { id: 'T4', detail: { linkedSaleId: 'S4', doctorId: 'DOC-B', doctorName: 'หมอ ข', treatmentDate: '2026-04-20' } },
  ],
  branches: [
    { id: 'BR-A', name: 'สาขา A' },
    { id: 'BR-B', name: 'สาขา B' },
  ],
  staff: [],
  doctors: [
    { id: 'DOC-A', position: 'แพทย์', name: 'หมอ ก' },
    { id: 'DOC-B', position: 'แพทย์', name: 'หมอ ข' },
  ],
  products: [],
  batches: [],
  courses: [],
  appointments: [],
});

describe('FS.F1 — TOP-10 DOCTORS populates after orchestrator enrichment', () => {
  it('FS.F1.1 — without enrichment (treatments=[]) → empty', () => {
    const raw = { ...fixtures(), treatments: [] };
    const snap = composeClinicReportSnapshot(raw, { from: '2026-03-01', to: '2026-04-30' });
    // Without treatments to provide doctorId, sales have no doctorId field
    // → staffSalesAggregator's doctorRows is empty → topDoctors empty.
    expect(snap.tables.topDoctors).toEqual([]);
  });

  it('FS.F1.2 — with treatments → 2 doctors populated', () => {
    const raw = fixtures();
    const snap = composeClinicReportSnapshot(raw, { from: '2026-03-01', to: '2026-04-30' });
    expect(snap.tables.topDoctors.length).toBeGreaterThan(0);
    const names = snap.tables.topDoctors.map(d => d.staffName);
    expect(names).toContain('หมอ ก');
    expect(names).toContain('หมอ ข');
  });

  it('FS.F1.3 — TOP-10 totals reconcile with sale netTotals', () => {
    const raw = fixtures();
    const snap = composeClinicReportSnapshot(raw, { from: '2026-03-01', to: '2026-04-30' });
    const docARow = snap.tables.topDoctors.find(d => d.staffName === 'หมอ ก');
    expect(docARow.total).toBe(25000); // S1 (10000) + S2 (15000) — both BR-A
  });

  it('FS.F1.4 — branchIds=["BR-A"] limits TOP-10 DOCTORS to BR-A treatments', () => {
    const raw = fixtures();
    const snap = composeClinicReportSnapshot(raw, { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-A'] });
    const names = snap.tables.topDoctors.map(d => d.staffName);
    expect(names).toContain('หมอ ก');
    // BR-B sales filtered out via the orchestrator-level branch pre-filter
    // (Phase 16.2-bis branchSetForAggs gate ahead of staffSalesAggregator).
    expect(names).not.toContain('หมอ ข');
  });
});

describe('FS.F2 — courseUtilization respects branchIds', () => {
  it('FS.F2.1 — global → 50% (50/100 + 200/200 + 0/100 = 250/400 used = 62.5%)', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30' });
    expect(snap.tiles.courseUtilization).toBe(62.5);
  });

  it('FS.F2.2 — branchIds=["BR-A"] → only customers c1+c3', () => {
    // C1: 50/100 used (50%) + C3: 0/100 used (0%) → 50/200 = 25%
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-A'] });
    expect(snap.tiles.courseUtilization).toBe(25);
  });

  it('FS.F2.3 — branchIds=["BR-B"] → only c2 (200/200 used = 100%)', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-B'] });
    expect(snap.tiles.courseUtilization).toBe(100);
  });
});

describe('FS.F3 — expenseRatio respects branchIds', () => {
  it('FS.F3.1 — global → revenue=38000, expense=3000 → ~7.89%', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30' });
    expect(snap.tiles.expenseRatio).toBeCloseTo(7.89, 1);
  });

  it('FS.F3.2 — branchIds=["BR-A"]: rev=25000, exp=1000 → 4%', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-A'] });
    expect(snap.tiles.expenseRatio).toBe(4);
  });

  it('FS.F3.3 — branchIds=["BR-B"]: rev=13000, exp=2000 → ~15.38%', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-B'] });
    expect(snap.tiles.expenseRatio).toBeCloseTo(15.38, 1);
  });
});

describe('FS.F4 — newCustomersTrend respects branchIds', () => {
  it('FS.F4.1 — global has 3 customers across 2 months', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30' });
    const totalCount = snap.charts.newCustomersTrend.reduce((s, p) => s + p.value, 0);
    expect(totalCount).toBe(3);
  });

  it('FS.F4.2 — branchIds=["BR-A"] → only c1+c3 (2 customers)', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-A'] });
    const totalCount = snap.charts.newCustomersTrend.reduce((s, p) => s + p.value, 0);
    expect(totalCount).toBe(2);
  });

  it('FS.F4.3 — branchIds=["BR-B"] → only c2 (1 customer)', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-B'] });
    const totalCount = snap.charts.newCustomersTrend.reduce((s, p) => s + p.value, 0);
    expect(totalCount).toBe(1);
  });
});

describe('FS.F5 — cashFlow expense leg respects branchIds', () => {
  it('FS.F5.1 — global cashFlow March: +10000-1000 = +9000', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30' });
    const march = snap.charts.cashFlow.find(p => p.label === '2026-03');
    // March: BR-A sale 10000 + BR-B sale 5000 = 15000 revenue; expense 1000 (BR-A) → 14000
    expect(march.value).toBe(14000);
  });

  it('FS.F5.2 — branchIds=["BR-A"] March: 10000 - 1000 = 9000 (BR-B exp filtered out)', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-A'] });
    const march = snap.charts.cashFlow.find(p => p.label === '2026-03');
    expect(march.value).toBe(9000);
  });

  it('FS.F5.3 — branchIds=["BR-B"] April: 8000 - 2000 = 6000 (BR-A exp filtered out)', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-B'] });
    const april = snap.charts.cashFlow.find(p => p.label === '2026-04');
    expect(april.value).toBe(6000);
  });
});

describe('FS.G — meta + branch comparison + V14 invariants', () => {
  it('FS.G.1 — branchComparison row count matches selected branches', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30', branchIds: ['BR-A'] });
    expect(snap.charts.branchComparison.rows).toHaveLength(1);
    expect(snap.charts.branchComparison.rows[0].branchId).toBe('BR-A');
  });

  it('FS.G.2 — V14 no-undefined-leaves: snapshot stringifies cleanly', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30' });
    const s = JSON.stringify(snap);
    expect(s).not.toMatch(/:\s*undefined/);
  });

  it('FS.G.3 — empty fixture (no data) does not throw', () => {
    const empty = { sales: [], customers: [], expenses: [], treatments: [], branches: [], staff: [], doctors: [], products: [], batches: [], courses: [], appointments: [] };
    expect(() => composeClinicReportSnapshot(empty, { from: '2026-04-01', to: '2026-04-30' })).not.toThrow();
  });

  it('FS.G.4 — meta.partialErrors null when errors empty', () => {
    const snap = composeClinicReportSnapshot(fixtures(), { from: '2026-03-01', to: '2026-04-30' });
    expect(snap.meta.partialErrors).toBe(null);
  });
});
