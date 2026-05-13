// src/lib/patientHealthMapping.js
//
// Phase 26.2g-fillin (2026-05-13) — derive TFP health-info strings from the
// customer's structured patientData. Closes the V12 multi-reader-sweep gap
// at TreatmentFormPage.jsx:1016-1020 where bloodType + drugAllergy auto-fill
// shipped but congenitalDisease + treatmentHistory never did.
//
// Pure JS, branch-blind. Used by:
//   - TreatmentFormPage.jsx (create-mode auto-fill — Thai helper)
//   - src/utils.js OPD print builders (Thai + English helpers — Phase 26.2g-fillin-followup, 2026-05-13)
// Tests:
//   - tests/phase-26-2g-fillin-patient-health-mapping.test.js
//   - tests/phase-26-2g-fillin-source-grep.test.js
//   - tests/phase-26-2g-fillin-flow-simulate.test.js
//   - tests/phase-26-2g-fillin-followup-english-helper.test.js
//   - tests/phase-26-2g-fillin-followup-source-grep.test.js
//
// Audit: AV40 (no direct patientData.ud_* reads in components/pages outside
// PatientForm writer + AdminDashboard pregnancy/chronic display chips).
// utils.js Rule-of-3 tech-debt PENDING — Phase 26.2g-fillin-followup Task 2
// will refactor both OPD print builders to consume helpers (not yet committed
// at the Task 1 SHA; this comment flips to CLOSED at the Task 2 commit).

const PREGNANCY_SENTINEL = 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์';

export const PREGNANCY_LABEL_PREFIX = 'การตั้งครรภ์: ';
export const MEDICATION_LABEL_PREFIX = 'ยาที่ใช้ประจำ: ';

// UI order matches PatientForm.jsx:1095-1102 (Hypertension / Diabetes / Lung
// / Kidney / Heart / Blood). Frozen so consumers can rely on key + label
// stability; insertion order via Object literal preserves UI order.
export const UD_LABELS = Object.freeze({
  ud_hypertension: 'ความดันโลหิตสูง',
  ud_diabetes:     'เบาหวาน',
  ud_lung:         'โรคปอด',
  ud_kidney:       'โรคไต',
  ud_heart:        'โรคหัวใจ',
  ud_blood:        'โรคโลหิต',
});

// UI order matches UD_LABELS (Thai). Formal clinical labels — intentionally
// MORE FORMAL than PatientForm.jsx UI labels (which are lay-friendly:
// 'Diabetes' / 'Kidney Disease' / 'Blood Disease'). OPD print is clinical
// documentation; formal labels are appropriate. The drift is intentional.
// Frozen so consumers can rely on key + label stability.
export const UD_LABELS_EN = Object.freeze({
  ud_hypertension: 'Hypertension',
  ud_diabetes:     'Diabetes Mellitus',
  ud_lung:         'Lung Disease',
  ud_kidney:       'Chronic Kidney Disease',
  ud_heart:        'Heart Disease',
  ud_blood:        'Hematological Disease',
});

function _isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Derive comma-separated chronic-disease labels from patientData.
 *
 * Returns '' when:
 *   - patientData is not a plain object
 *   - hasUnderlying !== 'มี' (patient declared no underlying — wins over flags)
 *   - all UD_LABELS keys are falsy AND ud_other-detail is empty/whitespace
 *
 * Standard flag labels emit first (UI order), then ud_otherDetail (if present).
 */
export function derivePatientCongenitalDisease(patientData) {
  if (!_isPlainObject(patientData)) return '';
  if (patientData.hasUnderlying !== 'มี') return '';

  const parts = [];
  for (const key of Object.keys(UD_LABELS)) {
    if (patientData[key]) parts.push(UD_LABELS[key]);
  }
  if (patientData.ud_other) {
    const detail = typeof patientData.ud_otherDetail === 'string'
      ? patientData.ud_otherDetail.trim()
      : '';
    if (detail) parts.push(detail);
  }
  return parts.join(', ');
}

/**
 * English-locale mirror of derivePatientCongenitalDisease. Returns comma-joined
 * formal-clinical English labels for chronic-disease flags.
 *
 * Returns '' when:
 *   - patientData is not a plain object
 *   - hasUnderlying !== 'มี'  (NOTE: gate key value is Thai 'มี' regardless of
 *                              caller's UI language — patientData shape is
 *                              language-agnostic; only OUTPUT labels differ)
 *   - all UD_LABELS_EN keys are falsy AND ud_otherDetail is empty/whitespace
 *
 * Standard flag labels emit first (UI order, matching UD_LABELS), then
 * ud_otherDetail (trimmed) if present.
 *
 * Used by: src/utils.js (Thai + English OPD print builders — line ~345 + ~415).
 */
export function derivePatientCongenitalDiseaseEnglish(patientData) {
  if (!_isPlainObject(patientData)) return '';
  if (patientData.hasUnderlying !== 'มี') return '';

  const parts = [];
  for (const key of Object.keys(UD_LABELS_EN)) {
    if (patientData[key]) parts.push(UD_LABELS_EN[key]);
  }
  if (patientData.ud_other) {
    const detail = typeof patientData.ud_otherDetail === 'string'
      ? patientData.ud_otherDetail.trim()
      : '';
    if (detail) parts.push(detail);
  }
  return parts.join(', ');
}

/**
 * Derive treatment-history string from patientData.
 *
 * Composes up to two " / "-joined parts:
 *   1. 'การตั้งครรภ์: <value>' — only when pregnancy is a non-empty string
 *      AND not the sentinel 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'
 *   2. 'ยาที่ใช้ประจำ: <trimmed value>' — only when currentMedication trims
 *      to non-empty
 *
 * Returns '' when both inputs are empty / sentinel.
 */
export function derivePatientTreatmentHistory(patientData) {
  if (!_isPlainObject(patientData)) return '';

  const parts = [];

  const preg = typeof patientData.pregnancy === 'string' ? patientData.pregnancy.trim() : '';
  if (preg && preg !== PREGNANCY_SENTINEL) {
    parts.push(`${PREGNANCY_LABEL_PREFIX}${preg}`);
  }

  const med = typeof patientData.currentMedication === 'string'
    ? patientData.currentMedication.trim()
    : '';
  if (med) {
    parts.push(`${MEDICATION_LABEL_PREFIX}${med}`);
  }

  return parts.join(' / ');
}
