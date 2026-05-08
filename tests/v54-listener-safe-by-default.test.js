// V54 (BS-13) — Raw listener+getter safe-by-default discipline.
//
// Validates 4 functions in src/lib/backendClient.js:
//   getAppointmentsByMonth (getter)
//   getAppointmentsByDate (getter)
//   listenToAppointmentsByMonth (listener)
//   listenToAppointmentsByDate (listener)
//
// Per scenario:
//   1. Explicit branchId → applies where('branchId','==',id) clause ✓
//   2. allBranches: true → no clause (cross-branch) ✓
//   3. Empty/null branchId + no allBranches → resolveSelectedBranchId fallback;
//      if STILL falsy → return empty (NEVER fall back to whole collection)
//   4. Legacy positional listener (no opts) → safe-by-default: empty when no
//      branch resolved
//
// Spec: docs/superpowers/specs/2026-05-08-listener-safe-by-default-design.md

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock chain capture ─────────────────────────────────────────────────────

let capturedConds = [];
let docsToReturn = [];
let onSnapshotMock = null;

vi.mock('firebase/firestore', () => ({
  collection: () => ({ __sentinel: 'col' }),
  query: (col, ...conds) => {
    capturedConds = conds.filter((c) => c?.__sentinel === 'where');
    return { __sentinel: 'query', conds };
  },
  where: (field, op, val) => ({ __sentinel: 'where', field, op, val }),
  orderBy: () => ({ __sentinel: 'orderBy' }),
  doc: () => ({ __sentinel: 'doc' }),
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({
    docs: docsToReturn.map((d) => ({ id: d.id, data: () => ({ ...d, id: undefined }) })),
  }),
  setDoc: async () => {},
  updateDoc: async () => {},
  deleteDoc: async () => {},
  writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
  runTransaction: async (_db, fn) => fn({ get: async () => ({ exists: () => false }), set: () => {}, update: () => {}, delete: () => {} }),
  serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
  limit: () => ({ __sentinel: 'limit' }),
  onSnapshot: (q, next) => {
    onSnapshotMock = { q, next };
    Promise.resolve().then(() => {
      next({ docs: docsToReturn.map((d) => ({ id: d.id, data: () => ({ ...d, id: undefined }) })) });
    });
    return () => { onSnapshotMock = null; };
  },
}));

vi.mock('../src/firebase.js', () => ({
  db: { __sentinel: 'db' },
  auth: { currentUser: null },
  appId: 'test-app',
}));

// Mock branchSelection so we can control resolveSelectedBranchId per-test.
let mockResolvedBranchId = null;
vi.mock('../src/lib/branchSelection.js', () => ({
  STORAGE_KEY: 'selectedBranchId',
  FALLBACK_ID: null,
  resolveSelectedBranchId: () => mockResolvedBranchId,
  setSelectedBranchId: () => {},
  resetBranchSelection: () => {},
}));

// Lazy-import after mocks
import * as bc from '../src/lib/backendClient.js';

const FIXTURES = {
  appts: [
    { id: 'TEST-V54-1', branchId: 'BR-A', date: '2026-05-04', startTime: '10:00' },
    { id: 'TEST-V54-2', branchId: 'BR-B', date: '2026-05-04', startTime: '11:00' },
    { id: 'TEST-V54-3', branchId: 'BR-A', date: '2026-05-04', startTime: '12:00' },
  ],
};

beforeEach(() => {
  capturedConds = [];
  docsToReturn = [];
  onSnapshotMock = null;
  mockResolvedBranchId = null;
});

function condsHaveBranchId(branchId) {
  return capturedConds.some((c) => c.field === 'branchId' && c.val === branchId);
}
function condsHaveNoBranchId() {
  return !capturedConds.some((c) => c.field === 'branchId');
}

// ─── L1 — getAppointmentsByMonth safe-by-default ────────────────────────────

