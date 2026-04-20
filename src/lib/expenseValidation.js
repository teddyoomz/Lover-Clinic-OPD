// ─── Expense validation — Phase 12.5 pure helpers ─────────────────────────
// Triangle: `opd.js forms /admin/expense` confirms fields: expense_name,
// amount, category_id / category_name, doc_id, has_user_id, user_id, image,
// note. Phase 12.5 adds `date` (YYYY-MM-DD) + `branchId` for report grouping.

export const STATUS_OPTIONS = Object.freeze(['active', 'void']);
export const NAME_MAX_LENGTH = 200;
export const NOTE_MAX_LENGTH = 1000;
export const DOC_ID_MAX_LENGTH = 50;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateExpense(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];
  if (typeof form.expenseName !== 'string' || !form.expenseName.trim()) return ['expenseName', 'กรุณากรอกรายการค่าใช้จ่าย'];
  if (form.expenseName.length > NAME_MAX_LENGTH) return ['expenseName', `รายการไม่เกิน ${NAME_MAX_LENGTH}`];
  const amount = Number(form.amount);
  if (!Number.isFinite(amount)) return ['amount', 'amount ต้องเป็นตัวเลข'];
  if (amount < 0) return ['amount', 'amount ต้องไม่ติดลบ'];
  if (strict && amount <= 0) return ['amount', 'amount ต้องมากกว่า 0'];

  if (form.date && !ISO_DATE_RE.test(String(form.date))) return ['date', 'date ต้องเป็น YYYY-MM-DD'];
  if (strict && !form.date) return ['date', 'กรุณาระบุวันที่'];
  if (strict && !form.categoryId) return ['categoryId', 'กรุณาเลือกหมวด'];

  if (form.categoryId != null && typeof form.categoryId !== 'string') return ['categoryId', 'categoryId ต้องเป็น string'];
  if (form.userId != null && typeof form.userId !== 'string') return ['userId', 'userId ต้องเป็น string'];
  if (form.branchId != null && typeof form.branchId !== 'string') return ['branchId', 'branchId ต้องเป็น string'];
  if (form.docId && form.docId.length > DOC_ID_MAX_LENGTH) return ['docId', `docId เกิน ${DOC_ID_MAX_LENGTH}`];
  if (form.note && form.note.length > NOTE_MAX_LENGTH) return ['note', `note เกิน ${NOTE_MAX_LENGTH}`];
  if (form.hasUserId != null && typeof form.hasUserId !== 'boolean') return ['hasUserId', 'hasUserId ต้องเป็น boolean'];
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) return ['status', 'สถานะไม่ถูกต้อง'];

  return null;
}

export function emptyExpenseForm() {
  return {
    expenseName: '',
    amount: 0,
    date: '',
    categoryId: '',
    categoryName: '',
    docId: '',
    userId: '',
    hasUserId: false,
    branchId: '',
    imageUrl: '',
    imagePath: '',
    note: '',
    status: 'active',
  };
}

export function normalizeExpense(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const n = Number(form.amount);
  return {
    ...form,
    expenseName: trim(form.expenseName),
    amount: Number.isFinite(n) ? n : 0,
    date: trim(form.date),
    categoryId: trim(form.categoryId),
    categoryName: trim(form.categoryName),
    docId: trim(form.docId),
    userId: trim(form.userId),
    hasUserId: !!form.hasUserId,
    branchId: trim(form.branchId),
    imageUrl: trim(form.imageUrl),
    imagePath: trim(form.imagePath),
    note: trim(form.note),
    status: STATUS_OPTIONS.includes(form.status) ? form.status : 'active',
  };
}

export function generateExpenseId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `EXP-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
