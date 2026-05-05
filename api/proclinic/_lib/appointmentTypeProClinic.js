// api/proclinic/_lib/appointmentTypeProClinic.js
//
// @dev-only — STRIP BEFORE PRODUCTION RELEASE (rule H-bis)
//
// Phase 19.0 (2026-05-06) — outgoing 4→2 translator for ProClinic dev-only
// sync. ProClinic only knows 'sales' and 'followup'. Our 4-type taxonomy
// gets compressed for outgoing PATCH bodies in api/proclinic/appointment.js.
// Same payload-shape as before; just a value swap on the way out.
//
// Pure JS, no Firestore. Safe to import in serverless handlers + tests.

/**
 * Map our 4-type taxonomy to the 2-type taxonomy ProClinic supports.
 *
 * - 'follow-up' → 'followup' (semantic match: post-care follow-up)
 * - 'deposit-booking' / 'no-deposit-booking' / 'treatment-in' → 'sales'
 *   (all are revenue-bearing or sales-funnel bookings; ProClinic categorizes
 *   these as 'sales')
 * - unknown / null / legacy values → 'sales' (defensive default)
 *
 * @param {string|null|undefined} type our internal appointmentType value
 * @returns {'sales'|'followup'} ProClinic-compatible value
 */
export function mapAppointmentTypeForProClinic(type) {
  if (type === 'follow-up') return 'followup';
  return 'sales';
}
