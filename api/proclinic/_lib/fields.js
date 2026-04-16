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

  // Personal details
  if (patient.nickname) params.set('nickname', patient.nickname);
  if (patient.weight) params.set('weight', patient.weight);
  if (patient.height) params.set('height', patient.height);
  if (patient.citizenId) params.set('citizen_id', patient.citizenId);
  if (patient.passportId) params.set('passport_id', patient.passportId);
  if (patient.email) params.set('email', patient.email);
  if (patient.lineId) params.set('line_id', patient.lineId);
  if (patient.facebookLink) params.set('facebook_link', patient.facebookLink);
  if (patient.occupation) params.set('occupation', patient.occupation);
  if (patient.income) params.set('income', patient.income);

  // Preferences
  if (patient.likeNote) params.set('like_note', patient.likeNote);
  if (patient.dislikeNote) params.set('dislike_note', patient.dislikeNote);

  // Medical
  if (patient.bloodType) params.set('blood_type', patient.bloodType);
  if (patient.isPregnant !== undefined) params.set('pregnanted', patient.isPregnant ? 'มี' : 'ไม่มี');
  if (patient.foodAllergy) params.set('history_of_food_allergy', patient.foodAllergy);
  if (patient.beforeTreatment) params.set('before_treatment', patient.beforeTreatment);

  // Assignment
  if (patient.personalDoctorId) params.set('doctor_id', patient.personalDoctorId);

  // Emergency contact #2
  if (patient.emergencyName2) {
    const parts = patient.emergencyName2.split(' ');
    params.set('contact_2_firstname', parts[0] || '');
    params.set('contact_2_lastname', parts.slice(1).join(' ') || '');
  }
  if (patient.emergencyPhone2) params.set('contact_2_telephone_number', patient.emergencyPhone2);

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
  params.set('customer_type_2', patient.customerType2 || 'ลูกค้าทั่วไป');

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

  // Citizen ID (separate field for citizen_id specifically)
  if (f.citizen_id) patient.citizenId = f.citizen_id;
  if (f.passport_id) patient.passportId = f.passport_id;

  // Personal details
  if (f.nickname) patient.nickname = f.nickname;
  if (f.weight) patient.weight = f.weight;
  if (f.height) patient.height = f.height;
  if (f.email) patient.email = f.email;
  if (f.line_id) patient.lineId = f.line_id;
  if (f.facebook_link) patient.facebookLink = f.facebook_link;
  if (f.occupation) patient.occupation = f.occupation;
  if (f.income) patient.income = f.income;

  // Preferences
  if (f.like_note) patient.likeNote = f.like_note;
  if (f.dislike_note) patient.dislikeNote = f.dislike_note;

  // Medical
  if (f.blood_type) patient.bloodType = f.blood_type;
  if (f.pregnanted) patient.isPregnant = f.pregnanted === 'มี';
  if (f.history_of_food_allergy) patient.foodAllergy = f.history_of_food_allergy;
  if (f.before_treatment) patient.beforeTreatment = f.before_treatment;

  // Assignment
  if (f.doctor_id) patient.personalDoctorId = f.doctor_id;

  // Emergency contact #2
  if (f.contact_2_firstname || f.contact_2_lastname) {
    patient.emergencyName2 = [f.contact_2_firstname, f.contact_2_lastname].filter(Boolean).join(' ');
  }
  if (f.contact_2_telephone_number) patient.emergencyPhone2 = f.contact_2_telephone_number;

  // Classification
  if (f.customer_type_2) patient.customerType2 = f.customer_type_2;

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

  // Personal details
  if (patient.nickname) params.set('nickname', patient.nickname);
  if (patient.weight) params.set('weight', patient.weight);
  if (patient.height) params.set('height', patient.height);
  if (patient.citizenId) params.set('citizen_id', patient.citizenId);
  if (patient.passportId) params.set('passport_id', patient.passportId);
  if (patient.email) params.set('email', patient.email);
  if (patient.lineId) params.set('line_id', patient.lineId);
  if (patient.facebookLink) params.set('facebook_link', patient.facebookLink);
  if (patient.occupation) params.set('occupation', patient.occupation);
  if (patient.income) params.set('income', patient.income);

  // Preferences
  if (patient.likeNote) params.set('like_note', patient.likeNote);
  if (patient.dislikeNote) params.set('dislike_note', patient.dislikeNote);

  // Medical
  if (patient.bloodType) params.set('blood_type', patient.bloodType);
  if (patient.isPregnant !== undefined) params.set('pregnanted', patient.isPregnant ? 'มี' : 'ไม่มี');
  if (patient.foodAllergy) params.set('history_of_food_allergy', patient.foodAllergy);
  if (patient.beforeTreatment) params.set('before_treatment', patient.beforeTreatment);

  // Assignment
  if (patient.personalDoctorId) params.set('doctor_id', patient.personalDoctorId);

  // Emergency contact #2
  if (patient.emergencyName2) {
    const parts = patient.emergencyName2.split(' ');
    params.set('contact_2_firstname', parts[0] || '');
    params.set('contact_2_lastname', parts.slice(1).join(' ') || '');
  }
  if (patient.emergencyPhone2) params.set('contact_2_telephone_number', patient.emergencyPhone2);

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
  if (patient.customerType2) params.set('customer_type_2', patient.customerType2);

  return params;
}
