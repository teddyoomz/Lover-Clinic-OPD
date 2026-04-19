// ─── Treatment "buy" helpers — pure mapping from purchased items → form state
// Extracted from TreatmentFormPage.confirmBuyModal so the promotion-products
// → consumables mapping is unit-testable + reusable across treatment + sale
// flows.
//
// Why this file exists: 2026-04-19 bug — buying a promotion that contained
// both courses and standalone products only added the courses to the
// "โปรโมชัน" section; the standalone products were dropped on the floor,
// meaning they were neither displayed in "สินค้าสิ้นเปลือง" nor deducted
// from stock. Customer's stock was never decremented = inventory drift.
//
// The fix: map promotion.products[] → consumable shape, tag with promotionId
// for removal symmetry, and feed them through the existing
// deductStockForTreatment path (which iterates items.consumables[]).

/**
 * Map a purchased promotion's STANDALONE products[] (not the products inside
 * each sub-course) to consumables-array shape.
 *
 * Each consumable carries `promotionId` so removePurchasedItem can clean
 * them up symmetrically when the promotion is removed.
 *
 * @param {object} promotion — buy-modal item: { id, name, products: [{ id|productId, name|productName, qty, unit }] }
 * @returns {Array<{ id, name, qty, unit, promotionId, promotionName }>}
 */
export function mapPromotionProductsToConsumables(promotion) {
  if (!promotion || typeof promotion !== 'object') return [];
  const products = Array.isArray(promotion.products) ? promotion.products : [];
  if (products.length === 0) return [];
  const promoId = promotion.id != null ? String(promotion.id) : '';
  const promoName = String(promotion.name || '');
  return products
    .filter(p => p && (p.name || p.productName))
    .map(p => {
      const baseName = String(p.name || p.productName || '');
      const productId = p.id != null
        ? String(p.id)
        : (p.productId != null ? String(p.productId) : `promo-${promoId}-prod-${baseName || 'unknown'}`);
      return {
        id: productId,
        name: baseName,
        qty: String(p.qty != null ? p.qty : 1),
        unit: String(p.unit || ''),
        promotionId: promoId,
        promotionName: promoName,
      };
    });
}

/**
 * Filter a consumables array, removing entries tagged with the given
 * promotionId. Used by removePurchasedItem to keep promotion-removal
 * symmetric with promotion-buying.
 *
 * Safe with empty / non-array input. Returns the same reference when no
 * filtering is needed (cheap React identity preservation).
 */
export function filterOutConsumablesForPromotion(consumables, promotionId) {
  if (!Array.isArray(consumables) || consumables.length === 0) return consumables || [];
  if (promotionId == null) return consumables;
  const target = String(promotionId);
  if (!target) return consumables;
  const next = consumables.filter(c => String(c?.promotionId || '') !== target);
  return next.length === consumables.length ? consumables : next;
}

/**
 * Sale-side stock-deduction flatten: when selling a promotion bundle that
 * contains standalone products (the freebies / takeaway items, NOT the
 * sub-courses' own products), expand them into items.products[] so
 * deductStockForSale → _normalizeStockItems will iterate and deduct them.
 *
 * Why this is needed: _normalizeStockItems intentionally does NOT iterate
 * items.promotions[] — promotions are bundles holding course-credits, and
 * course-credits are NOT physical stock. But the promotion's TOP-LEVEL
 * products[] (e.g. "buy a Filler 3900 promo, get 2 sunscreens free") ARE
 * physical inventory and must decrement.
 *
 * This helper runs ONLY at sale-side (SaleTab + future direct-sale callers).
 * TreatmentFormPage does NOT use this — it routes promo.products into
 * consumables via mapPromotionProductsToConsumables (treatment-side),
 * because those products may be consumed during the visit. Calling both
 * helpers on the same purchase would DOUBLE-deduct.
 *
 * Notes:
 *   - Each flattened product is qty-multiplied by the promotion's own qty
 *     (selling 2× promo → 2× each freebie product).
 *   - Each flattened product carries `sourcePromotionId` + `sourceType:
 *     'promotion-product'` for audit-trail clarity in be_stock_movements.
 *   - The original `items.promotions[]` array is preserved (the receipt /
 *     report still wants to show "1× Filler 3900 promo" — not "1 promo +
 *     2 sunscreens"). Only items.products[] is mutated (extended).
 *   - Sub-courses inside the promotion (promo.courses[].products[]) are
 *     NEVER flattened — those are credit checkbox items consumed during
 *     treatment, tracked via customerCourses, not physical stock.
 *
 * @param {object|null} items — { promotions, courses, products, medications }
 * @returns {object} new items object with products[] extended
 */
export function flattenPromotionsForStockDeduction(items) {
  if (!items || typeof items !== 'object' || Array.isArray(items)) return items;
  const promos = Array.isArray(items.promotions) ? items.promotions : [];
  if (promos.length === 0) return items;
  const baseProducts = Array.isArray(items.products) ? items.products : [];
  const expanded = [];
  for (const promo of promos) {
    if (!promo || typeof promo !== 'object') continue;
    const promoProducts = Array.isArray(promo.products) ? promo.products : [];
    if (promoProducts.length === 0) continue;
    const promoQty = Math.max(1, Number(promo.qty) || 1);
    const promoId = promo.id != null ? String(promo.id) : '';
    const promoName = String(promo.name || promo.promotion_name || '');
    for (const p of promoProducts) {
      if (!p || (!p.name && !p.productName)) continue;
      const baseQty = Number(p.qty) || 1;
      expanded.push({
        id: p.id != null ? String(p.id) : (p.productId != null ? String(p.productId) : null),
        productId: p.productId != null ? String(p.productId) : (p.id != null ? String(p.id) : null),
        name: String(p.name || p.productName || ''),
        productName: String(p.productName || p.name || ''),
        qty: baseQty * promoQty,
        unit: String(p.unit || ''),
        sourceType: 'promotion-product',
        sourcePromotionId: promoId,
        sourcePromotionName: promoName,
      });
    }
  }
  if (expanded.length === 0) return items;
  return { ...items, products: [...baseProducts, ...expanded] };
}
