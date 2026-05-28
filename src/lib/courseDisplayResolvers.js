// src/lib/courseDisplayResolvers.js — canonical-first display resolvers for a
// course doc, mirroring customerDisplayName.js (resolveCustomerHN) +
// treatmentDisplayResolvers.js.
//
// WHY (V132, 2026-05-28): the canonical be_courses doc stores `courseCategory`
// / `procedureType` / `courseName`. Older master_data shapes use
// `category_name` / `procedure_type_name` / (none); the beCourseToMasterShape
// adapter emits `category` + `course_category`. Reading a single HARDCODED
// legacy field (e.g. `category_name || category`) from a RAW canonical doc is
// the V49/V131 class-of-bug (canonical→legacy shape mismatch) — it silently
// returns '' → callers show "ไม่ระบุ". reports-revenue hit exactly this: every
// course-category cell read `category_name || category`, both absent on the
// raw be_courses doc → all rows "ไม่ระบุ" despite 380/385 courses having a real
// courseCategory.
//
// These resolvers are the SINGLE SOURCE OF TRUTH for "how to read a course's
// category / procedure-type / name". Reading the live `be_courses.courseCategory`
// (free-text, admin-edited via CourseFormModal — no hardcoded enum) means ANY
// category or procedure-type added in the FUTURE surfaces automatically in every
// consumer (report rows, filter dropdowns, CSV) with zero code change.
//
// Contract: return the trimmed resolved string, or '' when none present. The
// caller decides the display fallback (e.g. 'ไม่ระบุ') — same shape as
// resolveCustomerHN.

const t = (v) => (typeof v === 'string' ? v.trim() : (v == null ? '' : String(v).trim()));

/**
 * Course หมวดหมู่ (category). Canonical `courseCategory` first, then legacy
 * `category_name` (master_data) / `course_category` + `category` (mapper output).
 * @returns {string} trimmed category, '' if none.
 */
export function resolveCourseCategory(doc) {
  if (!doc || typeof doc !== 'object') return '';
  return t(doc.courseCategory) || t(doc.category_name) || t(doc.course_category) || t(doc.category);
}

/**
 * Course ประเภทหัตถการ (procedure type). Canonical `procedureType` first,
 * legacy `procedure_type_name` (master_data) fallback. The beCourseToMasterShape
 * adapter spreads `...c` so its output also carries `procedureType`.
 * @returns {string} trimmed procedure type, '' if none.
 */
export function resolveCourseProcedureType(doc) {
  if (!doc || typeof doc !== 'object') return '';
  return t(doc.procedureType) || t(doc.procedure_type_name);
}

/**
 * Course display name. Canonical `courseName` first, then mapper/legacy
 * `name` / `course_name`.
 * @returns {string} trimmed name, '' if none.
 */
export function resolveCourseDisplayName(doc) {
  if (!doc || typeof doc !== 'object') return '';
  return t(doc.courseName) || t(doc.name) || t(doc.course_name);
}
