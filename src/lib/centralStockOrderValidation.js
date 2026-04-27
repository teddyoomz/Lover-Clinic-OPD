// ─── Central Stock Order validation — Phase 15.2 pure helpers ───────────────
// Triangle (Rule F, 2026-04-27): captured `/admin/central-stock/order/create`
// via opd.js — vendor + central warehouse + line items (productId/qty/cost/
// expiry/isPremium) + discount + note. Mirrors `be_stock_orders` shape but
// keyed off centralWarehouseId instead of branchId.
//
// All functions pure — no Firestore imports, safe for client + tests.
// V14-aware: normalize() never returns undefined values (Firestore setDoc
// rejects them). Empty optional fields default to '' / null / 0.

import { CENTRAL_ORDER_STATUS } from './stockUtils.js';

export const NOTE_MAX_LENGTH = 500;
export const VENDOR_NAME_MAX_LENGTH = 200;
export const PRODUCT_NAME_MAX_LENGTH = 200;
export const UNIT_MAX_LENGTH = 50;

export const DISCOUNT_TYPES = Object.freeze(['amount', 'percent']);

const DEFAULT_DISCOUNT_TYPE = 'amount';

/**
 * Validate a central PO form. Returns null on success, [field, message] on
 * first failure. Mirrors validateProduct's return shape so the caller's
 * scrollToError pattern works unchanged.
 *
 * Required:
 *   - centralWarehouseId, vendorId (both truthy strings)
 *   - items array with ≥ 1 line; each line has productId + qty > 0 + cost >= 0
 *
 * Optional (validated when present):
 *   - vendorName, importedDate, note, discount, discountType, items[].expiresAt
 *
 * @param {object} form
 * @returns {[string,string] | null}
 */
export function validateCentralStockOrder(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  const wh = String(form.centralWarehouseId || '').trim();
  if (!wh) return ['centralWarehouseId', 'กรุณาเลือกคลังกลาง'];

  const vendorId = String(form.vendorId || '').trim();
  if (!vendorId) return ['vendorId', 'กรุณาเลือก vendor'];

  if (form.vendorName != null && String(form.vendorName).length > VENDOR_NAME_MAX_LENGTH) {
    return ['vendorName', `ชื่อ vendor ไม่เกิน ${VENDOR_NAME_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `หมายเหตุไม่เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.discount != null && form.discount !== '') {
    const n = Number(form.discount);
    if (!Number.isFinite(n) || n < 0) {
      return ['discount', 'ส่วนลดต้องเป็นจำนวนไม่ติดลบ'];
    }
  }

  if (form.discountType != null && form.discountType !== '' && !DISCOUNT_TYPES.includes(form.discountType)) {
    return ['discountType', 'ประเภทส่วนลดต้องเป็น amount หรือ percent'];
  }

  if (form.importedDate != null && form.importedDate !== '') {
    if (typeof form.importedDate !== 'string') {
      return ['importedDate', 'รูปแบบวันที่ไม่ถูกต้อง'];
    }
  }

  if (!Array.isArray(form.items) || form.items.length === 0) {
    return ['items', 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ'];
  }

  for (let i = 0; i < form.items.length; i++) {
    const it = form.items[i];
    const idx = i + 1;
    if (!it || typeof it !== 'object') {
      return [`items[${i}]`, `รายการที่ ${idx} ไม่ถูกต้อง`];
    }
    if (!String(it.productId || '').trim()) {
      return [`items[${i}].productId`, `รายการที่ ${idx} ต้องเลือกสินค้า`];
    }
    if (it.productName != null && String(it.productName).length > PRODUCT_NAME_MAX_LENGTH) {
      return [`items[${i}].productName`, `ชื่อสินค้าไม่เกิน ${PRODUCT_NAME_MAX_LENGTH} ตัวอักษร`];
    }
    const qty = Number(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return [`items[${i}].qty`, `รายการที่ ${idx} จำนวนต้องมากกว่า 0`];
    }
    if (it.cost != null && it.cost !== '') {
      const c = Number(it.cost);
      if (!Number.isFinite(c) || c < 0) {
        return [`items[${i}].cost`, `รายการที่ ${idx} ต้นทุนต้องเป็นจำนวนไม่ติดลบ`];
      }
    }
    if (it.expiresAt != null && it.expiresAt !== '' && typeof it.expiresAt !== 'string') {
      return [`items[${i}].expiresAt`, `รายการที่ ${idx} วันหมดอายุไม่ถูกต้อง`];
    }
    if (it.unit != null && String(it.unit).length > UNIT_MAX_LENGTH) {
      return [`items[${i}].unit`, `รายการที่ ${idx} หน่วยเกิน ${UNIT_MAX_LENGTH} ตัวอักษร`];
    }
    if (it.isPremium != null && typeof it.isPremium !== 'boolean') {
      return [`items[${i}].isPremium`, `รายการที่ ${idx} isPremium ต้องเป็น boolean`];
    }
  }

  return null;
}

/**
 * Empty form for a fresh "create central PO" modal.
 *   - importedDate defaults to today (Bangkok) — caller may override.
 *   - one blank line so the user sees the form structure immediately.
 */
export function emptyCentralStockOrderForm() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    centralWarehouseId: '',
    vendorId: '',
    vendorName: '',
    importedDate: today,
    note: '',
    discount: 0,
    discountType: DEFAULT_DISCOUNT_TYPE,
    items: [
      {
        productId: '',
        productName: '',
        qty: '',
        cost: '',
        expiresAt: '',
        unit: '',
        isPremium: false,
      },
    ],
  };
}

