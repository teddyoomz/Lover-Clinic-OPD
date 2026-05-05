// ─── Exam-room validation — Phase 18.0 pure helpers ───────────────────────
// Branch-scoped master entity. Mirrors branchValidation.js / holidayValidation.js
// shape. Used by ExamRoomFormModal + saveExamRoom + migration script.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const NAME_MAX_LENGTH = 80;
export const NOTE_MAX_LENGTH = 200;

export function validateExamRoom(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // name — required
  if (typeof form.name !== 'string') return ['name', 'กรุณากรอกชื่อห้องตรวจ'];
  const nm = form.name.trim();
  if (!nm) return ['name', 'กรุณากรอกชื่อห้องตรวจ'];
  if (nm.length > NAME_MAX_LENGTH) return ['name', `ชื่อห้องไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  // optional bounded text
  if (form.nameEn && String(form.nameEn).length > NAME_MAX_LENGTH) {
    return ['nameEn', `ชื่อ (EN) ไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
  }

  // status enum
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // sortOrder optional non-negative integer
  if (form.sortOrder !== undefined && form.sortOrder !== null && form.sortOrder !== '') {
    const n = Number(form.sortOrder);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return ['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ'];
    }
  }

  return null;
}

export function emptyExamRoomForm() {
  return { name: '', nameEn: '', note: '', status: 'ใช้งาน', sortOrder: 0 };
}

export function normalizeExamRoom(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const coerceInt = (v) => {
    if (v === '' || v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : 0;
  };
  return {
    ...form,
    name: trim(form.name),
    nameEn: trim(form.nameEn),
    note: trim(form.note),
    status: form.status || 'ใช้งาน',
    sortOrder: coerceInt(form.sortOrder),
  };
}
