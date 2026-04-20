// ─── Bank Account validation — Phase 12.5 pure helpers ────────────────────
// ProClinic `/admin/bank-account` = 0 forms (inline as text in sale/deposit
// records). OUR app structures bank accounts as a referenced entity so sales
// can point to a structured account record instead of free-form strings.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);
export const ACCOUNT_TYPE_OPTIONS = Object.freeze(['savings', 'current', 'fixed', 'other']);

export const NAME_MAX_LENGTH = 100;
export const ACCOUNT_NUMBER_MAX_LENGTH = 50;
export const BRANCH_MAX_LENGTH = 100;
export const NOTE_MAX_LENGTH = 300;

export function validateBankAccount(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];
  if (typeof form.bankName !== 'string' || !form.bankName.trim()) return ['bankName', 'กรุณากรอกชื่อธนาคาร'];
  if (form.bankName.length > NAME_MAX_LENGTH) return ['bankName', `ชื่อธนาคารไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  if (typeof form.accountNumber !== 'string' || !form.accountNumber.trim()) return ['accountNumber', 'กรุณากรอกเลขบัญชี'];
  if (form.accountNumber.length > ACCOUNT_NUMBER_MAX_LENGTH) return ['accountNumber', `เลขบัญชีเกิน ${ACCOUNT_NUMBER_MAX_LENGTH}`];
  if (form.accountName && form.accountName.length > NAME_MAX_LENGTH) return ['accountName', `ชื่อบัญชีเกิน ${NAME_MAX_LENGTH}`];
  if (form.accountType && !ACCOUNT_TYPE_OPTIONS.includes(form.accountType)) return ['accountType', 'ประเภทบัญชีไม่ถูกต้อง'];
  if (form.branchName && form.branchName.length > BRANCH_MAX_LENGTH) return ['branchName', `สาขาเกิน ${BRANCH_MAX_LENGTH}`];
  if (form.branchId != null && typeof form.branchId !== 'string') return ['branchId', 'branchId ต้องเป็น string'];
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) return ['status', 'สถานะไม่ถูกต้อง'];
  if (form.isDefault != null && typeof form.isDefault !== 'boolean') return ['isDefault', 'isDefault ต้องเป็น boolean'];
  if (form.note && form.note.length > NOTE_MAX_LENGTH) return ['note', `note เกิน ${NOTE_MAX_LENGTH}`];
  return null;
}

export function emptyBankAccountForm() {
  return {
    bankName: '',
    accountNumber: '',
    accountName: '',
    accountType: 'savings',
    branchName: '',
    branchId: '',
    isDefault: false,
    status: 'ใช้งาน',
    note: '',
  };
}

export function normalizeBankAccount(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  return {
    ...form,
    bankName: trim(form.bankName),
    accountNumber: trim(form.accountNumber).replace(/[\s-]/g, ''),
    accountName: trim(form.accountName),
    accountType: ACCOUNT_TYPE_OPTIONS.includes(form.accountType) ? form.accountType : 'savings',
    branchName: trim(form.branchName),
    branchId: trim(form.branchId),
    isDefault: !!form.isDefault,
    status: form.status || 'ใช้งาน',
    note: trim(form.note),
  };
}

export function generateBankAccountId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `BANK-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
