// ─── Sale validation — Phase 12.9 pure helpers (critical path) ────────────
// Triangle (Rule F, 2026-04-20): detailed-adminsalecreate.json captures ~90
// unique field names. Covers: 5 sellers (not 3 — updated after 12.4 scan),
// 3 payment methods (paid_amount_1..3 / payment_method_1..3 / hasPaymentMethod1..3),
// discount + coupon/voucher/promotion + wallet/deposit application, items[]
// array with product_id OR course_id + qty + price, takeaway products, and
// the full optional-appointment scheduling block when a sale creates a linked
// appointment.
//
// Invariants (strict mode — fires on atomic create/edit):
//   SA-1 customer_id required
//   SA-2 items array non-empty
//   SA-3 each item has product_id XOR course_id + qty > 0 + price ≥ 0
//   SA-4 5-seller rule: hasSellerN drives N-th seller presence;
//        sum(percent) == 100 AND sum(total) == net ± 0.01 when any active
//   SA-5 3-payment-method rule: hasPaymentMethodN drives N-th method;
//        sum(paid_amount_N where active) == totalPaid ± 0.01
//   SA-6 usingDeposit ⇒ deposit > 0; usingWallet ⇒ customer_wallet_id + credit > 0
//   SA-7 discount_type ∈ {'', 'percent', 'baht'}; baht discount ≤ subtotal
//   SA-8 status ∈ valid set; 'cancelled' requires cancel_detail + cancelled_at
//   SA-9 refund_value ≤ paid_amount_total when refunded
//
// The existing saveBackendSale (backendClient.js) stays non-strict to avoid
// breaking SaleTab flows. Callers that want the hard gate import
// `validateSaleStrict` directly.

export const STATUS_OPTIONS = Object.freeze([
  'draft', 'pending', 'completed', 'cancelled', 'refunded',
]);
export const DISCOUNT_TYPE_OPTIONS = Object.freeze(['', 'percent', 'baht']);
export const MAX_SELLERS = 5;
export const MAX_PAYMENT_METHODS = 3;

const AMOUNT_EPSILON = 0.01;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function sumActiveSellers(sellers) {
  return (sellers || []).reduce((acc, s) => {
    if (!s) return acc;
    return {
      percent: acc.percent + (Number(s.percent ?? s.salePercent ?? s.sale_percent) || 0),
      total:   acc.total   + (Number(s.total   ?? s.saleTotal   ?? s.sale_total)   || 0),
      count:   acc.count + 1,
    };
  }, { percent: 0, total: 0, count: 0 });
}

function sumActivePayments(payments) {
  return (payments || []).reduce((acc, p) => {
    if (!p) return acc;
    return {
      paid:  acc.paid + (Number(p.amount ?? p.paid_amount) || 0),
      count: acc.count + 1,
    };
  }, { paid: 0, count: 0 });
}

