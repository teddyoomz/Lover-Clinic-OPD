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

// Phase 24.0-nonies (2026-05-06 evening) — extend gender enum to include
// LGBTQ+ option per user directive ("เพิ่มเพศ LGBTQ+ ใน Dropdown ...
// ของหน้าสร้าง/แก้ไข ข้อมูลลูกค้า"). Code 'LGBTQ' (no '+' — keeps the
// canonical schema string-safe). Display label is rendered with the '+'.
export const GENDER_OPTIONS = Object.freeze(['M', 'F', 'LGBTQ', '']);  // '' = unspecified
export const RECEIPT_TYPE_OPTIONS = Object.freeze(['personal', 'company', '']);
// V33-customer-create (2026-04-27): added imageMarketing to consent ladder
// (Rule of 3 — same shape as marketing + healthData; replaces flat
// is_image_marketing_allowed field which is kept as deprecated mirror).
export const CONSENT_KEYS = Object.freeze(['marketing', 'healthData', 'imageMarketing']);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const THAI_PHONE_RE = /^[+\-\s\d]{8,20}$/;         // permissive — international OK
const THAI_CITIZEN_RE = /^\d{13}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HTTPS_URL_RE = /^https?:\/\//i;
const FACEBOOK_LINK_RE = /^(https?:)?\/\/(www\.)?(facebook|fb)\.(com|me)\//i;
const LINE_ID_RE = /^[\w._-]{2,100}$/;

const FIELD_BOUNDS = {
  hn_no: 30,
  old_hn_id: 30,
  prefix: 40,
  prefix_en: 40,
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
  // V33-customer-create — bounds for fields used by ProClinic create form
  customer_type: 50,
  customer_type_2: 50,
  blood_type: 10,
  passport_id: 30,
  profile_image: 500,
  card_photo: 500,
  doctor_id: 50,
  contact_1_firstname: 100,
  contact_1_firstname_en: 100,
  contact_1_lastname: 100,
  contact_1_lastname_en: 100,
  contact_1_telephone_number: 30,
  // Phase 24.0-nonies (2026-05-06 evening) — emergency-contact relation
  // promoted from note-stuffed kludge to canonical field. Mirrors to
  // patientData.emergencyRelation via buildPatientDataFromForm.
  contact_1_relation: 100,
  contact_2_relation: 100,
  contact_2_firstname: 100,
  contact_2_firstname_en: 100,
  contact_2_lastname: 100,
  contact_2_lastname_en: 100,
  contact_2_telephone_number: 30,
  // V33.7 — LINE OA bot reply language preference. 'th' or 'en' (≤ 2 chars).
  // Stored when admin manually toggles via LinkLineInstructionsModal /
  // LinkRequestsTab. When absent, bot derives from customer_type at read
  // time (foreigner → 'en', else 'th'). See getLanguageForCustomer in
  // src/lib/lineBotResponder.js.
  lineLanguage: 10,
  // Phase BS (2026-05-06) — multi-branch: which branch CREATED this customer.
  // Semantic: "สาขาที่สร้างรายการลูกค้า" (immutable after first write).
  // Optional. Stamped on CREATE by addCustomer / cloneOrchestrator /
  // /api/admin/customer-branch-baseline (one-shot backfill). Update paths
  // (updateCustomerFromForm) MUST NOT change this field — see immutability
  // contract in backendClient.js. Customer base is shared across branches;
  // this field is purely a display tag on CustomerDetailView card.
  branchId: 100,
};

