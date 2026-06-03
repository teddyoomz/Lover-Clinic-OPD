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

/**
 * Resolve the doctor display name for an appointment, preferring the LIVE
 * doctor-master name (via doctorMap, keyed by doctorId) over the snapshotted
 * `appt.doctorName`. Mirrors resolveAssistantNames: the master is the source of
 * truth; the snapshot is the fallback (deleted doctor / no map / legacy appt).
 *
 * Why (2026-06-04): the appointment views rendered `appt.doctorName` RAW — a
 * value frozen at appointment-creation time — so renaming a doctor in tab=doctors
 * never propagated to EXISTING appointments ("ไม่อัพเดทตามฐานข้อมูล"). Live-resolve
 * at render makes be_doctors the single source of truth (V108/V111/V113 class) and
 * removes any need for manual name backfills.
 *
 * @param {object} appt - appointment doc (be_appointments)
 * @param {Map<string,{name:string}>|object|null} doctorMap - id→{name} lookup
 * @returns {string} live name → snapshot → '' (caller renders its own placeholder)
 */
export function resolveDoctorName(appt, doctorMap) {
  if (!appt) return '';
  const id = appt.doctorId != null ? String(appt.doctorId) : '';
  if (id && doctorMap) {
    let entry = null;
    if (typeof doctorMap.get === 'function') entry = doctorMap.get(id);
    else if (typeof doctorMap === 'object') entry = doctorMap[id];
    const live = entry ? String(entry.name || '').trim() : '';
    if (live) return live;
  }
  return String(appt.doctorName || '').trim();
}

// ─── Appointment display formatting (calendar-density, 2026-05-20) ─────────
// Shared by AppointmentDetailPopover + AppointmentAgendaView + the calendar
// grid block. APPT_STATUSES is the SINGLE source for the status palette —
// was previously duplicated as a local `STATUSES` const inside
// AppointmentCalendarView.jsx (Rule C1 Rule-of-3: referenced at the def + 2
// `.find()` callsites). The grid now imports it from here.
//
// Shape: { value, label, bg, text, dot, accent }. `accent` is a CSS color
// string used for the block's 4px left border + dot glow. Keep this shape in
// sync with every consumer (grid block, popover status pill, agenda card).
export const APPT_STATUSES = [
  { value: 'pending',   label: 'รอยืนยัน',   bg: 'bg-orange-500/20',  text: 'text-orange-400',  dot: 'bg-orange-400',  accent: 'rgb(251 146 60)'  },
  { value: 'confirmed', label: 'ยืนยันแล้ว', bg: 'bg-sky-500/20',     text: 'text-sky-400',     dot: 'bg-sky-400',     accent: 'rgb(56 189 248)'  },
  { value: 'done',      label: 'เสร็จแล้ว',  bg: 'bg-emerald-500/20', text: 'text-emerald-400', dot: 'bg-emerald-400', accent: 'rgb(52 211 153)'  },
  { value: 'cancelled', label: 'ยกเลิก',     bg: 'bg-red-500/20',     text: 'text-red-400',     dot: 'bg-red-400',     accent: 'rgb(248 113 113)' },
];

/** Resolve a status's render meta; unknown/missing → first entry (pending). */
export function getApptStatusMeta(status) {
  return APPT_STATUSES.find((s) => s.value === status) || APPT_STATUSES[0];
}

/** Display name with fallback: customerName → customerNameTemp → '-'. */
export function apptDisplayName(appt) {
  return (appt && (appt.customerName || appt.customerNameTemp)) || '-';
}

/** Phone value preferring the linked customer's phone over the booking temp. */
export function apptPhoneValue(appt) {
  if (!appt) return '';
  return appt.customerPhone || appt.customerPhoneTemp || '';
}

/** "HH:MM–HH:MM" (en-dash) · "HH:MM" when no end · '' when no start. */
export function apptTimeRange(appt) {
  if (!appt || !appt.startTime) return '';
  return appt.endTime ? `${appt.startTime}–${appt.endTime}` : appt.startTime;
}

/**
 * V139 (2026-05-31) — couple appt.status ↔ serviceCompletedAt so the
 * "กำลังรอ / ✓ เสร็จแล้ว" today sub-tab (driven by serviceCompletedAt, the SSOT)
 * stays in sync with the status dropdown ("เสร็จแล้ว"='done') + mark/unmark
 * buttons. serviceCompletedAt remains the tab SSOT — the filter is NOT touched;
 * this only reconciles serviceCompletedAt when an explicit status crosses the
 * done boundary. Pure (no Firestore) so the caller applies serverTimestamp.
 *
 *   'stamp' → caller adds serviceCompletedAt=serverTimestamp() (+ wasServiceCompleted:true) → moves to "เสร็จแล้ว"
 *   'clear' → caller adds serviceCompletedAt=null (+ serviceCompletedBy:'')           → moves to "กำลังรอ"
 *   'none'  → no coupling change (no status in patch OR already consistent OR no transition)
 *
 * @param {*} patchStatus           appt.status in the incoming update patch (only lowercase 'done' counts as done)
 * @param {*} oldServiceCompletedAt existing serviceCompletedAt (truthy = currently in the done tab)
 * @returns {'stamp'|'clear'|'none'}
 */
export function decideApptStatusServiceSync(patchStatus, oldServiceCompletedAt) {
  if (typeof patchStatus !== 'string' || !patchStatus) return 'none';
  const inDoneTab = !!oldServiceCompletedAt;
  if (patchStatus === 'done' && !inDoneTab) return 'stamp';
  if (patchStatus !== 'done' && inDoneTab) return 'clear';
  return 'none';
}

// Phase 19.0 (2026-05-06) — re-export type-resolution helpers from
// appointmentTypes.js so chip-rendering callers (AppointmentTab,
// CustomerDetailView, AdminDashboard) have a single import surface.
export {
  resolveAppointmentTypeLabel,
  resolveAppointmentTypeDefaultColor,
  APPOINTMENT_TYPES,
  DEFAULT_APPOINTMENT_TYPE,
} from './appointmentTypes.js';
