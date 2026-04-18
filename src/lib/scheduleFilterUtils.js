// ─── Schedule link slot-blocking filter ─────────────────────────────────────
// Pure logic for deciding whether an appointment should mark a schedule-link
// slot as "busy". Extracted so AdminDashboard's schedule-link creation and the
// background resync can share identical rules, and so it can be unit-tested
// without mounting the whole React tree.
//
// A slot is busy if EITHER:
//   - the selected doctor (if specified) has an overlapping appointment, OR
//   - the selected room  (if specified) is physically occupied.
//
// The "no specific doctor" case is where the subtlety lives. Before, every
// appointment (by anyone, in any room) counted as busy — which is fine when
// no room filter is active (that's the legacy "all doctors" view). But when
// a room filter IS active, "all doctors" must defer to the room check only;
// an appointment in a DIFFERENT room by a DIFFERENT doctor must not block the
// selected room's availability. User-reported bug 2026-04-19: Shockwave room
// was booked at 16:30–17:00, and a doctor-mode link filtered to a different
// exam room still showed 16:30 as busy.

/**
 * @typedef {Object} AppointmentLike
 * @property {string|number|null} doctorId
 * @property {string|number|null} roomId
 */

/**
 * @typedef {Object} FilterConfig
 * @property {boolean} noDoctorRequired      - "ไม่ต้องพบแพทย์" checkbox
 * @property {string|number|null} selectedDoctorId   - specific doctor id or null
 * @property {string|number|null} selectedRoomId     - specific room id or null
 * @property {Set<string>} assistantIds      - set of assistant practitioner ids (string)
 */

/**
 * @param {AppointmentLike} appointment
 * @param {FilterConfig} config
 * @returns {boolean} true if the appointment should mark its slot as busy
 */
export function shouldBlockScheduleSlot(appointment, config) {
  const doctorStr = appointment.doctorId == null ? '' : String(appointment.doctorId);
  const roomStr = appointment.roomId == null ? '' : String(appointment.roomId);

  const { noDoctorRequired, selectedDoctorId, selectedRoomId, assistantIds } = config;
  const selRoomStr = selectedRoomId == null || selectedRoomId === '' ? null : String(selectedRoomId);
  const selDoctorStr = selectedDoctorId == null || selectedDoctorId === '' ? null : String(selectedDoctorId);

  // Physical room: if the link targets a specific room, that room being
  // occupied blocks the slot regardless of who booked it.
  const roomBusy = selRoomStr !== null && roomStr === selRoomStr;

  // Person (doctor / assistant) level busy check.
  let personBusy;
  if (selDoctorStr !== null) {
    // Specific doctor picked — only their appointments count.
    personBusy = doctorStr === selDoctorStr;
  } else if (selRoomStr !== null) {
    // Room-only filter — person-level busy doesn't apply. A different doctor
    // booking a different room must not block us.
    personBusy = false;
  } else if (noDoctorRequired) {
    // ไม่พบแพทย์ mode without a room filter — assistant bookings block.
    personBusy = assistantIds && assistantIds.has(doctorStr);
  } else {
    // Legacy "all doctors" view (no filters) — conservative: any appointment blocks.
    personBusy = true;
  }

  return personBusy || roomBusy;
}
