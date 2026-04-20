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

  for (const boolKey of ['isVatIncluded', 'isClaimDrugDiscount', 'isTakeawayProduct']) {
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
  };
}

export function normalizeProduct(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const numOrNull = (v) => (v === '' || v == null) ? null : Number(v);
  return {
    ...form,
    productName: trim(form.productName),
    productCode: trim(form.productCode),
    productType: form.productType || 'ยา',
    serviceType: trim(form.serviceType),
    genericName: trim(form.genericName),
    categoryName: trim(form.categoryName),
    subCategoryName: trim(form.subCategoryName),
    mainUnitName: trim(form.mainUnitName),
    price: numOrNull(form.price),
    priceInclVat: numOrNull(form.priceInclVat),
    isVatIncluded: !!form.isVatIncluded,
    isClaimDrugDiscount: !!form.isClaimDrugDiscount,
    isTakeawayProduct: !!form.isTakeawayProduct,
    defaultProductUnitGroupId: trim(form.defaultProductUnitGroupId),
    stockLocation: trim(form.stockLocation),
    alertDayBeforeExpire: numOrNull(form.alertDayBeforeExpire),
    alertQtyBeforeOutOfStock: numOrNull(form.alertQtyBeforeOutOfStock),
    alertQtyBeforeMaxStock: numOrNull(form.alertQtyBeforeMaxStock),
    dosageAmount: trim(form.dosageAmount),
    dosageUnit: trim(form.dosageUnit),
    indications: trim(form.indications),
    instructions: trim(form.instructions),
    storageInstructions: trim(form.storageInstructions),
    administrationMethod: trim(form.administrationMethod),
    administrationMethodHour: trim(form.administrationMethodHour),
    administrationTimes: Array.isArray(form.administrationTimes)
      ? form.administrationTimes.map(s => trim(s)).filter(Boolean)
      : [],
    timesPerDay: numOrNull(form.timesPerDay),
    orderBy: numOrNull(form.orderBy),
    status: form.status || 'ใช้งาน',
  };
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
