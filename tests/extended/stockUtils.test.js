// ═══════════════════════════════════════════════════════════════════════════
// Phase 8 — stockUtils pure-function unit tests
// No Firestore — all synchronous pure-function verification.
// Mirrors courseUtils sanity tests + adds batch FIFO/FEFO/LIFO adversarial.
// ═══════════════════════════════════════════════════════════════════════════
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BRANCH_ID,
  MOVEMENT_TYPES,
  TRANSFER_STATUS,
  WITHDRAWAL_STATUS,
  BATCH_STATUS,
  deductQtyNumeric,
  reverseQtyNumeric,
  buildQtyNumeric,
  formatStockQty,
  hasExpired,
  daysToExpiry,
  isBatchDepleted,
  isBatchAvailable,
  batchFifoAllocate,
} from '../src/lib/stockUtils.js';

// ─── Constants sanity ───────────────────────────────────────────────────────
describe('[STK-U] constants sanity', () => {
  it('DEFAULT_BRANCH_ID === "main"', () => {
    expect(DEFAULT_BRANCH_ID).toBe('main');
  });

  it('MOVEMENT_TYPES matches ProClinic enum codes', () => {
    expect(MOVEMENT_TYPES.IMPORT).toBe(1);
    expect(MOVEMENT_TYPES.SALE).toBe(2);
    expect(MOVEMENT_TYPES.ADJUST_ADD).toBe(3);
    expect(MOVEMENT_TYPES.ADJUST_REDUCE).toBe(4);
    expect(MOVEMENT_TYPES.TREATMENT).toBe(6);
    expect(MOVEMENT_TYPES.TREATMENT_MED).toBe(7);
    expect(MOVEMENT_TYPES.EXPORT_TRANSFER).toBe(8);
    expect(MOVEMENT_TYPES.RECEIVE).toBe(9);
    expect(MOVEMENT_TYPES.CANCEL_IMPORT).toBe(14);
  });

  it('TRANSFER_STATUS has 5 states (0..4)', () => {
    expect(TRANSFER_STATUS.PENDING_DISPATCH).toBe(0);
    expect(TRANSFER_STATUS.PENDING_RECEIVE).toBe(1);
    expect(TRANSFER_STATUS.COMPLETED).toBe(2);
    expect(TRANSFER_STATUS.CANCELLED).toBe(3);
    expect(TRANSFER_STATUS.REJECTED).toBe(4);
  });

  it('WITHDRAWAL_STATUS has 4 states (no rejected)', () => {
    expect(WITHDRAWAL_STATUS.PENDING_APPROVAL).toBe(0);
    expect(WITHDRAWAL_STATUS.SENT).toBe(1);
    expect(WITHDRAWAL_STATUS.COMPLETED).toBe(2);
    expect(WITHDRAWAL_STATUS.CANCELLED).toBe(3);
  });

  it('BATCH_STATUS has 4 lifecycle states', () => {
    expect(BATCH_STATUS.ACTIVE).toBe('active');
    expect(BATCH_STATUS.DEPLETED).toBe('depleted');
    expect(BATCH_STATUS.CANCELLED).toBe('cancelled');
    expect(BATCH_STATUS.EXPIRED).toBe('expired');
  });
});

