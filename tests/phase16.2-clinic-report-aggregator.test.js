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
// Real aggregateStaffSales returns {staffRows, doctorRows, totals, meta} —
// NOT {rows}. Mock matches the production shape.
vi.mock('../src/lib/staffSalesAggregator.js', () => ({
  aggregateStaffSales: vi.fn(() => ({
    staffRows: [{ staffKey: 'k1', staffName: 'Jane (admin)', saleCount: 5, netShare: 30000, paidShare: 30000 }],
    doctorRows: [{ doctorKey: 'd1', doctorName: 'Dr.A', saleCount: 10, netTotal: 50000, paidAmount: 50000 }],
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

// ─── A4: Real-schema field mapping (post 0aa8cb6 bug fix) ──────────────────
// Verifies orchestrator reads sale.billing.netTotal + e.date + sales.items.products[]
// + parsed customer.courses[].qty string. The previous version used s.total,
// e.expenseDate, qtyRemaining, and stockReportAggregator output (inventory),
// all of which produced empty/wrong values against real be_sales/be_customers.
import { aggregateRevenueByProcedure } from '../src/lib/revenueAnalysisAggregator.js';
import { aggregateStaffSales } from '../src/lib/staffSalesAggregator.js';

describe('A4 Real-schema field mapping', () => {
  it('A4.1 — topServices DEDUPS by courseName across procedureType+category splits', () => {
    // revenueAnalysisAggregator returns rows grouped by (procType, category, courseName).
    // Same service in 2 categories → 2 rows. Dashboard should sum to 1 row per name.
    aggregateRevenueByProcedure.mockReturnValueOnce({
      rows: [
        { courseName: 'เทส IV', procedureType: 'IV', category: 'Skin', lineTotal: 600000, qty: 3 },
        { courseName: 'เทส IV', procedureType: 'IV', category: 'Anti-aging', lineTotal: 200000, qty: 1 },
        { courseName: 'Botox', procedureType: 'Botox', category: 'Aesthetic', lineTotal: 500000, qty: 2 },
      ],
      totals: {}, meta: {},
    });
    const snap = composeClinicReportSnapshot({
      sales: [SALE], customers: [CUSTOMER], appointments: [], staff: [], doctors: [],
      products: [], batches: [], courses: [], expenses: [], branches: [BRANCH], errors: {},
    }, { from: '2026-04-01', to: '2026-04-30' });

    // เทส IV must appear EXACTLY ONCE (merged across 2 procedureType/category splits)
    const tesIvRows = snap.tables.topServices.filter(r => r.name === 'เทส IV');
    expect(tesIvRows).toHaveLength(1);
    expect(tesIvRows[0].revenue).toBe(800000); // 600k + 200k
    expect(tesIvRows[0].count).toBe(4);        // 3 + 1
    // Botox separate
    expect(snap.tables.topServices[0].name).toBe('เทส IV'); // bigger revenue → first
    expect(snap.tables.topServices[1].name).toBe('Botox');
  });

  it('A4.2 — topProducts aggregates from sales.items.products[] (real sales, not stockReport inventory)', () => {
    const salesWithProducts = [{
      id: 's1', branchId: 'BR-A', billing: { netTotal: 30000 }, status: 'paid', saleDate: '2026-04-15', customerId: 'c1',
      items: {
        products: [
          { productId: 'p1', productName: 'BA Vitamin', qty: 5, lineTotal: 10000 },
          { productId: 'p2', productName: 'Aloe Gel', qty: 3, lineTotal: 6000 },
        ],
        medications: [
          { productId: 'm1', productName: 'Painkiller', qty: 2, lineTotal: 800 },
        ],
      },
    }];
    const snap = composeClinicReportSnapshot({
      sales: salesWithProducts, customers: [CUSTOMER], appointments: [], staff: [], doctors: [],
      products: [], batches: [], courses: [], expenses: [], branches: [BRANCH], errors: {},
    }, { from: '2026-04-01', to: '2026-04-30' });

    expect(snap.tables.topProducts.length).toBeGreaterThanOrEqual(3);
    const baVitamin = snap.tables.topProducts.find(p => p.name === 'BA Vitamin');
    expect(baVitamin).toBeTruthy();
    expect(baVitamin.value).toBe(10000);
    expect(baVitamin.qty).toBe(5);
    // Sorted desc by value
    expect(snap.tables.topProducts[0].name).toBe('BA Vitamin'); // 10000 > 6000 > 800
  });

  it('A4.3 — topDoctors reads staffSales.doctorRows (real shape) — Thai honorific names safe', () => {
    // staffSalesAggregator returns {staffRows, doctorRows} NOT {rows}.
    // Thai honorifics นพ./พญ./ทพ. were previously dropped by /Dr\./i regex —
    // now we trust the per-doctor aggregation as-is from doctorRows.
    aggregateStaffSales.mockReturnValueOnce({
      staffRows: [],
      doctorRows: [
        { doctorKey: 'd1', doctorName: 'นพ.สมชาย',     netTotal: 50000, paidAmount: 50000, saleCount: 10 },
        { doctorKey: 'd2', doctorName: 'Jane (admin)', netTotal: 30000, paidAmount: 30000, saleCount: 5 },
        { doctorKey: 'd3', doctorName: 'พญ.มาลี',       netTotal: 20000, paidAmount: 20000, saleCount: 3 },
      ],
      totals: {}, meta: {},
    });
    const snap = composeClinicReportSnapshot({
      sales: [SALE], customers: [CUSTOMER], appointments: [], staff: [], doctors: [],
      products: [], batches: [], courses: [], expenses: [], branches: [BRANCH], errors: {},
    }, { from: '2026-04-01', to: '2026-04-30' });

    expect(snap.tables.topDoctors).toHaveLength(3);
    expect(snap.tables.topDoctors[0].staffName).toBe('นพ.สมชาย'); // sorted desc by total (netTotal)
    expect(snap.tables.topDoctors[0].total).toBe(50000);
  });

  it('A4.3b — topDoctors empty when doctorRows missing (graceful degradation)', () => {
    aggregateStaffSales.mockReturnValueOnce({ staffRows: [], totals: {}, meta: {} });
    const snap = composeClinicReportSnapshot({
      sales: [SALE], customers: [CUSTOMER], appointments: [], staff: [], doctors: [],
      products: [], batches: [], courses: [], expenses: [], branches: [BRANCH], errors: {},
    }, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.tables.topDoctors).toEqual([]);
  });

  it('A4.4 — revenueTrend sums sale.billing.netTotal (real schema)', () => {
    const realSales = [
      { id: 's1', branchId: 'BR-A', billing: { netTotal: 12000 }, status: 'paid', saleDate: '2026-04-15', customerId: 'c1' },
      { id: 's2', branchId: 'BR-A', billing: { netTotal: 8000 }, status: 'paid', saleDate: '2026-04-20', customerId: 'c2' },
    ];
    const snap = composeClinicReportSnapshot({
      sales: realSales, customers: [CUSTOMER], appointments: [], staff: [], doctors: [],
      products: [], batches: [], courses: [], expenses: [], branches: [BRANCH], errors: {},
    }, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.charts.revenueTrend).toEqual([{ label: '2026-04', value: 20000 }]);
  });

  it('A4.5 — cashFlow uses sale.billing.netTotal AND expense.date (real schema)', () => {
    const realSales = [
      { id: 's1', branchId: 'BR-A', billing: { netTotal: 10000 }, status: 'paid', saleDate: '2026-04-15', customerId: 'c1' },
    ];
    const realExpenses = [
      { id: 'e1', date: '2026-04-10', amount: 3000 },
    ];
    const snap = composeClinicReportSnapshot({
      sales: realSales, customers: [CUSTOMER], appointments: [], staff: [], doctors: [],
      products: [], batches: [], courses: [], expenses: realExpenses, branches: [BRANCH], errors: {},
    }, { from: '2026-04-01', to: '2026-04-30' });
    expect(snap.charts.cashFlow).toEqual([{ label: '2026-04', value: 7000 }]); // 10000 − 3000
  });

  it('A4.6 — courseUtilization parses customer.courses[].qty string (real schema)', () => {
    const realCustomers = [
      { id: 'c1', createdAt: '2026-04-15', courses: [
        { qty: '50 / 100 U', status: 'active' },   // used 50/100
        { qty: '25 / 50 ครั้ง', status: 'active' }, // used 25/50
      ] },
    ];
    const snap = composeClinicReportSnapshot({
      sales: [SALE], customers: realCustomers, appointments: [], staff: [], doctors: [],
      products: [], batches: [], courses: [], expenses: [], branches: [BRANCH], errors: {},
    }, { from: '2026-04-01', to: '2026-04-30' });
    // total = 150, used = 75 → 50%
    expect(snap.tiles.courseUtilization).toBeCloseTo(50, 1);
  });
});
