// ─── Treatment validation — Phase 13.6 pure helpers ───────────────────────
// Schema gate for `be_treatments/{treatmentId}` docs. TreatmentFormPage.jsx
// (3200+ LOC) builds these via hand-coded state updates; we've had enough
// silent-field-drift bugs (V8 historical) that a strict validator at the
// save site is long overdue. Keep `saveTreatment` non-strict to avoid
// breaking in-flight edits; callers that want the hard gate import
// `validateTreatmentStrict` directly.
//
// Shape summary (match backendClient.saveTreatment + createBackendTreatment):
//   {
//     treatmentId, customerId, customerHN?, customerName?,
//     detail: {
//       treatmentDate: 'YYYY-MM-DD',
//       doctorId?, doctorName?,
//       items?: { courses: [{name, qty, price, ...}], products: [{productId, qty, price, ...}] },
//       billing?: { subtotal, discount, discountType, netTotal },
//       payment?: { paymentStatus, channels: [...], paymentDate?, refNo?, ... },
//       status?: 'draft' | 'completed' | 'cancelled',
//       cancelReason?,
//       hasSale?: boolean,
//       linkedSaleId?,
//       note?,
//     },
//     createdBy, createdAt, updatedAt,
//   }
//
// Invariants (strict mode):
//   TR-1 customerId required
//   TR-2 detail.treatmentDate required + YYYY-MM-DD
//   TR-3 billing.netTotal >= 0 when present
//   TR-4 paymentStatus in PAYMENT_STATUS_OPTIONS
//   TR-5 paymentStatus='2' (paid) + channels → sum(channels.amount) == netTotal ± 0.01
//   TR-6 doctorId present → doctorName also present (display safety)
//   TR-7 items.courses[] non-empty entries have name + qty > 0
//   TR-8 items.products[] non-empty entries have productId + qty > 0
//   TR-9 status='cancelled' → cancelReason required
//   TR-10 hasSale=true → linkedSaleId required
//   TR-11 detail.dfEntries, if present, must be an array (Phase 14.5)
//   TR-12 each detail.dfEntries[i] must pass validateDfEntry (Phase 14.5)

import { validateDfEntry, normalizeDfEntry } from './dfEntryValidation.js';

