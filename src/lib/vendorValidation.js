// ─── Vendor (คู่ค้า) master data validation — Phase 14.3 (G6) ──────────────
// be_vendors stores B2B partners (suppliers / vendors / wholesale buyers).
// Used by vendor-sale flow + future receivables / purchase orders.

export const NAME_MAX_LENGTH = 200;
export const NOTE_MAX_LENGTH = 500;
export const TAX_ID_MAX_LENGTH = 30;

export function validateVendor(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) return ['form', 'missing form'];
  if (typeof form.name !== 'string' || !form.name.trim()) return ['name', 'ต้องระบุชื่อคู่ค้า'];
  if (form.name.length > NAME_MAX_LENGTH) return ['name', `ชื่อเกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  if (form.taxId && String(form.taxId).length > TAX_ID_MAX_LENGTH) return ['taxId', `taxId เกิน ${TAX_ID_MAX_LENGTH}`];
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) return ['note', `note เกิน ${NOTE_MAX_LENGTH}`];
  if (form.isActive != null && typeof form.isActive !== 'boolean') return ['isActive', 'isActive ต้องเป็น boolean'];
  return null;
}

export function emptyVendorForm() {
  return {
    name: '',
    taxId: '',
    address: '',
    phone: '',
    email: '',
    contactName: '',
    note: '',
    isActive: true,
  };
}

export function normalizeVendor(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  return {
    ...form,
    name: trim(form.name),
    taxId: trim(form.taxId),
    address: trim(form.address),
    phone: trim(form.phone),
    email: trim(form.email),
    contactName: trim(form.contactName),
    note: trim(form.note),
    isActive: form.isActive !== false,
  };
}

export function generateVendorId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `VEND-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable');
}