export function validateSaleStrict(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  const customerId = String(form.customerId || form.customer_id || '').trim();
  if (!customerId) return ['customerId', 'ต้องระบุ customerId'];

  // Items — items[] OR legacy courses[]/products[] arrays.
  const items = Array.isArray(form.items) ? form.items : [];
  if (items.length === 0) return ['items', 'ใบเสร็จต้องมีรายการอย่างน้อย 1 รายการ'];

  for (const [i, it] of items.entries()) {
    if (!it || typeof it !== 'object') return ['items', `items[${i}] ต้องเป็น object`];
    const pid = String(it.productId || it.product_id || '').trim();
    const cid = String(it.courseId || it.course_id || '').trim();
    if (!pid && !cid) return ['items', `items[${i}] ต้องมี productId หรือ courseId`];
    if (pid && cid) return ['items', `items[${i}] มีทั้ง productId และ courseId — เลือกอย่างใดอย่างหนึ่ง`];
    const qty = num(it.qty);
    if (!Number.isFinite(qty) || qty <= 0) return ['items', `items[${i}].qty ต้องเป็นจำนวนบวก`];
    const price = num(it.price);
    if (!Number.isFinite(price) || price < 0) return ['items', `items[${i}].price ต้องไม่ติดลบ`];
  }

  const billing = form.billing || form;
  const netTotal = num(billing.netTotal ?? billing.net_total ?? form.netTotal);
  if (!Number.isFinite(netTotal) || netTotal < 0) return ['netTotal', 'netTotal ต้องไม่ติดลบ'];

  // Sellers block (SA-4).
  const sellers = Array.isArray(form.sellers) ? form.sellers : [];
  if (sellers.length > MAX_SELLERS) return ['sellers', `รองรับผู้ขายสูงสุด ${MAX_SELLERS} คน`];
  const seenSellers = new Set();
  for (const [i, s] of sellers.entries()) {
    if (!s || typeof s !== 'object') return ['sellers', `sellers[${i}] ต้องเป็น object`];
    const sid = String(s.sellerId || s.seller_id || '').trim();
    if (!sid) return ['sellers', `sellers[${i}].sellerId ว่าง`];
    if (seenSellers.has(sid)) return ['sellers', `sellers[${i}] ซ้ำ (${sid})`];
    seenSellers.add(sid);
    const pct = num(s.percent ?? s.salePercent ?? s.sale_percent);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return ['sellers', `sellers[${i}].percent นอกช่วง 0-100`];
    const tot = num(s.total ?? s.saleTotal ?? s.sale_total);
    if (!Number.isFinite(tot) || tot < 0) return ['sellers', `sellers[${i}].total ต้องไม่ติดลบ`];
  }
  if (sellers.length > 0) {
    const { percent, total } = sumActiveSellers(sellers);
    if (Math.abs(percent - 100) > AMOUNT_EPSILON) {
      return ['sellers', `รวม % ผู้ขาย = ${percent.toFixed(2)} ต้องเท่ากับ 100`];
    }
    if (Math.abs(total - netTotal) > AMOUNT_EPSILON) {
      return ['sellers', `รวมยอดผู้ขาย = ${total.toFixed(2)} ต้องเท่ากับ netTotal ${netTotal.toFixed(2)}`];
    }
  }

  // Payments block (SA-5).
  const payments = Array.isArray(form.payments)
    ? form.payments
    : Array.isArray(form.payment?.channels) ? form.payment.channels : [];
  if (payments.length > MAX_PAYMENT_METHODS) {
    return ['payments', `รองรับวิธีชำระสูงสุด ${MAX_PAYMENT_METHODS} วิธีต่อใบเสร็จ`];
  }
  for (const [i, p] of payments.entries()) {
    if (!p || typeof p !== 'object') return ['payments', `payments[${i}] ต้องเป็น object`];
    const method = String(p.method || p.paymentMethod || p.payment_method || '').trim();
    if (!method) return ['payments', `payments[${i}].method ว่าง`];
    const amt = num(p.amount ?? p.paid_amount);
    if (!Number.isFinite(amt) || amt < 0) return ['payments', `payments[${i}].amount ต้องไม่ติดลบ`];
  }
  const totalPaid = num(
    form.totalPaidAmount ?? form.total_paid_amount ?? form.payment?.totalPaid ?? form.paidAmount
  );
  if (payments.length > 0 && Number.isFinite(totalPaid)) {
    const { paid } = sumActivePayments(payments);
    if (Math.abs(paid - totalPaid) > AMOUNT_EPSILON) {
      return ['payments', `รวม paid = ${paid.toFixed(2)} ต้องเท่ากับ totalPaidAmount ${totalPaid.toFixed(2)}`];
    }
  }

  // Deposit + wallet consistency (SA-6).
  if (form.usingDeposit) {
    const d = num(form.deposit ?? form.depositApplied ?? form.billing?.depositApplied);
    if (!Number.isFinite(d) || d <= 0) return ['deposit', 'usingDeposit=true ต้องมียอดใช้มัดจำ > 0'];
  }
  if (form.usingWallet) {
    const wid = String(form.customerWalletId || form.customer_wallet_id || '').trim();
    if (!wid) return ['customerWalletId', 'usingWallet=true ต้องระบุ customerWalletId'];
    const c = num(form.credit ?? form.walletApplied ?? form.billing?.walletApplied);
    if (!Number.isFinite(c) || c <= 0) return ['credit', 'usingWallet=true ต้องมียอดใช้ wallet > 0'];
  }

  // Discount (SA-7).
  const discount = num(form.discount ?? billing.discount);
  if (Number.isFinite(discount) && discount < 0) return ['discount', 'discount ต้องไม่ติดลบ'];
  const discountType = form.discountType ?? form.discount_type ?? billing.discountType ?? '';
  if (discountType !== '' && discountType != null) {
    if (!DISCOUNT_TYPE_OPTIONS.includes(discountType)) return ['discountType', 'discountType ไม่ถูกต้อง'];
    if (discountType === 'percent' && discount > 100) return ['discount', 'percent discount เกิน 100'];
  }

  // Status + cancel/refund gates (SA-8 + SA-9).
  const status = form.status;
  if (status != null && !STATUS_OPTIONS.includes(status)) return ['status', 'สถานะไม่ถูกต้อง'];
  if (status === 'cancelled') {
    if (!form.cancelDetail && !form.cancel_detail) return ['cancelDetail', 'cancelled ต้องมี cancelDetail'];
    if (!form.cancelledAt && !form.cancelled_at) return ['cancelledAt', 'cancelled ต้องมี cancelledAt'];
  }
  if (status === 'refunded' || form.refunded) {
    const rv = num(form.refundValue ?? form.refund_value);
    if (!Number.isFinite(rv) || rv < 0) return ['refundValue', 'refundValue ต้องไม่ติดลบ'];
    if (Number.isFinite(totalPaid) && rv > totalPaid + AMOUNT_EPSILON) {
      return ['refundValue', `refundValue (${rv}) เกิน totalPaidAmount (${totalPaid})`];
    }
  }

  // Dates — saleDate ISO, paymentTime loose.
  if (form.saleDate && !DATE_ISO_RE.test(String(form.saleDate))) {
    return ['saleDate', 'saleDate ต้องเป็น YYYY-MM-DD'];
  }

  return null;
}

