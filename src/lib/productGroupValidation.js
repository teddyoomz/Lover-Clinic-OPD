// ─── Product Group validation — Phase 11.2 + 11.9 fix ─────────────────────
// Extracted from ProductGroupFormModal so business rules can be unit-tested
// without rendering React. Returns the same shape as Phase 9 validators:
// `[fieldName, errorMessage]` on failure, `null` on pass — this feeds
// `scrollToField(name)` for the data-field attribute scroll.
//
// Triangle (Rule F) — re-captured 2026-04-20 for Phase 11.9:
// `opd.js intel /admin/product-group` modal `form-create-product-group`:
//   - group_name (text, required)
//   - product_type (radio, 2 options: "ยากลับบ้าน" | "สินค้าสิ้นเปลือง")
//   - temp_product_id[] (checkbox array — product multi-picker)
//   - POST /admin/product-group
// Edit form disables product_type (immutable after create).
//
// Phase 11.2 ORIGINAL Triangle FAILED: claimed 4-option product_type (ยา/
// สินค้าหน้าร้าน/สินค้าสิ้นเปลือง/บริการ) which did NOT match ProClinic.
// 11.9 corrects to 2 options. V10 anti-example registered.

/**
 * Canonical 2 product-group-type options (Triangle verified 2026-04-20).
 * Adversarial test PG4 guards this list — changes require a fresh Triangle
 * scan + this rule-file update.
 */
export const PRODUCT_TYPES = Object.freeze([
  'ยากลับบ้าน',
  'สินค้าสิ้นเปลือง',
]);

/**
 * Legacy 4-type values from pre-Phase-11.9 data — normalized into the new
 * 2-option enum on read (see `normalizeProductType`). Not exposed in forms.
 */
const LEGACY_PRODUCT_TYPE_MAP = Object.freeze({
  'ยา': 'ยากลับบ้าน',               // ยา → ยากลับบ้าน (most meds dispensed are takeaway)
  'สินค้าหน้าร้าน': 'สินค้าสิ้นเปลือง',  // retail → consumable (closest match)
  'บริการ': 'สินค้าสิ้นเปลือง',        // service → consumable fallback
});

/**
 * Coerce any product-group type value to the new 2-option enum. Used when
 * reading existing be_product_groups docs that were saved under the 11.2
 * 4-option schema. New writes always use the 2-option enum directly.
 */
export function normalizeProductType(value) {
  if (PRODUCT_TYPES.includes(value)) return value;
  if (LEGACY_PRODUCT_TYPE_MAP[value]) return LEGACY_PRODUCT_TYPE_MAP[value];
  return PRODUCT_TYPES[0];  // default to ยากลับบ้าน
}

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
 *  - productType not in PRODUCT_TYPES (incl. empty/wrong-case/legacy)
 *  - status value outside STATUS_OPTIONS (if provided — defaults OK)
 *  - productIds not array of strings
 *  - productIds contains duplicate entries
 *  - productIds contains blank/non-string entries
 *
 * @param {object} form
 * @returns {[string, string] | null}
 */
export function validateProductGroup(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

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

  if (!PRODUCT_TYPES.includes(form.productType)) {
    return ['productType', 'ประเภทกลุ่มสินค้าไม่ถูกต้อง'];
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  if (form.products != null) {
    if (!Array.isArray(form.products)) {
      return ['products', 'products ต้องเป็น array'];
    }
    const seen = new Set();
    for (const p of form.products) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) {
        return ['products', 'products[i] ต้องเป็น object'];
      }
      const pid = String(p.productId || '');
      if (!pid) {
        return ['products', 'ต้องมี productId ทุกรายการ'];
      }
      if (seen.has(pid)) {
        return ['products', 'รหัสสินค้าซ้ำในกลุ่มเดียวกัน'];
      }
      seen.add(pid);
      const qty = Number(p.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return ['products', 'จำนวนสินค้าต้อง > 0'];
      }
    }
  }

  return null;
}

/**
 * Phase 11.9: migrate legacy `productIds: [id, id, ...]` → `products: [{productId, qty:1}, ...]`.
 * Called by ProductGroupFormModal useState init and by the backendClient
 * read path so existing 11.2 data doesn't break. Idempotent — if form.products
 * is already populated, returns unchanged.
 */
export function migrateProductIdsToProducts(form) {
  if (!form || typeof form !== 'object') return form;
  if (Array.isArray(form.products) && form.products.length > 0) return form;
  if (Array.isArray(form.productIds) && form.productIds.length > 0) {
    return {
      ...form,
      products: form.productIds
        .filter(id => typeof id === 'string' && id.trim())
        .map(id => ({ productId: id, qty: 1 })),
    };
  }
  return form;
}

/**
 * Blank starting form — used by ProductGroupFormModal `useState` init and
 * tests. Separate from validate() so tests can exercise the happy path
 * without reconstructing the object literal.
 */
export function emptyProductGroupForm() {
  return {
    name: '',
    productType: 'ยากลับบ้าน',
    products: [],
    status: 'ใช้งาน',
    note: '',
  };
}
