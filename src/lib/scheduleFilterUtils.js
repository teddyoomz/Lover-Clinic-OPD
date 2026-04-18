// ─── Schedule link: slot-blocking filter + customer-view helpers ───────────
// This module owns the pure logic used by BOTH sides of the schedule link:
//   1. Admin side (AdminDashboard.handleGenScheduleLink) — decides which
//      appointments end up in the schedule doc's `bookedSlots`.
//   2. Customer side (ClinicSchedule.jsx) — renders the calendar + slots
//      the customer sees. `isSlotBooked` / `generateTimeSlots` / doctor-hours
//      helpers live here so they can be tested without mounting React.
//
// Keeping the logic in one file means the admin filter and customer display
// can't silently drift out of sync — a class of bug the user called out
// 2026-04-19 (Shockwave leak + "ลิ้งก์ที่ลูกค้าได้รับ ตรงกันไหม").
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

/**
 * Decide whether an appointment should show up as "doctor busy" in the
 * customer link's `doctorBookedSlots` — the info badge that tells the
 * customer "btw, a doctor is occupied at this time".
 *
 * Semantics (per user 2026-04-19): a doctor is considered busy only when
 * they're at their DOCTOR room — i.e. role='doctor' room. A doctor doing
 * a Shockwave / IV-drip / other procedure in a STAFF room is doing
 * something other than seeing patients at their station, so their "doctor
 * availability" for the customer is unaffected.
 *
 * Only applies in ไม่พบแพทย์ mode; other modes don't render the badge.
 *
 * @param {AppointmentLike} appointment
 * @param {Object} config
 * @param {boolean} config.noDoctorRequired
 * @param {Set<string>} config.doctorPractitionerIds   practitioners role='doctor'
 * @param {Set<string>} config.doctorRoomIds           rooms role='doctor'
 */
export function shouldBlockDoctorSlot(appointment, config) {
  if (!config.noDoctorRequired) return false;
  const doctorStr = appointment.doctorId == null ? '' : String(appointment.doctorId);
  const roomStr = appointment.roomId == null ? '' : String(appointment.roomId);
  if (!config.doctorPractitionerIds?.has(doctorStr)) return false;
  // If doctor-room list isn't configured, fall back to legacy "any room" behaviour
  // so links generated before the room-role config still work.
  if (!config.doctorRoomIds || config.doctorRoomIds.size === 0) return true;
  return config.doctorRoomIds.has(roomStr);
}

// ═══════════════════════════════════════════════════════════════════════════
// Customer-view helpers (shared with ClinicSchedule.jsx)
// ═══════════════════════════════════════════════════════════════════════════

const _toMin = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
};

/** Parse "YYYY-MM-DD" → UTC-midnight Date. Safe for day-of-week checks regardless of the browser timezone. */
function _parseYMDToUTC(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map((x) => parseInt(x, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/**
 * Fixed-duration slot generator from clinic open/close times. Slots that
 * would run past `closeTime` are dropped. Pure.
 * @returns {Array<{start:string,end:string}>}
 */
export function generateTimeSlots(openTime, closeTime, durationMins) {
  const slots = [];
  const start = _toMin(openTime);
  const end = _toMin(closeTime);
  const dur = Number(durationMins) || 0;
  if (dur <= 0) return slots;
  let current = start;
  while (current + dur <= end) {
    const sH = String(Math.floor(current / 60)).padStart(2, '0');
    const sM = String(current % 60).padStart(2, '0');
    const eH = String(Math.floor((current + dur) / 60)).padStart(2, '0');
    const eM = String((current + dur) % 60).padStart(2, '0');
    slots.push({ start: `${sH}:${sM}`, end: `${eH}:${eM}` });
    current += dur;
  }
  return slots;
}

/**
 * Does any entry in `bookedSlots` overlap the given slot window?
 * Overlap rule: busy if `b.start < slotEnd && b.end > slotStart`
 * (half-open interval — a 10:00–11:00 booking does NOT block a 11:00–12:00 slot).
 */
export function isSlotBooked(date, slotStart, slotEnd, bookedSlots) {
  const sMin = _toMin(slotStart);
  const eMin = _toMin(slotEnd);
  return (bookedSlots || []).some((b) => {
    if (b.date !== date) return false;
    const bS = _toMin(b.startTime);
    const bE = _toMin(b.endTime);
    return bS < eMin && bE > sMin;
  });
}

/**
 * Doctor working-hour ranges for a given calendar date. Falls back to weekly
 * defaults based on weekday/weekend; honours `customDoctorHours[dateStr]`
 * overrides (either a single `{start,end}` or an array of ranges).
 */
export function getDoctorRangesForDate(dateStr, scheduleDoc) {
  const custom = (scheduleDoc.customDoctorHours || {})[dateStr];
  if (custom) return Array.isArray(custom) ? custom : [custom];
  const dow = _parseYMDToUTC(dateStr).getUTCDay(); // 0=Sun, 6=Sat
  const isWknd = dow === 0 || dow === 6;
  return [{
    start: isWknd ? (scheduleDoc.doctorStartTimeWeekend || scheduleDoc.doctorStartTime || '10:00') : (scheduleDoc.doctorStartTime || '10:00'),
    end:   isWknd ? (scheduleDoc.doctorEndTimeWeekend   || scheduleDoc.doctorEndTime   || '19:00') : (scheduleDoc.doctorEndTime   || '19:00'),
  }];
}

/**
 * Is a candidate slot outside the doctor's working hours for that date?
 * Returns false for no-doctor mode or on non-doctor days (no gating applies).
 * A slot is "outside" if it doesn't fit ENTIRELY within at least one range.
 */
export function isSlotOutsideDoctorHours(dateStr, slotStart, slotEnd, scheduleDoc) {
  if (scheduleDoc.noDoctorRequired) return false;
  const doctorDaysSet = new Set(scheduleDoc.doctorDays || []);
  if (!doctorDaysSet.has(dateStr)) return false;
  const ranges = getDoctorRangesForDate(dateStr, scheduleDoc);
  const sMin = _toMin(slotStart);
  const eMin = _toMin(slotEnd);
  return !ranges.some((r) => sMin >= _toMin(r.start) && eMin <= _toMin(r.end));
}

/**
 * Clinic-day visibility: closed → false; before showFromDate → false;
 * after endDate → false; otherwise true. Pure.
 */
export function isDayVisible(dateStr, scheduleDoc, { showFromDate = '', endDate = '' } = {}) {
  if ((scheduleDoc.closedDays || []).includes(dateStr)) return false;
  if (showFromDate && dateStr < showFromDate) return false;
  if (endDate && dateStr > endDate) return false;
  return true;
}

/**
 * Pick the appropriate clinic open/close tuple for the given calendar date.
 * Returns {open, close} in "HH:MM" format.
 */
export function getClinicHoursForDate(dateStr, scheduleDoc) {
  const dow = _parseYMDToUTC(dateStr).getUTCDay();
  const isWknd = dow === 0 || dow === 6;
  return {
    open:  isWknd ? (scheduleDoc.clinicOpenTimeWeekend  || scheduleDoc.clinicOpenTime  || '10:00') : (scheduleDoc.clinicOpenTime  || '10:00'),
    close: isWknd ? (scheduleDoc.clinicCloseTimeWeekend || scheduleDoc.clinicCloseTime || '17:00') : (scheduleDoc.clinicCloseTime || '19:00'),
  };
}