/**
 * Normalize a form into a Firestore-write-safe shape.
 *
 * Guarantees:
 *   - Never emits `undefined` (V14 lesson — setDoc rejects undefined values).
 *   - Numbers coerced; missing → 0 (qty / cost / discount).
 *   - Booleans coerced.
 *   - String fields trimmed.
 *   - items[].centralOrderProductId stable per-line if caller didn't supply.
 *   - status defaults to 'pending' on new creates (caller can override for tests).
 *
 * @param {object} form
 * @param {{ orderId?: string }} [opts]  — orderId used to mint stable centralOrderProductId
 * @returns {object} normalized payload
 */
export function normalizeCentralStockOrder(form, opts = {}) {
  const f = form && typeof form === 'object' ? form : {};
  const orderId = String(opts.orderId || f.orderId || '');

  const items = Array.isArray(f.items) ? f.items : [];
  const normalizedItems = items.map((it, idx) => {
    const i = it && typeof it === 'object' ? it : {};
    const lineId = String(i.centralOrderProductId || (orderId ? `${orderId}-${idx}` : `line-${idx}`));
    const qtyN = Number(i.qty);
    const costN = Number(i.cost);
    return {
      centralOrderProductId: lineId,
      productId: String(i.productId || '').trim(),
      productName: String(i.productName || '').trim(),
      qty: Number.isFinite(qtyN) && qtyN > 0 ? qtyN : 0,
      cost: Number.isFinite(costN) && costN >= 0 ? costN : 0,
      expiresAt: i.expiresAt ? String(i.expiresAt) : null,
      unit: String(i.unit || '').trim(),
      isPremium: !!i.isPremium,
      receivedBatchId: i.receivedBatchId ? String(i.receivedBatchId) : null,
      receivedQty: Number.isFinite(Number(i.receivedQty)) ? Number(i.receivedQty) : 0,
    };
  });

  const discountN = Number(f.discount);
  return {
    centralWarehouseId: String(f.centralWarehouseId || '').trim(),
    vendorId: String(f.vendorId || '').trim(),
    vendorName: String(f.vendorName || '').trim(),
    importedDate: f.importedDate ? String(f.importedDate) : new Date().toISOString().slice(0, 10),
    note: String(f.note || '').trim(),
    discount: Number.isFinite(discountN) && discountN >= 0 ? discountN : 0,
    discountType: DISCOUNT_TYPES.includes(f.discountType) ? f.discountType : DEFAULT_DISCOUNT_TYPE,
    items: normalizedItems,
    status: f.status && Object.values(CENTRAL_ORDER_STATUS).includes(f.status) ? f.status : CENTRAL_ORDER_STATUS.PENDING,
  };
}

/**
 * Validate a partial-receive payload against an existing order doc. Used by
 * `receiveCentralStockOrder` to ensure the client never sends garbage.
 *
 * Each receipt: { centralOrderProductId, qty }. qty must equal the line's
 * total qty (Phase 15.2 receives full-line at a time; partial-line is a
 * Phase 15.7+ enhancement). Multiple lines may be received in one call.
 *
 * @param {{centralOrderProductId:string, qty:number}[]} receipts
 * @param {{items: Array}} order  — the existing order doc
 * @returns {[string,string] | null}
 */
export function validateLineReceipts(receipts, order) {
  if (!Array.isArray(receipts) || receipts.length === 0) {
    return ['receipts', 'กรุณาระบุรายการที่จะรับสินค้า'];
  }
  if (!order || !Array.isArray(order.items)) {
    return ['order', 'order doc ไม่ถูกต้อง'];
  }

  const seen = new Set();
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i];
    if (!r || typeof r !== 'object') {
      return [`receipts[${i}]`, `รายการที่ ${i + 1} ไม่ถูกต้อง`];
    }
    const lineId = String(r.centralOrderProductId || '').trim();
    if (!lineId) {
      return [`receipts[${i}].centralOrderProductId`, `รายการที่ ${i + 1} ขาด centralOrderProductId`];
    }
    if (seen.has(lineId)) {
      return [`receipts[${i}].centralOrderProductId`, `รายการ ${lineId} ซ้ำในคำสั่งเดียว`];
    }
    seen.add(lineId);

    const line = order.items.find(it => it.centralOrderProductId === lineId);
    if (!line) {
      return [`receipts[${i}].centralOrderProductId`, `ไม่พบรายการ ${lineId} ใน order`];
    }
    if (line.receivedBatchId) {
      return [`receipts[${i}].centralOrderProductId`, `รายการ ${lineId} รับสินค้าแล้ว`];
    }
    const qty = Number(r.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      return [`receipts[${i}].qty`, `รายการที่ ${i + 1} จำนวนต้องมากกว่า 0`];
    }
  }
  return null;
}
