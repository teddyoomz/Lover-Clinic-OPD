// src/lib/customerLinkPayloadCore.js
//
// Pure core for the customer patient-link payload + auto-cleanup decision.
// SINGLE SOURCE for "what does this link show" (AV135) — consumed by:
//   - api/patient-view.js                    (render payload: usable courses + upcoming appts)
//   - api/cron/patient-link-cleanup-sweep.js (isEmpty → stamp/clear/delete decision)
//   - scripts/patient-link-cleanup-sweep.mjs (Rule-M dry-run/apply mirror)
// NO firebase imports — pure JS, fully unit-testable.
//
// "Empty" = no usable non-expired course AND no upcoming appointment. Expired
// courses do NOT count as "คอร์สคงเหลือ" and do NOT keep a link alive.
import { parseQtyString } from './courseUtils.js';
import { parseStatusFromCourse, deriveEffectiveStatus, STATUS_ACTIVE } from './remainingCourseUtils.js';

/** 30-day grace: a link must be empty this long before auto-delete. */
export const PATIENT_LINK_EMPTY_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

// Completed / attended appointment statuses — mirrors appointmentAnalysisAggregator
// didAttend + the (pre-refactor) inline set in api/patient-view.js.
const COMPLETED_APPT_STATUSES = new Set(['done', 'completed', 'มาตามนัด', 'ชำระเงิน']);

/**
 * A course is "usable remaining" iff its EFFECTIVE status is ACTIVE.
 * deriveEffectiveStatus flips finite+depleted (total>0 && remaining<=0) → ใช้หมดแล้ว,
 * keeps buffet (total 0) + remaining>0 as active, preserves refunded/cancelled.
 */
export function isUsableActiveCourse(c) {
  const { remaining, total } = parseQtyString(c?.qty || '');
  return deriveEffectiveStatus(parseStatusFromCourse(c), Number(total) || 0, Number(remaining) || 0) === STATUS_ACTIVE;
}

/**
 * Split usable courses into remaining (non-expired) vs expired.
 * @param {Array} courses - customer.courses[]
 * @param {string} todayISO - 'YYYY-MM-DD' (Bangkok)
 * @returns {{ remaining: Array, expired: Array }}
 */
export function computeUsableCourses(courses, todayISO) {
  const all = Array.isArray(courses) ? courses : [];
  const usable = all.filter(isUsableActiveCourse);
  const remaining = usable.filter(c => !c.expiryDate || String(c.expiryDate) >= todayISO);
  const expired = usable.filter(c => c.expiryDate && String(c.expiryDate) < todayISO);
  return { remaining, expired };
}

/**
 * Upcoming = future-or-today date, NOT cancelled, NOT serviced/attended.
 * @param {object} a - be_appointments doc data
 * @param {string} todayISO - 'YYYY-MM-DD' (Bangkok)
 */
export function isAppointmentUpcoming(a, todayISO) {
  if (!a) return false;
  const dt = a.date || '';
  if (dt && String(dt) < todayISO) return false;
  if (a.status === 'cancelled') return false;
  if (a.serviceCompletedAt || a.wasServiceCompleted) return false;
  if (COMPLETED_APPT_STATUSES.has(String(a.status || '').trim())) return false;
  return true;
}

/**
 * Empty = no usable non-expired course AND no upcoming appt.
 * Expired courses do NOT count (literal "ไม่มีคอร์สคงเหลือ").
 * @param {{ courses: Array, appointments: Array, todayISO: string }} args
 * @returns {boolean}
 */
export function isCustomerLinkEmpty({ courses, appointments, todayISO }) {
  const { remaining } = computeUsableCourses(courses, todayISO);
  if (remaining.length > 0) return false;
  const appts = Array.isArray(appointments) ? appointments : [];
  return !appts.some(a => isAppointmentUpcoming(a, todayISO));
}

/**
 * Decide the auto-cleanup action for ONE enabled-link customer.
 * Empty-since state machine (Q3=A): stamp on first-empty, delete after grace,
 * clear when data returns. "Delete" = clear token + disable (Q4=A, true delete).
 * Pure — the cron applies the patch + adds the serverTimestamp forensic stamp.
 *
 * @param {object} customer - be_customers doc data
 * @param {boolean} isEmpty
 * @param {number} now - epoch ms
 * @param {number} [graceMs=PATIENT_LINK_EMPTY_GRACE_MS]
 * @returns {{ action: 'stamp'|'clear'|'delete'|'skip', patch: object }}
 */
export function decidePatientLinkCleanup(customer, isEmpty, now, graceMs = PATIENT_LINK_EMPTY_GRACE_MS) {
  const emptySince = typeof customer?.patientLinkEmptySince === 'number' ? customer.patientLinkEmptySince : null;
  if (isEmpty) {
    if (emptySince == null) return { action: 'stamp', patch: { patientLinkEmptySince: now } };
    if (now - emptySince >= graceMs) {
      return {
        action: 'delete',
        patch: {
          patientLinkToken: null,
          patientLinkEnabled: false,
          patientLinkEmptySince: null,
          patientLinkAutoDeleteReason: 'stale-empty-30d',
        },
      };
    }
    return { action: 'skip', patch: {} };
  }
  // has data
  if (emptySince != null) return { action: 'clear', patch: { patientLinkEmptySince: null } };
  return { action: 'skip', patch: {} };
}
