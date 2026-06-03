// ─── appointmentSlotKeys — pure AP1/AP1-bis slot-key builders ────────────────
//
// Extracted 2026-06-03 (appointment-loop R1) from backendClient.js so the
// deposit-booking writers in appointmentDepositBatch.js can reserve the SAME
// atomic double-booking slots as createBackendAppointment — WITHOUT importing
// the huge backendClient module (preserves the deliberate circular-import
// boundary the appointmentDepositBatch header documents). Pure JS, no Firestore.
//
// WHY THIS EXISTS (the bug it closes): pre-extraction, only createBackendAppointment
// reserved be_appointment_slots docs inside a runTransaction (AP1-bis atomic
// double-booking guard). The deposit-booking writers (createDepositBookingPair /
// createAppointmentForExistingDeposit) did a plain writeBatch.set(appt) with NO
// slot reservation → the money-backed booking flow had ZERO atomic double-booking
// protection and the two flows were mutually blind. Reproduced on real prod
// (scripts/e2e-appointment-double-booking-concurrency.mjs D1: 2 concurrent
// deposit bookings for the same doctor+slot → appts=2 deposits=2 collisions=0).
// The fix makes the deposit writers reserve slots via THESE keys so both flows
// share one slot namespace. backendClient.js re-exports these for backward-compat.

/**
 * Default slot interval for AP1-bis multi-slot reservation. 15 minutes
 * matches ProClinic + clinic-typical scheduling granularity. Tunable by
 * caller for tests but every production write uses 15.
 */
export const SLOT_INTERVAL_MIN = 15;

