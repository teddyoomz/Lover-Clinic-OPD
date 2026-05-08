// ─── Exam-room validation — Phase 18.0 pure helpers ───────────────────────
// Branch-scoped master entity. Mirrors branchValidation.js / holidayValidation.js
// shape. Used by ExamRoomFormModal + saveExamRoom + migration script.
//
// V57 / AV30 (2026-05-08) — `kind` field added to close the schema-vs-consumer
// drift. Phase 18.0 introduced be_exam_rooms but the validation file never
// declared `kind` even though V55 (mapper) + V56 (modal/panel/handleGenScheduleLink)
// consumers filtered `r.kind === 'doctor'`. Existing prod data has all rooms
// with `kind: undefined` → silently excluded from doctor-mode UIs. V57 adds
// the field at schema level + UI picker + Rule M backfill migration. All
// 5 consumer sites adopt defensive-default `(kind ?? 'doctor')` so legacy
// data degrades gracefully (treated as doctor-rooms — matches naming
// convention of "ห้องแพทย์/ผ่าตัด" in prod).

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

// V57 / AV30 — kind enum. 'doctor' = ห้องแพทย์/ผ่าตัด (default for new rooms,
// matches the most common clinic exam room). 'staff' = ห้องหัตถการทั่วไป
// (procedure rooms staff use without doctor — e.g. ห้องช็อคเวฟ for shockwave
// therapy administered by staff). Used by V55 schedule-link `เลือกห้อง`
// dropdown to switch between doctor+room vs ไม่ต้องพบแพทย์ flows.
export const KIND_OPTIONS = Object.freeze(['doctor', 'staff']);
export const KIND_LABEL = Object.freeze({
  doctor: 'ห้องแพทย์',
  staff: 'ห้องหัตถการทั่วไป',
});

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

  // V57 / AV30 — kind enum check. Optional at validate-level (legacy rooms
  // pre-V57 have no kind); when present must be a valid enum value. New
  // rooms via emptyExamRoomForm() default to 'doctor' so this rarely fires.
  if (form.kind != null && form.kind !== '' && !KIND_OPTIONS.includes(form.kind)) {
    return ['kind', 'ประเภทห้องไม่ถูกต้อง (doctor | staff)'];
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
  // V57 / AV30 — default kind 'doctor' (most clinics' default; admin can
  // flip to 'staff' for procedure rooms via radio picker).
  return { name: '', nameEn: '', note: '', status: 'ใช้งาน', kind: 'doctor', sortOrder: 0 };
}

export function normalizeExamRoom(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const coerceInt = (v) => {
    if (v === '' || v == null) return 0;
    const n = Number(v);
    return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : 0;
  };
  // V57 / AV30 — preserve kind (default 'doctor' if unset for legacy data).
  // Defense-in-depth: even if upstream caller forgets to set kind, the
  // saved doc gets a stable shape so consumers don't need defensive
  // defaults at read time (though they still have them for backward-compat).
  const coerceKind = (v) => (KIND_OPTIONS.includes(v) ? v : 'doctor');
  return {
    ...form,
    name: trim(form.name),
    nameEn: trim(form.nameEn),
    note: trim(form.note),
    status: form.status || 'ใช้งาน',
    kind: coerceKind(form.kind),
    sortOrder: coerceInt(form.sortOrder),
  };
}
