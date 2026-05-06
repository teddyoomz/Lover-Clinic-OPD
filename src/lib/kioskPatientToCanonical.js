// ─── kioskPatientToCanonical — Phase 23.0 (2026-05-06) ─────────────────────
// Pure helper. Translates the kiosk PatientForm's camelCase shape (stored on
// `opd_sessions/{id}.patientData`) into the canonical snake_case customer
// schema expected by `addCustomer` / `updateCustomerFromForm` in
// `src/lib/backendClient.js`.
//
// Why this exists (V12 multi-reader-sweep miss locked here):
//   Phase 20.0 swapped the writer (broker.fillProClinic → addCustomer) but
//   left handleResync + handleDepositSync feeding the writer with the OLD
//   ProClinic-style camelCase blob. addCustomer's `normalizeCustomer` +
//   `buildPatientDataFromForm` chain expects FIELD_BOUNDS-canonical keys
//   (firstname, lastname, telephone_number, citizen_id/passport_id, …).
//   When camelCase keys land on the doc, normalizeCustomer's loops + the
//   patientData mirror miss them entirely → root be_customers doc has wrong
//   keys, patientData mirror builds empty → BackendDashboard CustomerCard
//   reads .patientData.firstName === undefined → "เหมือนไม่มีข้อมูลอะไรเลย".
//
// Rule C1 (Rule of 3): same builder existed at AdminDashboard.jsx:2422
// (handleResync) + :2535 (handleDepositSync). Extracted to shared helper.

import { generateClinicalSummary } from '../utils.js';

/**
 * Convert kiosk PatientForm patientData → canonical snake_case customer form.
 *
 * @param {object} d — opd_sessions.patientData (camelCase kiosk shape).
 * @param {object} [opts]
 * @param {string} [opts.formType='intake'] — for clinicalSummary generation
 *                  ('intake' / 'deposit' / 'custom').
 * @param {object} [opts.customTemplate] — for custom-form summary.
 * @param {string} [opts.summaryLanguage='en'] — clinicalSummary language.
 * @returns {object} canonical snake_case form ready for addCustomer.
 */