// ─── Numeric qty ────────────────────────────────────────────────────────────
describe('[STK-U] buildQtyNumeric / deductQtyNumeric / reverseQtyNumeric', () => {
  it('build → deduct → reverse round-trip preserves total', () => {
    const q0 = buildQtyNumeric(1000);
    expect(q0).toEqual({ remaining: 1000, total: 1000 });

    const q1 = deductQtyNumeric(q0, 300);
    expect(q1).toEqual({ remaining: 700, total: 1000 });

    const q2 = reverseQtyNumeric(q1, 300);
    expect(q2).toEqual({ remaining: 1000, total: 1000 });
  });

  it('deduct throws when insufficient', () => {
    const q = buildQtyNumeric(100);
    expect(() => deductQtyNumeric(q, 101)).toThrow(/insufficient/i);
  });

  it('deduct 0 is a no-op', () => {
    const q = buildQtyNumeric(100);
    expect(deductQtyNumeric(q, 0)).toEqual({ remaining: 100, total: 100 });
  });

  it('deduct negative throws', () => {
    const q = buildQtyNumeric(100);
    expect(() => deductQtyNumeric(q, -5)).toThrow(/invalid deduct qty/i);
  });

  it('deduct preserves total on partial consume', () => {
    const q = deductQtyNumeric({ remaining: 50, total: 100 }, 25);
    expect(q.total).toBe(100);
    expect(q.remaining).toBe(25);
  });

  it('reverse caps at total (never exceeds)', () => {
    const q = reverseQtyNumeric({ remaining: 5, total: 10 }, 100);
    expect(q).toEqual({ remaining: 10, total: 10 });
  });

  it('reverse 0 is a no-op', () => {
    const q = reverseQtyNumeric({ remaining: 5, total: 10 }, 0);
    expect(q).toEqual({ remaining: 5, total: 10 });
  });

  it('reverse negative throws', () => {
    expect(() => reverseQtyNumeric({ remaining: 5, total: 10 }, -3)).toThrow(/invalid reverse amount/i);
  });

  it('fractional qty (0.5) round-trips exactly', () => {
    const q0 = buildQtyNumeric(10);
    const q1 = deductQtyNumeric(q0, 0.5);
    expect(q1.remaining).toBe(9.5);
    const q2 = reverseQtyNumeric(q1, 0.5);
    expect(q2.remaining).toBe(10);
  });

  it('cumulative small deductions sum exactly (ε-level drift tolerated)', () => {
    let q = buildQtyNumeric(1);
    for (let i = 0; i < 10; i++) q = deductQtyNumeric(q, 0.1);
    // JS float math: 10×0.1 !== 1 exactly — tolerate ε
    expect(q.remaining).toBeCloseTo(0, 10);
  });

  it('huge qty (10,000,000) handles without overflow', () => {
    const q0 = buildQtyNumeric(10_000_000);
    const q1 = deductQtyNumeric(q0, 9_999_999);
    expect(q1.remaining).toBe(1);
    expect(q1.total).toBe(10_000_000);
  });

  it('missing qty object → toNumber treats as 0; deduct 0 ok', () => {
    expect(deductQtyNumeric(undefined, 0)).toEqual({ remaining: 0, total: 0 });
    expect(() => deductQtyNumeric(undefined, 1)).toThrow(/insufficient/i);
  });
});

// ─── Display formatting ────────────────────────────────────────────────────
describe('[STK-U] formatStockQty', () => {
  it('integer formatting with unit', () => {
    expect(formatStockQty(900, 1000, 'U')).toBe('900 / 1000 U');
  });

  it('decimal formatting with 2 decimals', () => {
    expect(formatStockQty(0.5, 1.5, 'mL')).toBe('0.50 / 1.50 mL');
  });

  it('integer when input is integer, even if typed as float', () => {
    expect(formatStockQty(100.0, 200.0, 'เม็ด')).toBe('100 / 200 เม็ด');
  });

  it('no unit → no trailing space', () => {
    expect(formatStockQty(5, 10, '')).toBe('5 / 10');
  });

  it('non-numeric falls back to 0', () => {
    expect(formatStockQty('abc', 'def', 'U')).toBe('0 / 0 U');
  });
});

// ─── Expiry helpers ────────────────────────────────────────────────────────
describe('[STK-U] hasExpired / daysToExpiry', () => {
  const now = new Date('2026-04-18T00:00:00.000Z');

  it('no expiresAt → never expired', () => {
    expect(hasExpired({ expiresAt: null }, now)).toBe(false);
    expect(hasExpired({}, now)).toBe(false);
  });

  it('past expiresAt → expired', () => {
    expect(hasExpired({ expiresAt: '2026-04-17' }, now)).toBe(true);
  });

  it('future expiresAt → not expired', () => {
    expect(hasExpired({ expiresAt: '2026-04-19' }, now)).toBe(false);
  });

  it('invalid expiresAt string → treated as no expiry', () => {
    expect(hasExpired({ expiresAt: 'not-a-date' }, now)).toBe(false);
  });

  it('daysToExpiry positive for future, negative for past', () => {
    expect(daysToExpiry({ expiresAt: '2026-04-25' }, now)).toBe(7);
    expect(daysToExpiry({ expiresAt: '2026-04-11' }, now)).toBe(-7);
  });

  it('daysToExpiry null for missing expiresAt', () => {
    expect(daysToExpiry({}, now)).toBeNull();
    expect(daysToExpiry({ expiresAt: '' }, now)).toBeNull();
    expect(daysToExpiry({ expiresAt: 'bad' }, now)).toBeNull();
  });
});

