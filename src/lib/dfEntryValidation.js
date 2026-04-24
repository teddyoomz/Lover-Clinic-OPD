// ─── DF Entry (treatment-scoped) validation — Phase 14.3 ──────────────────
// Triangle (Rule F + F-bis, captured 2026-04-24 via opd.js flow + har):
// ProClinic's #addDfModal / #editDfModal on /admin/treatment/{id}/edit
// stores one DF entry per doctor/assistant per treatment. Row-level inputs
// are unnamed in ProClinic's DOM — JS harvests at submit — so our replica
// is free to design `dfEntries[]` shape for Firestore.
//
// Storage target: `be_treatments/{treatmentId}.detail.dfEntries[]`
// (embedded, not a separate collection — per-entry payload stays small
// and always co-fetched with the parent treatment).
//
// Runtime resolver sources:
//   - be_df_groups (group.rates[])      → Phase 13.3.1
//   - be_df_staff_rates (override)       → Phase 13.3.1
//   - doctor.defaultDfGroupId on be_doctors → Phase 14.1
//
// Invariants (DFE-1..DFE-10):
//   DFE-1  doctorId required (string, non-empty)
//   DFE-2  dfGroupId required (resolved group at entry creation, string non-empty)
//   DFE-3  rows must be an array (possibly empty)
//   DFE-4  each row has courseId (non-empty string)
//   DFE-5  each row has enabled:boolean
//   DFE-6  each row has value ≥ 0 (number)
//   DFE-7  each row has type in RATE_TYPES ('baht' | 'percent')
//   DFE-8  type='percent' ⇒ value ≤ 100
//   DFE-9  no duplicate courseId within rows[]
//   DFE-10 at least one row enabled=true (on save — empty or all-disabled entry is meaningless)
//
// Rule C ✅ (all patterns here reused: RATE_TYPES from dfGroupValidation,
// generate id via crypto, trim helper). Rule E ✅ (zero broker / proclinic
// imports). Rule H ✅ (lives on our be_treatments — never POSTed out).

import { RATE_TYPES } from './dfGroupValidation.js';

export const DF_ENTRY_ID_RE = /^DFE-[0-9a-z]+-[0-9a-f]{16}$/;

function trim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

export function emptyDfEntry() {
  return {
    id: '',
    doctorId: '',
    doctorName: '',
    dfGroupId: '',
    rows: [],
  };
}

export function validateDfEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return ['form', 'missing entry'];
  }
  const doctorId = trim(entry.doctorId);
  if (!doctorId) return ['doctorId', 'กรุณาเลือกแพทย์ / ผู้ช่วยแพทย์']; // DFE-1

  const dfGroupId = trim(entry.dfGroupId);
  if (!dfGroupId) return ['dfGroupId', 'กรุณาเลือกกลุ่มค่ามือ']; // DFE-2

  if (!Array.isArray(entry.rows)) return ['rows', 'rows ต้องเป็น array']; // DFE-3

  const seen = new Set();
  let hasEnabled = false;
  for (const [i, r] of entry.rows.entries()) {
    if (!r || typeof r !== 'object' || Array.isArray(r)) {
      return ['rows', `rows[${i}] ต้องเป็น object`];
    }
    const cid = trim(r.courseId);
    if (!cid) return ['rows', `rows[${i}] ต้องมี courseId`]; // DFE-4
    if (seen.has(cid)) return ['rows', `rows[${i}] courseId ซ้ำ (${cid})`]; // DFE-9
    seen.add(cid);

    if (typeof r.enabled !== 'boolean') {
      return ['rows', `rows[${i}].enabled ต้องเป็น boolean`]; // DFE-5
    }
    if (r.enabled) hasEnabled = true;

    const value = Number(r.value);
    if (!Number.isFinite(value) || value < 0) {
      return ['rows', `rows[${i}].value ต้องไม่ติดลบ`]; // DFE-6
    }
    if (!RATE_TYPES.includes(r.type)) {
      return ['rows', `rows[${i}].type ไม่ถูกต้อง (baht / percent)`]; // DFE-7
    }
    if (r.type === 'percent' && value > 100) {
      return ['rows', `rows[${i}] percent เกิน 100`]; // DFE-8
    }
  }

  if (!hasEnabled) {
    return ['rows', 'ต้องเลือกคอร์สอย่างน้อยหนึ่งรายการ']; // DFE-10
  }

  const id = trim(entry.id);
  if (id && !DF_ENTRY_ID_RE.test(id)) {
    return ['id', 'id ต้องเป็น DFE-{b36ts}-{16hex}'];
  }

  return null;
}

export function normalizeDfEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
  const out = { ...entry };
  out.id = trim(out.id);
  out.doctorId = trim(out.doctorId);
  out.doctorName = trim(out.doctorName);
  out.dfGroupId = trim(out.dfGroupId);
  out.rows = Array.isArray(out.rows) ? out.rows.map((r) => ({
    courseId: trim(r?.courseId),
    courseName: trim(r?.courseName),
    enabled: !!r?.enabled,
    value: Math.max(0, Number(r?.value) || 0),
    type: RATE_TYPES.includes(r?.type) ? r.type : 'baht',
  })).filter((r) => r.courseId) : [];
  return out;
}

export function generateDfEntryId() {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('crypto.getRandomValues unavailable — cannot generate DF entry id');
  }
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `DFE-${Date.now().toString(36)}-${hex}`;
}

/**
 * Resolve DF rows for a doctor + group against a treatment's selected
 * courses. Calls `getRateForStaffCourse` from Phase 13.3 for each course;
 * rows where no rate resolves get `value: 0, type: 'baht', enabled: false`
 * so the user can still see the course + override manually.
 *
 * @param {Array<{courseId, courseName}>} treatmentCourses - courses picked on this treatment
 * @param {string} doctorId
 * @param {string} dfGroupId
 * @param {Array} groups - be_df_groups docs
 * @param {Array} staffRates - be_df_staff_rates docs
 * @param {(staffId, courseId, groupId, groups, staffRates) => {value, type, source}|null} resolver
 *        - injected for testability; defaults to the real getRateForStaffCourse
 * @returns {Array<{courseId, courseName, enabled, value, type, source}>}
 */
export function buildDefaultRows(treatmentCourses, doctorId, dfGroupId, groups, staffRates, resolver) {
  if (!Array.isArray(treatmentCourses)) return [];
  const resolve = typeof resolver === 'function' ? resolver : null;
  return treatmentCourses.map((c) => {
    const courseId = trim(c?.courseId);
    const courseName = trim(c?.courseName);
    if (!courseId) return null;
    let value = 0;
    let type = 'baht';
    let source = null;
    if (resolve && doctorId) {
      const r = resolve(doctorId, courseId, dfGroupId, groups, staffRates);
      if (r) {
        value = Math.max(0, Number(r.value) || 0);
        type = RATE_TYPES.includes(r.type) ? r.type : 'baht';
        source = r.source || null;
      }
    }
    return {
      courseId,
      courseName,
      enabled: value > 0, // default-on when a rate is found; user can toggle
      value,
      type,
      source, // informational — 'staff' | 'group' | null
    };
  }).filter(Boolean);
}

/**
 * Dup-guard helper used by DfEntryModal's ADD path. Returns true if the
 * selected doctor already has an entry on this treatment (ProClinic's
 * client-side guard mirrors this — see df-modal-brief-phase14.md §2 of
 * Save flow).
 */
export function isDoctorAlreadyEntered(doctorId, existingEntries) {
  if (!doctorId) return false;
  const id = String(doctorId);
  return (existingEntries || []).some((e) => String(e?.doctorId) === id);
}