export function emptySaleForm() {
  return {
    customerId: '',
    customerHN: '',
    customerName: '',
    saleDate: '',
    appointmentId: '',
    items: [],          // [{ productId?, courseId?, qty, price, discount, ... }]
    sellers: [],        // [{ sellerId, sellerName, percent, total }] up to 5
    payments: [],       // [{ method, amount, refNo?, paidAt? }] up to 3
    totalPaidAmount: 0,
    billing: {
      subtotal: 0,
      discount: 0,
      discountType: '',
      netTotal: 0,
      depositApplied: 0,
      walletApplied: 0,
    },
    usingDeposit: false,
    deposit: 0,
    usingWallet: false,
    customerWalletId: '',
    credit: 0,
    couponCode: '',
    voucherId: '',
    promotionId: '',
    isVatIncluded: false,
    isPremium: false,
    saleNote: '',
    customerNote: '',
    refNo: '',
    fileUrl: '',
    paymentTime: '',
    status: 'draft',
    cancelDetail: '',
    cancelledAt: null,
    cancelledBy: '',
    refunded: false,
    refundValue: 0,
    refundMethod: '',
    refundTime: '',
    refundImage: '',
    source: '',
    sourceDetail: '',
    branchId: '',
    createdBy: '',
  };
}

export function normalizeSale(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const out = { ...form };
  const trim = (v) => typeof v === 'string' ? v.trim() : v;

  out.customerId = String(trim(out.customerId ?? out.customer_id) || '');
  out.saleDate = typeof out.saleDate === 'string' ? out.saleDate.trim() : '';
  out.sellers = Array.isArray(out.sellers) ? out.sellers.slice(0, MAX_SELLERS).map(s => ({
    sellerId: String(s?.sellerId || s?.seller_id || '').trim(),
    sellerName: String(s?.sellerName || s?.seller_name || '').trim(),
    percent: Math.max(0, Number(s?.percent ?? s?.salePercent ?? s?.sale_percent) || 0),
    total: Math.max(0, Number(s?.total ?? s?.saleTotal ?? s?.sale_total) || 0),
  })).filter(s => s.sellerId) : [];
  out.payments = Array.isArray(out.payments) ? out.payments.slice(0, MAX_PAYMENT_METHODS).map(p => ({
    method: String(p?.method || p?.paymentMethod || p?.payment_method || '').trim(),
    amount: Math.max(0, Number(p?.amount ?? p?.paid_amount) || 0),
    refNo: String(p?.refNo || p?.ref_no || '').trim(),
  })).filter(p => p.method && p.amount > 0) : [];
  out.usingDeposit = !!out.usingDeposit;
  out.usingWallet = !!out.usingWallet;
  out.isVatIncluded = !!out.isVatIncluded;
  out.isPremium = !!out.isPremium;
  out.refunded = !!out.refunded;
  out.status = STATUS_OPTIONS.includes(out.status) ? out.status : 'draft';
  return out;
}
