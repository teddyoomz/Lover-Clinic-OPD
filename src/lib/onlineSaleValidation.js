// ─── Online Sale validation — Phase 12.6 pure helpers ─────────────────────
// Pre-sale ledger for online transfers. State machine:
//   pending → paid → completed
//           ↘ cancelled
// `completed` happens when staff verifies the transfer AND converts the
// online-sale to a real be_sales record (Phase 12.9). `cancelled` can come
// from either pending or paid, never from completed.
//
// Transitions outside the allowed set throw. Callers must route everything
// through `applyStatusTransition` to keep history consistent.

export const STATUS_OPTIONS = Object.freeze(['pending', 'paid', 'completed', 'cancelled']);

export const TRANSITIONS = Object.freeze({
  pending: Object.freeze(['paid', 'cancelled']),
  paid: Object.freeze(['completed', 'cancelled']),
  completed: Object.freeze([]),
  cancelled: Object.freeze([]),
});

export const NAME_MAX_LENGTH = 200;
export const NOTE_MAX_LENGTH = 1000;
export const URL_MAX_LENGTH = 500;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Accept either 'YYYY-MM-DDTHH:mm' (HTML datetime-local) or full ISO.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+\-]\d{2}:?\d{2})?$/;

export function validateOnlineSale(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];

  if (typeof form.customerId !== 'string' || !form.customerId.trim()) return ['customerId', 'ต้องระบุ customerId'];

  const amount = Number(form.amount);
  if (!Number.isFinite(amount)) return ['amount', 'amount ต้องเป็นตัวเลข'];
  if (amount < 0) return ['amount', 'amount ต้องไม่ติดลบ'];
  if (strict && amount <= 0) return ['amount', 'amount ต้องมากกว่า 0'];

  if (strict && (!form.bankAccountId || !String(form.bankAccountId).trim())) {
    return ['bankAccountId', 'กรุณาเลือกบัญชีธนาคาร'];
  }
  if (form.bankAccountId != null && typeof form.bankAccountId !== 'string') {
    return ['bankAccountId', 'bankAccountId ต้องเป็น string'];
  }

  if (form.transferDate) {
    if (!ISO_DATE_RE.test(String(form.transferDate))) return ['transferDate', 'transferDate ต้องเป็น YYYY-MM-DD'];
  }
  if (form.transferTime) {
    // Accept HH:mm OR full datetime.
    const t = String(form.transferTime);
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(t) && !ISO_DATETIME_RE.test(t)) {
      return ['transferTime', 'transferTime รูปแบบไม่ถูกต้อง (HH:mm หรือ ISO)'];
    }
  }

  if (form.slipImageUrl && String(form.slipImageUrl).length > URL_MAX_LENGTH) {
    return ['slipImageUrl', `slipImageUrl เกิน ${URL_MAX_LENGTH}`];
  }

  if (form.source && String(form.source).length > NAME_MAX_LENGTH) {
    return ['source', `source เกิน ${NAME_MAX_LENGTH}`];
  }
  if (form.adDescription && String(form.adDescription).length > NOTE_MAX_LENGTH) {
    return ['adDescription', `adDescription เกิน ${NOTE_MAX_LENGTH}`];
  }
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH}`];
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  if (form.linkedSaleId != null && typeof form.linkedSaleId !== 'string') {
    return ['linkedSaleId', 'linkedSaleId ต้องเป็น string'];
  }

  // When status=completed, linkedSaleId MUST be set (Phase 12.9 enforces the
  // other direction by creating the sale first, then setting both).
  if (form.status === 'completed') {
    if (!form.linkedSaleId || !String(form.linkedSaleId).trim()) {
      return ['linkedSaleId', 'completed ต้องมี linkedSaleId (ใบเสร็จที่เชื่อมโยง)'];
    }
  }

  return null;
}

// Pure transition helper. Returns new status on success, throws on invalid.
export function applyStatusTransition(currentStatus, nextStatus) {
  if (!STATUS_OPTIONS.includes(currentStatus)) {
    throw new Error(`unknown current status: ${currentStatus}`);
  }
  if (!STATUS_OPTIONS.includes(nextStatus)) {
    throw new Error(`unknown next status: ${nextStatus}`);
  }
  if (currentStatus === nextStatus) return nextStatus;  // idempotent
  const allowed = TRANSITIONS[currentStatus];
  if (!allowed.includes(nextStatus)) {
    throw new Error(`invalid transition ${currentStatus} → ${nextStatus}`);
  }
  return nextStatus;
}

export function emptyOnlineSaleForm() {
  return {
    customerId: '',
    customerName: '',
    customerHN: '',
    amount: 0,
    bankAccountId: '',
    bankAccountLabel: '',     // denorm — "กสิกรไทย ****1234" for list display
    transferDate: '',
    transferTime: '',
    slipImageUrl: '',
    slipImagePath: '',
    source: '',
    adDescription: '',
    note: '',
    status: 'pending',
    linkedSaleId: '',
    paidAt: null,
    completedAt: null,
    cancelledAt: null,
    cancelReason: '',
  };
}

export function normalizeOnlineSale(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const n = Number(form.amount);
  const status = STATUS_OPTIONS.includes(form.status) ? form.status : 'pending';
  return {
    ...form,
    customerId: trim(form.customerId),
    customerName: trim(form.customerName),
    customerHN: trim(form.customerHN),
    amount: Number.isFinite(n) ? n : 0,
    bankAccountId: trim(form.bankAccountId),
    bankAccountLabel: trim(form.bankAccountLabel),
    transferDate: trim(form.transferDate),
    transferTime: trim(form.transferTime),
    slipImageUrl: trim(form.slipImageUrl),
    slipImagePath: trim(form.slipImagePath),
    source: trim(form.source),
    adDescription: trim(form.adDescription),
    note: trim(form.note),
    status,
    linkedSaleId: trim(form.linkedSaleId),
    cancelReason: trim(form.cancelReason),
  };
}

export function generateOnlineSaleId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `OSALE-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
