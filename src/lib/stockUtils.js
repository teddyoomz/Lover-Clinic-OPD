// ─── Stock Utility Functions (Phase 8) ──────────────────────────────────────
// Pure functions for stock batch qty handling, FIFO/FEFO allocation, expiry checks.
//
// Unlike courseUtils.js (which uses string qty "X / Y unit" for display), stock
// stores remaining/total as NUMBERS — Firestore aggregate(sum) needs numeric
// fields for dashboard queries. Use formatStockQty() for display only.
//
// No Firestore imports — all pure, safe for client + tests.

// ─── Constants ──────────────────────────────────────────────────────────────

export const DEFAULT_BRANCH_ID = 'main';

// ProClinic movement type enum — stored as numeric codes.
// Grouped pairs (2|5, 3|4, 6|7, 8|10, 12|13) are semantic aliases in ProClinic's
// filter UI. We store one code per movement; the pair is used only in log filtering.
//
// Phase 15.2 (2026-04-27) — types 15+16 added as audit-only (qty=0) for the
// approval state-flip on be_stock_withdrawals. They ride V19's existing rule
// (`hasOnly(['reversedByMovementId'])`) — no rule change needed.
export const MOVEMENT_TYPES = {
  IMPORT: 1,             // นำเข้า (vendor order receive — branch OR central)
  SALE: 2,               // ขาย (retail customer sale)
  ADJUST_ADD: 3,         // ปรับสต็อคเพิ่ม
  ADJUST_REDUCE: 4,      // ปรับสต็อคลด
  SALE_VENDOR: 5,        // ขาย (vendor/wholesale)
  TREATMENT: 6,          // ใช้ในการรักษา (consumables)
  TREATMENT_MED: 7,      // จ่ายยาในการรักษา (take-home meds)
  EXPORT_TRANSFER: 8,    // ส่งออก (transfer to another location)
  RECEIVE: 9,            // รับเข้า (from transfer)
  EXPORT_WITHDRAWAL: 10, // ส่งออก (withdrawal)
  WITHDRAWAL_REQUEST: 12,// เบิก (request)
  WITHDRAWAL_CONFIRM: 13,// เบิก (confirm receive)
  CANCEL_IMPORT: 14,     // ยกเลิกนำเข้า
  WITHDRAWAL_APPROVE: 15,// อนุมัติเบิก — Phase 15.5 audit-only (qty=0, paired w/ withdrawalId)
  WITHDRAWAL_REJECT: 16, // ปฏิเสธเบิก — Phase 15.5 audit-only (qty=0, paired w/ rejectReason)
};

// Phase 15.2 (2026-04-27) — location-type discriminator for be_stock_batches.
// Additive: existing branch batches don't need locationType to keep working;
// new central batches carry locationType:'central'. Read-side fallback via
// deriveLocationType() so legacy docs render correctly until backfill.
export const LOCATION_TYPE = Object.freeze({
  BRANCH: 'branch',
  CENTRAL: 'central',
});

/**
 * Derive a location's tier from its id. Convention: central warehouses use
 * `WH-` prefix (set by createCentralWarehouse), branches use either 'main'
 * or any other id from be_branches.
 *
 * Phase 15.1 read-side fallback for legacy docs missing the explicit
 * `locationType` field. New writers populate locationType on every write.
 *
 * @param {string} locationId
 * @returns {'branch' | 'central'}
 */
export function deriveLocationType(locationId) {
  const id = String(locationId || '');
  return id.startsWith('WH-') ? LOCATION_TYPE.CENTRAL : LOCATION_TYPE.BRANCH;
}

// Central PO status enum (Phase 15.2)
//   - pending  → 1+ items not yet received (initial state)
//   - partial  → some lines received, others still pending
//   - received → all lines fully received (all items have receivedBatchId)
//   - cancelled → cancelled before any receive (no batches created)
//   - cancelled_post_receive → cancelled AFTER receive; batches got CANCEL_IMPORT
export const CENTRAL_ORDER_STATUS = Object.freeze({
  PENDING: 'pending',
  PARTIAL: 'partial',
  RECEIVED: 'received',
  CANCELLED: 'cancelled',
  CANCELLED_POST_RECEIVE: 'cancelled_post_receive',
});

