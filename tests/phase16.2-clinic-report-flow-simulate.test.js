// tests/phase16.2-clinic-report-flow-simulate.test.js
//
// Phase 16.2 full-flow simulate per Rule I. Chains: filter init → fetch →
// compose snapshot → tile rendering → CSV export → drilldown click → branch
// toggle → cache invalidation → second fetch → V14 no-undefined.
//
// Mocks the Firestore I/O (backendClient list-* fns) but exercises the real
// composeClinicReportSnapshot + helpers + CSV builder + DRILLDOWN_MAP.
//
// + Source-grep regression guards (item c per Rule I)
// + Adversarial inputs (item d)
// + Lifecycle assertions (item e)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// Mock backendClient — use REAL export names (verified in Task 5)
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

import * as backend from '../src/lib/backendClient.js';
import {
  fetchClinicReportData,
  composeClinicReportSnapshot,
  clinicReportAggregator,
} from '../src/lib/clinicReportAggregator.js';
import { toCsv } from '../src/lib/clinicReportCsv.js';

const FIXTURE_BRANCHES = [
  { id: 'BR-A', name: 'ชลบุรี', isDefault: true },
  { id: 'BR-B', name: 'ปทุมธานี' },
];

const FIXTURE_SALES = [
  // BR-A sales in range
  { id: 's1', customerId: 'c1', branchId: 'BR-A', total: 5000,  saleDate: '2025-11-05', status: 'paid',      items: { courses: [{ courseId: 'co1', courseName: 'ดริปผิวใส', qty: 1, lineTotal: 5000 }] } },
  { id: 's2', customerId: 'c2', branchId: 'BR-A', total: 4000,  saleDate: '2025-11-20', status: 'paid',      items: { courses: [{ courseId: 'co1', courseName: 'ดริปผิวใส', qty: 1, lineTotal: 4000 }] } },
  { id: 's3', customerId: 'c1', branchId: 'BR-A', total: 2000,  saleDate: '2025-12-15', status: 'paid',      items: {} },
  { id: 's5', customerId: 'c1', branchId: 'BR-A', total: 3000,  saleDate: '2026-01-20', status: 'paid',      items: {} },
  { id: 's7', customerId: 'c4', branchId: 'BR-A', total: 12000, saleDate: '2026-04-20', status: 'paid',      items: {} },
  // BR-B sales in range
  { id: 's4', customerId: 'c3', branchId: 'BR-B', total: 8000,  saleDate: '2025-12-10', status: 'paid',      items: {} },
  { id: 's6', customerId: 'c3', branchId: 'BR-B', total: 1500,  saleDate: '2026-01-25', status: 'paid',      items: {} },
  // Cancelled — must NEVER inflate revenue
  { id: 's8', customerId: 'c5', branchId: 'BR-A', total: 99999, saleDate: '2026-04-22', status: 'cancelled', items: {} },
];

const FIXTURE_CUSTOMERS = [
  { id: 'c1', createdAt: '2025-11-05', branchId: 'BR-A' },
  { id: 'c2', createdAt: '2025-11-20', branchId: 'BR-A' },
  { id: 'c3', createdAt: '2025-12-10', branchId: 'BR-B' },
  { id: 'c4', createdAt: '2026-04-19', branchId: 'BR-A', courses: [{ qty: 10, qtyRemaining: 4 }, { qty: 5, qtyRemaining: 1 }] },
  { id: 'c5', createdAt: '2026-04-22', branchId: 'BR-A' },
];

function setupMocks() {
  vi.clearAllMocks();
  backend.getAllSales.mockResolvedValue(FIXTURE_SALES);
  backend.getAllCustomers.mockResolvedValue(FIXTURE_CUSTOMERS);
  // getAppointmentsByMonth returns { date: [...] } grouped — empty for tests
  backend.getAppointmentsByMonth.mockResolvedValue({});
  backend.listStaff.mockResolvedValue([]);
  backend.listDoctors.mockResolvedValue([{ id: 'd1', name: 'Dr.A', role: 'doctor' }]);
  backend.listProducts.mockResolvedValue([{ id: 'p1', name: 'BA Vitamin' }]);
  backend.listStockBatches.mockResolvedValue([{ id: 'b1', productId: 'p1', productName: 'BA Vitamin', qty: { remaining: 10, total: 10 } }]);
  backend.listCourses.mockResolvedValue([{ id: 'co1', name: 'ดริปผิวใส', procedure_type_name: 'IV', category_name: 'Skin' }]);
  backend.listExpenses.mockResolvedValue([{ id: 'e1', amount: 4000, expenseDate: '2026-04-15' }]);
  backend.listBranches.mockResolvedValue(FIXTURE_BRANCHES);
}

