// ─── Product Unit Group validation — Phase 11.3 pure helpers ──────────────
// Triangle (Rule F, 2026-04-20): fresh `opd.js forms /admin/default-product-unit`
// revealed ProClinic treats units as a GROUP with CONVERSION AMOUNTS, not a
// flat label. Fields captured:
//   - product_unit_group_name  (text, required) — group label
//   - unit_name[]              (text, required, ≥ 1) — first = smallest
//   - unit_amount[]            (number, required, min=1) — per-smallest
//
// Our schema extends minimally: adds `status` (ใช้งาน / พักใช้งาน) + `note`
// for UX parity with Phase 11.2, and promotes the first unit's flag to
// `isBase: true` so consumers (SaleTab / StockTab in 11.8 wiring) can pick
// the base unit without scanning.
//
// Rule C3 lean-schema: no `productType` field — ProClinic form has none, and
// product categorization lives in be_product_groups (distinct concern).

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const GROUP_NAME_MAX_LENGTH = 80;
export const UNIT_NAME_MAX_LENGTH = 40;
export const MIN_UNITS = 1;          // at minimum the base unit
export const MAX_UNITS = 10;         // sanity bound for UI rows

/**
 * Validate a unit-group form. Returns null on pass, `[field, msg]` on failure.
 *
 * The `field` name in failures points to either:
 *   - `groupName` / `status` / `note` — top-level inputs
 *   - `units.<index>.<sub>` — nested into a row (e.g. `units.0.name`)
 * Downstream `scrollToField` can be extended to handle dot-paths later.
 */
export function validateProductUnitGroup(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // groupName
  if (typeof form.groupName !== 'string') {
    return ['groupName', 'กรุณากรอกชื่อกลุ่มหน่วยสินค้า'];
  }
  const gn = form.groupName.trim();
  if (!gn) return ['groupName', 'กรุณากรอกชื่อกลุ่มหน่วยสินค้า'];
  if (gn.length > GROUP_NAME_MAX_LENGTH) {
    return ['groupName', `ชื่อกลุ่มต้องไม่เกิน ${GROUP_NAME_MAX_LENGTH} ตัวอักษร`];
  }

  // units array
  if (!Array.isArray(form.units)) {
    return ['units', 'รูปแบบ units ต้องเป็น array'];
  }
  if (form.units.length < MIN_UNITS) {
    return ['units', `ต้องมีหน่วยอย่างน้อย ${MIN_UNITS} รายการ (หน่วยเล็กที่สุด)`];
  }
  if (form.units.length > MAX_UNITS) {
    return ['units', `หน่วยเกิน ${MAX_UNITS} รายการ — ลดจำนวน`];
  }

  // Per-row validation
  const seenNames = new Set();
  let baseCount = 0;
  for (let i = 0; i < form.units.length; i++) {
    const u = form.units[i];
    if (!u || typeof u !== 'object' || Array.isArray(u)) {
      return [`units.${i}`, `แถวหน่วยที่ ${i + 1} ไม่ถูกต้อง`];
    }

    // name
    if (typeof u.name !== 'string') {
      return [`units.${i}.name`, `แถว ${i + 1}: กรุณากรอกชื่อหน่วย`];
    }
    const nm = u.name.trim();
    if (!nm) return [`units.${i}.name`, `แถว ${i + 1}: กรุณากรอกชื่อหน่วย`];
    if (nm.length > UNIT_NAME_MAX_LENGTH) {
      return [`units.${i}.name`, `แถว ${i + 1}: ชื่อหน่วยเกิน ${UNIT_NAME_MAX_LENGTH} ตัวอักษร`];
    }
    const key = nm.toLowerCase();
    if (seenNames.has(key)) {
      return [`units.${i}.name`, `แถว ${i + 1}: ชื่อหน่วย "${nm}" ซ้ำในกลุ่ม`];
    }
    seenNames.add(key);

    // amount — integer ≥ 1
    const amt = Number(u.amount);
    if (!Number.isFinite(amt) || !Number.isInteger(amt) || amt < 1) {
      return [`units.${i}.amount`, `แถว ${i + 1}: จำนวนต้องเป็นจำนวนเต็ม ≥ 1`];
    }

    // isBase — optional but shape-check if present
    if (u.isBase === true) baseCount++;
  }

  // Base-unit rule: first row MUST be the base (smallest unit) with amount=1.
  // Matches ProClinic's "ชื่อหน่วยเล็กที่สุด" as the first input. If the form
  // didn't explicitly flag isBase, we auto-promote row 0 downstream — but we
  // still reject forms where BOTH rule 0 isn't the base AND some other row
  // tries to claim it.
  if (baseCount > 1) {
    return ['units', 'ต้องมีหน่วยเล็กที่สุดเพียง 1 รายการ'];
  }
  if (Number(form.units[0].amount) !== 1) {
    return ['units.0.amount', 'หน่วยเล็กที่สุด (แถวแรก) ต้องมีจำนวน = 1'];
  }

  // status — optional, enum when present
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  return null;
}

/**
 * Blank starting form — single base unit row with amount=1 pre-filled.
 * Mirrors ProClinic's "ชื่อหน่วยเล็กที่สุด" as the default first row.
 */
export function emptyProductUnitGroupForm() {
  return {
    groupName: '',
    units: [
      { name: '', amount: 1, isBase: true },
    ],
    status: 'ใช้งาน',
    note: '',
  };
}

/**
 * Normalize a form before persisting: trims names, forces row 0 to be the
 * base (amount=1, isBase=true), resets isBase on other rows. Call from
 * saveProductUnitGroup so Firestore never stores an inconsistent shape.
 */
export function normalizeProductUnitGroup(form) {
  const out = {
    ...form,
    groupName: String(form.groupName || '').trim(),
    note: String(form.note || '').trim(),
    status: form.status || 'ใช้งาน',
  };
  out.units = (Array.isArray(form.units) ? form.units : []).map((u, i) => ({
    name: String(u.name || '').trim(),
    amount: i === 0 ? 1 : Number(u.amount) || 1,
    isBase: i === 0,
  }));
  return out;
}
