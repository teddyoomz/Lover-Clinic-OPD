// V34 (2026-04-28) — ADJUST_ADD silent qty-cap bug fix
//
// Bug: createStockAdjustment used `reverseQtyNumeric` for type='add' which caps
// `remaining` at `total`. When admin adjusts +N on a batch already at full
// capacity (remaining === total), the math returns the SAME qty silently.
// runTransaction commits batch.update (no-op since qty unchanged), movement
// (with before === after), and adjustment doc — admin sees "บันทึกสำเร็จ"
// but balance never moves. Long-standing latent bug; surfaced when user did
// +20 +20 +10 on a chanel le'bess 10/10 batch and reported "ยอดไม่เปลี่ยน".
//
// Fix: new `adjustAddQtyNumeric` helper (soft cap — bumps total only when
// new remaining exceeds it) + createStockAdjustment uses it for type='add'.
// `reverseQtyNumeric` semantic preserved for actual reverse-of-deduction
// (used by _reverseOneMovement → reverseStockForSale/Treatment/Order).
//
// Per Rule I: pure helper tests + source-grep regression guards + adversarial
// inputs + flow-simulate verifying tx writes the new (post-bug-fix) qty.
// preview_eval runtime verification documented inline in the V-entry.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  adjustAddQtyNumeric,
  reverseQtyNumeric,
  deductQtyNumeric,
  buildQtyNumeric,
} from '../src/lib/stockUtils.js';

const STOCK_UTILS_PATH = join(process.cwd(), 'src', 'lib', 'stockUtils.js');
const BACKEND_CLIENT_PATH = join(process.cwd(), 'src', 'lib', 'backendClient.js');
const STOCK_UTILS_SRC = readFileSync(STOCK_UTILS_PATH, 'utf-8');
const BACKEND_CLIENT_SRC = readFileSync(BACKEND_CLIENT_PATH, 'utf-8');

// ─── D1: Pure helper unit tests ─────────────────────────────────────────────
describe('V34.D1 — adjustAddQtyNumeric pure helper', () => {
  it('USER BUG REPRO: 10/10 + 20 → 30/30 (was 10/10 silent cap)', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 10 }, 20))
      .toEqual({ remaining: 30, total: 30 });
  });

  it('soft cap preserved: 50/40 + 1 → 50/41 (room available, total unchanged)', () => {
    expect(adjustAddQtyNumeric({ total: 50, remaining: 40 }, 1))
      .toEqual({ remaining: 41, total: 50 });
  });

  it('overflow grows total: 100/50 + 100 → 150/150', () => {
    expect(adjustAddQtyNumeric({ total: 100, remaining: 50 }, 100))
      .toEqual({ remaining: 150, total: 150 });
  });

  it('huge overflow: 10/5 + 100 → 105/105', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 5 }, 100))
      .toEqual({ remaining: 105, total: 105 });
  });

  it('count correction within capacity: 10/5 + 3 → 8/10 (remaining < total)', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 5 }, 3))
      .toEqual({ remaining: 8, total: 10 });
  });

  it('count correction at exact total: 10/5 + 5 → 10/10', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 5 }, 5))
      .toEqual({ remaining: 10, total: 10 });
  });

  it('depleted batch refill: 10/0 + 5 → 5/10 (refill within capacity)', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 0 }, 5))
      .toEqual({ remaining: 5, total: 10 });
  });

  it('depleted batch overflow refill: 10/0 + 50 → 50/50', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 0 }, 50))
      .toEqual({ remaining: 50, total: 50 });
  });

  it('zero (no-op): 10/10 + 0 → 10/10', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 10 }, 0))
      .toEqual({ remaining: 10, total: 10 });
  });

  it('fractional: 10/5 + 2.5 → 7.5/10', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 5 }, 2.5))
      .toEqual({ remaining: 7.5, total: 10 });
  });

  it('fractional overflow: 10/9.5 + 1 → 10.5/10.5', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 9.5 }, 1))
      .toEqual({ remaining: 10.5, total: 10.5 });
  });
});