function _parseHHMM(s) {
  const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function _formatHHMM(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * AP1 (legacy single-slot) — exact-key slot id. KEPT for backward-compat
 * with V15 #12/#13 production data. New code uses buildAppointmentSlotKeys
 * (plural, multi-slot — see AP1-bis below).
 *
 * Format: `${date}_${doctorId}_${startTime}_${endTime}`. Empty / missing
 * inputs return ''.
 */
export function buildAppointmentSlotKey(input) {
  const { date, doctorId, startTime, endTime } = (input && typeof input === 'object') ? input : {};
  const d = String(date || '').trim();
  const doc = String(doctorId || '').trim();
  const s = String(startTime || '').trim();
  const e = String(endTime || startTime || '').trim();
  if (!d || !doc || !s) return '';
  const safeDoc = doc.replace(/[\/.]/g, '-');
  return `${d}_${safeDoc}_${s}_${e || s}`;
}

/**
 * AP1-bis (2026-05-04): build the ARRAY of 15-min interval slot keys an
 * appointment occupies. Catches RANGE-OVERLAP collisions the legacy
 * single-key approach missed (e.g. 09:00-10:00 vs 09:30-10:30 — both
 * reserve slot 09:30 → atomic tx.get sees the conflict).
 *
 * Bucketing semantics:
 *   - startTime is FLOORED to the nearest interval boundary (09:10 → 09:00)
 *   - endTime is CEILINGED   (09:25 → 09:30)
 *   - emit `${date}_${doctorId}_${HH:MM}` for every interval start in
 *     [floor(start), ceil(end))
 *
 * Edge cases:
 *   - endTime missing OR ≤ startTime: emits ONE slot at floor(start)
 *   - startTime invalid (non-HH:MM): returns []
 *   - missing date/doctorId: returns []
 *
 * Returns plain string[] (sorted by time, deduped). Caller maps each to
 * `appointmentSlotDoc(key)` for tx.get / tx.set.
 *
 * Tunable interval (default 15) for tests; production callers use the
 * default. Intervals 1, 5, 10, 15, 30, 60 supported.
 */
export function buildAppointmentSlotKeys(input, intervalMin = SLOT_INTERVAL_MIN) {
  const { date, doctorId, startTime, endTime } = (input && typeof input === 'object') ? input : {};
  const d = String(date || '').trim();
  const doc = String(doctorId || '').trim();
  if (!d || !doc) return [];
  const start = _parseHHMM(startTime);
  if (start === null) return [];
  const end = _parseHHMM(endTime);
  const interval = Number.isFinite(intervalMin) && intervalMin > 0 ? Math.floor(intervalMin) : SLOT_INTERVAL_MIN;
  const safeDoc = doc.replace(/[\/.]/g, '-');

  // Single-point or end<=start: emit ONE slot at floor(start).
  if (end === null || end <= start) {
    const floorStart = Math.floor(start / interval) * interval;
    return [`${d}_${safeDoc}_${_formatHHMM(floorStart)}`];
  }

  const floorStart = Math.floor(start / interval) * interval;
  const ceilEnd = Math.ceil(end / interval) * interval;
  const keys = [];
  for (let m = floorStart; m < ceilEnd; m += interval) {
    keys.push(`${d}_${safeDoc}_${_formatHHMM(m)}`);
  }
  return keys;
}

/**
 * appointment-loop R2 (2026-06-03) — ROOM slot keys (one per 15-min interval).
 * Keyed on the EXAM ROOM, with a `ROOM__` prefix so a room key can NEVER
 * collide with a doctor key (which always starts with the date YYYY-MM-DD).
 * Lets two DIFFERENT doctors be prevented from booking the SAME physical room
 * at the same time — the atomic analogue of the soft `sameRoom` UI check.
 * Reproduced on REAL prod (scripts/diag-appointment-room-uncancel-probe.mjs B:
 * 2 doctors same room+time → both succeeded). Returns [] when no roomId (an
 * appointment with no room is simply not room-guarded).
 */
export function buildAppointmentRoomSlotKeys(input, intervalMin = SLOT_INTERVAL_MIN) {
  const { date, roomId, startTime, endTime } = (input && typeof input === 'object') ? input : {};
  const d = String(date || '').trim();
  const room = String(roomId || '').trim();
  if (!d || !room) return [];
  const start = _parseHHMM(startTime);
  if (start === null) return [];
  const end = _parseHHMM(endTime);
  const interval = Number.isFinite(intervalMin) && intervalMin > 0 ? Math.floor(intervalMin) : SLOT_INTERVAL_MIN;
  const safeRoom = room.replace(/[\/.]/g, '-');
  if (end === null || end <= start) {
    const floorStart = Math.floor(start / interval) * interval;
    return [`ROOM__${d}_${safeRoom}_${_formatHHMM(floorStart)}`];
  }
  const floorStart = Math.floor(start / interval) * interval;
  const ceilEnd = Math.ceil(end / interval) * interval;
  const keys = [];
  for (let m = floorStart; m < ceilEnd; m += interval) {
    keys.push(`ROOM__${d}_${safeRoom}_${_formatHHMM(m)}`);
  }
  return keys;
}

/**
 * appointment-loop R2 (2026-06-03) — the COMPLETE set of double-booking guard
 * keys an appointment occupies: the DOCTOR interval slots PLUS the ROOM interval
 * slots. EVERY reserve/release site (createBackendAppointment, the deposit-pair
 * writers, _releaseAppointmentSlot, updateBackendAppointment rotation/un-cancel)
 * uses THIS so a collision on EITHER the doctor OR the room aborts the write.
 * A missing doctorId OR roomId simply omits that dimension's keys.
 */
export function buildAppointmentGuardKeys(input, intervalMin = SLOT_INTERVAL_MIN) {
  const { date, doctorId, roomId, startTime, endTime } = (input && typeof input === 'object') ? input : {};
  return [
    ...buildAppointmentSlotKeys({ date, doctorId, startTime, endTime }, intervalMin),
    ...buildAppointmentRoomSlotKeys({ date, roomId, startTime, endTime }, intervalMin),
  ];
}

/**
 * appointment-loop R9 (2026-06-03) — compute the be_appointment_slots docs a LIVE
 * appointment should hold, for restore-time slot-guard REBUILD. The AP1-bis slot
 * docs are keyed date_doctor_time (+ ROOM__), NOT by branch/customer, so they're
 * absent from branch / customer-only backup scopes → a restore brings back live
 * appts with NO atomic double-booking guard. The restore executors map this over
 * the restored appts to re-create the slot docs. Pure (no Firestore). Returns []
 * for a cancelled / doctor-less / time-less / id-less appt. The doc shape mirrors
 * the reserve path EXACTLY so the guard reads them identically (cancelled:false).
 * @param {Object} appt — a restored be_appointments doc (carries id/appointmentId,
 *        date, doctorId, roomId, startTime, endTime, status).
 * @param {{takenAt?: string}} [opts] — caller supplies the timestamp (keeps pure).
 * @returns {Array<{key: string, doc: Object}>}
 */
export function computeAppointmentSlotDocs(appt, { takenAt = '' } = {}) {
  if (!appt || appt.status === 'cancelled') return [];
  const apptId = String(appt.id || appt.appointmentId || appt.docId || '');
  if (!apptId) return [];
  const keys = buildAppointmentGuardKeys({
    date: appt.date, doctorId: appt.doctorId, roomId: appt.roomId,
    startTime: appt.startTime, endTime: appt.endTime,
  });
  return keys.map((k) => ({
    key: k,
    doc: {
      slotId: k, appointmentId: apptId, date: appt.date || '', doctorId: String(appt.doctorId || ''),
      startTime: appt.startTime || '', endTime: appt.endTime || appt.startTime || '',
      cancelled: false, takenAt,
    },
  }));
}
