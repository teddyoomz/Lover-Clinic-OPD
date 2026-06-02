// ─── Product delete-cascade — pure helpers (debug fix 2026-06-02) ───────────
//
// Root cause (systematic-debugging): `deleteProduct` was a bare doc-delete with
// NO cascade → deleting a be_products doc left its be_stock_batches (orphan →
// linger in the stock-balance view, rendered with "-" cat/type because there's
// no product doc to resolve them) + its be_courses refs behind. Mirrors the
// V35 orphan-stock class at the DELETE boundary (V35 guarded batch-CREATE via
// `_assertProductExists`; this guards the delete side).
//
// User decision (Guard + cascade): block the delete when it would corrupt
// live data — (a) the product still has stock with remaining > 0, or (b) it is
// a course's mainProductId. Otherwise cascade: delete the product + clear its
// stock batches + PULL it out of every course's courseProducts[] (sub-item).
// NEVER touch be_treatments / be_sales / be_stock_movements (historical / audit
// ledger — Rule O denormalized names keep those readable after the product is
// gone).
//
// Batch clearing is capability-split (V144 firestore.rules — be_stock_batches
// delete is allowed ONLY when remaining == 0; negative-debt lots stay
// client-undeletable as defense-in-depth):
//   • remaining == 0 → DELETE (client SDK allowed by V144; admin SDK too)
//   • remaining  < 0 → CANCEL (status='cancelled' via UPDATE) for the client
//     path → leaves the balance view (active/depleted filter) without violating
//     V144. The admin-SDK cleanup script deletes negatives outright (bypasses
//     rules). Either way the orphan stops showing in stock.
// `batchDeleteAction(remaining)` encodes this; post-guard remaining is never >0.
//
// Pure JS — no Firestore. Shared by src/lib/productDeleteClient.js, the Rule M
// cleanup script, and tests (so the contract can't drift). AV176.

/** Sum of remaining across a product's batches that hold positive stock. */
export function sumPositiveRemaining(batches) {
  if (!Array.isArray(batches)) return 0;
  let total = 0;
  for (const b of batches) {
    const r = Number(b?.qty?.remaining);
    if (Number.isFinite(r) && r > 0) total += r;
  }
  return total;
}

/** Course array-of-objects products field is `courseProducts` (canonical, V44)
 * with a legacy `products` fallback. Returns whichever the doc carries. */
export function courseProductList(course) {
  if (Array.isArray(course?.courseProducts)) return course.courseProducts;
  if (Array.isArray(course?.products)) return course.products;
  return [];
}

// A stock op (be_stock_orders / _transfers / _withdrawals / be_central_stock_orders)
// whose status is NONE of these is "pending/inbound" — its receive path calls
// _assertProductExists, so deleting a product it references makes that receive
// throw PRODUCT_NOT_FOUND forever (the order/transfer can never be received).
//
// ⚠ Status is HETEROGENEOUS across the collections (verified from the real
// writers, 2026-06-02): be_stock_orders + be_central_stock_orders use STRING
// status ('active'/'pending'/'partial'/'received'/'cancelled'/…); be_stock_transfers
// + be_stock_withdrawals use NUMERIC status (0=pending-dispatch, 1=in-transit,
// 2=received, 3=cancelled). isPendingOp handles BOTH — a numeric status < 2 is
// still inbound (its 1→2 receive calls _assertProductExists).
export const TERMINAL_OP_STATUSES = Object.freeze(['received', 'cancelled', 'canceled', 'rejected', 'completed', 'done', 'voided', 'closed', 'cancelled_post_receive']);
// Numeric (transfer/withdrawal): 2=received, 3=cancelled → terminal; 0/1 → pending.
export const TERMINAL_OP_STATUS_MIN_CODE = 2;

/** Does this stock-op doc reference the product (top-level productId or any
 * array-of-objects items[].productId)? */
export function opReferencesProduct(op, productId) {
  const pid = String(productId || '');
  if (!pid || !op || typeof op !== 'object') return false;
  if (String(op.productId || '') === pid) return true;
  for (const v of Object.values(op)) {
    if (Array.isArray(v)) {
      for (const el of v) if (el && typeof el === 'object' && String(el.productId || '') === pid) return true;
    }
  }
  return false;
}

/** Is this op non-terminal (pending/inbound — its receive would break if the
 * product is deleted)? Handles numeric (transfer/withdrawal) + string statuses. */
export function isPendingOp(op) {
  const s = op?.status;
  if (typeof s === 'number') return s < TERMINAL_OP_STATUS_MIN_CODE; // 0/1 pending; ≥2 terminal
  return !TERMINAL_OP_STATUSES.includes(String(s ?? '').toLowerCase());
}

/**
 * Guard evaluation. Returns { blocked, reasons } where each reason is
 * { code, message (Thai), detail }. NON-destructive — read-only over the
 * already-fetched batches + courses for THIS product.
 *
 * @param {object} a
 * @param {string} a.productId
 * @param {object[]} a.batches  — be_stock_batches with productId === productId
 * @param {object[]} a.courses  — ALL be_courses in the product's branch
 * @param {object[]} [a.stockOps] — ALL be_stock_orders/_transfers/_withdrawals/
 *   be_central_stock_orders in the product's branch (each {status, items[]...}).
 *   A non-terminal op referencing the product is a HARD blocker: its receive
 *   path calls _assertProductExists → deleting the product makes that
 *   order/transfer/withdrawal un-receivable forever (PRODUCT_NOT_FOUND).
 */
