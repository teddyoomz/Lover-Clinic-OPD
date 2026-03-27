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

// ─── Build form data for CREATE ─────────────────────────────────────────────

export function buildCreateFormData(patient, csrf, defaultFields = {}) {
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

  // Customer type defaults
  params.set('customer_type', '1');   // คนไทย
  params.set('customer_type_2', '1'); // ลูกค้าทั่วไป

  return params;
}

// ─── Build form data for UPDATE ─────────────────────────────────────────────

export function buildUpdateFormData(patient, existingFields, csrf) {
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

  return params;
}
