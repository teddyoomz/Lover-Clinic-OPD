// ─── Product validation — Phase 12.2 pure helpers ──────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/product` (trial server,
// 788-line scan) + `/admin/api/product` JSON verified. Captures core product
// fields — name/code/type/unit/price/VAT/alerts + dosage-for-medicine cluster.
//
// Dosage-specific fields (generic_name, dosage_*, indications, instructions,
// administration_method*, storage_instructions, times_per_day) are kept in
// the schema as free-text so edits preserve them, but aren't required here.
// Stricter by-product-type validation lands in Phase 16 polish per v5.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const PRODUCT_TYPE_OPTIONS = Object.freeze(['ยา', 'สินค้าหน้าร้าน', 'สินค้าสิ้นเปลือง', 'บริการ']);

export const NAME_MAX_LENGTH = 200;
export const CODE_MAX_LENGTH = 50;
export const TEXT_MAX_LENGTH = 1000;
export const NOTE_MAX_LENGTH = 500;

export function validateProduct(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  if (typeof form.productName !== 'string') return ['productName', 'กรุณากรอกชื่อสินค้า'];
  const pn = form.productName.trim();
  if (!pn) return ['productName', 'กรุณากรอกชื่อสินค้า'];
  if (pn.length > NAME_MAX_LENGTH) return ['productName', `ชื่อสินค้าไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  if (!form.productType) return ['productType', 'กรุณาเลือกประเภทสินค้า'];
  if (!PRODUCT_TYPE_OPTIONS.includes(form.productType)) {
    return ['productType', 'ประเภทสินค้าไม่ถูกต้อง'];
  }

  if (form.productCode && String(form.productCode).length > CODE_MAX_LENGTH) {
    return ['productCode', `รหัสสินค้าไม่เกิน ${CODE_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.price != null && form.price !== '') {
    const n = Number(form.price);
    if (!Number.isFinite(n) || n < 0) return ['price', 'ราคาต้องเป็นจำนวนไม่ติดลบ'];
  }
  if (form.priceInclVat != null && form.priceInclVat !== '') {
    const n = Number(form.priceInclVat);
    if (!Number.isFinite(n) || n < 0) return ['priceInclVat', 'ราคารวม VAT ต้องเป็นจำนวนไม่ติดลบ'];
  }

  for (const k of ['alertDayBeforeExpire', 'alertQtyBeforeOutOfStock', 'alertQtyBeforeMaxStock', 'orderBy', 'timesPerDay']) {
    if (form[k] != null && form[k] !== '') {
      const n = Number(form[k]);
      if (!Number.isFinite(n) || n < 0) return [k, `${k} ต้องเป็นจำนวนไม่ติดลบ`];
    }
  }

  // Phase 29.22 (2026-05-14) — Recall preset fields STRIPPED. Recall durations
  // now live in be_recall_cases universal collection (see RecallTab sub-pill
  // "จัดการเคส"). Legacy fields followUpAfterDays / followUpReason /
  // recallAfterDays / recallReason no longer validated here.

  // V43 (2026-05-08) — `skipStockDeduction` added so direct product
  // purchases can opt out of stock decrement at master level. Mirrors the
  // course-row skipStockDeduction concept but lives on the be_products doc.
  for (const boolKey of ['isVatIncluded', 'isClaimDrugDiscount', 'isTakeawayProduct', 'skipStockDeduction']) {
    if (form[boolKey] != null && typeof form[boolKey] !== 'boolean') {
      return [boolKey, `${boolKey} ต้องเป็น boolean`];
    }
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // Free-text length bounds (prevent doc-size blowup).
  for (const textKey of ['genericName', 'indications', 'instructions', 'storageInstructions', 'administrationMethod', 'stockLocation']) {
    if (form[textKey] && String(form[textKey]).length > TEXT_MAX_LENGTH) {
      return [textKey, `${textKey} เกิน ${TEXT_MAX_LENGTH} ตัวอักษร`];
    }
  }

  if (form.administrationTimes != null && !Array.isArray(form.administrationTimes)) {
    return ['administrationTimes', 'administrationTimes ต้องเป็น array'];
  }

  return null;
}

export function emptyProductForm() {
  return {
    productName: '',
    productCode: '',
    productType: 'ยา',
    serviceType: '',
    genericName: '',
    categoryName: '',
    subCategoryName: '',
    mainUnitName: '',
    price: '',
    priceInclVat: '',
    isVatIncluded: false,
    isClaimDrugDiscount: false,
    isTakeawayProduct: false,
    // V43 (2026-05-08) — "ไม่ตัดสต็อค" master flag. When true, direct
    // purchases of this product (sale lines / treatment items / medications
    // / consumables — anything that doesn't come through a course-row)
    // emit a SKIP movement with reason="product-skip" instead of touching
    // the FIFO batches. Mirrors the course-row equivalent on be_courses.
    skipStockDeduction: false,
    defaultProductUnitGroupId: '',
    stockLocation: '',
    alertDayBeforeExpire: '',
    alertQtyBeforeOutOfStock: '',
    alertQtyBeforeMaxStock: '',
    dosageAmount: '',
    dosageUnit: '',
    indications: '',
    instructions: '',
    storageInstructions: '',
    administrationMethod: '',
    administrationMethodHour: '',
    administrationTimes: [],
    timesPerDay: '',
    orderBy: '',
    status: 'ใช้งาน',
    // Phase 29 (2026-05-14) — Recall master-data defaults. All 4 fields are
    // Phase 29.22 (2026-05-14) — Recall preset fields stripped. Durations
    // now live in be_recall_cases (see RecallTab sub-pill "จัดการเคส").
  };
}

export function normalizeProduct(form) {
  const f = (form && typeof form === 'object' && !Array.isArray(form)) ? form : {};
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const numOrNull = (v) => (v === '' || v == null) ? null : Number(v);
  // V145 (AV175, 2026-06-02) — WHITELIST: emit ONLY the canonical be_products
  // field set (the 30 form fields below + the curated extras after). The prior
  // leading `...form` spread let ANY caller field through, so editing a product
  // from the stock balance (which passes the AGGREGATED ROW, not the doc) +
  // saving via setDoc(merge:false) would (a) wipe real fields with blanks AND
  // (b) write stock-aggregation junk (batches/totalRemaining/unit/valueCost/
  // nextExpiry/expired/totalCapacity/id) onto the product doc. Rule R diag on
  // 610 real prod docs confirmed the corruption ALREADY hit 35 docs. The
  // explicit field list below + curated extras = the COMPLETE real schema; the
  // junk keys are simply never copied → can't pollute the doc.
  const out = {
    productName: trim(f.productName),
    productCode: trim(f.productCode),
    productType: f.productType || 'ยา',
    serviceType: trim(f.serviceType),
    genericName: trim(f.genericName),
    categoryName: trim(f.categoryName),
    subCategoryName: trim(f.subCategoryName),
    mainUnitName: trim(f.mainUnitName),
    price: numOrNull(f.price),
    priceInclVat: numOrNull(f.priceInclVat),
    isVatIncluded: !!f.isVatIncluded,
    isClaimDrugDiscount: !!f.isClaimDrugDiscount,
    isTakeawayProduct: !!f.isTakeawayProduct,
    // V43 (2026-05-08) — !! coerce to ensure no `undefined` leaves the
    // normalizer (V14 lock — Firestore setDoc rejects undefined fields).
    skipStockDeduction: !!f.skipStockDeduction,
    defaultProductUnitGroupId: trim(f.defaultProductUnitGroupId),
    stockLocation: trim(f.stockLocation),
    alertDayBeforeExpire: numOrNull(f.alertDayBeforeExpire),
    alertQtyBeforeOutOfStock: numOrNull(f.alertQtyBeforeOutOfStock),
    alertQtyBeforeMaxStock: numOrNull(f.alertQtyBeforeMaxStock),
    dosageAmount: trim(f.dosageAmount),
    dosageUnit: trim(f.dosageUnit),
    indications: trim(f.indications),
    instructions: trim(f.instructions),
    storageInstructions: trim(f.storageInstructions),
    administrationMethod: trim(f.administrationMethod),
    administrationMethodHour: trim(f.administrationMethodHour),
    administrationTimes: Array.isArray(f.administrationTimes)
      ? f.administrationTimes.map(s => trim(s)).filter(Boolean)
      : [],
    timesPerDay: numOrNull(f.timesPerDay),
    orderBy: numOrNull(f.orderBy),
    status: f.status || 'ใช้งาน',
    // Phase 29.22 (2026-05-14) — Recall preset fields stripped (followUpAfterDays
    // / followUpReason / recallAfterDays / recallReason). Now in be_recall_cases.
  };
  // V145 (AV175) — curated extras: the ONLY non-form fields a be_products doc
  // legitimately carries (enumerated from the full 610-doc Rule R diag) +
  // forensic `_*` audit stamps + the legacy `name` display alias (resolved by
  // resolveProductDisplayName). Copied only when present, never undefined (V14).
  // Anything NOT listed here (the stock-aggregation junk) is intentionally dropped.
  if (f.stockConfig !== undefined) out.stockConfig = f.stockConfig;
  if (f.createdBy !== undefined) out.createdBy = f.createdBy;
  if (f.updatedBy !== undefined) out.updatedBy = f.updatedBy;
  if (f.name !== undefined) out.name = f.name;
  for (const k of Object.keys(f)) {
    // V145 — prototype-pollution guard: `__proto__` is an own-key after
    // JSON.parse and starts with '_', so `out[k]=f[k]` would set the output's
    // prototype. Skip the dangerous keys (Firestore reserves __*__ so real docs
    // can't carry them, but this shared pure fn must not have a pollution sink).
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (k.startsWith('_') && f[k] !== undefined) out[k] = f[k];
  }
  return out;
}

/**
 * Display-name resolver for a be_products doc.
 *
 * Phase 14.10-tris (2026-04-26) migrated products from `master_data/products`
 * (legacy `.name` field) to `be_products` with canonical `productName`.
 * Old migrated docs got `name` preserved via the `...form` spread in
 * `normalizeProduct`, but new docs created via UI have ONLY `productName`.
 * 5 callers across StockAdjustPanel + OrderPanel still rendered `p.name`
 * — old products displayed by accident, new ones showed empty options.
 *
 * Lookup chain:
 *   1. p.productName (canonical, written by normalizeProduct)
 *   2. p.name (legacy spread alias from master_data origin)
 *   3. '' (NEVER `undefined` — V14)
 *
 * @param {object} p — be_products doc OR legacy master_data product
 * @returns {string}
 */
export function productDisplayName(p) {
  if (!p || typeof p !== 'object') return '';
  const canonical = typeof p.productName === 'string' ? p.productName.trim() : '';
  if (canonical) return canonical;
  const legacy = typeof p.name === 'string' ? p.name.trim() : '';
  return legacy;
}

export function generateProductId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `PROD-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