// ─── D2: Adversarial inputs ─────────────────────────────────────────────────
describe('V34.D2 — adversarial inputs', () => {
  it('rejects negative amount', () => {
    expect(() => adjustAddQtyNumeric({ total: 10, remaining: 10 }, -1))
      .toThrow(/Invalid adjust-add amount/);
  });

  it('rejects negative amount with fractional', () => {
    expect(() => adjustAddQtyNumeric({ total: 10, remaining: 10 }, -0.001))
      .toThrow(/Invalid adjust-add amount/);
  });

  it('coerces NaN amount → 0 (toNumber returns 0)', () => {
    // NaN coerces to 0 via toNumber helper — explicit invariant
    expect(adjustAddQtyNumeric({ total: 10, remaining: 10 }, NaN))
      .toEqual({ remaining: 10, total: 10 });
  });

  it('coerces undefined qty fields → 0', () => {
    expect(adjustAddQtyNumeric({}, 5))
      .toEqual({ remaining: 5, total: 5 });
  });

  it('coerces null qty → 0/0 base', () => {
    expect(adjustAddQtyNumeric(null, 7))
      .toEqual({ remaining: 7, total: 7 });
  });

  it('coerces string qty fields', () => {
    expect(adjustAddQtyNumeric({ total: '50', remaining: '40' }, 1))
      .toEqual({ remaining: 41, total: 50 });
  });

  it('coerces string amount', () => {
    expect(adjustAddQtyNumeric({ total: 10, remaining: 10 }, '20'))
      .toEqual({ remaining: 30, total: 30 });
  });

  it('preserves invariant remaining <= total in all paths', () => {
    const cases = [
      { total: 100, remaining: 50, n: 10 },
      { total: 100, remaining: 50, n: 100 },
      { total: 10, remaining: 10, n: 5 },
      { total: 10, remaining: 0, n: 0 },
      { total: 10, remaining: 0, n: 50 },
    ];
    for (const c of cases) {
      const r = adjustAddQtyNumeric({ total: c.total, remaining: c.remaining }, c.n);
      expect(r.remaining).toBeLessThanOrEqual(r.total);
    }
  });
});

// ─── D3: reverseQtyNumeric semantic preserved (regression guard) ────────────
describe('V34.D3 — reverseQtyNumeric still hard-caps (REGRESSION GUARD)', () => {
  it('reverseQtyNumeric STILL caps at total (used by _reverseOneMovement)', () => {
    // V34 must NOT change reverseQtyNumeric semantics — it's still used by
    // _reverseOneMovement for actual reverse-of-deduction operations where
    // the cap is correct (you cannot un-deduct more than was originally
    // there). If this test breaks, _reverseOneMovement's compensating
    // movement math would also break.
    expect(reverseQtyNumeric({ total: 10, remaining: 10 }, 20))
      .toEqual({ remaining: 10, total: 10 });
  });

  it('reverseQtyNumeric: 50/40 + 5 → 50/45 (within cap)', () => {
    expect(reverseQtyNumeric({ total: 50, remaining: 40 }, 5))
      .toEqual({ remaining: 45, total: 50 });
  });

  it('reverseQtyNumeric: 50/40 + 100 → 50/50 (capped)', () => {
    expect(reverseQtyNumeric({ total: 50, remaining: 40 }, 100))
      .toEqual({ remaining: 50, total: 50 });
  });

  it('adjustAddQtyNumeric and reverseQtyNumeric give DIFFERENT results when at-cap', () => {
    const qty = { total: 10, remaining: 10 };
    expect(adjustAddQtyNumeric(qty, 5)).toEqual({ remaining: 15, total: 15 });
    expect(reverseQtyNumeric(qty, 5)).toEqual({ remaining: 10, total: 10 });
  });
});

