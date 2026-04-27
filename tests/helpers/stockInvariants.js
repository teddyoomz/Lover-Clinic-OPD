// V34 (2026-04-28) — Stock invariant test helpers.
//
// Pure functions for asserting industry-standard inventory-control invariants
// in tests. The functions here do NOT touch Firestore — callers wire in their
// own data sources. This keeps the helpers test-independent and CI-friendly.
//
// Usage examples in `tests/v34-stock-invariants.test.js`.

import { MOVEMENT_TYPES } from '../../src/lib/stockUtils.js';

// ─── Movement → balance replay ──────────────────────────────────────────────

/**
 * Compute the signed-delta (per movement) that the movement contributed to
 * batch.qty.remaining. ProClinic conventions:
 *   IMPORT (1):                    +qty (initial seeding) → batch starts at qty
 *   ADJUST_ADD (3):                +qty
 *   ADJUST_REDUCE (4):             -qty (already negative in stored qty field, abs the magnitude)
 *   SALE (2) / SALE_VENDOR (5):    -qty
 *   TREATMENT (6) / TREATMENT_MED (7): -qty
 *   EXPORT_TRANSFER (8):           -qty (source-side)
 *   RECEIVE (9):                   +qty (destination-side, NEW batch)
 *   EXPORT_WITHDRAWAL (10):        -qty (source-side)
 *   WITHDRAWAL_CONFIRM (13):       +qty (destination-side, NEW batch)
 *   CANCEL_IMPORT (14):            -qty (zeroing out an order's batches)
 *
 * Stored `qty` field is already signed where the writer chose to sign it.
 * For invariant calculation we use the SIGNED stored value directly, since
 * createStockAdjustment / deductOne / etc. all pre-sign before writing.
 */
export function movementSignedDelta(movement) {
  if (!movement || typeof movement.qty !== 'number') return 0;
  // `qty` is already signed by the writer. Safe to sum.
  return movement.qty;
}

/**
 * Replay a sequence of movements (filtered to a single batchId) to compute
 * the expected final remaining qty. Filters out reversed movements + reverses
 * by default — pass `includeReversed: true` to count both sides.
 *
 * @param {Array} movements — list of movement docs (have `qty`, `batchId`, `reversedByMovementId`, `reverseOf`)
 * @param {object} [opts]
 * @param {string} [opts.batchId]  — filter to this batch only
 * @param {boolean} [opts.includeReversed=false]
 * @returns {number} final remaining qty (assumes batch started at 0)
 */
export function replayMovementsToBalance(movements, opts = {}) {
  const list = Array.isArray(movements) ? movements : [];
  const filtered = list.filter((m) => {
    if (opts.batchId && String(m.batchId) !== String(opts.batchId)) return false;
    if (!opts.includeReversed) {
      // skip reversed-pair both sides
      if (m.reversedByMovementId || m.reverseOf) return false;
    }
    return true;
  });
  // Sort chronologically so the replay is deterministic.
  filtered.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  let bal = 0;
  for (const m of filtered) {
    bal += movementSignedDelta(m);
  }
  return bal;
}

/**
 * Asserts conservation of mass for a single batch: replay of all movements
 * should equal the snapshot's qty.remaining. Throws on mismatch — caller
 * uses Vitest's `expect(...).not.toThrow()` to lock the invariant.
 *
 * @param {{ batchId, qty: { remaining, total } }} batchSnapshot
 * @param {Array} movements
 */
export function assertConservation(batchSnapshot, movements) {
  if (!batchSnapshot?.batchId) throw new Error('assertConservation: batchSnapshot.batchId required');
  const replay = replayMovementsToBalance(movements, { batchId: batchSnapshot.batchId });
  const snapshot = Number(batchSnapshot.qty?.remaining ?? 0);
  if (replay !== snapshot) {
    throw new Error(
      `Conservation violation on batch ${batchSnapshot.batchId}: ` +
      `snapshot.remaining=${snapshot} but movement-replay=${replay} ` +
      `(diff: ${snapshot - replay})`
    );
  }
}

/**
 * Time-travel replay: balance at timestamp T (ISO string).
 * @param {Array} movements
 * @param {string} batchId
 * @param {string} throughIsoTimestamp
 */
export function replayBalanceAtTime(movements, batchId, throughIsoTimestamp) {
  return replayMovementsToBalance(
    (movements || []).filter((m) => String(m.createdAt || '') <= String(throughIsoTimestamp)),
    { batchId }
  );
}

// ─── Test data factories ────────────────────────────────────────────────────

/**
 * Build a deterministic batch snapshot for fixture tests. Returns a plain
 * object suitable for use with assertConservation + mock Firestore reads.
 *
 * @param {object} [opts]
 * @param {string} [opts.batchId]
 * @param {string} [opts.branchId='TEST-BR-001']
 * @param {string} [opts.productId='TEST-PROD-001']
 * @param {string} [opts.productName='Test Product']
 * @param {number} [opts.total=100]
 * @param {number} [opts.remaining=100]
 * @param {string} [opts.status='active']
 */