export function kioskPatientToCanonical(d, opts = {}) {
  if (!d || typeof d !== 'object') return {};
  const {
    formType = 'intake',
    customTemplate = null,
    summaryLanguage = 'en',
  } = opts;

  // ── Reasons & past medical history (computed identically to legacy)
  const reasons = Array.isArray(d.visitReasons) ? d.visitReasons : (d?.reasons || []);
  const reasonsStr = Array.isArray(reasons) ? reasons.filter(Boolean).join(', ') : String(reasons || '');

  const pmh = [];
  if (d.hasUnderlying === 'มี') {
    if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
    if (d.ud_diabetes)     pmh.push('เบาหวาน');
    if (d.ud_lung)         pmh.push('โรคปอด');
    if (d.ud_kidney)       pmh.push('โรคไต');
    if (d.ud_heart)        pmh.push('โรคหัวใจ');
    if (d.ud_blood)        pmh.push('โรคโลหิต');
    if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
  }
  const underlyingStr = pmh.join(', ');
  const allergiesStr = d.hasAllergies === 'มี' ? (d.allergiesDetail || '') : '';

  // ── Phone — preserve country code if international
  const phoneCountryCode = d.isInternationalPhone ? (d.phoneCountryCode || '') : '';
  const phoneJoined = phoneCountryCode && d.phone
    ? `${phoneCountryCode}${d.phone}`.replace(/\s+/g, '')
    : (d.phone || '');

  const emPhoneCountryCode = d.isInternationalEmergencyPhone ? (d.emergencyPhoneCountryCode || '') : '';
  const emPhoneJoined = emPhoneCountryCode && d.emergencyPhone
    ? `${emPhoneCountryCode}${d.emergencyPhone}`.replace(/\s+/g, '')
    : (d.emergencyPhone || '');

  // ── Birthdate — kiosk stores BE year + 1-based month/day strings.
  // Canonical schema expects "YYYY-MM-DD" with CE year.
  let birthdate = '';
  if (d.dobYear && d.dobMonth && d.dobDay) {
    const beYear = parseInt(d.dobYear, 10);
    const mo = parseInt(d.dobMonth, 10);
    const dy = parseInt(d.dobDay, 10);
    if (!Number.isNaN(beYear) && !Number.isNaN(mo) && !Number.isNaN(dy)) {
      // BE → CE: most pickers in this codebase store BE; kiosk PatientForm
      // uses BE per Thai convention. ProClinic's birthdate is CE.
      const ce = beYear > 2400 ? beYear - 543 : beYear;  // detect if already CE
      birthdate = `${ce}-${String(mo).padStart(2, '0')}-${String(dy).padStart(2, '0')}`;
    }
  }

  // ── Identity — Thai vs foreigner branch
  const isForeigner = d.nationality === 'ต่างชาติ';
  const idCardRaw = typeof d.idCard === 'string' ? d.idCard.trim() : '';

  // ── Source — kiosk howFoundUs is an array of channel labels
  const sourceStr = Array.isArray(d.howFoundUs)
    ? d.howFoundUs.filter(Boolean).join(', ')
    : (d.howFoundUs || '');

  // ── Note — clinicalSummary only (Phase 24.0-nonies: emergency relation
  // promoted to canonical contact_1_relation field, no longer stuffed in note)
  const summary = generateClinicalSummary(d, formType, customTemplate, summaryLanguage);
  const noteStr = summary || '';

  // ── Gender: kiosk uses Thai labels ("ชาย"/"หญิง"/"LGBTQ+"); canonical
  // schema uses M/F/LGBTQ codes. Translate explicitly — pre-fix:
  // toUpperCase()-only kept "ชาย" verbatim, then normalizeCustomer's M|F
  // enum check zeroed it. Result: "บันทึกเพศจาก Frontend ลง backend ของเรา
  // ยังใช้ไม่ได้ ลูกค้าล่าสุดกรอกเพศชายแล้ว แต่พอบันทึกลง backend กลายเป็นเพศ -"
  // (Phase 24.0-nonies fix).
  function mapGender(raw) {
    if (raw == null) return '';
    const g = String(raw).trim();
    if (!g) return '';
    const upper = g.toUpperCase();
    if (upper === 'M' || upper === 'F' || upper === 'LGBTQ') return upper;
    if (/^male$/i.test(g) || /ชาย/.test(g)) return 'M';
    if (/^female$/i.test(g) || /หญิง/.test(g)) return 'F';
    if (/lgbtq/i.test(g)) return 'LGBTQ';
    return '';  // unknown → blank (better than rejecting at validator)
  }

  // ── Build canonical form
  const out = {
    // Names
    prefix: d.prefix || '',
    firstname: d.firstName || '',
    lastname: d.lastName || '',
    nickname: d.nickname || '',

    // Contact
    telephone_number: phoneJoined,
    email: d.email || '',
    line_id: d.lineId || '',
    facebook_link: d.facebookLink || '',

    // Address
    address: d.address || '',
    province: d.province || '',
    district: d.district || '',
    sub_district: d.subDistrict || '',
    postal_code: d.postalCode || '',

    // Demographics
    gender: mapGender(d.gender),
    birthdate,
    blood_type: d.bloodType || '',

    // Phase 24.0-nonies — kiosk customers default to "ลูกค้าทั่วไป" per user
    // directive. customer_type_2 retains the thai/foreigner distinction
    // (so backend forms can still filter / segment).
    customer_type: 'ลูกค้าทั่วไป',
    customer_type_2: isForeigner ? 'ต่างชาติ' : 'ไทย',

    // Identity (mutually exclusive — Thai vs foreigner)
    ...(isForeigner
      ? { passport_id: idCardRaw, country: d.nationalityCountry || '' }
      : { citizen_id: idCardRaw, country: 'ไทย' }),

    // Health
    symptoms: reasonsStr,
    history_of_drug_allergy: allergiesStr,
    congenital_disease: underlyingStr,

    // Referral source — kiosk howFoundUs maps to source (top of FIELD_BOUNDS).
    source: sourceStr,

    // Emergency contact (kiosk has single contact)
    contact_1_firstname: d.emergencyName || '',
    contact_1_telephone_number: emPhoneJoined,
    // Phase 24.0-nonies — promote emergencyRelation from note dump to
    // canonical contact_1_relation field. Backend form has matching input.
    contact_1_relation: d.emergencyRelation || '',

    // Free-text note (clinicalSummary; emergency relation moved out)
    note: noteStr,
  };

  // Strip empty strings ONLY for fields that should not exist when blank
  // (others — like firstname — must be present so addCustomer's strict-mode
  // validator can reject explicitly when missing).
  // We intentionally keep `firstname: ''` for callers using { strict: true }
  // so the validator path fires (rather than silently dropping).
  return out;
}

export default kioskPatientToCanonical;
