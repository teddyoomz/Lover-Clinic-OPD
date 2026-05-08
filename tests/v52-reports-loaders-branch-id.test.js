// V52 (BS-11) — reportsLoaders.js branchId param unit tests (Rule N targeted).
//
// Verifies each loader in src/lib/reportsLoaders.js correctly handles the new
// `branchId` + `allBranches` opts:
//   - branchId provided (truthy string) → Firestore `where('branchId','==',id)` clause OR client-side filter applied
//   - allBranches: true → no branch filter even if branchId provided
//   - neither → no branch filter (legacy/backward-compat behavior)
//
// Mocks `firebase/firestore` (where, query, getDocs, etc.) to capture
// what conditions the loader produces, plus run the fallback path
// to verify client-side filter logic.
//
// Spec: docs/superpowers/specs/2026-05-08-report-tabs-branch-scope-design.md
// Plan: docs/superpowers/plans/2026-05-08-report-tabs-branch-scope.md

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock chain capture ─────────────────────────────────────────────────────
// We replace firebase/firestore so that:
//  - `collection()` returns a sentinel
//  - `where(field, op, val)` returns a recorded { field, op, val }
//  - `orderBy(...)` returns a sentinel
//  - `query(col, ...conds)` records the conds for inspection
//  - `getDocs(q)` resolves to a controllable doc list (default: returns
//    the FIXTURES set so the fallback / sort / inline filters can run)

const FIXTURES = {
  sales: [
    { id: 'TEST-SALE-1', branchId: 'BR-A', saleDate: '2026-05-01', status: 'paid' },
    { id: 'TEST-SALE-2', branchId: 'BR-B', saleDate: '2026-05-02', status: 'paid' },
    { id: 'TEST-SALE-3', branchId: 'BR-A', saleDate: '2026-05-03', status: 'cancelled' },
    { id: 'TEST-SALE-4', branchId: '',     saleDate: '2026-05-04', status: 'paid' },
  ],
  appts: [
    { id: 'TEST-APPT-1', branchId: 'BR-A', date: '2026-05-01', startTime: '09:00' },
    { id: 'TEST-APPT-2', branchId: 'BR-B', date: '2026-05-02', startTime: '10:00' },
  ],
  customers: [
    { id: 'TEST-CUST-1', branchId: 'BR-A', clonedAt: '2026-04-01' },
    { id: 'TEST-CUST-2', branchId: 'BR-B', clonedAt: '2026-04-02' },
    { id: 'TEST-CUST-3', branchId: 'BR-A', clonedAt: '2026-04-03' },
  ],
  expenses: [
    { id: 'TEST-EXP-1', branchId: 'BR-A', date: '2026-05-01', amount: 100 },
    { id: 'TEST-EXP-2', branchId: 'BR-B', date: '2026-05-02', amount: 200 },
  ],
  claims: [
    { id: 'TEST-CLAIM-1', branchId: 'BR-A', claimDate: '2026-05-01', amount: 50 },
    { id: 'TEST-CLAIM-2', branchId: 'BR-B', claimDate: '2026-05-02', amount: 80 },
  ],
  treatments: [
    { id: 'TEST-T-1', branchId: 'BR-A', detail: { treatmentDate: '2026-05-01', status: 'completed' } },
    { id: 'TEST-T-2', branchId: 'BR-B', detail: { treatmentDate: '2026-05-02', status: 'completed' } },
    { id: 'TEST-T-3', branchId: 'BR-A', detail: { treatmentDate: '2026-05-03', status: 'cancelled' } },
  ],
  movements: [
    { id: 'TEST-M-1', branchId: 'BR-A', createdAt: '2026-05-01T10:00:00Z' },
    { id: 'TEST-M-2', branchId: 'BR-B', createdAt: '2026-05-02T10:00:00Z' },
  ],
  batches: [
    { id: 'TEST-B-1', branchId: 'BR-A', status: 'available', qty: { remaining: 10, total: 10 } },
    { id: 'TEST-B-2', branchId: 'BR-B', status: 'available', qty: { remaining: 5,  total: 5 } },
    { id: 'TEST-B-3', branchId: 'BR-A', status: 'cancelled', qty: { remaining: 0,  total: 10 } },
  ],
};

// Per-test capture of conds passed to `query()` and which collection name
// was last requested. This lets us assert "did the loader add a branchId
// where-clause when given branchId?".
let capturedConds = [];
let lastCollectionName = '';
let useFallbackPath = false; // toggle to force the catch path
let docsToReturn = [];

