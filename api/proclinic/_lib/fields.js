// ─── ProClinic Form Field Mapping ───────────────────────────────────────────
// Port of fillAndSubmitProClinicForm() and submitProClinicEditViaFetch()
// from broker-extension/background.js

const VALID_PREFIXES = ['นาย','นาง','นางสาว','ด.ช.','ด.ญ.','Mr.','Ms.','Mrs.','Miss','ดร.','คุณ'];

const GENDER_MAP = {
  'นาย':'ชาย', 'ด.ช.':'ชาย', 'Mr.':'ชาย',
  'นาง':'หญิง', 'นางสาว':'หญิง', 'ด.ญ.':'หญิง',
  'Ms.':'หญิง', 'Mrs.':'หญิง', 'Miss':'หญิง',
};

const HOW_MAP = {
  'Facebook':'Facebook', 'Google':'Google', 'Line':'Line',
  'AI':'ChatGPT', 'ป้ายตามที่ต่างๆ':'อื่นๆ', 'รู้จักจากคนรู้จัก':'เพื่อนแนะนำ',
};

function computeBirthdate(patient) {
  if (patient.dobDay && patient.dobMonth && patient.dobYear) {
    let year = parseInt(patient.dobYear);
    if (year > 2400) year -= 543; // พ.ศ. → ค.ศ.
    const mm = String(parseInt(patient.dobMonth)).padStart(2, '0');
    const dd = String(parseInt(patient.dobDay)).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
  }
  if (patient.age && !isNaN(parseInt(patient.age))) {
    const year = new Date().getFullYear() - parseInt(patient.age);
    return `${year}-01-01`;
  }
  return null;
}

// ─── Match country value กับ ProClinic select options ────────────────────────
// nationalityCountry format: "ชื่อไทย (EnglishName)"
// ProClinic country select: "ชื่อไทย (EnglishName)" — match by English name in ()
// allCountryOptions: array of { value, text } from extractFormFields or defaultFields
function matchCountryValue(nationalityCountry, allCountryOptions) {
  if (!nationalityCountry) return null;
  // Try exact match first
  const exact = allCountryOptions.find(o => o === nationalityCountry);
  if (exact) return exact;
  // Extract English name from parentheses and match
  const m = nationalityCountry.match(/\(([^)]+)\)/);
  if (m) {
    const en = m[1].toLowerCase();
    const found = allCountryOptions.find(o => {
      const om = o.match(/\(([^)]+)\)/);
      return om && om[1].toLowerCase() === en;
    });
    if (found) return found;
  }
  return nationalityCountry; // fallback: send as-is
}

// ─── Build form data for CREATE ─────────────────────────────────────────────

export function buildCreateFormData(patient, csrf, defaultFields = {}, countryOptions = []) {
  const params = new URLSearchParams();

  // Start with all default form fields from the create page (hidden fields, selects, etc.)
  for (const [key, val] of Object.entries(defaultFields)) {
    if (key !== '_token') {
      params.set(key, val);
    }
  }

  params.set('_token', csrf);

  const prefix = VALID_PREFIXES.includes(patient.prefix) ? patient.prefix : '';
  if (prefix) params.set('prefix', prefix);

  if (patient.firstName) params.set('firstname', patient.firstName);
  if (patient.lastName) params.set('lastname', patient.lastName);
  if (patient.phone) params.set('telephone_number', patient.phone);
  if (patient.address) params.set('address', patient.address);
  if (patient.province) params.set('province', patient.province);
  if (patient.district) params.set('district', patient.district);
  if (patient.subDistrict) params.set('sub_district', patient.subDistrict);
  if (patient.postalCode) params.set('postal_code', patient.postalCode);

  const gender = GENDER_MAP[patient.prefix];
  if (gender) params.set('gender', gender);

  const dob = computeBirthdate(patient);
  if (dob) params.set('birthdate', dob);

  // Source
  if (patient.howFoundUs?.length) {
    const mapped = HOW_MAP[patient.howFoundUs[0]] || patient.howFoundUs[0];
    params.set('source', mapped);
    params.set('source_detail', patient.howFoundUs.join(', '));
  }

  // Clinical fields
  if (patient.reasons?.length) params.set('symptoms', patient.reasons.join(', '));
  if (patient.underlying) params.set('congenital_disease', patient.underlying);
  if (patient.allergies) params.set('history_of_drug_allergy', patient.allergies);
  if (patient.clinicalSummary) params.set('note', patient.clinicalSummary || '');

  // Emergency contact
  if (patient.emergencyName) params.set('contact_1_firstname', patient.emergencyName);
  if (patient.emergencyRelation) params.set('contact_1_lastname', patient.emergencyRelation);
  if (patient.emergencyPhone) params.set('contact_1_telephone_number', patient.emergencyPhone);

  // Customer type: Thai vs Foreigner — radio values เป็น text ไม่ใช่ตัวเลข
  if (patient.nationality === 'ต่างชาติ') {
    params.set('customer_type', 'ชาวต่างชาติ');
    if (patient.nationalityCountry) {
      const matched = matchCountryValue(patient.nationalityCountry, countryOptions);
      if (matched) params.set('country', matched);
    }
  } else {
    params.set('customer_type', 'คนไทย');
    params.set('country', 'ไทย (Thailand)');
  }
  params.set('customer_type_2', 'ลูกค้าทั่วไป');

  return params;
}

