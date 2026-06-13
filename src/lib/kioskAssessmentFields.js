// ─── kioskAssessmentFields — perf/hormone assessment carry-through (AV194) ───
// 2026-06-13. The kiosk PatientForm writes the structured assessment answers
//   • Part 1  symp_pe                 (premature-ejaculation symptom flag)
//   • Part 2  adam_1 … adam_10        (ADAM — androgen deficiency)
//   • Part 3  iief_1 … iief_5         (IIEF-5 — erectile dysfunction)
//   •         mrs_1 … mrs_11          (MRS — menopause rating, female-hormone)
// onto `opd_sessions/{id}.patientData` (defaultFormData seeds all 27 keys).
//
// The intake-view reader (AdminDashboard "บันทึกข้อมูลรับเข้า" perf sections +
// renderAdamSection / renderIiefSection / renderMrsSection) reads
// `viewingSession.patientData.{symp_pe, adam_*, iief_*, mrs_*}`. For a SAVED
// customer the session is synthesized from be_customers (synthesizeSessionFromCustomer
// → patientData: customer.patientData), but `kioskPatientToCanonical` +
// `buildPatientDataFromForm` historically DROPPED these 27 fields → the saved
// intake view showed everything 0 / ไม่มี / "ข้อมูลไม่ครบถ้วน".
//
// Same class-of-bug as V141/AV162 (visit_reasons dropped by the same projection
// → blank "สาเหตุที่มาพบแพทย์"). This module is the single source of truth for
// the field list + the carry-through helper, shared by the kiosk→canonical
// projection (kioskPatientToCanonical.js) AND the patientData builder + reverse
// round-trip (backendClient.js buildPatientDataFromForm / buildFormFromCustomer)
// — Rule C1 (Rule of 3): 3 call sites, one list.

export const KIOSK_ASSESSMENT_FIELDS = Object.freeze([
  'symp_pe',
  'adam_1', 'adam_2', 'adam_3', 'adam_4', 'adam_5',
  'adam_6', 'adam_7', 'adam_8', 'adam_9', 'adam_10',
  'iief_1', 'iief_2', 'iief_3', 'iief_4', 'iief_5',
  'mrs_1', 'mrs_2', 'mrs_3', 'mrs_4', 'mrs_5', 'mrs_6',
  'mrs_7', 'mrs_8', 'mrs_9', 'mrs_10', 'mrs_11',
]);

/**
 * Returns ONLY the assessment fields that hold a MEANINGFUL answer:
 *   - boolean `true`            (ADAM / symp_pe checkbox ticked)
 *   - a finite number          (defensive — numeric severity)
 *   - a non-empty trimmed string ("1".."5" IIEF, "0".."4" MRS — note "0" is a
 *     valid MRS answer and is a truthy string, so it is correctly kept)
 *
 * Falsy/empty values (false ADAM, '' unanswered IIEF/MRS) are intentionally
 * dropped so a customer who never did the assessment doesn't get 27 empty
 * keys stamped — and the reader renders absent ≡ false ≡ '' identically
 * (ไม่มี / "ข้อมูลไม่ครบถ้วน"). Display-equivalent + lean.
 *
 * @param {object|null|undefined} src — kiosk patientData OR canonical form OR
 *                                       be_customers.patientData
 * @returns {Object<string, boolean|number|string>} only-meaningful subset
 */
export function pickKioskAssessmentFields(src) {
  if (!src || typeof src !== 'object') return {};
  const out = {};
  for (const k of KIOSK_ASSESSMENT_FIELDS) {
    const v = src[k];
    if (v === true) out[k] = true;
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && v.trim() !== '') out[k] = v;
  }
  return out;
}
