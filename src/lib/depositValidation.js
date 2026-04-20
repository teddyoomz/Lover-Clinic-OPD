// ─── Deposit validation — Phase 12.4 pure helpers ──────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/deposit` (2246-line scan)
// confirms ProClinic supports **5 sellers** per deposit (not 3 as v5 plan stated).
// Each seller has seller_N_id + sale_percent_N + sale_total_N + hasSellerN flag.
//
// Invariants:
//   DV-SELLERS-1: at most 5 active sellers per deposit
//   DV-SELLERS-2: if any seller is active, sum(sale_percent) == 100 (±0.01)
//   DV-SELLERS-3: if any seller is active, sum(sale_total) == deposit (±0.01)
//   DV-AMOUNT-1:  deposit amount > 0 on create (zero-amount deposits meaningless)
//   DV-REFUND-1:  refundAmount ≥ 0 AND ≤ amount
//
// These fire on strict writes (new create / full replace). Legacy docs with
// 1-2 sellers keep working because non-strict saves don't run them.

export const MAX_SELLERS = 5;
export const STATUS_OPTIONS = Object.freeze(['active', 'partial', 'used', 'cancelled', 'refunded']);

const AMOUNT_EPSILON = 0.01;
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateDeposit(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  const amount = Number(form.amount);
  if (!Number.isFinite(amount)) return ['amount', 'amount ต้องเป็นตัวเลข'];
  if (strict && amount <= 0) return ['amount', 'amount ต้องมากกว่า 0'];
  if (amount < 0) return ['amount', 'amount ต้องไม่ติดลบ'];

  if (strict) {
    if (!form.customerId || !String(form.customerId).trim()) {
      return ['customerId', 'ต้องระบุ customerId'];
    }
    if (!form.paymentChannel || !String(form.paymentChannel).trim()) {
      return ['paymentChannel', 'ต้องระบุวิธีชำระเงิน'];
    }
  }

  if (form.paymentDate && !DATE_ISO_RE.test(String(form.paymentDate))) {
    return ['paymentDate', 'paymentDate ต้องอยู่ในรูปแบบ YYYY-MM-DD'];
  }

  // Sellers array ≤ 5; each entry has sellerId + percent + total.
  if (form.sellers != null) {
    if (!Array.isArray(form.sellers)) return ['sellers', 'sellers ต้องเป็น array'];
    if (form.sellers.length > MAX_SELLERS) {
      return ['sellers', `รองรับผู้ขายสูงสุด ${MAX_SELLERS} คน`];
    }

    const seen = new Set();
    let sumPercent = 0;
    let sumTotal = 0;
    let activeCount = 0;

    for (const [i, s] of form.sellers.entries()) {
      if (!s || typeof s !== 'object' || Array.isArray(s)) {
        return ['sellers', `sellers[${i}] ต้องเป็น object`];
      }
      const sellerId = String(s.sellerId || s.seller_id || '').trim();
      if (!sellerId) return ['sellers', `sellers[${i}].sellerId ว่าง`];
      if (seen.has(sellerId)) return ['sellers', `sellers[${i}] สร้างรายการซ้ำ (sellerId=${sellerId})`];
      seen.add(sellerId);

      const pct = Number(s.percent ?? s.salePercent ?? s.sale_percent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        return ['sellers', `sellers[${i}].percent อยู่นอกช่วง 0-100`];
      }
      const tot = Number(s.total ?? s.saleTotal ?? s.sale_total);
      if (!Number.isFinite(tot) || tot < 0) {
        return ['sellers', `sellers[${i}].total ต้องไม่ติดลบ`];
      }
      sumPercent += pct;
      sumTotal += tot;
      activeCount += 1;
    }

    if (activeCount > 0) {
      if (Math.abs(sumPercent - 100) > AMOUNT_EPSILON) {
        return ['sellers', `รวม % ขาย = ${sumPercent.toFixed(2)}% ต้องเท่ากับ 100%`];
      }
      if (Math.abs(sumTotal - amount) > AMOUNT_EPSILON) {
        return ['sellers', `รวมยอดขายผู้ขาย = ${sumTotal.toFixed(2)} ต้องเท่ากับ amount ${amount.toFixed(2)}`];
      }
    }
  }

  // Refund invariant — only applies when status=refunded OR refundAmount > 0.
  if (form.refundAmount != null && form.refundAmount !== '') {
    const ra = Number(form.refundAmount);
    if (!Number.isFinite(ra) || ra < 0) return ['refundAmount', 'refundAmount ต้องไม่ติดลบ'];
    if (ra > amount + AMOUNT_EPSILON) return ['refundAmount', 'refundAmount เกิน amount เดิม'];
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // usedAmount / remainingAmount consistency — fires only when caller is
  // actively tracking balance (either field non-zero). Fresh forms with
  // both = 0 and amount > 0 are tolerated (createDeposit will init
  // remainingAmount from amount).
  if (form.usedAmount != null && form.remainingAmount != null && form.amount != null) {
    const u = Number(form.usedAmount);
    const r = Number(form.remainingAmount);
    const a = Number(form.amount);
    if (Number.isFinite(u) && Number.isFinite(r) && Number.isFinite(a) && (u > 0 || r > 0)) {
      if (Math.abs(u + r - a) > AMOUNT_EPSILON) {
        return ['amount', `used (${u}) + remaining (${r}) != amount (${a})`];
      }
    }
  }

  return null;
}

export function emptyDepositForm() {
  return {
    customerId: '',
    customerName: '',
    customerHN: '',
    amount: 0,
    usedAmount: 0,
    remainingAmount: 0,
    paymentChannel: '',
    paymentDate: '',
    paymentTime: '',
    refNo: '',
    sellers: [],  // [{ sellerId, sellerName, percent, total }] — up to 5
    customerSource: '',
    sourceDetail: '',
    hasAppointment: false,
    appointment: null,
    note: '',
    status: 'active',
    cancelNote: '',
    cancelEvidenceUrl: '',
    cancelledAt: null,
    refundAmount: 0,
    refundChannel: '',
    refundDate: null,
    paymentEvidenceUrl: '',
    paymentEvidencePath: '',
    proClinicDepositId: null,
    usageHistory: [],
  };
}

// Distribute `amount` evenly across N active sellers (helper for form init).
// Last seller absorbs rounding to keep sum exact.
export function distributeDepositEvenly(amount, sellerIds = []) {
  const N = sellerIds.length;
  if (N === 0) return [];
  if (N > MAX_SELLERS) throw new Error(`รองรับผู้ขายสูงสุด ${MAX_SELLERS} คน`);
  const a = Number(amount) || 0;
  const evenPct = Math.round((100 / N) * 100) / 100;
  const evenTot = Math.round((a / N) * 100) / 100;
  const out = [];
  let pctRemaining = 100;
  let totRemaining = a;
  for (let i = 0; i < N; i++) {
    const isLast = i === N - 1;
    const pct = isLast ? Math.round(pctRemaining * 100) / 100 : evenPct;
    const tot = isLast ? Math.round(totRemaining * 100) / 100 : evenTot;
    pctRemaining -= pct;
    totRemaining -= tot;
    out.push({ sellerId: String(sellerIds[i]), percent: pct, total: tot });
  }
  return out;
}

export function normalizeDeposit(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const trim = (v) => (typeof v === 'string' ? v.trim() : v);
  const numOrZero = (v) => {
    if (v === '' || v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const out = { ...form };
  out.customerId = String(trim(out.customerId) || '');
  out.customerName = String(trim(out.customerName) || '');
  out.customerHN = String(trim(out.customerHN) || '');
  out.amount = numOrZero(out.amount);
  out.usedAmount = numOrZero(out.usedAmount);
  // If caller didn't provide remainingAmount OR left it at zero-default, derive
  // from amount - usedAmount. Only honor explicit non-zero remainingAmount.
  const explicitRemaining = numOrZero(out.remainingAmount);
  out.remainingAmount = explicitRemaining > 0 ? explicitRemaining : Math.max(0, out.amount - out.usedAmount);
  out.refundAmount = numOrZero(out.refundAmount);
  out.paymentChannel = String(trim(out.paymentChannel) || '');
  out.paymentDate = String(trim(out.paymentDate) || '');
  out.paymentTime = String(trim(out.paymentTime) || '');
  out.refNo = String(trim(out.refNo) || '');
  out.note = String(trim(out.note) || '');
  out.hasAppointment = !!out.hasAppointment;
  out.sellers = Array.isArray(out.sellers)
    ? out.sellers.slice(0, MAX_SELLERS).map(s => ({
        sellerId: String(s?.sellerId || s?.seller_id || '').trim(),
        sellerName: String(s?.sellerName || s?.seller_name || '').trim(),
        percent: Math.max(0, Number(s?.percent ?? s?.salePercent ?? s?.sale_percent) || 0),
        total: Math.max(0, Number(s?.total ?? s?.saleTotal ?? s?.sale_total) || 0),
      })).filter(s => s.sellerId)
    : [];
  if (!STATUS_OPTIONS.includes(out.status)) out.status = 'active';
  return out;
}
