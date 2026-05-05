// src/lib/appointmentTypes.js
//
// Phase 19.0 (2026-05-06) — Single source of truth for appointment-type
// taxonomy. Replaces the 2-value 'sales' / 'followup' enum scattered across
// AppointmentFormModal / AppointmentReportTab / AdminDashboard / aggregators.
//
// Pure JS — no Firestore, no React. Safe to import in tests, server,
// migration scripts, and UI.

/**
 * 4-value appointment-type taxonomy. Frozen.
 *
 * - value: storage key (string, written to be_appointments.appointmentType)
 * - label: Thai display label (rendered in dropdowns, chips, reports)
 * - defaultColor: per-type fallback color when admin doesn't pick
 *   appointmentColor explicitly. Must be one of APPT_COLORS values.
 * - order: stable display ordering (radio rows, dropdown rows)
 */
export const APPOINTMENT_TYPES = Object.freeze([
  Object.freeze({ value: 'deposit-booking',    label: 'จองมัดจำ',     defaultColor: 'เขียวอ่อน',    order: 0 }),
  Object.freeze({ value: 'no-deposit-booking', label: 'จองไม่มัดจำ',  defaultColor: 'ส้มอ่อน',      order: 1 }),
  Object.freeze({ value: 'treatment-in',       label: 'เข้าทำหัตถการ', defaultColor: 'น้ำเงินอ่อน',   order: 2 }),
  Object.freeze({ value: 'follow-up',          label: 'ติดตามอาการ',   defaultColor: 'เหลืองอ่อน',   order: 3 }),
]);

export const APPOINTMENT_TYPE_VALUES = Object.freeze(
  APPOINTMENT_TYPES.map((t) => t.value),
);

/** Default value for new appointments (Q2 lock). */
export const DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking';

/** Legacy values that may exist in be_appointments before migration. */
const LEGACY_TYPE_VALUES = Object.freeze(['sales', 'followup', 'follow', 'consult', 'treatment']);

/**
 * Resolve display label for an appointment-type value.
 * Unknown / null / legacy values fall back to the DEFAULT_APPOINTMENT_TYPE
 * label (defensive — handles deploy-before-migration window).
 *
 * @param {string|null|undefined} value
 * @returns {string} Thai display label
 */
export function resolveAppointmentTypeLabel(value) {
  const match = APPOINTMENT_TYPES.find((t) => t.value === value);
  if (match) return match.label;
  const fallback = APPOINTMENT_TYPES.find((t) => t.value === DEFAULT_APPOINTMENT_TYPE);
  return fallback ? fallback.label : '';
}

/**
 * Resolve per-type default color for chip rendering.
 * Unknown values fall back to default-type color.
 *
 * @param {string|null|undefined} value
 * @returns {string} color name (one of APPT_COLORS)
 */
export function resolveAppointmentTypeDefaultColor(value) {
  const match = APPOINTMENT_TYPES.find((t) => t.value === value);
  if (match) return match.defaultColor;
  const fallback = APPOINTMENT_TYPES.find((t) => t.value === DEFAULT_APPOINTMENT_TYPE);
  return fallback ? fallback.defaultColor : '';
}

/**
 * Detect a legacy 2-type or ProClinic-imported value.
 *
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function isLegacyAppointmentType(value) {
  if (value == null || value === '') return true; // null / empty also counts as needing migration
  return LEGACY_TYPE_VALUES.includes(value);
}

/**
 * Migrate a legacy value to the new 4-type taxonomy.
 *
 * Phase 19.0 Q1 = Option B Uniform: ALL legacy values → DEFAULT_APPOINTMENT_TYPE.
 * Idempotent: passes through any value already in the 4-type set.
 *
 * @param {string|null|undefined} value
 * @returns {string} one of APPOINTMENT_TYPE_VALUES
 */
export function migrateLegacyAppointmentType(value) {
  if (APPOINTMENT_TYPE_VALUES.includes(value)) return value;
  return DEFAULT_APPOINTMENT_TYPE;
}
