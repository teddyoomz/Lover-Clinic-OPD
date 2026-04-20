// ─── Sale Insurance Claim validation — Phase 12.7 pure helpers ────────────
// Backfills Phase 10.2 SaleReportTab "เบิกประกัน" column which was hardcoded
// to 0. One sale may have multiple claim rows (partial reimbursements over
// time); aggregator sums them per saleId.
//
// Status flow: pending → approved → paid, or pending → rejected.

export const STATUS_OPTIONS = Object.freeze(['pending', 'approved', 'paid', 'rejected']);

export const TRANSITIONS = Object.freeze({
  pending:  Object.freeze(['approved', 'rejected']),
  approved: Object.freeze(['paid', 'rejected']),
  paid:     Object.freeze([]),
  rejected: Object.freeze([]),
});

export const NAME_MAX_LENGTH = 200;
export const NOTE_MAX_LENGTH = 1000;
export const URL_MAX_LENGTH = 500;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateSaleInsuranceClaim(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];

  if (typeof form.saleId !== 'string' || !form.saleId.trim()) return ['saleId', 'ต้องระบุ saleId'];
  if (typeof form.customerId !== 'string' || !form.customerId.trim()) return ['customerId', 'ต้องระบุ customerId'];

  const amount = Number(form.claimAmount);
  if (!Number.isFinite(amount)) return ['claimAmount', 'claimAmount ต้องเป็นตัวเลข'];
  if (amount < 0) return ['claimAmount', 'claimAmount ต้องไม่ติดลบ'];
  if (strict && amount <= 0) return ['claimAmount', 'claimAmount ต้องมากกว่า 0'];

  if (form.paidAmount != null && form.paidAmount !== '') {
    const pa = Number(form.paidAmount);
    if (!Number.isFinite(pa) || pa < 0) return ['paidAmount', 'paidAmount ต้องไม่ติดลบ'];
    if (pa > amount) return ['paidAmount', 'paidAmount เกิน claimAmount'];
  }

  if (form.claimDate && !ISO_DATE_RE.test(String(form.claimDate))) {
    return ['claimDate', 'claimDate ต้องเป็น YYYY-MM-DD'];
  }
  if (strict && !form.claimDate) return ['claimDate', 'กรุณาระบุวันที่เบิก'];

  if (form.insuranceCompany && String(form.insuranceCompany).length > NAME_MAX_LENGTH) {
    return ['insuranceCompany', `insuranceCompany เกิน ${NAME_MAX_LENGTH}`];
  }
  if (form.policyNumber && String(form.policyNumber).length > NAME_MAX_LENGTH) {
    return ['policyNumber', `policyNumber เกิน ${NAME_MAX_LENGTH}`];
  }
  if (form.claimFileUrl && String(form.claimFileUrl).length > URL_MAX_LENGTH) {
    return ['claimFileUrl', `claimFileUrl เกิน ${URL_MAX_LENGTH}`];
  }
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH}`];
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // When status=paid, paidAmount must be > 0 and <= claimAmount.
  if (form.status === 'paid') {
    const pa = Number(form.paidAmount);
    if (!Number.isFinite(pa) || pa <= 0) {
      return ['paidAmount', 'paid status ต้องมี paidAmount > 0'];
    }
  }

  return null;
}

export function applyClaimStatusTransition(currentStatus, nextStatus) {
  if (!STATUS_OPTIONS.includes(currentStatus)) throw new Error(`unknown current status: ${currentStatus}`);
  if (!STATUS_OPTIONS.includes(nextStatus)) throw new Error(`unknown next status: ${nextStatus}`);
  if (currentStatus === nextStatus) return nextStatus;
  if (!TRANSITIONS[currentStatus].includes(nextStatus)) {
    throw new Error(`invalid transition ${currentStatus} → ${nextStatus}`);
  }
  return nextStatus;
}

export function emptySaleInsuranceClaimForm() {
  return {
    saleId: '',
    customerId: '',
    customerHN: '',
    customerName: '',
    insuranceCompany: '',
    policyNumber: '',
    claimAmount: 0,
    paidAmount: 0,
    claimDate: '',
    paymentMethod: '',
    paymentTime: '',
    claimFileUrl: '',
    claimFilePath: '',
    status: 'pending',
    note: '',
    approvedAt: null,
    paidAt: null,
    rejectedAt: null,
    rejectReason: '',
  };
}

export function normalizeSaleInsuranceClaim(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const n = Number(form.claimAmount);
  const pa = Number(form.paidAmount);
  return {
    ...form,
    saleId: trim(form.saleId),
    customerId: trim(form.customerId),
    customerHN: trim(form.customerHN),
    customerName: trim(form.customerName),
    insuranceCompany: trim(form.insuranceCompany),
    policyNumber: trim(form.policyNumber),
    claimAmount: Number.isFinite(n) ? n : 0,
    paidAmount: Number.isFinite(pa) ? pa : 0,
    claimDate: trim(form.claimDate),
    paymentMethod: trim(form.paymentMethod),
    paymentTime: trim(form.paymentTime),
    claimFileUrl: trim(form.claimFileUrl),
    claimFilePath: trim(form.claimFilePath),
    status: STATUS_OPTIONS.includes(form.status) ? form.status : 'pending',
    note: trim(form.note),
    rejectReason: trim(form.rejectReason),
  };
}

export function generateSaleInsuranceClaimId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `CLAIM-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}

// Aggregation helper — for Phase 10.2 report integration. Takes a flat array
// of claims and returns a Map<saleId, totalPaidAmount>. Only 'paid' claims
// count toward the insurance-claim column (pending/approved are not yet
// reimbursed; rejected is zero).
export function aggregateClaimsBySaleId(claims) {
  const map = new Map();
  if (!Array.isArray(claims)) return map;
  for (const c of claims) {
    if (!c || c.status !== 'paid') continue;
    const sid = String(c.saleId || '').trim();
    if (!sid) continue;
    const amt = Number(c.paidAmount) || 0;
    map.set(sid, (map.get(sid) || 0) + amt);
  }
  return map;
}