// ─── Batch state ───────────────────────────────────────────────────────────
describe('[STK-U] isBatchDepleted / isBatchAvailable', () => {
  const now = new Date('2026-04-18T00:00:00.000Z');

  it('depleted when remaining === 0', () => {
    expect(isBatchDepleted({ qty: { remaining: 0, total: 100 } })).toBe(true);
  });

  it('not depleted when remaining > 0', () => {
    expect(isBatchDepleted({ qty: { remaining: 1, total: 100 } })).toBe(false);
  });

  it('depleted when remaining is negative (shouldn\'t happen but safe)', () => {
    expect(isBatchDepleted({ qty: { remaining: -5, total: 100 } })).toBe(true);
  });

  it('missing qty → treated as depleted', () => {
    expect(isBatchDepleted({})).toBe(true);
    expect(isBatchDepleted(null)).toBe(true);
  });

  it('available: active + remaining + not expired', () => {
    expect(isBatchAvailable({
      status: BATCH_STATUS.ACTIVE,
      qty: { remaining: 50, total: 100 },
      expiresAt: '2026-12-31',
    }, now)).toBe(true);
  });

  it('not available: cancelled', () => {
    expect(isBatchAvailable({
      status: BATCH_STATUS.CANCELLED,
      qty: { remaining: 50, total: 100 },
    }, now)).toBe(false);
  });

  it('not available: depleted', () => {
    expect(isBatchAvailable({
      status: BATCH_STATUS.ACTIVE,
      qty: { remaining: 0, total: 100 },
    }, now)).toBe(false);
  });

  it('not available: expired', () => {
    expect(isBatchAvailable({
      status: BATCH_STATUS.ACTIVE,
      qty: { remaining: 50, total: 100 },
      expiresAt: '2026-04-17',
    }, now)).toBe(false);
  });

  it('null batch → unavailable', () => {
    expect(isBatchAvailable(null)).toBe(false);
  });
});