export function evaluateProductDeleteGuards({ productId, batches, courses, stockOps }) {
  const pid = String(productId || '');
  const reasons = [];

  // (a) live stock remaining > 0 → block (deleting would vaporize real inventory)
  const positive = sumPositiveRemaining(batches);
  if (positive > 0) {
    reasons.push({
      code: 'HAS_STOCK',
      message: `ยังมีสต็อกคงเหลือ ${positive} — เคลียร์/โอน/เบิกสต็อกให้เป็น 0 ก่อนลบสินค้า`,
      detail: { remaining: positive },
    });
  }

  // (b) is a course's mainProductId → block (removing a course's main product
  // breaks the course structurally; user must fix the course first)
  const mainOf = (Array.isArray(courses) ? courses : []).filter(
    (c) => String(c?.mainProductId || '') === pid && pid,
  );
  if (mainOf.length > 0) {
    reasons.push({
      code: 'IS_COURSE_MAIN',
      message: `เป็นสินค้าหลักของคอร์ส ${mainOf.length} รายการ (${mainOf.slice(0, 5).map((c) => c.courseName || c.id).join(', ')}${mainOf.length > 5 ? ' …' : ''}) — แก้/ลบคอร์สก่อน`,
      detail: { courseIds: mainOf.map((c) => c.id || c.courseId).filter(Boolean) },
    });
  }

  // (c) referenced by a PENDING inbound stock op → block (deleting it makes the
  // order/transfer/withdrawal un-receivable forever — _assertProductExists throws)
  const pendingOps = (Array.isArray(stockOps) ? stockOps : []).filter(
    (op) => pid && isPendingOp(op) && opReferencesProduct(op, pid),
  );
  if (pendingOps.length > 0) {
    reasons.push({
      code: 'HAS_PENDING_OP',
      message: `มีรายการสั่งซื้อ/โอน/เบิก ที่ยังไม่รับเข้า ${pendingOps.length} รายการ — รับเข้าหรือยกเลิกรายการนั้นก่อนลบสินค้า`,
      detail: { opIds: pendingOps.map((o) => o.id || o.orderId || o.transferId || o.withdrawalId).filter(Boolean) },
    });
  }

  return { blocked: reasons.length > 0, reasons };
}

/**
 * Per-batch clear action given its remaining (post-guard remaining is ≤ 0):
 *   remaining == 0 → 'delete' (V144 client-allowed)
 *   remaining  < 0 → 'cancel' (client UPDATE status='cancelled'; admin deletes)
 *   remaining  > 0 → 'block'  (should never reach cascade — guarded upstream)
 */
export function batchDeleteAction(remaining) {
  const r = Number(remaining);
  if (!Number.isFinite(r)) return 'cancel'; // defensive: unknown → cancel (don't vaporize)
  if (r > 0) return 'block';
  if (r === 0) return 'delete';
  return 'cancel';
}

/**
 * Cascade plan (call ONLY when evaluateProductDeleteGuards returns
 * blocked:false). Returns:
 *   • batches — the product's batch records (id + remaining; the caller splits
 *     delete-vs-cancel via batchDeleteAction). Location-agnostic: the caller
 *     queries be_stock_batches `where productId`, so BRANCH + CENTRAL lots both
 *     come through (a deleted product clears from the balance AND คลังกลาง view).
 *   • courseUpdates — per-course courseProducts[] rewrites (target pulled out).
 *   • groupUpdates — per-be_product_groups rewrites: pull the target from BOTH
 *     `productIds[]` (id array) AND `products[]` ({productId} array) so a deleted
 *     product stops appearing in its group (completeness — answers "ครบไหม").
 *
 * NOT in scope (history/audit — kept with denormalized names, Rule O): movements,
 * stock orders/transfers/withdrawals/adjustments/central_orders, treatments, sales.
 *
 * @returns {{ batches, courseUpdates, groupUpdates }}
 */
export function planProductCascade({ productId, batches, courses, groups }) {
  const pid = String(productId || '');
  const batchRecords = (Array.isArray(batches) ? batches : [])
    .filter((b) => String(b?.productId || '') === pid && pid)
    .map((b) => ({ batchId: b.batchId || b.id, remaining: Number(b?.qty?.remaining || 0) }))
    .filter((b) => b.batchId);

  const courseUpdates = [];
  for (const c of Array.isArray(courses) ? courses : []) {
    const list = courseProductList(c);
    if (!list.length) continue;
    const next = list.filter((p) => String(p?.productId || '') !== pid);
    if (next.length !== list.length) {
      courseUpdates.push({
        courseId: c.id || c.courseId,
        courseProducts: next,
        removedCount: list.length - next.length,
      });
    }
  }

  const groupUpdates = [];
  for (const g of Array.isArray(groups) ? groups : []) {
    if (!pid) break;
    const ids = Array.isArray(g?.productIds) ? g.productIds : [];
    const prods = Array.isArray(g?.products) ? g.products : [];
    const nextIds = ids.filter((x) => String(x) !== pid);
    const nextProds = prods.filter((p) => String(p?.productId || '') !== pid);
    const removed = (ids.length - nextIds.length) + (prods.length - nextProds.length);
    if (removed > 0) {
      const patch = { groupId: g.id || g.groupId, removedCount: removed };
      if (ids.length) patch.productIds = nextIds;
      if (prods.length) patch.products = nextProds;
      groupUpdates.push(patch);
    }
  }

  return { batches: batchRecords, courseUpdates, groupUpdates };
}