export const STATUS_OPTIONS = Object.freeze(['draft', 'completed', 'cancelled']);
// ProClinic convention: '0' = ชำระภายหลัง, '2' = ชำระเต็มจำนวน, '4' = แบ่งชำระ
export const PAYMENT_STATUS_OPTIONS = Object.freeze(['0', '2', '4']);
export const PAYMENT_STATUS_LABEL = Object.freeze({
  '0': 'ชำระภายหลัง',
  '2': 'ชำระเต็มจำนวน',
  '4': 'แบ่งชำระ',
});
export const DISCOUNT_TYPE_OPTIONS = Object.freeze(['', 'percent', 'baht']);

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_EPSILON = 0.01;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function trim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function validateTreatmentStrict(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // TR-1
  const customerId = trim(form.customerId ?? form.customer_id);
  if (!customerId) return ['customerId', 'ต้องระบุ customerId'];

  const detail = form.detail || {};

  // TR-2
  const treatmentDate = trim(detail.treatmentDate);
  if (!treatmentDate) return ['treatmentDate', 'ต้องระบุ treatmentDate'];
  if (!DATE_ISO_RE.test(treatmentDate)) return ['treatmentDate', 'treatmentDate ต้องเป็น YYYY-MM-DD'];

  // TR-3
  const billing = detail.billing || {};
  if (billing.netTotal != null) {
    const nt = num(billing.netTotal);
    if (!Number.isFinite(nt) || nt < 0) return ['netTotal', 'netTotal ต้องไม่ติดลบ'];
  }
  if (billing.discount != null) {
    const d = num(billing.discount);
    if (Number.isFinite(d) && d < 0) return ['discount', 'discount ต้องไม่ติดลบ'];
  }
  if (billing.discountType != null && billing.discountType !== '' && !DISCOUNT_TYPE_OPTIONS.includes(billing.discountType)) {
    return ['discountType', 'discountType ไม่ถูกต้อง'];
  }

  // TR-4 + TR-5
  const payment = detail.payment || {};
  if (payment.paymentStatus != null && !PAYMENT_STATUS_OPTIONS.includes(String(payment.paymentStatus))) {
    return ['paymentStatus', 'paymentStatus ไม่ถูกต้อง'];
  }
  if (String(payment.paymentStatus || '') === '2' && Array.isArray(payment.channels) && payment.channels.length > 0) {
    const netTotal = num(billing.netTotal);
    if (Number.isFinite(netTotal)) {
      const totalPaid = payment.channels.reduce((s, c) => s + (num(c?.amount) || 0), 0);
      if (Math.abs(totalPaid - netTotal) > AMOUNT_EPSILON) {
        return ['payment', `paymentStatus=2 แต่ sum(channels.amount)=${totalPaid.toFixed(2)} ≠ netTotal ${netTotal.toFixed(2)}`];
      }
    }
  }

  // TR-6
  const doctorId = trim(detail.doctorId);
  if (doctorId) {
    const doctorName = trim(detail.doctorName);
    if (!doctorName) return ['doctorName', 'doctorId ต้องมาพร้อม doctorName'];
  }

  // TR-7 + TR-8
  const items = detail.items || {};
  if (Array.isArray(items.courses)) {
    for (const [i, c] of items.courses.entries()) {
      if (!c || typeof c !== 'object') return ['courses', `courses[${i}] ต้องเป็น object`];
      const n = trim(c.name);
      if (!n) return ['courses', `courses[${i}] ต้องมี name`];
      const qty = num(c.qty);
      if (!Number.isFinite(qty) || qty <= 0) return ['courses', `courses[${i}].qty ต้องเป็นจำนวนบวก`];
    }
  }
  if (Array.isArray(items.products)) {
    for (const [i, p] of items.products.entries()) {
      if (!p || typeof p !== 'object') return ['products', `products[${i}] ต้องเป็น object`];
      const pid = trim(p.productId ?? p.id);
      if (!pid) return ['products', `products[${i}] ต้องมี productId`];
      const qty = num(p.qty);
      if (!Number.isFinite(qty) || qty <= 0) return ['products', `products[${i}].qty ต้องเป็นจำนวนบวก`];
    }
  }

  // TR-9
  const status = detail.status;
  if (status != null && !STATUS_OPTIONS.includes(status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }
  if (status === 'cancelled') {
    if (!trim(detail.cancelReason)) return ['cancelReason', 'cancelled ต้องมี cancelReason'];
  }

  // TR-10
  if (detail.hasSale) {
    if (!trim(detail.linkedSaleId)) return ['linkedSaleId', 'hasSale=true ต้องมี linkedSaleId'];
  }

  // TR-11 + TR-12 (Phase 14.5): dfEntries, if present, must be an array
  // whose elements each pass validateDfEntry. Delegates to Phase 14.3.1
  // helper so any future tightening of DF invariants propagates here.
  if (detail.dfEntries != null) {
    if (!Array.isArray(detail.dfEntries)) {
      return ['dfEntries', 'dfEntries ต้องเป็น array'];
    }
    for (const [i, e] of detail.dfEntries.entries()) {
      const entryFail = validateDfEntry(e);
      if (entryFail) {
        return ['dfEntries', `dfEntries[${i}]: ${entryFail[1]}`];
      }
    }
  }

  return null;
}

export function emptyTreatmentForm() {
  return {
    treatmentId: '',
    customerId: '',
    customerHN: '',
    customerName: '',
    detail: {
      treatmentDate: '',
      doctorId: '',
      doctorName: '',
      items: { courses: [], products: [] },
      dfEntries: [],
      billing: { subtotal: 0, discount: 0, discountType: '', netTotal: 0 },
      payment: { paymentStatus: '0', channels: [], paymentDate: '', refNo: '' },
      status: 'draft',
      cancelReason: '',
      hasSale: false,
      linkedSaleId: '',
      note: '',
    },
    createdBy: '',
  };
}

export function normalizeTreatment(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const out = { ...form };
  out.customerId = trim(out.customerId ?? out.customer_id);
  out.customerHN = trim(out.customerHN ?? out.customer_hn);
  out.customerName = trim(out.customerName ?? out.customer_name);

  const detail = { ...(out.detail || {}) };
  detail.treatmentDate = trim(detail.treatmentDate);
  detail.doctorId = trim(detail.doctorId);
  detail.doctorName = trim(detail.doctorName);
  detail.note = trim(detail.note);
  detail.cancelReason = trim(detail.cancelReason);
  detail.linkedSaleId = trim(detail.linkedSaleId);
  detail.hasSale = !!detail.hasSale;
  detail.status = STATUS_OPTIONS.includes(detail.status) ? detail.status : 'draft';

  const billing = { ...(detail.billing || {}) };
  billing.subtotal = Math.max(0, num(billing.subtotal) || 0);
  billing.discount = Math.max(0, num(billing.discount) || 0);
  billing.discountType = DISCOUNT_TYPE_OPTIONS.includes(billing.discountType) ? billing.discountType : '';
  billing.netTotal = Math.max(0, num(billing.netTotal) || 0);
  detail.billing = billing;

  const payment = { ...(detail.payment || {}) };
  payment.paymentStatus = PAYMENT_STATUS_OPTIONS.includes(String(payment.paymentStatus)) ? String(payment.paymentStatus) : '0';
  payment.channels = Array.isArray(payment.channels) ? payment.channels.map((c) => ({
    ...c,
    amount: Math.round((num(c?.amount) || 0) * 100) / 100,
  })) : [];
  detail.payment = payment;

  detail.items = {
    courses: Array.isArray(detail.items?.courses) ? detail.items.courses : [],
    products: Array.isArray(detail.items?.products) ? detail.items.products : [],
  };

  // Phase 14.5: normalize each DF entry through its own normalizer (trim /
  // coerce / drop rows with empty courseId). Missing / non-array becomes [].
  detail.dfEntries = Array.isArray(detail.dfEntries)
    ? detail.dfEntries.map(normalizeDfEntry).filter(Boolean)
    : [];

  out.detail = detail;
  return out;
}
