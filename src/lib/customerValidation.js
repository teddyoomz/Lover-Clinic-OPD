// ─── Customer validation — Phase 12.3 pure helpers ─────────────────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/customer/create` revealed
// ~79 unique field names. This validator covers ALL of them at type-level,
// with strict bounds on a subset that's high-risk for data corruption (HN,
// phone, email, citizen_id, birthdate, gender enum, height/weight ranges).
//
// Why soft-normalize + optional strict: CloneTab imports raw ProClinic payloads
// that may contain nulls or coerced types. normalizeCustomer coerces safely;
// validateCustomer returns [field, message] on hard violations only.
// Edit-mode UI can opt into strict by passing {strict: true} which adds
// required-field checks (firstname + hn_no).

export const GENDER_OPTIONS = Object.freeze(['M', 'F', '']);  // '' = unspecified
export const RECEIPT_TYPE_OPTIONS = Object.freeze(['personal', 'company', '']);
export const CONSENT_KEYS = Object.freeze(['marketing', 'healthData']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THAI_PHONE_RE = /^[+\-\s\d]{8,20}$/;         // permissive — international OK
const THAI_CITIZEN_RE = /^\d{13}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const FIELD_BOUNDS = {
  hn_no: 30,
  old_hn_id: 30,
  prefix: 40,
  firstname: 100,
  lastname: 100,
  firstname_en: 100,
  lastname_en: 100,
  nickname: 50,
  occupation: 100,
  address: 500,
  full_address_en: 500,
  postal_code: 20,
  district: 100,
  sub_district: 100,
  province: 100,
  country: 100,
  telephone_number: 30,
  email: 100,
  line_id: 100,
  facebook_link: 300,
  symptoms: 2000,
  symptoms_en: 2000,
  before_treatment: 2000,
  before_treatment_en: 2000,
  congenital_disease: 2000,
  congenital_disease_en: 2000,
  history_of_drug_allergy: 2000,
  history_of_drug_allergy_en: 2000,
  history_of_food_allergy: 2000,
  history_of_food_allergy_en: 2000,
  note: 2000,
  like_note: 2000,
  dislike_note: 2000,
  ad_description: 500,
  source: 100,
  source_detail: 300,
  personal_receipt_name: 200,
  personal_receipt_address: 500,
  personal_receipt_phonenumber: 30,
  personal_receipt_tax_id: 30,
  company_receipt_name: 200,
  company_receipt_address: 500,
  company_receipt_phonenumber: 30,
  company_receipt_tax_id: 30,
};

export function validateCustomer(form, opts = {}) {
  const strict = !!opts.strict;
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // Strict mode: require firstname + hn_no for a valid new/edit save.
  if (strict) {
    const fn = typeof form.firstname === 'string' ? form.firstname.trim() : '';
    if (!fn) return ['firstname', 'กรุณากรอกชื่อ'];
    if (!form.hn_no || !String(form.hn_no).trim()) return ['hn_no', 'กรุณากรอก HN'];
  }

  // Bounded-length strings.
  for (const [key, limit] of Object.entries(FIELD_BOUNDS)) {
    const v = form[key];
    if (v != null && v !== '' && String(v).length > limit) {
      return [key, `${key} เกิน ${limit} ตัวอักษร`];
    }
  }

  // Email (optional but must parse if present).
  if (form.email) {
    const em = String(form.email).trim();
    if (em && !EMAIL_RE.test(em)) return ['email', 'อีเมลไม่ถูกต้อง'];
  }

  // Telephone — permissive: 8–20 chars of digits/spaces/dashes/plus.
  for (const phoneKey of ['telephone_number', 'personal_receipt_phonenumber', 'company_receipt_phonenumber']) {
    if (form[phoneKey]) {
      const ph = String(form[phoneKey]).trim();
      if (ph && !THAI_PHONE_RE.test(ph)) return [phoneKey, `${phoneKey} รูปแบบไม่ถูกต้อง`];
    }
  }

  // Citizen ID — Thai format is exactly 13 digits. Empty OR foreign passport
  // both OK; only reject the 13-digit-string-that-isn't-digits case.
  if (form.citizen_id) {
    const cid = String(form.citizen_id).replace(/[-\s]/g, '');
    if (cid && cid.length === 13 && !/^\d{13}$/.test(cid)) {
      return ['citizen_id', 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก'];
    }
    if (cid && /^\d+$/.test(cid) && cid.length !== 13) {
      return ['citizen_id', 'เลขบัตรประชาชนต้องมี 13 หลัก'];
    }
  }

  // Birthdate — YYYY-MM-DD only when present.
  if (form.birthdate) {
    const bd = String(form.birthdate);
    if (!ISO_DATE_RE.test(bd)) return ['birthdate', 'วันเกิดต้องอยู่ในรูปแบบ YYYY-MM-DD'];
    const d = new Date(bd + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime())) return ['birthdate', 'วันเกิดไม่ถูกต้อง'];
    // Allow back to year 1900, reject future dates.
    const y = Number(bd.slice(0, 4));
    if (y < 1900) return ['birthdate', 'ปีเกิดเก่าเกินไป'];
    if (d.getTime() > Date.now() + 86400 * 1000) return ['birthdate', 'วันเกิดอยู่ในอนาคต'];
  }

  if (form.gender != null && form.gender !== '') {
    if (!GENDER_OPTIONS.includes(form.gender)) return ['gender', 'เพศต้องเป็น M / F หรือไม่ระบุ'];
  }

  // Height / weight — soft bounds (reject clearly bogus numbers).
  for (const [key, min, max] of [['height', 30, 280], ['weight', 1, 500]]) {
    if (form[key] != null && form[key] !== '') {
      const n = Number(form[key]);
      if (!Number.isFinite(n)) return [key, `${key} ต้องเป็นตัวเลข`];
      if (n < min || n > max) return [key, `${key} อยู่นอกช่วง ${min}-${max}`];
    }
  }

  // Income — optional numeric.
  if (form.income != null && form.income !== '') {
    const n = Number(form.income);
    if (!Number.isFinite(n) || n < 0) return ['income', 'รายได้ต้องเป็นจำนวนไม่ติดลบ'];
  }

  if (form.receipt_type != null && !RECEIPT_TYPE_OPTIONS.includes(form.receipt_type)) {
    return ['receipt_type', 'receipt_type ไม่ถูกต้อง'];
  }

  if (form.pregnanted != null && typeof form.pregnanted !== 'boolean') {
    return ['pregnanted', 'pregnanted ต้องเป็น boolean'];
  }
  if (form.is_image_marketing_allowed != null && typeof form.is_image_marketing_allowed !== 'boolean') {
    return ['is_image_marketing_allowed', 'is_image_marketing_allowed ต้องเป็น boolean'];
  }

  // Consent block — values must be boolean.
  if (form.consent) {
    if (typeof form.consent !== 'object' || Array.isArray(form.consent)) {
      return ['consent', 'consent ต้องเป็น object'];
    }
    for (const k of CONSENT_KEYS) {
      if (form.consent[k] != null && typeof form.consent[k] !== 'boolean') {
        return ['consent', `consent.${k} ต้องเป็น boolean`];
      }
    }
  }

  return null;
}

export function emptyCustomerForm() {
  return {
    hn_no: '',
    old_hn_id: '',
    prefix: '',
    prefix_en: '',
    firstname: '',
    lastname: '',
    firstname_en: '',
    lastname_en: '',
    nickname: '',
    gender: '',
    birthdate: '',
    blood_type: '',
    height: '',
    weight: '',
    citizen_id: '',
    passport_id: '',
    country: '',
    pregnanted: false,
    customer_type: '',
    customer_type_2: '',
    telephone_number: '',
    email: '',
    line_id: '',
    facebook_link: '',
    address: '',
    full_address_en: '',
    postal_code: '',
    district: '',
    sub_district: '',
    province: '',
    occupation: '',
    income: '',
    source: '',
    source_detail: '',
    ad_description: '',
    is_image_marketing_allowed: false,
    profile_image: '',
    card_photo: '',
    doctor_id: '',
    symptoms: '',
    symptoms_en: '',
    before_treatment: '',
    before_treatment_en: '',
    congenital_disease: '',
    congenital_disease_en: '',
    history_of_drug_allergy: '',
    history_of_drug_allergy_en: '',
    history_of_food_allergy: '',
    history_of_food_allergy_en: '',
    note: '',
    like_note: '',
    dislike_note: '',
    receipt_type: '',
    personal_receipt_name: '',
    personal_receipt_address: '',
    personal_receipt_phonenumber: '',
    personal_receipt_tax_id: '',
    company_receipt_name: '',
    company_receipt_address: '',
    company_receipt_phonenumber: '',
    company_receipt_tax_id: '',
    contact_1_firstname: '',
    contact_1_firstname_en: '',
    contact_1_lastname: '',
    contact_1_lastname_en: '',
    contact_1_telephone_number: '',
    contact_2_firstname: '',
    contact_2_firstname_en: '',
    contact_2_lastname: '',
    contact_2_lastname_en: '',
    contact_2_telephone_number: '',
    consent: { marketing: false, healthData: false },
  };
}

export function normalizeCustomer(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const trim = (v) => (typeof v === 'string' ? v.trim() : v);
  const out = { ...form };

  // Trim every known string field; preserve non-string values (e.g. numbers).
  for (const key of Object.keys(FIELD_BOUNDS)) {
    if (typeof out[key] === 'string') out[key] = trim(out[key]);
  }

  // Coerce numeric strings on known numeric fields (height/weight/income).
  for (const key of ['height', 'weight', 'income']) {
    if (out[key] === '' || out[key] == null) out[key] = null;
    else {
      const n = Number(out[key]);
      out[key] = Number.isFinite(n) ? n : null;
    }
  }

  // Booleans.
  for (const key of ['pregnanted', 'is_image_marketing_allowed']) {
    out[key] = !!out[key];
  }

  // Gender — normalize uppercase M/F else blank.
  if (typeof out.gender === 'string') {
    const g = out.gender.trim().toUpperCase();
    out.gender = g === 'M' || g === 'F' ? g : '';
  } else {
    out.gender = '';
  }

  // Citizen id — strip spaces/dashes (keep digits if purely numeric).
  if (typeof out.citizen_id === 'string') {
    out.citizen_id = out.citizen_id.replace(/[-\s]/g, '').trim();
  }

  // Consent — always emit both keys so downstream callers can rely on shape.
  const c = out.consent && typeof out.consent === 'object' && !Array.isArray(out.consent) ? out.consent : {};
  out.consent = {
    marketing: !!c.marketing,
    healthData: !!c.healthData,
  };

  return out;
}