// Transfer status enum (ProClinic parity)
export const TRANSFER_STATUS = {
  PENDING_DISPATCH: 0,   // รอส่งสินค้า
  PENDING_RECEIVE: 1,    // รอรับสินค้า
  COMPLETED: 2,          // สำเร็จ
  CANCELLED: 3,          // ยกเลิก
  REJECTED: 4,           // ปฏิเสธ
};

// Withdrawal status enum (one fewer status than transfer — no "rejected")
export const WITHDRAWAL_STATUS = {
  PENDING_APPROVAL: 0,
  SENT: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

// Batch lifecycle status
export const BATCH_STATUS = {
  ACTIVE: 'active',
  DEPLETED: 'depleted',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
};

// ─── Numeric qty helpers ────────────────────────────────────────────────────

/**
 * Deduct from batch qty (numeric).
 * @param {{remaining: number, total: number}} qty
 * @param {number} takeQty
 * @returns {{remaining: number, total: number}}
 * @throws {Error} if takeQty > remaining
 */
export function deductQtyNumeric(qty, takeQty) {
  const remaining = toNumber(qty?.remaining);
  const total = toNumber(qty?.total);
  const take = toNumber(takeQty);
  if (take < 0) throw new Error(`Invalid deduct qty: ${takeQty} (must be >= 0)`);
  if (remaining < take) {
    throw new Error(`Stock insufficient: remaining ${remaining}, need ${take}`);
  }
  return { remaining: remaining - take, total };
}

/**
 * Reverse a deduction — caps at total so remaining never exceeds original.
 * @param {{remaining: number, total: number}} qty
 * @param {number} amount
 * @returns {{remaining: number, total: number}}
 */
export function reverseQtyNumeric(qty, amount) {
  const remaining = toNumber(qty?.remaining);
  const total = toNumber(qty?.total);
  const amt = toNumber(amount);
  if (amt < 0) throw new Error(`Invalid reverse amount: ${amount} (must be >= 0)`);
  return { remaining: Math.min(remaining + amt, total), total };
}

/**
 * Build a fresh qty for a new batch (remaining = total = qty).
 * @param {number} qty
 * @returns {{remaining: number, total: number}}
 */
export function buildQtyNumeric(qty) {
  const n = toNumber(qty);
  return { remaining: n, total: n };
}

// ─── Display helpers ────────────────────────────────────────────────────────

/**
 * Format for UI display: "900 / 1000 U". Never stored — recompute from the
 * numeric qty fields each render.
 * @param {number} remaining
 * @param {number} total
 * @param {string} unit
 * @returns {string}
 */
export function formatStockQty(remaining, total, unit) {
  const r = formatNumber(remaining);
  const t = formatNumber(total);
  return unit ? `${r} / ${t} ${unit}` : `${r} / ${t}`;
}

// ─── Batch status helpers ───────────────────────────────────────────────────

/**
 * Has the batch expired? expiresAt absent → never expires (returns false).
 * @param {{expiresAt?: string | null}} batch
 * @param {Date} [now] — override for testing (default: new Date())
 * @returns {boolean}
 */
export function hasExpired(batch, now = new Date()) {
  if (!batch?.expiresAt) return false;
  const exp = new Date(batch.expiresAt);
  if (isNaN(exp.getTime())) return false;
  return exp.getTime() < now.getTime();
}

/**
 * Days until expiry (negative = already expired).
 * @param {{expiresAt?: string | null}} batch
 * @param {Date} [now]
 * @returns {number | null} null if expiresAt absent or invalid
 */
export function daysToExpiry(batch, now = new Date()) {
  if (!batch?.expiresAt) return null;
  const exp = new Date(batch.expiresAt);
  if (isNaN(exp.getTime())) return null;
  const ms = exp.getTime() - now.getTime();
  return Math.floor(ms / 86400000);
}

/**
 * @param {{qty?: {remaining: number, total: number}}} batch
 * @returns {boolean}
 */
export function isBatchDepleted(batch) {
  return toNumber(batch?.qty?.remaining) <= 0;
}

/**
 * Effective availability — considers status, depletion, expiry.
 * Active batches with remaining > 0 and not expired are "available".
 * @param {object} batch
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isBatchAvailable(batch, now = new Date()) {
  if (!batch) return false;
  if (batch.status && batch.status !== BATCH_STATUS.ACTIVE) return false;
  if (isBatchDepleted(batch)) return false;
  if (hasExpired(batch, now)) return false;
  return true;
}

// ─── FIFO / FEFO allocation ─────────────────────────────────────────────────

/**
 * Allocate `deductQty` across batches following priority:
 *   1. If `exactBatchId` is given and that batch is available → consume first.
 *   2. Filter remaining by `filterFn(batch)` (defaults to name/branch match via opts.productId + opts.branchId).
 *   3. Sort by strategy:
 *        preferNewest === true  → receivedAt DESC (LIFO; for in-session batches)
 *        default                → expiresAt ASC (FEFO), tie-break receivedAt ASC (FIFO)
 *   4. Skip unavailable batches (see isBatchAvailable).
 *   5. Consume greedily until deductQty satisfied or batches exhausted.
 *
 * @param {Array<object>} batches — read from Firestore be_stock_batches
 * @param {number} deductQty
 * @param {{
 *   productId?: string,
 *   branchId?: string,
 *   exactBatchId?: string,
 *   preferNewest?: boolean,
 *   filterFn?: (batch:object) => boolean,
 *   now?: Date,
 * }} [opts]
 * @returns {{ allocations: Array<{batchId:string, takeQty:number, batch:object}>, shortfall: number }}
 *          shortfall > 0 means insufficient stock (caller decides throw vs continue).
 */
export function batchFifoAllocate(batches, deductQty, opts = {}) {
  const need = toNumber(deductQty);
  if (need <= 0) return { allocations: [], shortfall: 0 };
  if (!Array.isArray(batches) || batches.length === 0) {
    return { allocations: [], shortfall: need };
  }

  const now = opts.now instanceof Date ? opts.now : new Date();
  const preferNewest = !!opts.preferNewest;

  const baseFilter = (b) => {
    if (!isBatchAvailable(b, now)) return false;
    if (opts.productId && b.productId !== opts.productId) return false;
    if (opts.branchId && b.branchId !== opts.branchId) return false;
    if (typeof opts.filterFn === 'function' && !opts.filterFn(b)) return false;
    return true;
  };

  let remaining = need;
  const allocations = [];
  const consumed = new Set();

  // Step 1: exact-batchId first (if supplied and matches)
  if (opts.exactBatchId) {
    const exact = batches.find(b => b.batchId === opts.exactBatchId);
    if (exact && baseFilter(exact)) {
      const available = toNumber(exact.qty?.remaining);
      const take = Math.min(remaining, available);
      if (take > 0) {
        allocations.push({ batchId: exact.batchId, takeQty: take, batch: exact });
        consumed.add(exact.batchId);
        remaining -= take;
      }
    }
  }

  // Step 2: FIFO / FEFO / LIFO across remaining batches
  if (remaining > 0) {
    const candidates = batches
      .filter(b => !consumed.has(b.batchId) && baseFilter(b))
      .sort((a, b) => {
        if (preferNewest) {
          return compareDate(b.receivedAt, a.receivedAt); // newest first
        }
        // FEFO: earliest expiresAt first; nulls sort last (treat as "no expiry")
        const expCmp = compareExpiry(a.expiresAt, b.expiresAt);
        if (expCmp !== 0) return expCmp;
        return compareDate(a.receivedAt, b.receivedAt); // FIFO tie-break
      });

    for (const b of candidates) {
      if (remaining <= 0) break;
      const available = toNumber(b.qty?.remaining);
      if (available <= 0) continue;
      const take = Math.min(remaining, available);
      allocations.push({ batchId: b.batchId, takeQty: take, batch: b });
      remaining -= take;
    }
  }

  return { allocations, shortfall: Math.max(0, remaining) };
}

// ─── Internal helpers ───────────────────────────────────────────────────────

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(n) {
  const num = toNumber(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

function compareDate(a, b) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  const va = Number.isNaN(ta) ? 0 : ta;
  const vb = Number.isNaN(tb) ? 0 : tb;
  return va - vb;
}

/**
 * Expiry compare where null/missing expiresAt sorts LAST (never-expires wins FIFO race
 * only after explicit-expiry batches are exhausted).
 */
function compareExpiry(a, b) {
  const hasA = !!a;
  const hasB = !!b;
  if (hasA && !hasB) return -1;  // a first
  if (!hasA && hasB) return 1;   // b first
  if (!hasA && !hasB) return 0;
  return compareDate(a, b);
}
