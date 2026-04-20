// ─── Product Group validation — Phase 11.2 pure helpers ───────────────────
// Extracted from ProductGroupFormModal so business rules can be unit-tested
// without rendering React. Returns the same shape as Phase 9 validators:
// `[fieldName, errorMessage]` on failure, `null` on pass — this feeds
// `scrollToField(name)` for the data-field attribute scroll.
//
// Triangle (Rule F): Fields captured via `opd.js intel /admin/product-group`
// on 2026-04-20 — ProClinic has `group_name` (text) + `product_type`
// (4-option select). We add `status` + `productIds[]` + `note` ourselves
// (Rule H — OUR data, we extend beyond what ProClinic stores).

/**
 * Canonical 4 product-type options. Mirrors ProClinic's `product_type` enum
 * (verified via Triangle intel). Adversarial test PV4 guards this list so
 * future changes require explicit rule-file update.
 */
export const PRODUCT_TYPES = Object.freeze([
  'ยา',
  'สินค้าหน้าร้าน',
  'สินค้าสิ้นเปลือง',
  'บริการ',
]);

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

/**
 * Max display length for group name — prevents UI overflow in
 * SaleTab/StockTab pickers where groups render as chips/dropdowns.
 * ProClinic's own field accepts longer but renders poorly; clamp here.
 */
export const NAME_MAX_LENGTH = 80;

/**
 * Validate product-group form shape. Returns null on pass, else
 * `[fieldName, errorMessage]` so scrollToField can jump to the bad input.
 *
 * Adversarial rejections:
 *  - null/undefined/non-object form
 *  - missing/blank/whitespace-only name
 *  - name > NAME_MAX_LENGTH
 *  - non-string name (number, bool, object, array, null, undefined)
 *  - productType not in PRODUCT_TYPES (incl. empty/wrong-case)
 *  - status value outside STATUS_OPTIONS (if provided — defaults OK)
 *  - productIds not array (optional field must be array if present)
 *
 * @param {object} form
 * @returns {[string, string] | null}
 */
export function validateProductGroup(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // Name — must be a non-blank string within bounds.
  if (typeof form.name !== 'string') {
    return ['name', 'กรุณากรอกชื่อกลุ่มสินค้า'];
  }
  const trimmed = form.name.trim();
  if (!trimmed) {
    return ['name', 'กรุณากรอกชื่อกลุ่มสินค้า'];
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return ['name', `ชื่อกลุ่มสินค้าต้องไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }

  // Product type — strict enum.
  if (!PRODUCT_TYPES.includes(form.productType)) {
    return ['productType', 'ประเภทสินค้าไม่ถูกต้อง'];
  }

  // Status — optional but if present must be in enum.
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // productIds — optional but must be array if present. Phase 11.8 wiring
  // will populate this from StockTab product picker; for now we just shape-
  // check so the field doesn't drift into "maybe a string" territory.
  if (form.productIds != null && !Array.isArray(form.productIds)) {
    return ['productIds', 'รหัสสินค้าต้องเป็น array'];
  }

  return null;
}

/**
 * Blank starting form — used by ProductGroupFormModal `useState` init and
 * tests. Separate from validate() so tests can exercise the happy path
 * without reconstructing the object literal.
 */
export function emptyProductGroupForm() {
  return {
    name: '',
    productType: 'ยา',
    productIds: [],
    status: 'ใช้งาน',
    note: '',
  };
}
