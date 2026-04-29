// tests/phase16.2-clinic-report-aggregator.test.js
// Phase 16.2 — clinicReportAggregator orchestrator (Task 5)
// Verified export names (2026-04-29):
//   backendClient: getAllSales, getAllCustomers, getAppointmentsByMonth, listStaff,
//                  listDoctors, listProducts, listStockBatches, listCourses,
//                  listExpenses, listBranches
//   aggregators:   all 8 match plan exactly

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock backendClient — using REAL export names verified by grep
vi.mock('../src/lib/backendClient.js', () => ({
  getAllSales: vi.fn(),
  getAllCustomers: vi.fn(),
  getAppointmentsByMonth: vi.fn(),
  listStaff: vi.fn(),
  listDoctors: vi.fn(),
  listProducts: vi.fn(),
  listStockBatches: vi.fn(),
  listCourses: vi.fn(),
  listExpenses: vi.fn(),
  listBranches: vi.fn(),
}));

// Mock aggregators — all verified to match plan signatures exactly
vi.mock('../src/lib/revenueAnalysisAggregator.js', () => ({
  aggregateRevenueByProcedure: vi.fn(() => ({
    rows: [{ courseName: 'X', lineTotal: 5000, qty: 1 }],
    totals: {},
    meta: {},
  })),
}));
vi.mock('../src/lib/customerReportAggregator.js', () => ({
  aggregateCustomerReport: vi.fn(() => ({
    rows: [],
    totals: { totalNew: 4 },
    meta: {},
  })),
}));
vi.mock('../src/lib/saleReportAggregator.js', () => ({
  aggregateSaleReport: vi.fn(() => ({
    rows: [],
    totals: { totalRevenue: 28000 },
    meta: {},
  })),
}));
vi.mock('../src/lib/staffSalesAggregator.js', () => ({
  aggregateStaffSales: vi.fn(() => ({
    rows: [{ staffName: 'Dr.A', total: 10000, role: 'doctor' }],
    totals: {},
    meta: {},
  })),
}));
vi.mock('../src/lib/stockReportAggregator.js', () => ({
  aggregateStockReport: vi.fn(() => ({
    rows: [],
    totals: {},
    meta: {},
  })),
}));
vi.mock('../src/lib/pnlReportAggregator.js', () => ({
  aggregatePnLReport: vi.fn(() => ({
    rows: [],
    totals: { revenue: 28000, expenses: 4000 },
    meta: {},
  })),
}));
vi.mock('../src/lib/appointmentReportAggregator.js', () => ({
  aggregateAppointmentReport: vi.fn(() => ({
    rows: [],
    totals: { totalAppointments: 10, fillRate: 80 },
    meta: {},
  })),
}));
vi.mock('../src/lib/appointmentAnalysisAggregator.js', () => ({
  aggregateAppointmentAnalysis: vi.fn(() => ({
    kpiByAdvisor: [],
    totals: { noShowRate: 8 },
    meta: {},
  })),
}));

import * as backend from '../src/lib/backendClient.js';
import {
  fetchClinicReportData,
  composeClinicReportSnapshot,
  clinicReportAggregator,
} from '../src/lib/clinicReportAggregator.js';

// ─── Shared fixture ────────────────────────────────────────────────────────
const SALE = {
  id: 's1',
  total: 5000,
  status: 'paid',
  saleDate: '2026-04-15',
  customerId: 'c1',
  branchId: 'BR-A',
};
const CUSTOMER = { id: 'c1', createdAt: '2026-04-15', branchId: 'BR-A' };
const BRANCH = { id: 'BR-A', name: 'ชลบุรี' };
const EXPENSE = { id: 'e1', amount: 1000, expenseDate: '2026-04-15' };

function setupMocks() {
  backend.getAllSales.mockResolvedValue([SALE]);
  backend.getAllCustomers.mockResolvedValue([CUSTOMER]);
  backend.getAppointmentsByMonth.mockResolvedValue([]);
  backend.listStaff.mockResolvedValue([]);
  backend.listDoctors.mockResolvedValue([]);
  backend.listProducts.mockResolvedValue([]);
  backend.listStockBatches.mockResolvedValue([]);
  backend.listCourses.mockResolvedValue([]);
  backend.listExpenses.mockResolvedValue([]);
  backend.listBranches.mockResolvedValue([BRANCH]);
}