vi.mock('firebase/firestore', () => {
  return {
    collection: (_db, ...path) => {
      lastCollectionName = path[path.length - 1];
      return { __sentinel: 'col', name: lastCollectionName };
    },
    where: (field, op, val) => ({ __sentinel: 'where', field, op, val }),
    orderBy: (field, dir) => ({ __sentinel: 'orderBy', field, dir }),
    query: (col, ...conds) => {
      capturedConds = conds.filter((c) => c?.__sentinel === 'where');
      return { __sentinel: 'query', col, conds };
    },
    getDocs: async () => {
      if (useFallbackPath) {
        // Simulate the "missing index" path by throwing FROM the first call,
        // then succeeding on the fallback. We use a counter:
        useFallbackPath = false;
        throw new Error('FAKE_INDEX_NOT_BUILT');
      }
      return {
        docs: docsToReturn.map((d) => ({ id: d.id, data: () => ({ ...d, id: undefined }) })),
      };
    },
  };
});

// Mock firebase.js — both db and appId are read at top of reportsLoaders.
vi.mock('../src/firebase.js', () => ({
  db: { __sentinel: 'db' },
  appId: 'test-app-id',
}));

// Import AFTER mocks are set up
import * as loaders from '../src/lib/reportsLoaders.js';

beforeEach(() => {
  capturedConds = [];
  lastCollectionName = '';
  useFallbackPath = false;
  docsToReturn = [];
});

function condsHaveBranchId(branchId) {
  return capturedConds.some((c) => c.field === 'branchId' && c.op === '==' && c.val === branchId);
}

function condsHaveNoBranchId() {
  return !capturedConds.some((c) => c.field === 'branchId');
}

// ─── L1 — loadSalesByDateRange ──────────────────────────────────────────────

describe('L1 — loadSalesByDateRange branchId param', () => {
  it('L1.1 no branchId → no branchId where-clause (legacy behavior)', async () => {
    docsToReturn = FIXTURES.sales;
    await loaders.loadSalesByDateRange({ from: '2026-05-01', to: '2026-05-31' });
    expect(condsHaveNoBranchId()).toBe(true);
  });

  it('L1.2 branchId provided → adds where("branchId","==",id) clause', async () => {
    docsToReturn = FIXTURES.sales;
    await loaders.loadSalesByDateRange({ from: '2026-05-01', to: '2026-05-31', branchId: 'BR-A' });
    expect(condsHaveBranchId('BR-A')).toBe(true);
  });

  it('L1.3 allBranches: true → no branchId clause even if branchId given', async () => {
    docsToReturn = FIXTURES.sales;
    await loaders.loadSalesByDateRange({ branchId: 'BR-A', allBranches: true });
    expect(condsHaveNoBranchId()).toBe(true);
  });

  it('L1.4 empty string branchId → no clause (treated like undefined)', async () => {
    docsToReturn = FIXTURES.sales;
    await loaders.loadSalesByDateRange({ branchId: '' });
    expect(condsHaveNoBranchId()).toBe(true);
  });

  it('L1.5 fallback path filters branchId client-side', async () => {
    useFallbackPath = true;
    docsToReturn = FIXTURES.sales;
    const out = await loaders.loadSalesByDateRange({ branchId: 'BR-A', includeCancelled: true });
    expect(out.every((s) => s.branchId === 'BR-A')).toBe(true);
    expect(out.length).toBeGreaterThan(0);
  });

  it('L1.6 includeCancelled: false (default) excludes cancelled', async () => {
    docsToReturn = FIXTURES.sales;
    const out = await loaders.loadSalesByDateRange({ branchId: 'BR-A' });
    expect(out.every((s) => s.status !== 'cancelled')).toBe(true);
  });
});

// ─── L2 — loadAppointmentsByDateRange ───────────────────────────────────────

describe('L2 — loadAppointmentsByDateRange branchId param', () => {
  it('L2.1 no branchId → no clause', async () => {
    docsToReturn = FIXTURES.appts;
    await loaders.loadAppointmentsByDateRange({ from: '2026-05-01', to: '2026-05-31' });
    expect(condsHaveNoBranchId()).toBe(true);
  });

  it('L2.2 branchId → adds clause', async () => {
    docsToReturn = FIXTURES.appts;
    await loaders.loadAppointmentsByDateRange({ branchId: 'BR-A' });
    expect(condsHaveBranchId('BR-A')).toBe(true);
  });

  it('L2.3 fallback filters client-side', async () => {
    useFallbackPath = true;
    docsToReturn = FIXTURES.appts;
    const out = await loaders.loadAppointmentsByDateRange({ branchId: 'BR-A' });
    expect(out.every((a) => a.branchId === 'BR-A')).toBe(true);
  });
});

// ─── L3 — loadAllCustomersForReport ─────────────────────────────────────────

