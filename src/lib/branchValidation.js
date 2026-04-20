// ─── Branch validation — Phase 11.6 pure helpers ──────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/branch` revealed ~18+
// fields including 7-day opening-hours matrix. Phase 11.6 ships the CORE
// identification/contact/address/map fields (13) + our `status` + `isDefault`
// extensions. The weekly schedule (is_<dow>_open + <dow>_opening_time +
// <dow>_closing_time × 7 days) is deferred to Phase 13 where it pairs with
// staff schedules and the AppointmentTab booking flow.

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);

export const NAME_MAX_LENGTH = 120;
export const ADDRESS_MAX_LENGTH = 500;
export const NOTE_MAX_LENGTH = 200;

// Thai landline/mobile: 0 followed by 8..10 digits (mirrors ProClinic regex).
const PHONE_RE = /^0[0-9]{8,10}$/;
const URL_RE = /^https?:\/\/.+/i;

export function validateBranch(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // name — required
  if (typeof form.name !== 'string') return ['name', 'กรุณากรอกชื่อสาขา'];
  const nm = form.name.trim();
  if (!nm) return ['name', 'กรุณากรอกชื่อสาขา'];
  if (nm.length > NAME_MAX_LENGTH) return ['name', `ชื่อสาขาไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];

  // phone — required (per ProClinic)
  if (typeof form.phone !== 'string' || !form.phone.trim()) {
    return ['phone', 'กรุณากรอกเบอร์ติดต่อ'];
  }
  const ph = form.phone.replace(/[\s-]/g, '');
  if (!PHONE_RE.test(ph)) {
    return ['phone', 'เบอร์ติดต่อต้องเป็น 0 ตามด้วยตัวเลข 8-10 ตัว'];
  }

  // Optional fields.
  if (form.website && !URL_RE.test(String(form.website))) {
    return ['website', 'เว็บไซต์ต้องขึ้นต้นด้วย http:// หรือ https://'];
  }
  if (form.googleMapUrl && !URL_RE.test(String(form.googleMapUrl))) {
    return ['googleMapUrl', 'ลิงก์แผนที่ต้องขึ้นต้นด้วย http:// หรือ https://'];
  }

  // Latitude / longitude — optional numbers in range
  if (form.latitude != null && form.latitude !== '') {
    const lat = Number(form.latitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return ['latitude', 'ละติจูดต้องอยู่ในช่วง -90 ถึง 90'];
    }
  }
  if (form.longitude != null && form.longitude !== '') {
    const lng = Number(form.longitude);
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return ['longitude', 'ลองจิจูดต้องอยู่ในช่วง -180 ถึง 180'];
    }
  }

  // Length bounds on free-text
  if (form.address && String(form.address).length > ADDRESS_MAX_LENGTH) {
    return ['address', `ที่อยู่เกิน ${ADDRESS_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.addressEn && String(form.addressEn).length > ADDRESS_MAX_LENGTH) {
    return ['addressEn', `ที่อยู่ (EN) เกิน ${ADDRESS_MAX_LENGTH} ตัวอักษร`];
  }
  if (form.note && String(form.note).length > NOTE_MAX_LENGTH) {
    return ['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
  }

  // status enum
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // isDefault must be boolean if provided
  if (form.isDefault != null && typeof form.isDefault !== 'boolean') {
    return ['isDefault', 'isDefault ต้องเป็น boolean'];
  }

  return null;
}

export function emptyBranchForm() {
  return {
    name: '',
    nameEn: '',
    phone: '',
    website: '',
    licenseNo: '',
    taxId: '',
    address: '',
    addressEn: '',
    googleMapUrl: '',
    latitude: '',
    longitude: '',
    note: '',
    isDefault: false,
    status: 'ใช้งาน',
  };
}

export function normalizeBranch(form) {
  const trim = (v) => typeof v === 'string' ? v.trim() : '';
  const coerceNum = (v) => (v === '' || v == null) ? null : Number(v);
  return {
    ...form,
    name: trim(form.name),
    nameEn: trim(form.nameEn),
    phone: trim(form.phone).replace(/[\s-]/g, ''),
    website: trim(form.website),
    licenseNo: trim(form.licenseNo),
    taxId: trim(form.taxId),
    address: trim(form.address),
    addressEn: trim(form.addressEn),
    googleMapUrl: trim(form.googleMapUrl),
    latitude: coerceNum(form.latitude),
    longitude: coerceNum(form.longitude),
    note: trim(form.note),
    isDefault: !!form.isDefault,
    status: form.status || 'ใช้งาน',
  };
}
