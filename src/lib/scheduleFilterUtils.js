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

  const { noDoctorRequired, selectedDoctorId, selectedRoomId, selectedRoomIds, assistantIds } = config;

  // V61 / AV33 (2026-05-08) — `selectedRoomIds: string[]` is the V61 array
  // shape (snapshot of doctor's roomIds union, or single-element wrap of
  // a specific room). Prefer when present + non-empty; fall back to legacy
  // `selectedRoomId` (single string) for pre-V61 saved docs. Empty array
  // → no room filter (treated like null). Mirrors V60 backward-compat
  // pattern (selectedRoomIds preferred; selectedRoomId is the legacy field).
  let roomSet = null;
  if (Array.isArray(selectedRoomIds) && selectedRoomIds.length > 0) {
    roomSet = new Set(
      selectedRoomIds
        .filter((id) => id != null && id !== '')
        .map(String),
    );
    if (roomSet.size === 0) roomSet = null;
  }
  if (roomSet === null && selectedRoomId != null && selectedRoomId !== '') {
    roomSet = new Set([String(selectedRoomId)]);
  }
  const selDoctorStr = selectedDoctorId == null || selectedDoctorId === '' ? null : String(selectedDoctorId);

  // Physical room: if the link targets a specific room (or set of rooms),
  // any of those rooms being occupied blocks the slot regardless of who
  // booked it.
  const roomBusy = roomSet !== null && roomSet.has(roomStr);

  // Person (doctor / assistant) level busy check.
  let personBusy;
  if (selDoctorStr !== null) {
    // Specific doctor picked — only their appointments count.
    personBusy = doctorStr === selDoctorStr;
  } else if (roomSet !== null) {
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

// ─── V53 (BS-12, 2026-05-08) — Per-branch open hours → admin time-axis ────
//
// V51 shipped per-branch clinic_settings.openHours.{monFri,satSun}.{open,close}.
// useEffectiveClinicSettings() merges branch + clinic + flat sources and emits
// flat fields `openHoursMonFri` + `openHoursSatSun`. These helpers consume that
// merged shape to drive admin-side time-axis filtering for AppointmentCalendarView,
// AppointmentFormModal, and ScheduleEntryFormModal.
//
// Distinct from getClinicHoursForDate above — that helper reads schedule-link
// docs (customer-facing, scheduleDoc.clinicOpenTime/Weekend pattern). V53 reads
// V51 per-branch merged settings (admin-facing, openHoursMonFri/SatSun pattern).
// Two patterns coexist because they answer different questions in different
// surfaces; merging would require migrating the schedule-link doc shape too,
// which is out of V53 scope (Rule C3 lean schema — don't touch what works).

/**
 * Resolve day-of-week for a 'YYYY-MM-DD' date → 'monFri' | 'satSun'.
 *
 * The YYYY-MM-DD string is assumed to be a Bangkok-local calendar date
 * (admins always type/store dates in Bangkok TZ; the date string itself
 * has no timezone component). Parses as midday UTC to avoid any TZ-shift
 * edge case (T00:00:00+07:00 would shift to previous day in UTC and
 * break getUTCDay).
 *
 * @internal
 */
function _getDayBucket(dateISO) {
  if (!dateISO || typeof dateISO !== 'string') return 'monFri';
  const m = dateISO.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 'monFri';
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo, d, 12, 0, 0));
  if (isNaN(date.getTime())) return 'monFri';
  const dow = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  return (dow === 0 || dow === 6) ? 'satSun' : 'monFri';
}

/**
 * Is this hours-window effectively "closed"?
 * Closed when: object missing/null OR fields missing/non-string OR open===close
 * OR close < open (reversed/invalid).
 *
 * @internal
 */
function _isClosedHours(hours) {
  if (!hours || typeof hours !== 'object') return true;
  const o = hours.open;
  const c = hours.close;
  if (typeof o !== 'string' || typeof c !== 'string') return true;
  if (!o || !c) return true;
  if (o === c) return true;
  if (c < o) return true;
  return false;
}

/**
 * Resolve the open-hours window for a given date based on the branch's
 * monFri vs satSun bucket. Returns null when closed.
 *
 * @param {string} dateISO — 'YYYY-MM-DD'
 * @param {object} mergedSettings — output of useEffectiveClinicSettings()
 *   Reads: openHoursMonFri, openHoursSatSun (V51 merge layer fields).
 * @returns {{open:string, close:string} | null}
 */
export function getOpenHoursForDate(dateISO, mergedSettings) {
  if (!mergedSettings || typeof mergedSettings !== 'object') return null;
  const bucket = _getDayBucket(dateISO);
  const hours = bucket === 'satSun'
    ? mergedSettings.openHoursSatSun
    : mergedSettings.openHoursMonFri;
  if (_isClosedHours(hours)) return null;
  return { open: hours.open, close: hours.close };
}