export function makeBatchFixture(opts = {}) {
  const total = Number(opts.total ?? 100);
  const remaining = opts.remaining != null ? Number(opts.remaining) : total;
  return {
    batchId: opts.batchId || `TEST-BATCH-${Date.now()}`,
    branchId: opts.branchId || 'TEST-BR-001',
    productId: opts.productId || 'TEST-PROD-001',
    productName: opts.productName || 'Test Product',
    qty: { total, remaining },
    status: opts.status || 'active',
    originalCost: opts.originalCost ?? 100,
    receivedAt: opts.receivedAt || new Date().toISOString(),
    expiresAt: opts.expiresAt ?? null,
    isPremium: !!opts.isPremium,
  };
}

/**
 * Build a minimal movement fixture. Tests construct sequences of these
 * to feed into replayMovementsToBalance / assertConservation.
 *
 * @param {object} opts
 * @param {string} opts.batchId
 * @param {number} opts.qty (signed: positive for IN, negative for OUT)
 * @param {number} opts.type (one of MOVEMENT_TYPES values)
 * @param {string} [opts.branchId='TEST-BR-001']
 * @param {string} [opts.createdAt]
 * @param {number} [opts.before]
 * @param {number} [opts.after]
 * @param {Array<string>} [opts.branchIds]
 */
export function makeMovementFixture(opts) {
  if (!opts?.batchId) throw new Error('makeMovementFixture: batchId required');
  if (typeof opts.qty !== 'number') throw new Error('makeMovementFixture: qty (signed number) required');
  if (typeof opts.type !== 'number') throw new Error('makeMovementFixture: type required');
  return {
    movementId: `TEST-MVT-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`,
    batchId: opts.batchId,
    type: opts.type,
    qty: opts.qty,
    before: opts.before ?? 0,
    after: opts.after ?? 0,
    branchId: opts.branchId || 'TEST-BR-001',
    branchIds: opts.branchIds || [],
    productId: opts.productId || 'TEST-PROD-001',
    productName: opts.productName || 'Test Product',
    createdAt: opts.createdAt || new Date().toISOString(),
    user: opts.user || { userId: 'TEST-USER', userName: 'TEST-USER' },
    note: opts.note || '',
    reversedByMovementId: opts.reversedByMovementId || null,
    reverseOf: opts.reverseOf || null,
    sourceDocPath: opts.sourceDocPath || '',
  };
}

// ─── Tier helpers ───────────────────────────────────────────────────────────

/**
 * Filter movements that should be visible at a given tier reader.
 * Mirrors the listStockMovements client-side filter + cross-tier branchIds[]
 * metadata pattern (V21 architecture).
 *
 * @param {Array} movements
 * @param {string} branchId — the reader's tier identifier
 * @param {object} [opts] — { includeLegacyMain }
 * @returns {Array} filtered
 */
export function filterMovementsForTier(movements, branchId, opts = {}) {
  if (!branchId) return movements;
  const aliases = [String(branchId)];
  if (opts.includeLegacyMain && String(branchId) !== 'main') {
    aliases.push('main');
  }
  return (movements || []).filter((m) => aliases.includes(String(m.branchId || '')));
}

// ─── No-undefined-leaves regression guard ───────────────────────────────────

/**
 * Walk an object tree and assert no undefined values exist anywhere.
 * Mirrors V14 ("setDoc rejects undefined fields") regression pattern.
 * Throws on first undefined leaf found.
 */
export function assertNoUndefinedLeaves(obj, path = '$') {
  if (obj === undefined) throw new Error(`Undefined leaf at ${path}`);
  if (obj === null) return;
  if (typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => assertNoUndefinedLeaves(v, `${path}[${i}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    assertNoUndefinedLeaves(v, `${path}.${k}`);
  }
}

// ─── Movement-type semantic helpers ─────────────────────────────────────────

export const SOURCE_SIDE_TYPES = Object.freeze([
  MOVEMENT_TYPES.SALE,
  MOVEMENT_TYPES.SALE_VENDOR,
  MOVEMENT_TYPES.ADJUST_REDUCE,
  MOVEMENT_TYPES.TREATMENT,
  MOVEMENT_TYPES.TREATMENT_MED,
  MOVEMENT_TYPES.EXPORT_TRANSFER,
  MOVEMENT_TYPES.EXPORT_WITHDRAWAL,
  MOVEMENT_TYPES.CANCEL_IMPORT,
]);

export const DESTINATION_SIDE_TYPES = Object.freeze([
  MOVEMENT_TYPES.IMPORT,
  MOVEMENT_TYPES.ADJUST_ADD,
  MOVEMENT_TYPES.RECEIVE,
  MOVEMENT_TYPES.WITHDRAWAL_CONFIRM,
]);

export const CROSS_TIER_TYPES = Object.freeze([
  MOVEMENT_TYPES.EXPORT_TRANSFER,
  MOVEMENT_TYPES.RECEIVE,
  MOVEMENT_TYPES.EXPORT_WITHDRAWAL,
  MOVEMENT_TYPES.WITHDRAWAL_CONFIRM,
]);

/**
 * Check whether a movement type is at the source tier (sender) or
 * destination tier (receiver) of a cross-tier flow.
 */
export function isSourceSideMovement(type) {
  return SOURCE_SIDE_TYPES.includes(Number(type));
}

export function isDestinationSideMovement(type) {
  return DESTINATION_SIDE_TYPES.includes(Number(type));
}

export function isCrossTierMovement(type) {
  return CROSS_TIER_TYPES.includes(Number(type));
}
