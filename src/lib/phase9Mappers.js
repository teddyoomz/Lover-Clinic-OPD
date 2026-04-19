// ─── Phase 9 field mappers — pure functions ────────────────────────────────
// Extracted from migrateMasterXxxToBe (backendClient.js) so the shape
// transformations can be unit-tested without hitting Firestore.

/** master_data/promotions/items → be_promotions shape. `src` comes from
 *  `listItems('promotion')` (api/proclinic/treatment.js) with: id, name,
 *  price, category, courses[], products[]. We normalize to our full
 *  27-field schema, preserving nested courses[].products[]. */
export function buildBePromotionFromMaster(src, id, now, existingCreatedAt = null) {
  if (!src || typeof src !== 'object') return null;
  if (!String(src.name || '').trim()) return null;

  const salePrice = Number(src.price) || 0;
  const courses = Array.isArray(src.courses) ? src.courses.map(c => ({
    id: c.id,
    name: c.name || '',
    qty: Number(c.qty) || 1,
    price: Number(c.price) || 0,
    products: Array.isArray(c.products) ? c.products.map(p => ({
      id: p.id, name: p.name || '', qty: Number(p.qty) || 1, unit: p.unit || '',
    })) : [],
  })) : [];
  const products = Array.isArray(src.products) ? src.products.map(p => ({
    id: p.id, name: p.name || '', qty: Number(p.qty) || 1,
    price: Number(p.price) || 0, unit: p.unit || '',
  })) : [];

  return {
    promotionId: id,
    proClinicSourceId: id,
    usage_type: 'clinic',
    promotion_name: String(src.name || ''),
    receipt_promotion_name: '',
    promotion_code: '',
    category_name: String(src.category || ''),
    procedure_type_name: '',
    deposit_price: 0,
    sale_price: salePrice,
    is_vat_included: Number(src.isVatIncluded) === 1,
    sale_price_incl_vat: salePrice,
    promotion_type: 'fixed',
    min_course_chosen_count: 1,
    max_course_chosen_count: 1,
    min_course_chosen_qty: 1,
    max_course_chosen_qty: 1,
    has_promotion_period: false,
    promotion_period_start: '',
    promotion_period_end: '',
    description: '',
    status: 'active',
    enable_line_oa_display: false,
    is_price_line_display: true,
    button_label: '',
    cover_image: '',
    courses,
    products,
    createdAt: existingCreatedAt || now,
    updatedAt: now,
    migratedAt: now,
    migratedFromMasterData: true,
  };
}

/** master_data/coupons/items → be_coupons shape. */
export function buildBeCouponFromMaster(src, id, now, existingCreatedAt = null) {
  if (!src || typeof src !== 'object') return null;
  const nameStr = String(src.name || src.coupon_name || '').trim();
  if (!nameStr) return null;
  return {
    couponId: id,
    proClinicSourceId: id,
    coupon_name: nameStr,
    coupon_code: String(src.coupon_code || src.code || ''),
    discount: Number(src.discount) || 0,
    discount_type: src.discount_type === 'baht' ? 'baht' : 'percent',
    max_qty: Number(src.max_qty) || 0,
    is_limit_per_user: !!src.is_limit_per_user,
    start_date: String(src.start_date || ''),
    end_date: String(src.end_date || ''),
    description: String(src.description || ''),
    branch_ids: Array.isArray(src.branch_ids) ? src.branch_ids : [],
    createdAt: existingCreatedAt || now,
    updatedAt: now,
    migratedAt: now,
    migratedFromMasterData: true,
  };
}

/** master_data/vouchers/items → be_vouchers shape. */
export function buildBeVoucherFromMaster(src, id, now, existingCreatedAt = null) {
  if (!src || typeof src !== 'object') return null;
  const nameStr = String(src.name || src.voucher_name || '').trim();
  if (!nameStr) return null;
  return {
    voucherId: id,
    proClinicSourceId: id,
    usage_type: 'clinic',
    voucher_name: nameStr,
    sale_price: Number(src.price || src.sale_price) || 0,
    commission_percent: Number(src.commission_percent) || 0,
    platform: String(src.platform || ''),
    has_period: !!(src.period_start || src.period_end || src.has_period),
    period_start: String(src.period_start || ''),
    period_end: String(src.period_end || ''),
    description: String(src.description || ''),
    status: src.status === 'suspended' ? 'suspended' : 'active',
    createdAt: existingCreatedAt || now,
    updatedAt: now,
    migratedAt: now,
    migratedFromMasterData: true,
  };
}