// ─── batchFifoAllocate — the heart of Phase 8 allocation ───────────────────
describe('[STK-F] batchFifoAllocate — FIFO / FEFO / LIFO / exact-batch', () => {
  const now = new Date('2026-04-18T00:00:00.000Z');

  // Fixture helper
  function mkBatch({ id, product = 'Allergan', branch = 'main', qty = 100, expiresAt = null, receivedAt, status = 'active' }) {
    return {
      batchId: id,
      productId: product,
      productName: product,
      branchId: branch,
      qty: { remaining: qty, total: qty },
      expiresAt,
      receivedAt: receivedAt || '2026-01-01',
      status,
    };
  }

  it('empty batches → full shortfall', () => {
    const r = batchFifoAllocate([], 50, { now });
    expect(r.allocations).toEqual([]);
    expect(r.shortfall).toBe(50);
  });

  it('single sufficient batch → one allocation', () => {
    const r = batchFifoAllocate([mkBatch({ id: 'B1', qty: 100 })], 30, { now });
    expect(r.allocations.length).toBe(1);
    expect(r.allocations[0]).toMatchObject({ batchId: 'B1', takeQty: 30 });
    expect(r.shortfall).toBe(0);
  });

  it('FEFO: earlier expiresAt consumed first (both future)', () => {
    const batches = [
      mkBatch({ id: 'B-AUG', expiresAt: '2026-08-01', qty: 50, receivedAt: '2026-01-01' }),
      mkBatch({ id: 'B-MAY', expiresAt: '2026-05-01', qty: 50, receivedAt: '2026-03-01' }),
    ];
    const r = batchFifoAllocate(batches, 40, { now });
    expect(r.allocations[0].batchId).toBe('B-MAY');
    expect(r.allocations[0].takeQty).toBe(40);
  });

  it('FIFO tie-break: same expiresAt → older receivedAt first', () => {
    const batches = [
      mkBatch({ id: 'B-NEW', expiresAt: '2026-06-01', qty: 100, receivedAt: '2026-03-01' }),
      mkBatch({ id: 'B-OLD', expiresAt: '2026-06-01', qty: 100, receivedAt: '2026-01-01' }),
    ];
    const r = batchFifoAllocate(batches, 50, { now });
    expect(r.allocations[0].batchId).toBe('B-OLD');
  });

  it('preferNewest: receivedAt DESC (LIFO for in-session batches)', () => {
    const batches = [
      mkBatch({ id: 'B-OLD', qty: 100, receivedAt: '2026-01-01' }),
      mkBatch({ id: 'B-NEW', qty: 100, receivedAt: '2026-04-15' }),
    ];
    const r = batchFifoAllocate(batches, 30, { now, preferNewest: true });
    expect(r.allocations[0].batchId).toBe('B-NEW');
  });

  it('no-expiry batches sort AFTER explicit-expiry batches (FEFO rule)', () => {
    const batches = [
      mkBatch({ id: 'B-FOREVER', expiresAt: null, qty: 100, receivedAt: '2026-01-01' }),
      mkBatch({ id: 'B-SOON', expiresAt: '2026-05-01', qty: 100, receivedAt: '2026-03-01' }),
    ];
    const r = batchFifoAllocate(batches, 50, { now });
    expect(r.allocations[0].batchId).toBe('B-SOON');
  });

  it('exactBatchId hits named batch first, then fallback', () => {
    const batches = [
      mkBatch({ id: 'B-OLD', qty: 100, receivedAt: '2026-01-01' }),
      mkBatch({ id: 'B-TARGET', qty: 30, receivedAt: '2026-04-01' }),
    ];
    const r = batchFifoAllocate(batches, 50, { now, exactBatchId: 'B-TARGET' });
    expect(r.allocations.length).toBe(2);
    expect(r.allocations[0].batchId).toBe('B-TARGET');
    expect(r.allocations[0].takeQty).toBe(30);
    expect(r.allocations[1].batchId).toBe('B-OLD');
    expect(r.allocations[1].takeQty).toBe(20);
  });

  it('exactBatchId alone satisfies demand → no fallback', () => {
    const batches = [
      mkBatch({ id: 'B-OLD', qty: 100 }),
      mkBatch({ id: 'B-TARGET', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 50, { now, exactBatchId: 'B-TARGET' });
    expect(r.allocations.length).toBe(1);
    expect(r.allocations[0].batchId).toBe('B-TARGET');
  });

  it('exactBatchId unavailable (cancelled) → falls back to FEFO', () => {
    const batches = [
      mkBatch({ id: 'B-DEAD', status: 'cancelled', qty: 100 }),
      mkBatch({ id: 'B-LIVE', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 50, { now, exactBatchId: 'B-DEAD' });
    expect(r.allocations[0].batchId).toBe('B-LIVE');
  });

  it('shortfall reported when total insufficient', () => {
    const batches = [mkBatch({ id: 'B1', qty: 10 })];
    const r = batchFifoAllocate(batches, 50, { now });
    expect(r.allocations.length).toBe(1);
    expect(r.allocations[0].takeQty).toBe(10);
    expect(r.shortfall).toBe(40);
  });

  it('skips cancelled batch', () => {
    const batches = [
      mkBatch({ id: 'B-DEAD', status: 'cancelled', qty: 100 }),
      mkBatch({ id: 'B-LIVE', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 30, { now });
    expect(r.allocations[0].batchId).toBe('B-LIVE');
  });

  it('skips depleted batch (remaining=0)', () => {
    const batches = [
      mkBatch({ id: 'B-EMPTY', qty: 0 }),
      mkBatch({ id: 'B-LIVE', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 30, { now });
    expect(r.allocations.length).toBe(1);
    expect(r.allocations[0].batchId).toBe('B-LIVE');
  });

  it('skips expired batch', () => {
    const batches = [
      mkBatch({ id: 'B-EXP', qty: 100, expiresAt: '2026-04-17' }),
      mkBatch({ id: 'B-LIVE', qty: 100, expiresAt: '2026-12-31' }),
    ];
    const r = batchFifoAllocate(batches, 30, { now });
    expect(r.allocations[0].batchId).toBe('B-LIVE');
  });

  it('productId filter: only matching product consumed', () => {
    const batches = [
      mkBatch({ id: 'B-BOTOX', product: 'Botox', qty: 100 }),
      mkBatch({ id: 'B-ALLER', product: 'Allergan', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 30, { now, productId: 'Allergan' });
    expect(r.allocations[0].batchId).toBe('B-ALLER');
  });

  it('branchId filter: only matching branch consumed', () => {
    const batches = [
      mkBatch({ id: 'B-BKK', branch: 'bangkok', qty: 100 }),
      mkBatch({ id: 'B-MAIN', branch: 'main', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 30, { now, branchId: 'main' });
    expect(r.allocations[0].batchId).toBe('B-MAIN');
  });

  it('custom filterFn narrows further', () => {
    const batches = [
      mkBatch({ id: 'B-PREMIUM', qty: 100 }),
      mkBatch({ id: 'B-REGULAR', qty: 100 }),
    ];
    batches[0].isPremium = true;
    const r = batchFifoAllocate(batches, 30, {
      now,
      filterFn: (b) => !b.isPremium,
    });
    expect(r.allocations[0].batchId).toBe('B-REGULAR');
  });

  it('zero deductQty → empty allocations, no shortfall', () => {
    const batches = [mkBatch({ id: 'B1', qty: 100 })];
    const r = batchFifoAllocate(batches, 0, { now });
    expect(r.allocations).toEqual([]);
    expect(r.shortfall).toBe(0);
  });

  it('negative deductQty → empty allocations (caller responsibility to validate)', () => {
    const batches = [mkBatch({ id: 'B1', qty: 100 })];
    const r = batchFifoAllocate(batches, -5, { now });
    expect(r.allocations).toEqual([]);
    expect(r.shortfall).toBe(0);
  });

  it('100 batches same product — FEFO deterministic order', () => {
    const batches = [];
    for (let i = 0; i < 100; i++) {
      batches.push(mkBatch({
        id: `B-${i}`,
        qty: 10,
        expiresAt: `2026-${String(6 + (i % 6)).padStart(2, '0')}-01`,
        receivedAt: `2026-01-${String(1 + (i % 28)).padStart(2, '0')}`,
      }));
    }
    const r = batchFifoAllocate(batches, 25, { now });
    expect(r.allocations.length).toBe(3);  // 10+10+5
    // First two fully consumed, third partial
    expect(r.allocations[0].takeQty).toBe(10);
    expect(r.allocations[1].takeQty).toBe(10);
    expect(r.allocations[2].takeQty).toBe(5);
    // All 3 should have earliest expiry (2026-06)
    for (const a of r.allocations) {
      expect(a.batch.expiresAt.startsWith('2026-06')).toBe(true);
    }
    expect(r.shortfall).toBe(0);
  });

  it('fractional FIFO split (0.3 + 0.2 from 2 batches)', () => {
    const batches = [
      mkBatch({ id: 'B1', qty: 0.3, receivedAt: '2026-01-01' }),
      mkBatch({ id: 'B2', qty: 0.5, receivedAt: '2026-02-01' }),
    ];
    const r = batchFifoAllocate(batches, 0.5, { now });
    expect(r.allocations.length).toBe(2);
    expect(r.allocations[0].takeQty).toBeCloseTo(0.3, 10);
    expect(r.allocations[1].takeQty).toBeCloseTo(0.2, 10);
  });

  it('exactBatchId + preferNewest still prioritises exact first', () => {
    const batches = [
      mkBatch({ id: 'B-OLD', qty: 100, receivedAt: '2026-01-01' }),
      mkBatch({ id: 'B-TARGET', qty: 20, receivedAt: '2026-02-01' }),
      mkBatch({ id: 'B-NEWEST', qty: 100, receivedAt: '2026-04-15' }),
    ];
    const r = batchFifoAllocate(batches, 50, { now, exactBatchId: 'B-TARGET', preferNewest: true });
    expect(r.allocations[0].batchId).toBe('B-TARGET');
    expect(r.allocations[0].takeQty).toBe(20);
    expect(r.allocations[1].batchId).toBe('B-NEWEST');
    expect(r.allocations[1].takeQty).toBe(30);
  });

  it('reads unavailable batch even if exactBatchId specifies it → skip silently, fallback', () => {
    const batches = [
      mkBatch({ id: 'B-EXP', qty: 100, expiresAt: '2026-01-01' }),
      mkBatch({ id: 'B-LIVE', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 30, { now, exactBatchId: 'B-EXP' });
    expect(r.allocations[0].batchId).toBe('B-LIVE');
  });

  it('does not consume same batch twice even when exactBatchId partial + fallback', () => {
    const batches = [
      mkBatch({ id: 'B-TARGET', qty: 30 }),
      mkBatch({ id: 'B-OTHER', qty: 100 }),
    ];
    const r = batchFifoAllocate(batches, 50, { now, exactBatchId: 'B-TARGET' });
    expect(r.allocations.length).toBe(2);
    const ids = r.allocations.map(a => a.batchId);
    expect(new Set(ids).size).toBe(2);  // no duplicates
  });
});
