// ─── Expense Category validation — Phase 12.5 pure helpers ────────────────
// `/admin/expense-category` is inline-only in ProClinic — no dedicated form.
// OUR schema: minimal {name, note, status} so expenses can group by category.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);
export const NAME_MAX_LENGTH = 100;
export const NOTE_MAX_LENGTH = 300;

export function validateExpenseCategory(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];
  if (typeof form.name !== 'string' || !form.name.trim()) return ['name', 'กรุณากรอกชื่อหมวด'];
  if (form.name.length > NAME_MAX_LENGTH) return ['name', `ชื่อหมวดไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) return ['status', 'สถานะไม่ถูกต้อง'];
  if (form.note && form.note.length > NOTE_MAX_LENGTH) return ['note', `note เกิน ${NOTE_MAX_LENGTH}`];
  return null;
}

export function emptyExpenseCategoryForm() {
  return { name: '', note: '', status: 'ใช้งาน' };
}

export function normalizeExpenseCategory(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  return {
    ...form,
    name: trim(form.name),
    note: trim(form.note),
    status: form.status || 'ใช้งาน',
  };
}

export function generateExpenseCategoryId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `EXPCAT-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
