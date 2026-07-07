// ─── Stock-alert report aggregator — pure ──────────────────────────────────
// "แจ้งเตือนสต็อค" — 3 buckets over be_stock_batches (+ be_products thresholds):
//   expired    — hasExpired(batch)                           (write-off candidates)
//   nearExpiry — 0 ≤ daysToExpiry ≤ product.alertDayBeforeExpire (default 90)
//   lowStock   — Σ non-expired remaining ≤ product.alertQtyBeforeOutOfStock
//
// Uses the clinic's own per-product alert thresholds. Batches with 0 remaining
// are ignored (no stock, no alert). Expired stock is NOT counted toward the
// low-stock available total (it's not usable inventory). Snapshot report — no
// date range.

import { hasExpired, daysToExpiry } from './stockUtils.js';

const DEFAULT_NEAR_EXPIRY_DAYS = 90;
const remainingOf = (b) => {
  const r = Number(b?.qty?.remaining);
  if (Number.isFinite(r)) return r;
  const s = Number(b?.qty);
  return Number.isFinite(s) ? s : 0;
};

/**
 * @param {Array<object>} batches — be_stock_batches docs
 * @param {Array<object>} products — be_products docs (for alert thresholds)
 * @param {Date} [now]
 * @returns {{ expired:Array, nearExpiry:Array, lowStock:Array, counts:{expired:number,nearExpiry:number,lowStock:number} }}
 */
export function aggregateStockAlert(batches = [], products = [], now = new Date()) {
  const prodById = new Map((products || []).map((p) => [String(p.id ?? p.productId), p]));
  const expired = [];
  const nearExpiry = [];
  const lowByProduct = new Map(); // productId → { product, remaining, threshold }

  for (const b of (batches || [])) {
    const rem = remainingOf(b);
    if (rem <= 0) continue;
    const p = prodById.get(String(b.productId));
    const name = b.productName || p?.productName || p?.name || '-';

    if (hasExpired(b, now)) {
      const d = daysToExpiry(b, now);
      expired.push({
        id: b.id, product: name, batch: b.id, remaining: rem,
        expiresAt: b.expiresAt || '', overdueDays: d == null ? 0 : -d,
      });
      continue; // expired stock is not "available" — excluded from low-stock total
    }

    const d = daysToExpiry(b, now);
    const thrDays = Number(p?.alertDayBeforeExpire) || DEFAULT_NEAR_EXPIRY_DAYS;
    if (d != null && d >= 0 && d <= thrDays) {
      nearExpiry.push({
        id: b.id, product: name, batch: b.id, remaining: rem,
        expiresAt: b.expiresAt || '', daysLeft: d,
      });
    }

    const key = String(b.productId);
    const cur = lowByProduct.get(key) || { product: name, remaining: 0, threshold: Number(p?.alertQtyBeforeOutOfStock) };
    cur.remaining += rem;
    lowByProduct.set(key, cur);
  }

  const lowStock = [...lowByProduct.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .filter((v) => Number.isFinite(v.threshold) && v.threshold > 0 && v.remaining <= v.threshold)
    .sort((a, b) => a.remaining - b.remaining);

  expired.sort((a, b) => b.overdueDays - a.overdueDays);
  nearExpiry.sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    expired,
    nearExpiry,
    lowStock,
    counts: { expired: expired.length, nearExpiry: nearExpiry.length, lowStock: lowStock.length },
  };
}