describe('L1 — getAppointmentsByMonth safe-by-default (V54)', () => {
  it('L1.1 explicit branchId → where-clause applied', async () => {
    docsToReturn = FIXTURES.appts;
    await bc.getAppointmentsByMonth('2026-05', { branchId: 'BR-A' });
    expect(condsHaveBranchId('BR-A')).toBe(true);
  });

  it('L1.2 allBranches: true → no where-clause (cross-branch read)', async () => {
    docsToReturn = FIXTURES.appts;
    await bc.getAppointmentsByMonth('2026-05', { allBranches: true });
    expect(condsHaveNoBranchId()).toBe(true);
  });

  it('L1.3 empty {} opts + resolveSelectedBranchId returns "BR-X" → applies where', async () => {
    mockResolvedBranchId = 'BR-X';
    docsToReturn = FIXTURES.appts;
    await bc.getAppointmentsByMonth('2026-05', {});
    expect(condsHaveBranchId('BR-X')).toBe(true);
  });

  it('L1.4 empty {} opts + resolveSelectedBranchId returns null → returns empty {} (NO fallback to whole collection)', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.appts;
    const out = await bc.getAppointmentsByMonth('2026-05', {});
    expect(out).toEqual({});
    expect(capturedConds).toEqual([]); // no query was even built
  });

  it('L1.5 no opts arg + null resolved → empty (legacy positional path)', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.appts;
    const out = await bc.getAppointmentsByMonth('2026-05');
    expect(out).toEqual({});
  });
});

// ─── L2 — getAppointmentsByDate safe-by-default ─────────────────────────────

describe('L2 — getAppointmentsByDate safe-by-default (V54)', () => {
  it('L2.1 explicit branchId → where-clause applied', async () => {
    docsToReturn = FIXTURES.appts;
    await bc.getAppointmentsByDate('2026-05-04', { branchId: 'BR-A' });
    expect(condsHaveBranchId('BR-A')).toBe(true);
  });

  it('L2.2 allBranches: true → no clause', async () => {
    docsToReturn = FIXTURES.appts;
    await bc.getAppointmentsByDate('2026-05-04', { allBranches: true });
    expect(condsHaveNoBranchId()).toBe(true);
  });

  it('L2.3 {} opts + resolved BR-X → applies where', async () => {
    mockResolvedBranchId = 'BR-X';
    docsToReturn = FIXTURES.appts;
    await bc.getAppointmentsByDate('2026-05-04', {});
    expect(condsHaveBranchId('BR-X')).toBe(true);
  });

  it('L2.4 {} opts + resolved null → empty array (NO whole-collection fallback)', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.appts;
    const out = await bc.getAppointmentsByDate('2026-05-04', {});
    expect(out).toEqual([]);
  });

  it('L2.5 invalid date → empty array (existing behavior preserved)', async () => {
    mockResolvedBranchId = 'BR-A';
    const out = await bc.getAppointmentsByDate('not-a-date', { branchId: 'BR-A' });
    expect(out).toEqual([]);
  });
});

// ─── L3 — listenToAppointmentsByDate safe-by-default ────────────────────────