describe('L3 — loadAllCustomersForReport branchId param', () => {
  it('L3.1 no opts → returns all (legacy)', async () => {
    docsToReturn = FIXTURES.customers;
    const out = await loaders.loadAllCustomersForReport();
    expect(out.length).toBe(FIXTURES.customers.length);
  });

  it('L3.2 branchId → client-side filter narrows to that branch', async () => {
    docsToReturn = FIXTURES.customers;
    const out = await loaders.loadAllCustomersForReport({ branchId: 'BR-A' });
    expect(out.every((c) => c.branchId === 'BR-A')).toBe(true);
    expect(out.length).toBe(2); // CUST-1 + CUST-3
  });

  it('L3.3 allBranches: true overrides branchId', async () => {
    docsToReturn = FIXTURES.customers;
    const out = await loaders.loadAllCustomersForReport({ branchId: 'BR-A', allBranches: true });
    expect(out.length).toBe(FIXTURES.customers.length);
  });
});

// ─── L4 — loadExpensesByDateRange ───────────────────────────────────────────

describe('L4 — loadExpensesByDateRange branchId param', () => {
  it('L4.1 no branchId → no clause', async () => {
    docsToReturn = FIXTURES.expenses;
    await loaders.loadExpensesByDateRange({ from: '2026-05-01', to: '2026-05-31' });
    expect(condsHaveNoBranchId()).toBe(true);
  });

  it('L4.2 branchId → adds clause', async () => {
    docsToReturn = FIXTURES.expenses;
    await loaders.loadExpensesByDateRange({ branchId: 'BR-A' });
    expect(condsHaveBranchId('BR-A')).toBe(true);
  });
});

// ─── L5 — loadSaleInsuranceClaimsByDateRange ────────────────────────────────

describe('L5 — loadSaleInsuranceClaimsByDateRange branchId param', () => {
  it('L5.1 branchId → adds clause', async () => {
    docsToReturn = FIXTURES.claims;
    await loaders.loadSaleInsuranceClaimsByDateRange({ branchId: 'BR-A' });
    expect(condsHaveBranchId('BR-A')).toBe(true);
  });

  it('L5.2 fallback filters client-side', async () => {
    useFallbackPath = true;
    docsToReturn = FIXTURES.claims;
    const out = await loaders.loadSaleInsuranceClaimsByDateRange({ branchId: 'BR-A' });
    expect(out.every((c) => c.branchId === 'BR-A')).toBe(true);
  });
});

// ─── L6 — loadTreatmentsByDateRange ─────────────────────────────────────────

describe('L6 — loadTreatmentsByDateRange branchId param', () => {
  // This loader does full-collection read + client-side filter (no Firestore index)
  it('L6.1 no branchId → no filter', async () => {
    docsToReturn = FIXTURES.treatments;
    const out = await loaders.loadTreatmentsByDateRange({ includeCancelled: true });
    expect(out.length).toBe(FIXTURES.treatments.length);
  });

  it('L6.2 branchId → narrows to branch', async () => {
    docsToReturn = FIXTURES.treatments;
    const out = await loaders.loadTreatmentsByDateRange({ branchId: 'BR-A', includeCancelled: true });
    expect(out.every((t) => t.branchId === 'BR-A')).toBe(true);
    expect(out.length).toBe(2);
  });

  it('L6.3 includeCancelled: false (default) excludes cancelled', async () => {
    docsToReturn = FIXTURES.treatments;
    const out = await loaders.loadTreatmentsByDateRange({ branchId: 'BR-A' });
    expect(out.every((t) => t.detail?.status !== 'cancelled')).toBe(true);
  });
});

// ─── L7 — loadStockMovementsByDateRange ─────────────────────────────────────

describe('L7 — loadStockMovementsByDateRange branchId param', () => {
  it('L7.1 no branchId → no filter', async () => {
    docsToReturn = FIXTURES.movements;
    const out = await loaders.loadStockMovementsByDateRange();
    expect(out.length).toBe(FIXTURES.movements.length);
  });

  it('L7.2 branchId → narrows to branch', async () => {
    docsToReturn = FIXTURES.movements;
    const out = await loaders.loadStockMovementsByDateRange({ branchId: 'BR-A' });
    expect(out.every((m) => m.branchId === 'BR-A')).toBe(true);
  });
});

// ─── L8 — loadAllStockBatchesForReport (existing branchId; allBranches new) ──

describe('L8 — loadAllStockBatchesForReport allBranches opt', () => {
  it('L8.1 branchId only → narrows', async () => {
    docsToReturn = FIXTURES.batches;
    const out = await loaders.loadAllStockBatchesForReport({ branchId: 'BR-A' });
    expect(out.every((b) => b.branchId === 'BR-A')).toBe(true);
  });

  it('L8.2 allBranches: true → returns all (excluding cancelled/depleted/zero-qty)', async () => {
    docsToReturn = FIXTURES.batches;
    const out = await loaders.loadAllStockBatchesForReport({ branchId: 'BR-A', allBranches: true });
    // Cancelled batch (BATCH-3) is filtered regardless; remaining 2 active.
    expect(out.length).toBe(2);
    const branches = new Set(out.map((b) => b.branchId));
    expect(branches.size).toBeGreaterThanOrEqual(2); // BR-A + BR-B both visible
  });
});