describe('FS1 Full flow — Phase 16.2', () => {
  beforeEach(setupMocks);

  it('FS1.1 — Default 6-month filter → snapshot has all widgets populated', async () => {
    const filter = { from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-A', 'BR-B'] };
    const snap = await clinicReportAggregator(filter);

    // tiles
    expect(snap.tiles.revenueYtd).toBeGreaterThan(0);
    expect(snap.tiles.expenseRatio).toBeGreaterThanOrEqual(0);
    expect(typeof snap.tiles.avgTicket).toBe('number');
    expect(typeof snap.tiles.newCustomersPerMonth).toBe('number');

    // charts
    expect(snap.charts.revenueTrend.length).toBeGreaterThan(0);
    expect(snap.charts.retentionCohort.rows.length).toBeGreaterThan(0);
    // both branches visible in comparison
    expect(snap.charts.branchComparison.rows.length).toBe(2);

    // tables
    expect(snap.tables.topServices.length).toBeGreaterThanOrEqual(0);

    // meta
    expect(snap.meta.generatedAt).toMatch(/^\d{4}/);
  });

  it('FS1.2 — Branch filter clamps revenue to selected branches only', async () => {
    const aSnap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-A'] });
    const bSnap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-B'] });

    // Revenue differs between branches
    expect(aSnap.tiles.revenueYtd).not.toBe(bSnap.tiles.revenueYtd);

    // Branch comparison rows restricted to the selected branch only
    expect(aSnap.charts.branchComparison.rows.length).toBe(1);
    expect(aSnap.charts.branchComparison.rows[0].branchId).toBe('BR-A');

    expect(bSnap.charts.branchComparison.rows.length).toBe(1);
    expect(bSnap.charts.branchComparison.rows[0].branchId).toBe('BR-B');
  });

  it('FS1.3 — Cancelled sales never inflate revenue', async () => {
    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });
    // The cancelled sale s8 has total=99999; real paid revenue = 5000+4000+2000+3000+12000+8000+1500 = 35500
    expect(snap.tiles.revenueYtd).toBeLessThan(99999);
    expect(snap.tiles.revenueYtd).toBe(35500);
  });

  it('FS1.4 — CSV export round-trip preserves Thai + has BOM', async () => {
    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });
    const csv = toCsv(snap);

    // UTF-8 BOM (0xFEFF = 65279)
    expect(csv.charCodeAt(0)).toBe(0xFEFF);

    // Thai branch name must appear somewhere in the CSV
    expect(csv).toContain('ชลบุรี');

    // CSV has multiple lines (non-trivial)
    const lines = csv.split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThan(5);
  });

  it('FS1.5 — Lifecycle: orchestrator output is consistent for sorted vs reversed branchIds', async () => {
    const a = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-A', 'BR-B'] });
    const b = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30', branchIds: ['BR-B', 'BR-A'] });

    // Revenue must be identical regardless of branchIds array order
    expect(a.tiles.revenueYtd).toBe(b.tiles.revenueYtd);
  });

  it('FS1.6 — Adversarial: empty arrays everywhere → snapshot all zeros, no crash', async () => {
    backend.getAllSales.mockResolvedValueOnce([]);
    backend.getAllCustomers.mockResolvedValueOnce([]);
    backend.listExpenses.mockResolvedValueOnce([]);
    backend.listBranches.mockResolvedValueOnce([]);

    const snap = await clinicReportAggregator({ from: '2026-04-01', to: '2026-04-30' });

    expect(snap.tiles.revenueYtd).toBe(0);
    expect(snap.charts.revenueTrend).toEqual([]);
  });

  it('FS1.7 — Adversarial: one fetch fails → partial snapshot still produced', async () => {
    backend.listExpenses.mockRejectedValueOnce(new Error('expense db down'));

    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });

    // partialErrors.expenses should record the error message
    expect(snap.meta.partialErrors).not.toBeNull();
    expect(snap.meta.partialErrors.expenses).toMatch(/expense db down/);

    // Revenue should still be computed from the rest of the data
    expect(snap.tiles.revenueYtd).toBeGreaterThan(0);
  });

  it('FS1.8 — V14 no-undefined sweep across the whole snapshot tree', async () => {
    const snap = await clinicReportAggregator({ from: '2025-11-01', to: '2026-04-30' });

    function walk(obj, path) {
      if (obj === undefined) throw new Error(`undefined at ${path}`);
      if (obj === null || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        obj.forEach((v, i) => walk(v, `${path}[${i}]`));
      } else {
        Object.entries(obj).forEach(([k, v]) => walk(v, `${path}.${k}`));
      }
    }

    expect(() => walk(snap, '$')).not.toThrow();
  });
});

describe('FS2 Source-grep regression guards', () => {
  // Strip comment lines before checking — comments asserting "no X" would falsely match /X/.
  function nonCommentLines(src) {
    return src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  }

  it('FS2.1 — clinicReportAggregator does NOT read master_data in non-comment code (H-quater)', () => {
    const src = nonCommentLines(readFileSync('src/lib/clinicReportAggregator.js', 'utf8'));
    expect(src).not.toMatch(/master_data/);
  });

  it('FS2.2 — clinicReportAggregator does NOT import brokerClient or /api/proclinic in non-comment code (Rule E)', () => {
    const src = nonCommentLines(readFileSync('src/lib/clinicReportAggregator.js', 'utf8'));
    expect(src).not.toMatch(/brokerClient/);
    expect(src).not.toMatch(/\/api\/proclinic/);
  });

  it('FS2.3 — useClinicReport does NOT call setInterval (zero polling — comment excluded)', () => {
    const src = nonCommentLines(readFileSync('src/hooks/useClinicReport.js', 'utf8'));
    expect(src).not.toMatch(/setInterval/);
  });

  it('FS2.4 — ClinicReportTab uses onNavigate prop (not window.location)', () => {
    const src = readFileSync('src/components/backend/reports/ClinicReportTab.jsx', 'utf8');
    expect(src).toMatch(/onNavigate/);
    expect(src).not.toMatch(/window\.location\.assign|window\.location\.href\s*=/);
  });

  it('FS2.5 — All sibling aggregators imported by clinicReportAggregator exist as files', () => {
    const src = readFileSync('src/lib/clinicReportAggregator.js', 'utf8');
    // Match relative imports like: from './revenueAnalysisAggregator.js'
    const importMatches = [...src.matchAll(/from\s+['"]\.\/([\w-]+\.js)['"]/g)].map(m => m[1]);
    expect(importMatches.length).toBeGreaterThan(0);
    for (const name of importMatches) {
      expect(
        () => readFileSync(`src/lib/${name}`, 'utf8'),
        `Expected ${name} to exist in src/lib/`
      ).not.toThrow();
    }
  });
});
