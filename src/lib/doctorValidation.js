// ─── Doctor validation — Phase 12.1 pure helpers ───────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/doctor` (trial.proclinicth.com,
// 3127-line scan) confirms ProClinic doctor form structure — firstname*/lastname
// (Thai + English variants), nickname, email, password (same ≥8 strength regex
// as staff), color/background_color, branch_id[] multi-select, df_group_id +
// df_paid_type + hourly_income + minimum_df_type (DF matrix — deferred to
// Phase 13.3 be_df_groups), 130 permission_* checkboxes (collapsed to
// permissionGroupId ref like staff).
//
// Position enum: 'แพทย์' (doctor) / 'ผู้ช่วยแพทย์' (assistant). One collection
// with position discriminator per v5 wiring-matrix recommendation.
//
// DF fields (hourlyIncome, dfGroupId, dfPaidType, minimumDfType) are kept
// in the schema but NOT validated/required here — Phase 13 will add a
// stricter `validateDoctorDFCompleteness` pass once be_df_groups ships.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const POSITION_OPTIONS = Object.freeze(['แพทย์', 'ผู้ช่วยแพทย์']);

// Matches ProClinic dropdown values (placeholder — Phase 13.3 replaces with
// be_df_paid_types when DF matrix lands).
export const DF_PAID_TYPE_OPTIONS = Object.freeze(['fixed', 'percent', 'per_unit', '']);

export const NAME_MAX_LENGTH = 100;
export const LICENSE_MAX_LENGTH = 50;
export const NOTE_MAX_LENGTH = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#?[0-9a-fA-F]{3,8}$/;
const PASSWORD_RE = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{8,}$/;

export function validateDoctor(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  if (typeof form.firstname !== 'string') return ['firstname', 'กรุณากรอกชื่อ (ภาษาไทย)'];
  const fn = form.firstname.trim();
  if (!fn) return ['firstname', 'กรุณากรอกชื่อ (ภาษาไทย)'];
  if (fn.length > NAME_MAX_LENGTH) return ['firstname', `ชื่อไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  const checkNameField = (key, label) => {
    if (form[key] && String(form[key]).length > NAME_MAX_LENGTH) {
      return [key, `${label}ไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
    }
    return null;
  };
  const lenFail = checkNameField('lastname', 'นามสกุล')
    || checkNameField('firstnameEn', 'ชื่อ (EN)')
    || checkNameField('lastnameEn', 'นามสกุล (EN)')
    || checkNameField('nickname', 'ชื่อเล่น');
  if (lenFail) return lenFail;

  if (form.email) {
    const em = String(form.email).trim();
    if (em && !EMAIL_RE.test(em)) return ['email', 'อีเมลไม่ถูกต้อง'];
  }

  if (form.password) {
    if (typeof form.password !== 'string' || !PASSWORD_RE.test(form.password)) {
      return ['password', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวใหญ่ ตัวเล็ก และตัวเลข'];
    }
  }

  if (!form.position) return ['position', 'กรุณาเลือกตำแหน่ง (แพทย์ / ผู้ช่วยแพทย์)'];
  if (!POSITION_OPTIONS.includes(form.position)) {
    return ['position', 'ตำแหน่งไม่ถูกต้อง (แพทย์ / ผู้ช่วยแพทย์)'];
  }

  if (form.professionalLicense && String(form.professionalLicense).length > LICENSE_MAX_LENGTH) {
    return ['professionalLicense', `เลขใบประกอบวิชาชีพไม่เกิน ${LICENSE_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.branchIds != null) {
    if (!Array.isArray(form.branchIds)) return ['branchIds', 'branchIds ต้องเป็น array'];
    if (!form.branchIds.every(b => typeof b === 'string' && b.trim())) {
      return ['branchIds', 'branchIds แต่ละตัวต้องเป็น string ที่ไม่ว่าง'];
    }
  }

  if (form.permissionGroupId != null && typeof form.permissionGroupId !== 'string') {
    return ['permissionGroupId', 'permissionGroupId ต้องเป็น string'];
  }

  if (form.color && !HEX_COLOR_RE.test(String(form.color))) {
    return ['color', 'สีต้องเป็นรหัสสี hex'];
  }
  if (form.backgroundColor && !HEX_COLOR_RE.test(String(form.backgroundColor))) {
    return ['backgroundColor', 'สีพื้นหลังต้องเป็นรหัสสี hex'];
  }

  if (form.hourlyIncome != null && form.hourlyIncome !== '') {
    const n = Number(form.hourlyIncome);
    if (!Number.isFinite(n) || n < 0) {
      return ['hourlyIncome', 'รายได้รายชั่วโมงต้องเป็นจำนวนที่ไม่ติดลบ'];
    }
  }

  if (form.dfPaidType != null && !DF_PAID_TYPE_OPTIONS.includes(form.dfPaidType)) {
    return ['dfPaidType', 'ประเภทการจ่ายค่ามือไม่ถูกต้อง'];
  }

  if (form.hasSales != null && typeof form.hasSales !== 'boolean') {
    return ['hasSales', 'hasSales ต้องเป็น boolean'];
  }
  if (form.disabled != null && typeof form.disabled !== 'boolean') {
    return ['disabled', 'disabled ต้องเป็น boolean'];
  }
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
  }

  return null;
}

export function emptyDoctorForm() {
  return {
    firstname: '',
    lastname: '',
    firstnameEn: '',
    lastnameEn: '',
    nickname: '',
    email: '',
    password: '',
    position: 'แพทย์',
    professionalLicense: '',
    permissionGroupId: '',
    branchIds: [],
    color: '',
    backgroundColor: '',
    hourlyIncome: '',
    dfGroupId: '',
    dfPaidType: '',
    minimumDfType: '',
    hasSales: false,
    disabled: false,
    note: '',
    status: 'ใช้งาน',
    firebaseUid: '',
  };
}

export function normalizeDoctor(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const coerceNum = (v) => (v === '' || v == null) ? null : Number(v);
  return {
    ...form,
    firstname: trim(form.firstname),
    lastname: trim(form.lastname),
    firstnameEn: trim(form.firstnameEn),
    lastnameEn: trim(form.lastnameEn),
    nickname: trim(form.nickname),
    email: trim(form.email),
    position: form.position || 'แพทย์',
    professionalLicense: trim(form.professionalLicense),
    permissionGroupId: trim(form.permissionGroupId),
    branchIds: Array.isArray(form.branchIds) ? form.branchIds.map(b => trim(b)).filter(Boolean) : [],
    color: trim(form.color),
    backgroundColor: trim(form.backgroundColor),
    hourlyIncome: coerceNum(form.hourlyIncome),
    dfGroupId: trim(form.dfGroupId),
    dfPaidType: form.dfPaidType || '',
    minimumDfType: trim(form.minimumDfType),
    hasSales: !!form.hasSales,
    disabled: !!form.disabled,
    note: trim(form.note),
    status: form.status || 'ใช้งาน',
    firebaseUid: trim(form.firebaseUid),
  };
}

export function generateDoctorId(position) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const prefix = position === 'ผู้ช่วยแพทย์' ? 'ASST' : 'DOC';
    return `${prefix}-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable — cannot generate secure doctor id');
}