// ─── A1: fetchClinicReportData — Firestore I/O ─────────────────────────────
describe('A1 fetchClinicReportData — Firestore I/O', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('A1.1 — fetches all required collections', async () => {
    await fetchClinicReportData({ from: '2026-04-01', to: '2026-04-30' });
    expect(backend.getAllSales).toHaveBeenCalledOnce();
    expect(backend.getAllCustomers).toHaveBeenCalledOnce();
    expect(backend.listBranches).toHaveBeenCalledOnce();
    expect(backend.listDoctors).toHaveBeenCalledOnce();
    expect(backend.listStaff).toHaveBeenCalledOnce();
    expect(backend.listExpenses).toHaveBeenCalledOnce();
  });

  it('A1.2 — returns sales, customers, branches arrays', async () => {
    const result = await fetchClinicReportData({ from: '2026-04-01', to: '2026-04-30' });
    expect(Array.isArray(result.sales)).toBe(true);
    expect(Array.isArray(result.customers)).toBe(true);
    expect(Array.isArray(result.branches)).toBe(true);
    expect(result.sales[0].id).toBe('s1');
  });

  it('A1.3 — partial fetch failure does not throw — captured per-key', async () => {
    backend.listExpenses.mockRejectedValueOnce(new Error('expense fetch failed'));
    const result = await fetchClinicReportData({ from: '2026-04-01', to: '2026-04-30' });
    expect(result.errors.expenses).toMatch(/expense fetch failed/);
    expect(result.expenses).toEqual([]);
    expect(result.sales).toBeTruthy();
  });

  it('A1.4 — multiple fetch failures still return partial result', async () => {
    backend.listProducts.mockRejectedValueOnce(new Error('products down'));
    backend.listDoctors.mockRejectedValueOnce(new Error('doctors down'));
    const result = await fetchClinicReportData({ from: '2026-04-01', to: '2026-04-30' });
    expect(result.errors.products).toMatch(/products down/);
    expect(result.errors.doctors).toMatch(/doctors down/);
    expect(result.products).toEqual([]);
    expect(result.doctors).toEqual([]);
    expect(result.branches).toBeTruthy(); // others still loaded
  });

  it('A1.5 — errors key is always present in result', async () => {
    const result = await fetchClinicReportData({ from: '2026-04-01', to: '2026-04-30' });
    expect(result).toHaveProperty('errors');
    expect(typeof result.errors).toBe('object');
  });
});

// ─── A2: composeClinicReportSnapshot — pure orchestration ─────────────────
describe('A2 composeClinicReportSnapshot — pure orchestration', () => {
  const rawData = {
    sales: [SALE],
    customers: [CUSTOMER],
    appointments: [],
    staff: [],
    doctors: [],
    products: [],
    batches: [],
    courses: [],
    expenses: [EXPENSE],
    branches: [BRANCH],
    errors: {},
  };

  it('A2.1 — returns a ClinicReportSnapshot with 4 top-level keys', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(Object.keys(snap)).toEqual(expect.arrayContaining(['tiles', 'charts', 'tables', 'meta']));
  });

  it('A2.2 — tiles.revenueYtd reflects sale total', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tiles.revenueYtd).toBe(5000);
  });

  it('A2.2b — tiles.expenseRatio computed correctly', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    // 1000/5000 = 20%
    expect(snap.tiles.expenseRatio).toBeCloseTo(20, 1);
  });

  it('A2.3 — tables.topServices populated', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tables).toHaveProperty('topServices');
    expect(Array.isArray(snap.tables.topServices)).toBe(true);
  });

  it('A2.3b — tables.topDoctors populated', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tables).toHaveProperty('topDoctors');
    expect(Array.isArray(snap.tables.topDoctors)).toBe(true);
  });

  it('A2.3c — tables.topProducts populated', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tables).toHaveProperty('topProducts');
    expect(Array.isArray(snap.tables.topProducts)).toBe(true);
  });

  it('A2.4 — charts include retentionCohort, branchComparison, revenueTrend', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.charts).toHaveProperty('retentionCohort');
    expect(snap.charts).toHaveProperty('branchComparison');
    expect(snap.charts).toHaveProperty('revenueTrend');
  });

  it('A2.5 — meta.generatedAt is ISO timestamp', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.meta.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('A2.6 — V14 — no undefined leaves', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    function walk(obj, path = '$') {
      if (obj === undefined) throw new Error(`undefined at ${path}`);
      if (obj === null || typeof obj !== 'object') return;
      if (Array.isArray(obj)) obj.forEach((v, i) => walk(v, `${path}[${i}]`));
      else Object.entries(obj).forEach(([k, v]) => walk(v, `${path}.${k}`));
    }
    expect(() => walk(snap)).not.toThrow();
  });

  it('A2.7 — partial errors propagate to snapshot.meta.partialErrors', () => {
    const partial = { ...rawData, errors: { expenses: 'fetch failed' } };
    const snap = composeClinicReportSnapshot(partial, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.meta.partialErrors).toEqual({ expenses: 'fetch failed' });
  });

  it('A2.8 — meta.partialErrors is null when no errors', () => {
    const snap = composeClinicReportSnapshot(rawData, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.meta.partialErrors).toBeNull();
  });

  it('A2.9 — empty rawData does not throw', () => {
    expect(() =>
      composeClinicReportSnapshot(
        { sales: [], customers: [], appointments: [], staff: [], doctors: [], products: [], batches: [], courses: [], expenses: [], branches: [], errors: {} },
        { from: '2026-04-01', to: '2026-04-30' }
      )
    ).not.toThrow();
  });

  it('A2.10 — null/undefined rawData does not throw', () => {
    expect(() => composeClinicReportSnapshot(null, { from: '2026-04-01', to: '2026-04-30' })).not.toThrow();
    expect(() => composeClinicReportSnapshot(undefined, {})).not.toThrow();
  });
});

// ─── A3: clinicReportAggregator — full pipeline ────────────────────────────
describe('A3 clinicReportAggregator — full pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupMocks();
  });

  it('A3.1 — end-to-end produces complete snapshot with tiles', async () => {
    const snap = await clinicReportAggregator({ from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tiles.revenueYtd).toBe(5000);
  });

  it('A3.2 — branchComparison has rows matching branches', async () => {
    const snap = await clinicReportAggregator({ from: '2026-04-01', to: '2026-04-30' });
    expect(snap.charts.branchComparison.rows).toHaveLength(1);
  });

  it('A3.3 — called with no filter does not throw', async () => {
    await expect(clinicReportAggregator()).resolves.toBeDefined();
  });
});
