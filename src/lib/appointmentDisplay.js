// ─── Appointment display helpers (Phase 15.7, 2026-04-28) ─────────────────
// Shared name-resolution helpers used by AppointmentTab, CustomerDetailView,
// and any other UI surface that renders an appointment doc. Avoids three
// near-identical lookup patterns (Rule C1 Rule of 3 trigger).
//
// Why this exists: AppointmentFormModal historically saved `assistantIds` as
// IDs only — no `assistantNames` denorm. Render-time consumers (AppointmentTab,
// CustomerDetailView) only displayed `doctorName` and never iterated the
// assistants list at all. User reported (2026-04-28):
//   "ผู้ช่วยแพทย์และแพทย์ยังไม่ขึ้นชื่อในการนัดหมายที่ต่างๆ"
// Fix: AppointmentFormModal now denormalizes `assistantNames` at save time
// (legacy appts get the in-memory map fallback). This helper wraps the dual
// path so callers don't have to know which shape the doc is in.
//
// No Firestore imports — pure function, safe for client + tests.

/**
 * Resolve the array of assistant display names for an appointment.
 *
 * Priority:
 *   1. If `appt.assistantNames` is a non-empty array → use directly (denorm).
 *   2. Else fall back to `appt.assistantIds` + lookup via doctorMap.
 *
 * Both paths filter out falsy/blank entries so render code can safely
 * `.join(', ')` without empty-string artifacts.
 *
 * @param {object} appt - appointment doc (be_appointments)
 * @param {Map<string, {name: string}> | object | null} doctorMap - optional
 *        lookup map. Accepts native Map (preferred), plain object, or null.
 * @returns {string[]} array of display names (may be empty)
 */
export function resolveAssistantNames(appt, doctorMap) {
  if (!appt) return [];

  // Path 1: denormalized assistantNames (Phase 15.7+ writes always include
  // this; legacy appts may not).
  if (Array.isArray(appt.assistantNames) && appt.assistantNames.length > 0) {
    return appt.assistantNames
      .map((n) => String(n || '').trim())
      .filter(Boolean);
  }

  // Path 2: lookup via doctorMap (legacy appts written before Phase 15.7).
  const ids = Array.isArray(appt.assistantIds) ? appt.assistantIds : [];
  if (ids.length === 0) return [];

  const lookup = (id) => {
    if (!doctorMap) return '';
    const key = String(id);
    if (typeof doctorMap.get === 'function') {
      const entry = doctorMap.get(key);
      return entry ? String(entry.name || '').trim() : '';
    }
    if (typeof doctorMap === 'object') {
      const entry = doctorMap[key];
      return entry ? String(entry.name || '').trim() : '';
    }
    return '';
  };

  return ids
    .map((id) => lookup(id))
    .filter(Boolean);
}

/**
 * Build a doctor lookup map from a list of doctor records. Convenience for
 * callers that have an array but want O(1) name lookup.
 *
 * @param {Array<{id: string|number, name: string}>} doctors
 * @returns {Map<string, {id: string, name: string}>}
 */
export function buildDoctorMap(doctors) {
  const m = new Map();
  if (!Array.isArray(doctors)) return m;
  for (const d of doctors) {
    if (!d || d.id == null) continue;
    m.set(String(d.id), { id: String(d.id), name: String(d.name || '').trim() });
  }
  return m;
}
