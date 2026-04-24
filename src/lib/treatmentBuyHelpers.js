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

/**
 * Phase 12.2b Step 7 (2026-04-24): save-time validator for fill-later
 * treatment items. Returns the FIRST treatment item whose fillLater
 * flag is set AND whose qty is missing or ≤ 0, or null when all
 * fill-later rows have a positive qty. Pure — no side effects — so
 * handleSubmit can branch on the return value to scroll + error.
 *
 * Non-fill-later items are ignored (their qty can legitimately be 0 /
 * empty depending on context, not our concern here).
 *
 * @param {Array<object>} treatmentItems — [{ id, name, qty, fillLater? }]
 * @returns {object|null} first offender or null
 */
export function findMissingFillLaterQty(treatmentItems) {
  if (!Array.isArray(treatmentItems)) return null;
  return treatmentItems.find(t => {
    if (!t || !t.fillLater) return false;
    if (t.qty === '' || t.qty == null) return true;
    const n = Number(t.qty);
    return !Number.isFinite(n) || n <= 0;
  }) || null;
}

/**
 * Phase 12.2b follow-up (2026-04-24): save-time validator for
 * "เลือกสินค้าตามจริง" (pick-at-treatment) items. These carry a minQty
 * and/or maxQty configured on the course; the doctor's actual qty
 * must fall within that range.
 *
 * Returns the FIRST offending item + the reason ('below' | 'above'),
 * or null when all pick-at-treatment rows are within range. Rows
 * without the isPickAtTreatment flag are ignored (handled elsewhere
 * by findMissingFillLaterQty or the standard deduction path).
 *
 * @param {Array<object>} treatmentItems — [{ id, name, qty, isPickAtTreatment?, minQty?, maxQty? }]
 * @returns {{ item: object, reason: 'below' | 'above', limit: number }|null}
 */
export function findOutOfRangePickAtTreatmentQty(treatmentItems) {
  if (!Array.isArray(treatmentItems)) return null;
  for (const t of treatmentItems) {
    if (!t || !t.isPickAtTreatment) continue;
    // Blank qty is findMissingFillLaterQty's concern, not ours.
    if (t.qty === '' || t.qty == null) continue;
    const n = Number(t.qty);
    if (!Number.isFinite(n)) continue;
    const mn = t.minQty != null && t.minQty !== '' ? Number(t.minQty) : null;
    const mx = t.maxQty != null && t.maxQty !== '' ? Number(t.maxQty) : null;
    if (mn != null && Number.isFinite(mn) && n < mn) {
      return { item: t, reason: 'below', limit: mn };
    }
    if (mx != null && Number.isFinite(mx) && n > mx) {
      return { item: t, reason: 'above', limit: mx };
    }
  }
  return null;
}

/**
 * Phase 12.2b Step 7 (2026-04-24): pure helper that builds the synthetic
 * customerCourses entry for a newly-purchased course (buy-modal confirm).
 * Extracted from TreatmentFormPage.confirmBuyModal so the courseType-aware
 * fill-later logic has direct unit test coverage.
 *
 * Contract:
 *   - `isRealQty: true` when item.courseType === 'เหมาตามจริง' — the user
 *     bought a real-qty course, qty is NOT yet known at purchase; doctor
 *     fills it during treatment. Products carry remaining/total = '' so
 *     the course header shows "ระบุตอนรักษา" instead of "X / Y".
 *   - `isPickAtTreatment: true` when item.courseType === 'เลือกสินค้าตามจริง'
 *     — similar but products are chosen at treatment time (not just qty).
 *   - All other course types → standard remaining/total from item.qty with
 *     the existing 1-unit fallback to preserve display.
 *
 * @param {object} item — purchasedItems shape: { id, name, qty, unit, courseType?, products? }
 * @param {object} [opts] — { now: Date = Date.now() } for deterministic testing
 * @returns {object|null} customerCourses entry (isAddon=true stamped) or null when id missing
 */