// ─── Reverse mapping: ProClinic form fields → app patientData ───────────────

const REVERSE_HOW_MAP = Object.fromEntries(
  Object.entries(HOW_MAP).map(([k, v]) => [v, k])
);

const UNDERLYING_KEYWORDS = {
  'ความดัน': 'ud_hypertension', 'hypertension': 'ud_hypertension',
  'เบาหวาน': 'ud_diabetes', 'diabetes': 'ud_diabetes',
  'ปอด': 'ud_lung', 'lung': 'ud_lung', 'หอบหืด': 'ud_lung', 'asthma': 'ud_lung',
  'ไต': 'ud_kidney', 'kidney': 'ud_kidney',
  'หัวใจ': 'ud_heart', 'heart': 'ud_heart',
  'เลือด': 'ud_blood', 'blood': 'ud_blood',
};

export function reverseMapPatient(formFields) {
  const f = formFields || {};
  const patient = {};

  // Direct mappings
  if (f.prefix) patient.prefix = f.prefix;
  if (f.firstname) patient.firstName = f.firstname;
  if (f.lastname) patient.lastName = f.lastname;
  if (f.telephone_number) patient.phone = f.telephone_number;
  if (f.address) patient.address = f.address;
  if (f.province) patient.province = f.province;
  if (f.district) patient.district = f.district;
  if (f.sub_district) patient.subDistrict = f.sub_district;
  if (f.postal_code) patient.postalCode = f.postal_code;
  if (f.gender) patient.gender = f.gender;

  // Birthdate → dobDay/Month/Year + age
  if (f.birthdate) {
    const parts = f.birthdate.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      const day = parseInt(parts[2]);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        patient.dobYear = String(year + 543); // ค.ศ. → พ.ศ.
        patient.dobMonth = String(month);
        patient.dobDay = String(day);
        const today = new Date();
        let age = today.getFullYear() - year;
        if (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)) age--;
        patient.age = String(age);
      }
    }
  }

  // Source → howFoundUs
  if (f.source_detail) {
    patient.howFoundUs = f.source_detail.split(',').map(s => s.trim()).filter(Boolean);
  } else if (f.source) {
    const reversed = REVERSE_HOW_MAP[f.source] || f.source;
    patient.howFoundUs = [reversed];
  }

  // Symptoms → visitReasons
  if (f.symptoms) {
    patient.visitReasons = f.symptoms.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Allergies
  if (f.history_of_drug_allergy && f.history_of_drug_allergy.trim()) {
    patient.hasAllergies = 'มี';
    patient.allergiesDetail = f.history_of_drug_allergy.trim();
  } else {
    patient.hasAllergies = 'ไม่มี';
  }

  // Underlying conditions
  const congenital = (f.congenital_disease || '').trim();
  if (congenital) {
    patient.hasUnderlying = 'มี';
    const lower = congenital.toLowerCase();
    for (const [keyword, field] of Object.entries(UNDERLYING_KEYWORDS)) {
      if (lower.includes(keyword.toLowerCase())) patient[field] = true;
    }
    const hasKnown = Object.values(UNDERLYING_KEYWORDS).some(field => patient[field]);
    if (!hasKnown) {
      patient.ud_other = true;
      patient.ud_otherDetail = congenital;
    }
  } else {
    patient.hasUnderlying = 'ไม่มี';
  }

  // Clinical note
  if (f.note) patient.clinicalSummary = f.note;

  // Emergency contact
  if (f.contact_1_firstname) patient.emergencyName = f.contact_1_firstname;
  if (f.contact_1_lastname) patient.emergencyRelation = f.contact_1_lastname;
  if (f.contact_1_telephone_number) patient.emergencyPhone = f.contact_1_telephone_number;

  // Nationality
  if (f.customer_type === 'ชาวต่างชาติ') {
    patient.nationality = 'ต่างชาติ';
    if (f.country) patient.nationalityCountry = f.country;
  } else {
    patient.nationality = 'ไทย';
  }

  // ID card — check multiple possible field names
  const idCard = f.id_card_number || f.citizen_id || f.card_no || f.id_number || '';
  if (idCard) patient.idCard = idCard;

  return patient;
}

