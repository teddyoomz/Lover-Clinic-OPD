// ─── Vendor Sale validation — Phase 14.3 (G6) — 2026-04-25 ────────────────
// B2B sale variant — sell stock to vendors (cost+margin) instead of customers.
// New collection: `be_vendor_sales` (separate from be_sales / be_online_sales).
//
// Per ProClinic /admin/sale/vendor/create — simpler than customer sale:
//   - vendor (1, dropdown)
//   - saleDate
//   - items[] (productId / name / qty / unitPrice / lineTotal)
//   - discount (final-bill discount, baht)
//   - totalAmount = sum(lineTotals) - discount
//   - note (free text)
//
// Status: 'draft' → 'confirmed' → 'cancelled'. Stock deducts on confirmed.
//
// Rule E: Firestore-only — no ProClinic POST.

export const STATUS_OPTIONS = Object.freeze(['draft', 'confirmed', 'cancelled']);

export const TRANSITIONS = Object.freeze({
  draft:     Object.freeze(['confirmed', 'cancelled']),
  confirmed: Object.freeze(['cancelled']),
  cancelled: Object.freeze([]),
});

export const NAME_MAX_LENGTH = 200;
export const NOTE_MAX_LENGTH = 1000;
export const MAX_ITEMS = 100;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateVendorSale(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];
  if (typeof form.vendorId !== 'string' || !form.vendorId.trim()) return ['vendorId', 'ต้องระบุคู่ค้า'];
  if (form.saleDate && !ISO_DATE_RE.test(String(form.saleDate))) return ['saleDate', 'saleDate ต้องเป็น YYYY-MM-DD'];
  if (strict && !form.saleDate) return ['saleDate', 'กรุณาระบุวันที่ขาย'];

  if (!Array.isArray(form.items)) return ['items', 'items ต้องเป็น array'];
  if (strict && form.items.length === 0) return ['items', 'ต้องมีสินค้าอย่างน้อย 1 รายการ'];
  if (form.items.length > MAX_ITEMS) return ['items', `มีได้สูงสุด ${MAX_ITEMS} รายการ`];

  let computedTotal = 0;
  for (let i = 0; i < form.items.length; i++) {
    const it = form.items[i];
    if (!it || typeof it !== 'object') return [`items[${i}]`, 'item ผิดรูปแบบ'];
    if (typeof it.productId !== 'string' || !it.productId.trim()) return [`items[${i}].productId`, 'productId ว่าง'];
    if (typeof it.name !== 'string' || !it.name.trim()) return [`items[${i}].name`, 'ชื่อสินค้าว่าง'];
    const qty = Number(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) return [`items[${i}].qty`, 'qty ต้องเป็นตัวเลข > 0'];
    const unitPrice = Number(it.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return [`items[${i}].unitPrice`, 'unitPrice ต้องไม่ติดลบ'];
    computedTotal += qty * unitPrice;
  }

  const discount = Number(form.discount) || 0;
  if (!Number.isFinite(discount) || discount < 0) return ['discount', 'discount ต้องไม่ติดลบ'];
  if (discount > computedTotal) return ['discount', `discount เกินยอดรวมก่อนหัก (${computedTotal.toFixed(2)})`];

  if (form.totalAmount != null) {
    const expected = computedTotal - discount;
    if (Math.abs(Number(form.totalAmount) - expected) > 0.01) {
      return ['totalAmount', `totalAmount ไม่ตรงกับ sum(items)−discount (expected ${expected.toFixed(2)})`];
    }
  }

  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  return null;
}

export function emptyVendorSaleForm() {
  return {
    vendorId: '',
    vendorName: '',
    saleDate: '',
    items: [],
    discount: 0,
    totalAmount: 0,
    note: '',
    status: 'draft',
    confirmedAt: null,
    cancelledAt: null,
    cancelReason: '',
  };
}

export function normalizeVendorSale(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const safeItems = Array.isArray(form.items)
    ? form.items
        .filter(i => i && typeof i === 'object')
        .map(i => {
          const qty = Number(i.qty) || 0;
          const unitPrice = Number(i.unitPrice) || 0;
          return {
            productId: trim(i.productId),
            name: trim(i.name),
            qty,
            unitPrice,
            lineTotal: Math.round(qty * unitPrice * 100) / 100,
          };
        })
        .filter(i => i.productId && i.name)
    : [];
  const subTotal = safeItems.reduce((s, i) => s + i.lineTotal, 0);
  const discount = Number(form.discount) || 0;
  return {
    ...form,
    vendorId: trim(form.vendorId),
    vendorName: trim(form.vendorName),
    saleDate: trim(form.saleDate),
    items: safeItems,
    discount,
    totalAmount: Math.round((subTotal - discount) * 100) / 100,
    note: trim(form.note),
    status: STATUS_OPTIONS.includes(form.status) ? form.status : 'draft',
    cancelReason: trim(form.cancelReason),
  };
}

export function applyVendorSaleStatusTransition(currentStatus, nextStatus) {
  if (!STATUS_OPTIONS.includes(currentStatus)) throw new Error(`unknown current status: ${currentStatus}`);
  if (!STATUS_OPTIONS.includes(nextStatus)) throw new Error(`unknown next status: ${nextStatus}`);
  if (currentStatus === nextStatus) return nextStatus;
  if (!TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new Error(`invalid transition ${currentStatus} → ${nextStatus}`);
  }
  return nextStatus;
}

export function generateVendorSaleId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `VSALE-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
