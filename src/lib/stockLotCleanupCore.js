// ─── Stock lot-cleanup core (V143-quater, 2026-05-31) ───────────────────────
//
// User: "ดูให้แน่ใจว่า stock แต่ละสาขา เรามีระบบ clear lot เองด้วยถ้าสินค้าใน lot
// นั้นหมด ไม่งั้นมันจะล้นแน่ๆ".
//
// PROBLEM: every import creates a distinct lot (batch) — required for FEFO /
// per-lot expiry + cost. FIFO/FEFO deduction drains the earliest lot to 0
// (status flips to 'depleted' via resolveBatchStatusForRemaining). Depleted /
// zero-remaining lots are NEVER removed → over months of restock-then-deplete
// cycles a single product accumulates many dead 0-lots → the balance page's lot
// count inflates ("ล้น") and the collection bloats.
//
// FIX: an auto-clear that, PER (product × branch/location), keeps every LIVE lot
// (remaining !== 0 — positive stock OR negative debt) and AT MOST ONE zero lot
// (a placeholder so a fully-drained product still shows at 0 per V143/AV166),
// deleting the redundant zero lots. Pure, deterministic, idempotent, DELETE-ONLY
// (never touches a lot that holds stock or debt). cancelled / expired lots have a
// separate lifecycle and are NOT considered here. AV168.

/** Group key: a product's lots are independent PER LOCATION (same productId can
 *  exist in branch A and branch B). */
export function lotGroupKey(b) {
  return `${String(b?.productId ?? '')}|${String(b?.branchId ?? b?.locationId ?? '')}`;
}

const remOf = (b) => Number(b?.qty?.remaining ?? 0) || 0;
const idOf = (b) => b?.id ?? b?.batchId ?? null;

/**
 * Compute the lot-cleanup plan for a flat list of batches (any scope).
 * @param {Array} batches — be_stock_batches docs ({ id|batchId, productId, branchId|locationId, status, qty:{remaining} })
 * @returns {{ deleteIds: string[], perGroup: Object, keptPlaceholders: number }}
 */
export function planLotCleanup(batches) {
  const byGroup = new Map();
  for (const b of (Array.isArray(batches) ? batches : [])) {
    if (!b || !idOf(b)) continue;
    // Only active/depleted lots participate; cancelled/expired are a different lifecycle.
    if (b.status !== 'active' && b.status !== 'depleted') continue;
    if (!String(b.productId ?? '')) continue;
    const k = lotGroupKey(b);
    if (!byGroup.has(k)) byGroup.set(k, []);
    byGroup.get(k).push(b);
  }
  const deleteIds = [];
  const perGroup = {};
  let keptPlaceholders = 0;
  for (const [key, lots] of byGroup) {
    const live = lots.filter(b => remOf(b) !== 0); // positive stock OR negative debt
    const zero = lots.filter(b => remOf(b) === 0);
    if (zero.length === 0) continue; // nothing to clean
    let toDelete;
    if (live.length > 0) {
      // product has real stock/debt → every zero lot is dead weight
      toDelete = zero;
    } else {
      // fully drained → keep exactly ONE zero lot as the placeholder (shows at 0)
      toDelete = zero.slice(1);
      keptPlaceholders += 1;
    }
    if (toDelete.length > 0) {
      deleteIds.push(...toDelete.map(idOf).filter(Boolean));
      perGroup[key] = {
        productName: lots[0]?.productName || '',
        live: live.length,
        zero: zero.length,
        deleted: toDelete.length,
      };
    }
  }
  return { deleteIds, perGroup, keptPlaceholders };
}