// ─── D4: Source-grep regression guards ──────────────────────────────────────
describe('V34.D4 — source-grep regression guards', () => {
  it('stockUtils.js exports adjustAddQtyNumeric', () => {
    expect(STOCK_UTILS_SRC).toMatch(/^export function adjustAddQtyNumeric\b/m);
  });

  it('stockUtils.js export still exists for reverseQtyNumeric', () => {
    expect(STOCK_UTILS_SRC).toMatch(/^export function reverseQtyNumeric\b/m);
  });

  // Helper: extract function block by header phrase, ending at next top-level
  // export / async function / function / // ─── separator. Robust against
  // arbitrary nesting since we just slice between two anchors.
  function sliceFunctionBlock(src, headerRegex) {
    const startMatch = headerRegex.exec(src);
    if (!startMatch) return null;
    const start = startMatch.index;
    // Find next top-level boundary AFTER start
    const after = src.slice(start + startMatch[0].length);
    const endRel = after.search(/\n(?:export\s+(?:async\s+)?function|async\s+function|function|\/\/\s*─{3,})/);
    return endRel === -1 ? src.slice(start) : src.slice(start, start + startMatch[0].length + endRel);
  }

  it('createStockAdjustment imports adjustAddQtyNumeric (not reverseQtyNumeric)', () => {
    const block = sliceFunctionBlock(
      BACKEND_CLIENT_SRC,
      /export async function createStockAdjustment\b/
    );
    expect(block, 'createStockAdjustment function block exists').toBeTruthy();
    // Scope the not-match to the destructure assignment line only —
    // the V32 comment in the source explains the old behavior and
    // legitimately mentions "reverseQtyNumeric" by name.
    const destructureMatch = block.match(/const\s*\{[^}]*\}\s*=\s*stockUtils/);
    expect(destructureMatch, 'stockUtils destructure exists').toBeTruthy();
    expect(destructureMatch[0]).toMatch(/adjustAddQtyNumeric/);
    expect(destructureMatch[0]).not.toMatch(/reverseQtyNumeric/);
  });

  it('createStockAdjustment uses adjustAddQtyNumeric for type === "add"', () => {
    const block = sliceFunctionBlock(
      BACKEND_CLIENT_SRC,
      /export async function createStockAdjustment\b/
    );
    expect(block).toBeTruthy();
    // Anti-regression: any future Edit that flips this back to reverseQtyNumeric
    // is the V34 bug returning. Lock the pattern explicitly — the 'add' branch
    // must call adjustAddQtyNumeric within ~300 chars of the type check.
    expect(block).toMatch(/type === ['"]add['"][\s\S]{0,300}adjustAddQtyNumeric/);
  });

  it('_reverseOneMovement still uses reverseQtyNumeric (cap-at-total)', () => {
    // Regression guard the OTHER way: _reverseOneMovement MUST keep
    // reverseQtyNumeric (cap at total). If a future refactor "unifies" the
    // helpers and uses adjustAddQtyNumeric here, refunds would inflate
    // totals — a different class of stock-conservation bug.
    const block = sliceFunctionBlock(
      BACKEND_CLIENT_SRC,
      /async function _reverseOneMovement\b/
    );
    expect(block, '_reverseOneMovement function block exists').toBeTruthy();
    expect(block).toMatch(/reverseQtyNumeric/);
    expect(block).not.toMatch(/adjustAddQtyNumeric/);
  });

  it('V34 marker comment present in stockUtils.js', () => {
    expect(STOCK_UTILS_SRC).toMatch(/V32 \(2026-04-28\)/);
  });

  it('V32 → V34 rename caveat: V-entry references V32 in comments — accept either marker', () => {
    // The fix was originally drafted as "V32" before realizing V32 was taken
    // (PDF alignment family). Either marker text is acceptable as long as
    // the helper exists and the math is correct.
    const hasV32 = /V32 \(2026-04-28\)/.test(STOCK_UTILS_SRC);
    const hasV34 = /V34 \(2026-04-28\)/.test(STOCK_UTILS_SRC);
    expect(hasV32 || hasV34).toBe(true);
  });
});

// ─── D5: Flow simulate — full createStockAdjustment with mocked tx ──────────
describe('V34.D5 — createStockAdjustment full-flow simulate (mocked Firestore tx)', () => {
  let txGetCalls;
  let txUpdateCalls;
  let txSetCalls;
  let mockedBatch;

  beforeEach(() => {
    txGetCalls = [];
    txUpdateCalls = [];
    txSetCalls = [];
    mockedBatch = null;
    vi.resetModules();
  });

  async function runAdjust({ initialQty, type, qty, branchId }) {
    txGetCalls = [];
    txUpdateCalls = [];
    txSetCalls = [];
    mockedBatch = {
      batchId: 'TEST-BATCH-V34',
      productId: 'TEST-PROD',
      productName: 'Test Product',
      branchId,
      qty: initialQty,
      status: 'active',
      originalCost: 100,
    };

    // Mock firebase modules
    vi.doMock('firebase/firestore', () => ({
      doc: (db, ...path) => ({ __doc: path.join('/') }),
      collection: (db, ...path) => ({ __col: path.join('/') }),
      runTransaction: vi.fn(async (db, fn) => {
        return fn({
          get: async (ref) => {
            txGetCalls.push(ref.__doc);
            return { exists: () => !!mockedBatch, data: () => mockedBatch };
          },
          update: (ref, data) => { txUpdateCalls.push({ path: ref.__doc, data }); },
          set: (ref, data) => { txSetCalls.push({ path: ref.__doc, data }); },
        });
      }),
      // Other exports the module needs
      getDoc: vi.fn(),
      getDocs: vi.fn(),
      setDoc: vi.fn(),
      updateDoc: vi.fn(),
      deleteDoc: vi.fn(),
      query: vi.fn(),
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn(async () => undefined) })),
      onSnapshot: vi.fn(),
      Timestamp: { now: vi.fn(() => ({ toMillis: () => Date.now() })) },
      serverTimestamp: vi.fn(() => 'SERVER_TS'),
      arrayUnion: vi.fn((...args) => ({ __arrayUnion: args })),
      arrayRemove: vi.fn((...args) => ({ __arrayRemove: args })),
      increment: vi.fn((n) => ({ __increment: n })),
    }));
    vi.doMock('../src/firebase.js', () => ({ db: { __mock: true }, appId: 'test-app', auth: {} }));

    const { createStockAdjustment } = await import('../src/lib/backendClient.js');
    return createStockAdjustment(
      { batchId: 'TEST-BATCH-V34', type, qty, note: 'V34 test', branchId },
      { user: { userId: 'TEST-V34', userName: 'TEST-V34' } }
    );
  }

  it('USER BUG REPRO: type=add on full-capacity 10/10 + 20 → tx.update writes 30/30', async () => {
    const result = await runAdjust({
      initialQty: { total: 10, remaining: 10 },
      type: 'add',
      qty: 20,
      branchId: 'WH-TEST-V34',
    });

    expect(result.success).toBe(true);
    expect(result.before).toBe(10);
    expect(result.after).toBe(30); // BEFORE V34 FIX: this was 10 (silent cap)

    // Verify tx.update wrote { qty: { total: 30, remaining: 30 } }
    const batchUpdate = txUpdateCalls.find(c => c.path.includes('be_stock_batches'));
    expect(batchUpdate).toBeTruthy();
    expect(batchUpdate.data.qty).toEqual({ total: 30, remaining: 30 });
    expect(batchUpdate.data.status).toBe('active');
  });

  it('soft cap: type=add on 50/40 + 1 → tx.update writes 50/41 (preserves total)', async () => {
    const result = await runAdjust({
      initialQty: { total: 50, remaining: 40 },
      type: 'add',
      qty: 1,
      branchId: 'WH-TEST-V34',
    });

    expect(result.before).toBe(40);
    expect(result.after).toBe(41);

    const batchUpdate = txUpdateCalls.find(c => c.path.includes('be_stock_batches'));
    expect(batchUpdate.data.qty).toEqual({ total: 50, remaining: 41 });
  });

  it('overflow: type=add on 100/50 + 100 → tx.update writes 150/150', async () => {
    const result = await runAdjust({
      initialQty: { total: 100, remaining: 50 },
      type: 'add',
      qty: 100,
      branchId: 'WH-TEST-V34',
    });

    expect(result.after).toBe(150);
    const batchUpdate = txUpdateCalls.find(c => c.path.includes('be_stock_batches'));
    expect(batchUpdate.data.qty).toEqual({ total: 150, remaining: 150 });
  });

  it('type=reduce unchanged: 50/40 reduce 5 → 50/35', async () => {
    const result = await runAdjust({
      initialQty: { total: 50, remaining: 40 },
      type: 'reduce',
      qty: 5,
      branchId: 'WH-TEST-V34',
    });

    expect(result.after).toBe(35);
    const batchUpdate = txUpdateCalls.find(c => c.path.includes('be_stock_batches'));
    expect(batchUpdate.data.qty).toEqual({ total: 50, remaining: 35 });
  });

  it('movement record reflects post-fix qty (before/after on tx.set)', async () => {
    await runAdjust({
      initialQty: { total: 10, remaining: 10 },
      type: 'add',
      qty: 20,
      branchId: 'WH-TEST-V34',
    });

    const movementSet = txSetCalls.find(c => c.path.includes('be_stock_movements'));
    expect(movementSet).toBeTruthy();
    expect(movementSet.data.before).toBe(10);
    expect(movementSet.data.after).toBe(30); // not 10 (cap-bug fingerprint)
    expect(movementSet.data.qty).toBe(20); // signed positive for ADJUST_ADD
    expect(movementSet.data.type).toBe(3); // MOVEMENT_TYPES.ADJUST_ADD
    expect(movementSet.data.branchId).toBe('WH-TEST-V34');
  });

  it('adjustment audit doc carries correct branchId for central tier', async () => {
    await runAdjust({
      initialQty: { total: 10, remaining: 10 },
      type: 'add',
      qty: 5,
      branchId: 'WH-CENTRAL-1',
    });

    const adjSet = txSetCalls.find(c => c.path.includes('be_stock_adjustments'));
    expect(adjSet).toBeTruthy();
    expect(adjSet.data.branchId).toBe('WH-CENTRAL-1');
    expect(adjSet.data.type).toBe('add');
    expect(adjSet.data.qty).toBe(5);
    expect(adjSet.data.user).toEqual({ userId: 'TEST-V34', userName: 'TEST-V34' });
  });

  it('rejects type=reduce when remaining insufficient (cap from below)', async () => {
    await expect(
      runAdjust({
        initialQty: { total: 10, remaining: 5 },
        type: 'reduce',
        qty: 10,
        branchId: 'WH-TEST-V34',
      })
    ).rejects.toThrow(/Stock insufficient/);
  });

  it('rejects invalid type', async () => {
    await expect(
      runAdjust({
        initialQty: { total: 10, remaining: 10 },
        type: 'bogus',
        qty: 1,
        branchId: 'WH-TEST-V34',
      })
    ).rejects.toThrow(/Invalid adjustment type/);
  });

  it('rejects negative qty', async () => {
    await expect(
      runAdjust({
        initialQty: { total: 10, remaining: 10 },
        type: 'add',
        qty: -5,
        branchId: 'WH-TEST-V34',
      })
    ).rejects.toThrow(/Invalid qty/);
  });
});

// ─── D6: Documentation lock — V32-style verbose comment present ────────────
describe('V34.D6 — documentation locks', () => {
  it('adjustAddQtyNumeric JSDoc explains semantic difference from reverseQtyNumeric', () => {
    expect(STOCK_UTILS_SRC).toMatch(/Distinct from `reverseQtyNumeric`/);
    expect(STOCK_UTILS_SRC).toMatch(/soft cap/);
  });

  it('reverseQtyNumeric JSDoc warns NOT to use for ADJUST_ADD', () => {
    expect(STOCK_UTILS_SRC).toMatch(/admin-discovered extra stock \(ADJUST_ADD\)/);
  });
});
