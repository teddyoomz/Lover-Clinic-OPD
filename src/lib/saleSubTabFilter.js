// Sales-page sub-tab partition (2026-05-20). Splits the SaleTab list into the
// "การขาย" (non-cancelled) and "ยกเลิกแล้ว" (cancelled) sub-tabs. Pure JS — no
// React, no Firestore. Mirrors the V43-followup skipStockFilter.js pattern:
// a single-source predicate so every reader agrees on what "cancelled" means.

/** A sale is cancelled iff its top-level status === 'cancelled'
 *  (sale.status is set by the cancel flow and beats payment.status). */
export function isCancelledSale(sale) {
  return sale?.status === 'cancelled';
}

/** Partition the loaded sales list for the given sub-tab.
 *  subTab === 'cancelled' → only cancelled; anything else → non-cancelled.
 *  Tolerates non-array input + null members (defensive). */
export function filterSalesBySubTab(sales, subTab) {
  const list = Array.isArray(sales) ? sales : [];
  if (subTab === 'cancelled') return list.filter(isCancelledSale);
  return list.filter((s) => !isCancelledSale(s));
}