/**
 * Derive the visible time-slot list for a given date + branch.
 *
 * Filters allTimeSlots to [open, close] inclusive. When includeAppointments is
 * provided, scans for any appt whose startTime/endTime falls outside the open
 * range — if found, expands the visible range to include those times AND sets
 * `hasOutsideAppts: true` so callers (e.g. AppointmentCalendarView) can render
 * an orange "นอกเวลาเปิด" warning chip.
 *
 * Q1=A user choice (2026-05-08): show legacy out-of-hours appts in the grid
 * (auto-expand) so admin can see + reschedule them; do not hide.
 *
 * @param {object} opts
 * @param {string} opts.dateISO
 * @param {object} opts.mergedSettings — useEffectiveClinicSettings() output
 * @param {string[]} opts.allTimeSlots — canonical TIME_SLOTS (08:15..22:00)
 * @param {Array<{startTime?:string, endTime?:string}>} [opts.includeAppointments]
 *   When provided, scans for out-of-hours appts and auto-expands range.
 *
 * @returns {{
 *   slots: string[],
 *   openRange: {open:string, close:string} | null,
 *   isClosed: boolean,
 *   hasOutsideAppts: boolean,
 *   expandedFrom: 'open-hours' | 'closed' | 'legacy-expand' | 'fallback'
 * }}
 */
export function getVisibleTimeSlotsForDate({
  dateISO,
  mergedSettings,
  allTimeSlots,
  includeAppointments = [],
} = {}) {
  const safeAll = Array.isArray(allTimeSlots) ? allTimeSlots : [];

  // Fallback: no settings → return all TIME_SLOTS (legacy behavior preserved
  // for unmigrated/test branches; production branches all migrated by V51).
  if (!mergedSettings || typeof mergedSettings !== 'object') {
    return {
      slots: safeAll,
      openRange: null,
      isClosed: false,
      hasOutsideAppts: false,
      expandedFrom: 'fallback',
    };
  }

  const openRange = getOpenHoursForDate(dateISO, mergedSettings);

  // Closed day → empty grid. Caller renders banner.
  if (!openRange) {
    return {
      slots: [],
      openRange: null,
      isClosed: true,
      hasOutsideAppts: false,
      expandedFrom: 'closed',
    };
  }

  // Compute extended range from legacy appointments (Q1=A auto-expand).
  let lo = openRange.open;
  let hi = openRange.close;
  let hasOutsideAppts = false;

  for (const a of includeAppointments) {
    if (!a || typeof a !== 'object') continue;
    const start = a.startTime;
    const end = a.endTime;
    if (typeof start === 'string' && start.length >= 4 && start < lo) {
      lo = start;
      hasOutsideAppts = true;
    }
    if (typeof end === 'string' && end.length >= 4 && end > hi) {
      hi = end;
      hasOutsideAppts = true;
    }
    // start time AFTER close (booked late) — expand upper bound
    if (typeof start === 'string' && start.length >= 4 && start > openRange.close) {
      if (start > hi) hi = start;
      hasOutsideAppts = true;
    }
  }

  // Filter allTimeSlots to [lo, hi] inclusive. String comparison works because
  // 'HH:MM' format is naturally lexicographic.
  const slots = safeAll.filter((t) => t >= lo && t <= hi);

  return {
    slots,
    openRange,
    isClosed: false,
    hasOutsideAppts,
    expandedFrom: hasOutsideAppts ? 'legacy-expand' : 'open-hours',
  };
}

/**
 * Does this time fall outside the branch's open-hours for that date?
 *
 * Used by:
 *   - AppointmentCalendarView: chip-flag legacy appts whose startTime is outside
 *   - AppointmentFormModal / ScheduleEntryFormModal: warning hint below picker
 *     when current value (legacy edit) is outside range
 *
 * Returns:
 *   - false when settings missing (no opinion — preserves legacy behavior)
 *   - true when settings present + day closed (any time is outside on closed day)
 *   - true when time < open OR time > close (inclusive boundaries)
 *
 * @param {string} time — 'HH:MM' format
 * @param {string} dateISO — 'YYYY-MM-DD'
 * @param {object} mergedSettings — useEffectiveClinicSettings() output
 * @returns {boolean}
 */
export function isTimeOutsideOpenHours(time, dateISO, mergedSettings) {
  if (typeof time !== 'string' || time.length < 4) return false;
  if (!mergedSettings || typeof mergedSettings !== 'object') return false;

  const range = getOpenHoursForDate(dateISO, mergedSettings);

  // Closed day with settings present → any time is outside the (empty) window.
  // Caller still renders the closed-day banner separately; this fn is for the
  // out-of-hours chip on a per-time-string basis.
  if (!range) {
    // Only flag as "outside" if branch HAS openHours configured (otherwise
    // mergedSettings is fallback-shaped and we return false above)
    return Boolean(mergedSettings.openHoursMonFri || mergedSettings.openHoursSatSun);
  }

  return time < range.open || time > range.close;
}