const GALLERY_MAX_ITEMS = 20;
const GALLERY_URL_MAX_LEN = 500;

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

  // V33-customer-create — facebook_link must look like a Facebook URL when present.
  if (form.facebook_link) {
    const fb = String(form.facebook_link).trim();
    if (fb && !FACEBOOK_LINK_RE.test(fb)) {
      return ['facebook_link', 'รูปแบบลิงก์ Facebook ไม่ถูกต้อง'];
    }
  }

  // V33-customer-create — line_id must be a plain identifier (not a URL).
  if (form.line_id) {
    const ln = String(form.line_id).trim();
    if (ln && !LINE_ID_RE.test(ln)) {
      return ['line_id', 'LINE ID ต้องเป็นตัวอักษร/ตัวเลข/. _ - 2-100 ตัว'];
    }
  }

  // V33-customer-create — created_year integer 1900-2100 if present.
  if (form.created_year != null && form.created_year !== '') {
    const yr = Number(form.created_year);
    if (!Number.isInteger(yr) || yr < 1900 || yr > 2100) {
      return ['created_year', 'created_year ต้องเป็นปี ค.ศ. 1900-2100'];
    }
  }

  // V33-customer-create — gallery_upload array, ≤20 items, each https URL ≤500 chars.
  if (form.gallery_upload != null) {
    if (!Array.isArray(form.gallery_upload)) {
      return ['gallery_upload', 'gallery_upload ต้องเป็น array'];
    }
    if (form.gallery_upload.length > GALLERY_MAX_ITEMS) {
      return ['gallery_upload', `gallery_upload เกิน ${GALLERY_MAX_ITEMS} รายการ`];
    }
    for (const url of form.gallery_upload) {
      if (typeof url !== 'string') {
        return ['gallery_upload', 'gallery_upload แต่ละรายการต้องเป็น string'];
      }
      if (url.length > GALLERY_URL_MAX_LEN) {
        return ['gallery_upload', `gallery_upload URL เกิน ${GALLERY_URL_MAX_LEN} ตัวอักษร`];
      }
      if (url && !HTTPS_URL_RE.test(url)) {
        return ['gallery_upload', 'gallery_upload URL ต้องขึ้นต้น http:// หรือ https://'];
      }
    }
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
    // V33-customer-create — multi-image gallery + HN year tag + consent.imageMarketing
    gallery_upload: [],
    created_year: null,
    consent: { marketing: false, healthData: false, imageMarketing: false },
    // Phase BS (2026-05-06) — branch-of-creation tag (immutable after create).
    branchId: '',
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

  // V33.7 — lineLanguage coerce. Allow 'th' / 'en' only when explicitly set;
  // any other string value (or empty) → drop the field so bot derives from
  // customer_type at read time (foreigner → 'en', else 'th').
  if (out.lineLanguage != null) {
    const l = String(out.lineLanguage).trim().toLowerCase();
    if (l === 'th' || l === 'en') {
      out.lineLanguage = l;
    } else {
      delete out.lineLanguage;
    }
  }

  // Gender — normalize to canonical enum.
  // Phase 24.0-nonies — accept Thai labels "ชาย"/"หญิง"/"LGBTQ+" + English
  // synonyms; normalize to M / F / LGBTQ codes. Anything unrecognized → ''.
  if (typeof out.gender === 'string') {
    const raw = out.gender.trim();
    const g = raw.toUpperCase();
    if (g === 'M' || g === 'F' || g === 'LGBTQ') {
      out.gender = g;
    } else if (/^MALE$/i.test(raw) || /ชาย/.test(raw)) {
      out.gender = 'M';
    } else if (/^FEMALE$/i.test(raw) || /หญิง/.test(raw)) {
      out.gender = 'F';
    } else if (/lgbtq/i.test(raw)) {
      out.gender = 'LGBTQ';
    } else {
      out.gender = '';
    }
  } else {
    out.gender = '';
  }

  // Citizen id — strip spaces/dashes (keep digits if purely numeric).
  if (typeof out.citizen_id === 'string') {
    out.citizen_id = out.citizen_id.replace(/[-\s]/g, '').trim();
  }

  // V33-customer-create — passport upper-cased + trimmed.
  if (typeof out.passport_id === 'string') {
    out.passport_id = out.passport_id.trim().toUpperCase();
  }

  // Phase BS (2026-05-06) — branchId trim (string-only). Empty string preserved
  // (different from missing field for legacy migration semantics: empty string
  // = "explicitly unset"; missing = "never set"). Both treated as untagged
  // by the customer-branch-baseline migration endpoint.
  if (typeof out.branchId === 'string') {
    out.branchId = out.branchId.trim();
  }

  // V33-customer-create — created_year coerce to int or null.
  if (out.created_year === '' || out.created_year == null) {
    out.created_year = null;
  } else {
    const yr = Number(out.created_year);
    out.created_year = Number.isInteger(yr) ? yr : null;
  }

  // V33-customer-create — gallery_upload normalize: array of trimmed unique non-empty strings, max 20.
  if (Array.isArray(out.gallery_upload)) {
    const seen = new Set();
    const cleaned = [];
    for (const u of out.gallery_upload) {
      const s = typeof u === 'string' ? u.trim() : '';
      if (s && !seen.has(s)) {
        seen.add(s);
        cleaned.push(s);
      }
    }
    out.gallery_upload = cleaned.slice(0, 20);
  } else {
    out.gallery_upload = [];
  }

  // V33-customer-create — migrate flat is_image_marketing_allowed → consent.imageMarketing.
  // Keep flat field as deprecated mirror for one release; readers should switch to consent.imageMarketing.
  const c = out.consent && typeof out.consent === 'object' && !Array.isArray(out.consent) ? out.consent : {};
  const imageMarketingFromConsent = c.imageMarketing != null ? !!c.imageMarketing : null;
  const imageMarketingFromFlat = !!out.is_image_marketing_allowed;
  // Prefer consent.imageMarketing when explicitly set; else fall back to flat field.
  const finalImageMarketing = imageMarketingFromConsent !== null
    ? imageMarketingFromConsent
    : imageMarketingFromFlat;
  out.consent = {
    marketing: !!c.marketing,
    healthData: !!c.healthData,
    imageMarketing: finalImageMarketing,
  };
  // Mirror back to flat field for backward compat.
  out.is_image_marketing_allowed = finalImageMarketing;

  return out;
}