export function buildPurchasedCourseEntry(item, opts = {}) {
  if (!item || typeof item !== 'object' || item.id == null) return null;
  const now = typeof opts.now === 'number' ? opts.now : Date.now();
  const courseType = String(item.courseType || '').trim();
  const isRealQty = courseType === 'เหมาตามจริง';
  const isPickAtTreatment = courseType === 'เลือกสินค้าตามจริง';
  const fillLater = isRealQty || isPickAtTreatment;
  // Phase 12.2b Step 7 follow-up (2026-04-24): preserve the master
  // productId on each sub-product so the downstream stock path
  // (_normalizeStockItems → _deductOneItem) can look up the real
  // be_products doc. Before this, only `rowId` was set ("purchased-
  // <courseId>-row-<productId>") and _normalizeStockItems fell back to
  // `t.id` which was the rowId → productId mismatch → skipped movement
  // → user sees "ไม่เห็น stock movement" even after the previous fix.
  // Phase 12.2b follow-up (2026-04-24): distinguish "เหมาตามจริง"
  // (unlimited real-qty) vs "เลือกสินค้าตามจริง" (pick-at-treatment with
  // min/max limits). Both are `fillLater` at the treatment-tick level
  // (qty entered at save time), but they display + validate differently:
  // - isRealQty → "เหมาตามจริง" label, no qty bounds
  // - isPickAtTreatment → "min-max unit" label, qty gated by minQty/maxQty
  const products = (Array.isArray(item.products) && item.products.length > 0)
    ? item.products.map(p => {
        const pid = p.productId != null ? String(p.productId) : (p.id != null ? String(p.id) : '');
        const pMinQty = p.minQty != null && p.minQty !== '' ? Number(p.minQty) : null;
        const pMaxQty = p.maxQty != null && p.maxQty !== '' ? Number(p.maxQty) : null;
        return {
          rowId: `purchased-${item.id}-row-${pid || Math.random().toString(36).slice(2, 6)}`,
          productId: pid,
          name: p.name || item.name,
          // Real-qty / pick-at-treatment → leave qty markers empty so UI
          // can swap in the fill-later badge. Other types retain the
          // 1-unit fallback (pre-12.2b behavior) so existing installs
          // keep working.
          remaining: fillLater ? '' : String(p.qty || item.qty || 1),
          total: fillLater ? '' : String(p.qty || item.qty || 1),
          unit: p.unit || item.unit || 'ครั้ง',
          fillLater,
          // Propagate course type onto each product row so the render
          // layer can format the label correctly (one of: blank for
          // standard, "เหมาตามจริง" for real-qty, "min-max U" for pick-
          // at-treatment with limits).
          isRealQty,
          isPickAtTreatment,
          minQty: pMinQty,
          maxQty: pMaxQty,
        };
      })
    : [{
        rowId: `purchased-${item.id}-row-self`,
        productId: '', // No sub-product master id for self-fallback row
        name: item.name,
        remaining: fillLater ? '' : String(item.qty || 1),
        total: fillLater ? '' : String(item.qty || 1),
        unit: item.unit || 'คอร์ส',
        fillLater,
        isRealQty,
        isPickAtTreatment,
        minQty: null,
        maxQty: null,
      }];
  return {
    courseId: `purchased-course-${item.id}-${now}`,
    courseName: item.name,
    courseType,
    isAddon: true,
    isRealQty,
    isPickAtTreatment,
    purchasedItemId: item.id,
    purchasedItemType: 'course',
    products,
  };
}

/**
 * Phase 12.2b Step 6 (2026-04-24): pure helper extracted from
 * TreatmentFormPage's customerPromotionGroups useMemo so the add-on
 * propagation logic has direct unit test coverage (instead of relying on
 * a huge mount of TreatmentFormPage with mocked Firestore state).
 *
 * Groups customerCourses[] by promotionId, preserving courses that still
 * have remaining qty in at least one product row. Each output group
 * surfaces `isAddon` + `purchasedItemId` + `purchasedItemType` derived
 * from the synthetic courseEntry that confirmBuyModal wrote for
 * "ซื้อเพิ่ม" promotions. Existing (non-buy-this-visit) promotions
 * carry `isAddon: false`.
 *
 * @param {Array<object>} customerCourses — [{ courseId, courseName, promotionId, products[], isAddon?, purchasedItemId?, purchasedItemType? }]
 * @param {Array<object>} customerPromotions — [{ id, promotionName, isAddon? }]
 * @returns {Array<{ promotionId, promotionName, isAddon, purchasedItemId, purchasedItemType, courses: object[] }>}
 */
export function buildCustomerPromotionGroups(customerCourses, customerPromotions) {
  const allCourses = Array.isArray(customerCourses) ? customerCourses : [];
  const promos = Array.isArray(customerPromotions) ? customerPromotions : [];
  const promoCourses = allCourses.filter(c => c && c.promotionId && (c.products || []).some(p => parseFloat(p.remaining) > 0));
  const groups = {};
  promoCourses.forEach(c => {
    const pid = c.promotionId;
    if (!groups[pid]) {
      const promo = promos.find(p => String(p.id) === String(pid));
      groups[pid] = {
        promotionId: pid,
        promotionName: promo?.promotionName || c.courseName || `โปรโมชัน #${pid}`,
        isAddon: !!(c.isAddon || promo?.isAddon),
        purchasedItemId: c.purchasedItemId || null,
        purchasedItemType: c.purchasedItemType || null,
        courses: [],
      };
    }
    groups[pid].courses.push(c);
  });
  return Object.values(groups);
}