describe('L3 — listenToAppointmentsByDate safe-by-default (V54)', () => {
  it('L3.1 explicit branchId → where-clause applied; onSnapshot fires', async () => {
    docsToReturn = FIXTURES.appts;
    const calls = [];
    const unsub = bc.listenToAppointmentsByDate('2026-05-04', { branchId: 'BR-A' }, (appts) => calls.push(appts));
    await Promise.resolve();
    expect(condsHaveBranchId('BR-A')).toBe(true);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('L3.2 allBranches: true → no clause', async () => {
    docsToReturn = FIXTURES.appts;
    const unsub = bc.listenToAppointmentsByDate('2026-05-04', { allBranches: true }, () => {});
    await Promise.resolve();
    expect(condsHaveNoBranchId()).toBe(true);
    unsub();
  });

  it('L3.3 {} opts + resolved BR-X → applies where', async () => {
    mockResolvedBranchId = 'BR-X';
    docsToReturn = FIXTURES.appts;
    const unsub = bc.listenToAppointmentsByDate('2026-05-04', {}, () => {});
    await Promise.resolve();
    expect(condsHaveBranchId('BR-X')).toBe(true);
    unsub();
  });

  it('L3.4 {} opts + resolved null → fires onChange([]) + returns noop unsubscribe (NO whole-collection)', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.appts;
    const calls = [];
    const unsub = bc.listenToAppointmentsByDate('2026-05-04', {}, (appts) => calls.push(appts));
    expect(calls).toEqual([[]]); // immediate empty fire
    expect(typeof unsub).toBe('function'); // noop unsub
    expect(onSnapshotMock).toBeNull(); // no actual subscription happened
  });

  it('L3.5 legacy positional (date, onChange) — no opts → safe-by-default empty', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.appts;
    const calls = [];
    const unsub = bc.listenToAppointmentsByDate('2026-05-04', (appts) => calls.push(appts));
    expect(calls).toEqual([[]]);
    expect(typeof unsub).toBe('function');
  });

  it('L3.6 invalid date branch returns a callable unsubscribe (existing behavior)', async () => {
    // normalizeApptDate's behavior on edge inputs is not part of V54; just
    // verify the function returns a callable unsub (the canonical contract).
    mockResolvedBranchId = 'BR-A';
    const unsub = bc.listenToAppointmentsByDate('not-a-date', { branchId: 'BR-A' }, () => {});
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

// ─── L4 — listenToAppointmentsByMonth safe-by-default ───────────────────────

describe('L4 — listenToAppointmentsByMonth safe-by-default (V54 root cause fix)', () => {
  it('L4.1 explicit branchId → where-clause applied', async () => {
    docsToReturn = FIXTURES.appts;
    const unsub = bc.listenToAppointmentsByMonth('2026-05', { branchId: 'BR-A' }, () => {});
    await Promise.resolve();
    expect(condsHaveBranchId('BR-A')).toBe(true);
    unsub();
  });

  it('L4.2 allBranches: true → no clause', async () => {
    docsToReturn = FIXTURES.appts;
    const unsub = bc.listenToAppointmentsByMonth('2026-05', { allBranches: true }, () => {});
    await Promise.resolve();
    expect(condsHaveNoBranchId()).toBe(true);
    unsub();
  });

  it('L4.3 {} opts + resolved BR-X → applies where (AdminDashboard scenario)', async () => {
    mockResolvedBranchId = 'BR-X';
    docsToReturn = FIXTURES.appts;
    const unsub = bc.listenToAppointmentsByMonth('2026-05', {}, () => {});
    await Promise.resolve();
    expect(condsHaveBranchId('BR-X')).toBe(true);
    unsub();
  });

  it('L4.4 {} opts + resolved null → onChange([]) + noop (CLOSES PRE-V54 ADMIN LEAK)', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.appts;
    const calls = [];
    const unsub = bc.listenToAppointmentsByMonth('2026-05', {}, (appts) => calls.push(appts));
    expect(calls).toEqual([[]]);
    expect(typeof unsub).toBe('function');
    expect(onSnapshotMock).toBeNull(); // PRE-V54 would have subscribed to whole collection
  });

  it('L4.5 legacy positional (yearMonth, onChange) → safe-by-default', async () => {
    mockResolvedBranchId = null;
    const calls = [];
    const unsub = bc.listenToAppointmentsByMonth('2026-05', (appts) => calls.push(appts));
    expect(calls).toEqual([[]]);
    expect(typeof unsub).toBe('function');
  });

  it('L4.6 invalid yearMonth → onChange([]) + noop (existing behavior)', async () => {
    const calls = [];
    const unsub = bc.listenToAppointmentsByMonth('not-a-month', { branchId: 'BR-A' }, (appts) => calls.push(appts));
    expect(calls).toEqual([[]]);
    expect(typeof unsub).toBe('function');
  });
});

// ─── L5 — V54 marker comments ───────────────────────────────────────────────

describe('L5 — V54 source-grep markers', () => {
  it('L5.1 backendClient.js contains V54/BS-13 markers in 4 functions', async () => {
    const { readFileSync } = await import('node:fs');
    const c = readFileSync('src/lib/backendClient.js', 'utf8');
    // At least 4 V54 markers (one per fixed function)
    const matches = c.match(/V54\s*\(BS-13/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('L5.2 AdminDashboard.jsx contains V54 marker + explicit branchId pass', async () => {
    const { readFileSync } = await import('node:fs');
    const c = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
    expect(c).toMatch(/V54\s*\(BS-13/);
    // Two-pattern check: `listenToAppointmentsByMonth` is present (call site)
    // AND `{ branchId: selectedBranchId }` appears in the file (explicit V52/BS-11
    // pattern). Avoids a single-regex match that breaks on comment-internal
    // parens like "(BS-13, 2026-05-08)" terminating [^)]* early.
    expect(c).toMatch(/listenToAppointmentsByMonth\b/);
    expect(c).toMatch(/\{\s*branchId:\s*selectedBranchId\s*\}/);
  });
});
