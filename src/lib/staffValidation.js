// ─── Staff validation — Phase 12.1 pure helpers ────────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/user` (trial.proclinicth.com,
// 2871-line scan) confirms ProClinic staff form structure — employee_code,
// firstname*, lastname, nickname, email, password (pattern: ≥8 chars with
// upper+lower+digit), color/background_color (calendar), branch_id[] multi-select,
// has_sales toggle, 130 permission_* checkboxes. Our schema condenses permission
// checkboxes into `permissionGroupId` (ref to be_permission_groups, shipped
// Phase 11.7) rather than inlining 130 booleans per staff doc.
//
// Position enum (per v5 plan + user directive):
//   ผู้จัดการ / พนักงานต้อนรับ / พนักงานดำเนินการ /
//   รีเซฟชั่น / เคาเตอร์ / เจ้าหน้าที่คลังกลาง
//
// Password validation here matches ProClinic's regex (not weaker Firebase 6-char
// min); api/admin/users.js still requires 6+ as a lower bound so other callers
// aren't forced to 8+.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const POSITION_OPTIONS = Object.freeze([
  'ผู้จัดการ',
  'พนักงานต้อนรับ',
  'พนักงานดำเนินการ',
  'รีเซฟชั่น',
  'เคาเตอร์',
  'เจ้าหน้าที่คลังกลาง',
]);

export const NAME_MAX_LENGTH = 100;
export const CODE_MAX_LENGTH = 30;
export const NOTE_MAX_LENGTH = 300;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEX_COLOR_RE = /^#?[0-9a-fA-F]{3,8}$/;
// ProClinic regex verbatim: ≥8 chars, must contain upper + lower + digit.
const PASSWORD_RE = /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9]).{8,}$/;

export function validateStaff(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  if (typeof form.firstname !== 'string') return ['firstname', 'กรุณากรอกชื่อ'];
  const fn = form.firstname.trim();
  if (!fn) return ['firstname', 'กรุณากรอกชื่อ'];
  if (fn.length > NAME_MAX_LENGTH) return ['firstname', `ชื่อไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  if (form.lastname && String(form.lastname).length > NAME_MAX_LENGTH) {
    return ['lastname', `นามสกุลไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.nickname && String(form.nickname).length > NAME_MAX_LENGTH) {
    return ['nickname', `ชื่อเล่นไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.employeeCode && String(form.employeeCode).length > CODE_MAX_LENGTH) {
    return ['employeeCode', `รหัสพนักงานไม่เกิน ${CODE_MAX_LENGTH} ตัวอักษร`];
  }

  if (form.email) {
    const em = String(form.email).trim();
    if (em && !EMAIL_RE.test(em)) return ['email', 'อีเมลไม่ถูกต้อง'];
  }

  // Password is optional (only required when creating a Firebase user account).
  // When provided it must meet ProClinic's strength policy.
  if (form.password) {
    if (typeof form.password !== 'string' || !PASSWORD_RE.test(form.password)) {
      return ['password', 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร ประกอบด้วยตัวใหญ่ ตัวเล็ก และตัวเลข'];
    }
  }

  if (form.position && !POSITION_OPTIONS.includes(form.position)) {
    return ['position', 'ตำแหน่งไม่ถูกต้อง'];
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

  // Phase 14.1: defaultDfGroupId optional on staff (only required on doctors).
  // Some non-doctor staff roles (e.g. ผู้ช่วยทั่วไป if added later) may still
  // participate in DF lists; keeping the field here lets those staff opt-in
  // without a schema migration.
  if (form.defaultDfGroupId != null && typeof form.defaultDfGroupId !== 'string') {
    return ['defaultDfGroupId', 'defaultDfGroupId ต้องเป็น string'];
  }

  if (form.color && !HEX_COLOR_RE.test(String(form.color))) {
    return ['color', 'สีต้องเป็นรหัสสี hex'];
  }
  if (form.backgroundColor && !HEX_COLOR_RE.test(String(form.backgroundColor))) {
    return ['backgroundColor', 'สีพื้นหลังต้องเป็นรหัสสี hex'];
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

  // Phase 16.7-quinquies — hourly fee (optional; ≥ 0). Mirror be_doctors.
  if (form.hourlyIncome != null && form.hourlyIncome !== '') {
    const n = Number(form.hourlyIncome);
    if (!Number.isFinite(n) || n < 0) {
      return ['hourlyIncome', 'รายได้รายชั่วโมงต้องเป็นจำนวนที่ไม่ติดลบ'];
    }
  }

  // Phase 16.7-quinquies — monthly salary (optional; ≥ 0)
  if (form.salary != null && form.salary !== '') {
    const n = Number(form.salary);
    if (!Number.isFinite(n) || n < 0) {
      return ['salary', 'เงินเดือนต้องเป็นจำนวนที่ไม่ติดลบ'];
    }
  }

  // Phase 16.7-quinquies — payday (1..31; integer)
  if (form.salaryDate != null && form.salaryDate !== '') {
    const n = Number(form.salaryDate);
    if (!Number.isInteger(n) || n < 1 || n > 31) {
      return ['salaryDate', 'วันที่จ่ายเงินเดือนต้องอยู่ระหว่าง 1-31'];
    }
  }

  return null;
}

export function emptyStaffForm() {
  return {
    firstname: '',
    lastname: '',
    nickname: '',
    employeeCode: '',
    email: '',
    password: '',
    position: '',
    permissionGroupId: '',
    branchIds: [],
    color: '',
    backgroundColor: '',
    defaultDfGroupId: '',
    hourlyIncome: '',
    salary: '',
    salaryDate: '',
    hasSales: false,
    disabled: false,
    note: '',
    status: 'ใช้งาน',
    firebaseUid: '',
  };
}

export function normalizeStaff(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const coerceNum = (v) => (v === '' || v == null) ? null : Number(v);
  return {
    ...form,
    firstname: trim(form.firstname),
    lastname: trim(form.lastname),
    nickname: trim(form.nickname),
    employeeCode: trim(form.employeeCode),
    email: trim(form.email),
    position: form.position || '',
    permissionGroupId: trim(form.permissionGroupId),
    branchIds: Array.isArray(form.branchIds) ? form.branchIds.map(b => trim(b)).filter(Boolean) : [],
    color: trim(form.color),
    backgroundColor: trim(form.backgroundColor),
    defaultDfGroupId: trim(form.defaultDfGroupId),
    hourlyIncome: coerceNum(form.hourlyIncome),
    salary: coerceNum(form.salary),
    salaryDate: form.salaryDate === '' || form.salaryDate == null ? null : Number(form.salaryDate),
    hasSales: !!form.hasSales,
    disabled: !!form.disabled,
    note: trim(form.note),
    status: form.status || 'ใช้งาน',
    firebaseUid: trim(form.firebaseUid),
  };
}

// Generate stable staff ID — crypto-random (rule C2, no Math.random).
export function generateStaffId() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    return `STAFF-${Date.now().toString(36)}-${hex}`;
  }
  throw new Error('crypto.getRandomValues unavailable — cannot generate secure staff id');
}
