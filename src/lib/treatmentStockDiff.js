// ─── Treatment stock-change detector ────────────────────────────────────
// Phase 14.7.F (2026-04-26)
//
// Bug report: "คืนสต็อกการรักษาเดิมไม่สำเร็จ: Missing or insufficient
// permissions" — TreatmentFormPage.handleSubmit was calling
// reverseStockForTreatment on EVERY edit save, including image-only edits
// that don't touch stock at all. The reverse path tries to write
// `reversedByMovementId` on the original movement doc, which was blocked
// by `allow update: if false` on be_stock_movements. Two fixes:
//
//   1. Skip the reverse+rededuct path when the stock-bearing arrays are
//      identical (this module — pure helper, no Firestore).
//   2. Allow updating ONLY the `reversedByMovementId` field on movements
//      (firestore.rules — narrow exception to the immutability rule).
//
// This module owns part 1. It exports `hasStockChange(oldSnapshot, newDetail)`
// which returns false iff every stock-bearing array (treatmentItems,
// consumables, medications) is shape-equal between the snapshot taken at
// edit-load time and the new detail being saved.
//
// Shape-equal means same length AND same fields per item AND same order.
// Reorders count as "changed" — false positives there are acceptable
// (the cost is one extra reverse+rededuct cycle, which is correct anyway).

/**
 * Reduce an item to the fields that affect stock movement.
 * Other fields (id, ui-only flags, computed total) ignored.
 */
function normalizeStockItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    productId: item.productId ? String(item.productId) : '',
    productName: String(item.productName || item.name || ''),
    qty: Number(item.qty) || 0,
    unit: String(item.unit || ''),
  };
}

/**
 * Reduce an array of items to its stock-affecting shape.
 * Filters out null/empty entries so accidental sparse arrays don't trip us.
 */
export function stockShape(items) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeStockItem)
    .filter(Boolean);
}

/**
 * Compare two stock-shape arrays for equality. Same length, same fields,
 * same order — strict equality after normalization.
 */
function shapeEqual(aArr, bArr) {
  if (aArr.length !== bArr.length) return false;
  for (let i = 0; i < aArr.length; i++) {
    const a = aArr[i];
    const b = bArr[i];
    if (a.productId !== b.productId) return false;
    if (a.productName !== b.productName) return false;
    if (a.qty !== b.qty) return false;
    if (a.unit !== b.unit) return false;
  }
  return true;
}

/**
 * Return true iff any stock-bearing array differs between the snapshot
 * captured at edit-load time and the new detail being saved.
 *
 * Returns true when:
 *  - oldSnapshot is null/undefined (defensive — preserves legacy behavior
 *    if the snapshot wasn't captured for any reason).
 *  - any of treatmentItems / consumables / medications has a different
 *    length OR different per-item shape OR different order.
 *
 * Returns false when:
 *  - all 3 arrays are identical in length, content, and order — i.e. the
 *    save is a non-stock edit (images, charts, dr.note, vitals, etc.).
 *
 * @param {Object|null} oldSnapshot — { treatmentItems, consumables, medications }
 *   from the doc loaded at edit time. Use the RAW persisted shape, not
 *   form-state shape (form state can drift from doc — e.g. ids are
 *   regenerated on load).
 * @param {Object} newDetail — { treatmentItems, consumables, medications }
 *   from the new detail being passed to backendClient.updateBackendTreatment.
 * @returns {boolean}
 */
export function hasStockChange(oldSnapshot, newDetail) {
  // No snapshot = preserve legacy behavior (force reverse+rededuct).
  if (!oldSnapshot || typeof oldSnapshot !== 'object') return true;
  const newD = newDetail || {};
  const oldT = stockShape(oldSnapshot.treatmentItems);
  const newT = stockShape(newD.treatmentItems);
  if (!shapeEqual(oldT, newT)) return true;
  const oldC = stockShape(oldSnapshot.consumables);
  const newC = stockShape(newD.consumables);
  if (!shapeEqual(oldC, newC)) return true;
  const oldM = stockShape(oldSnapshot.medications);
  const newM = stockShape(newD.medications);
  if (!shapeEqual(oldM, newM)) return true;
  return false;
}