// ─── Build form data for UPDATE ─────────────────────────────────────────────

export function buildUpdateFormData(patient, existingFields, csrf, countryOptions = []) {
  const params = new URLSearchParams();

  // Start with all existing form fields (preserves hidden fields like hn_no, customer_id)
  for (const [key, val] of Object.entries(existingFields)) {
    if (key !== '_token' && key !== '_method') {
      params.set(key, val);
    }
  }

  params.set('_token', csrf);
  params.set('_method', 'PUT');

  // Override with patient data
  const prefix = VALID_PREFIXES.includes(patient.prefix) ? patient.prefix : null;
  if (prefix) params.set('prefix', prefix);
  if (patient.firstName) params.set('firstname', patient.firstName);
  if (patient.lastName) params.set('lastname', patient.lastName);
  if (patient.phone) params.set('telephone_number', patient.phone);
  if (patient.address) params.set('address', patient.address);
  if (patient.province) params.set('province', patient.province);
  if (patient.district) params.set('district', patient.district);
  if (patient.subDistrict) params.set('sub_district', patient.subDistrict);
  if (patient.postalCode) params.set('postal_code', patient.postalCode);

  const gender = GENDER_MAP[patient.prefix];
  if (gender) params.set('gender', gender);

  const dob = computeBirthdate(patient);
  if (dob) params.set('birthdate', dob);

  if (patient.howFoundUs?.length) {
    params.set('source', HOW_MAP[patient.howFoundUs[0]] || patient.howFoundUs[0]);
    params.set('source_detail', patient.howFoundUs.join(', '));
  }

  if (patient.reasons?.length) params.set('symptoms', patient.reasons.join(', '));
  if (patient.underlying) params.set('congenital_disease', patient.underlying);
  if (patient.allergies) params.set('history_of_drug_allergy', patient.allergies);
  if (patient.clinicalSummary) params.set('note', patient.clinicalSummary);

  if (patient.emergencyName) params.set('contact_1_firstname', patient.emergencyName);
  if (patient.emergencyRelation) params.set('contact_1_lastname', patient.emergencyRelation);
  if (patient.emergencyPhone) params.set('contact_1_telephone_number', patient.emergencyPhone);

  // Customer type: Thai vs Foreigner
  if (patient.nationality === 'ต่างชาติ') {
    params.set('customer_type', 'ชาวต่างชาติ');
    if (patient.nationalityCountry) {
      const matched = matchCountryValue(patient.nationalityCountry, countryOptions);
      if (matched) params.set('country', matched);
    }
  } else {
    params.set('customer_type', 'คนไทย');
    params.set('country', 'ไทย (Thailand)');
  }

  return params;
}
