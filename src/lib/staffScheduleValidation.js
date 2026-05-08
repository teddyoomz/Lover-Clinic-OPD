// ─── Staff Schedule validation — Phase 13.2.1 pure helpers ────────────────
// Triangle (Rule F, 2026-04-20 + 2026-04-26): captured both
// /admin/schedule/{doctor,employee} pages — both use month-calendar layout
// with per-staff right sidebar. Three distinct entry kinds:
//   1. งานประจำสัปดาห์  — RECURRING weekly shifts (Mon-Sun × time range)
//   2. งานรายวัน        — per-DATE override (cancels recurring for that date)
//   3. วันลา            — leave dates (block working)
//
// All three persist into ONE `be_staff_schedules` collection. Doctor +
// employee schedules share this collection — role distinction lives on the
// referenced be_staff/be_doctors doc, not on the schedule entry.
//
// Rule E: OUR data in Firestore. Rule H: never written back to ProClinic.
//
// Invariants (strict mode):
//   SS-1 staffId required
//   SS-2 date required + YYYY-MM-DD (per-date entries only — NOT recurring)
//   SS-3 type in TYPE_OPTIONS
//   SS-4 type='work'|'halfday'|'recurring' requires startTime + endTime (HH:MM)
//   SS-5 endTime > startTime when both present
//   SS-6 id format matches STFSCH-{MMYY}-{8hex} when present
//   SS-7 startTime/endTime must be valid HH:MM (00-23 hours, 00-59 minutes)
//   SS-8 type='recurring' → dayOfWeek required (0..6, 0=Sunday); date forbidden
//   SS-9 type !== 'recurring' → date required; dayOfWeek forbidden (mutually exclusive)

// 'recurring' added 2026-04-26 Phase 13.2.6 for ProClinic-fidelity weekly-shift model.
export const TYPE_OPTIONS = Object.freeze(['recurring', 'work', 'halfday', 'holiday', 'leave', 'sick']);
export const TYPE_LABEL = Object.freeze({
  recurring: 'ประจำสัปดาห์',
  work:      'ทำงาน',
  halfday:   'ครึ่งวัน',
  holiday:   'วันหยุด',
  leave:     'ลา',
  sick:      'ลาป่วย',
});

// dayOfWeek labels — JS Date.getDay() convention: 0=Sun..6=Sat.
export const DAY_OF_WEEK_LABEL = Object.freeze({
  0: 'อาทิตย์',
  1: 'จันทร์',
  2: 'อังคาร',
  3: 'พุธ',
  4: 'พฤหัสบดี',
  5: 'ศุกร์',
  6: 'เสาร์',
});

// Types that imply "working" hours (require start+end).
const WORKING_TIME_TYPES = new Set(['recurring', 'work', 'halfday']);
// Types that need start/end times when used per-date (excludes recurring which uses dayOfWeek).
const PER_DATE_WORK_TYPES = new Set(['work', 'halfday']);

// Phase 19.0 (2026-05-06) — canonical 15-min time slot list
// (08:15-22:00). Was 30-min (08:30-22:00, 28 entries) prior to Phase 19.0.
// Now 56 entries. Aligned with backendClient.SLOT_INTERVAL_MIN = 15
// (AP1-bis schema-based reservation). Imported by AppointmentTab,
// AppointmentFormModal, DepositPanel, ScheduleEntryFormModal — replacing
// 3 prior local copies (Rule of 3 collapse).
export const SLOT_INTERVAL_MIN_DISPLAY = 15;
export const TIME_SLOTS = Object.freeze((() => {
  const slots = [];
  for (let h = 8; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 8 && m === 0) continue; // start at 08:15
      if (h === 22 && (m === 15 || m === 30 || m === 45)) continue; // end at 22:00
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})());

const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SCHEDULE_ID_RE = /^STFSCH-\d{4}-[0-9a-f]{8}$/;

function trim(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function toMinutes(hhmm) {
  if (typeof hhmm !== 'string' || !TIME_HHMM_RE.test(hhmm)) return NaN;
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return h * 60 + m;
}

export function validateStaffScheduleStrict(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  const staffId = trim(form.staffId ?? form.staff_id);
  if (!staffId) return ['staffId', 'ต้องระบุ staffId'];

  const type = form.type ?? 'work';
  if (!TYPE_OPTIONS.includes(type)) return ['type', 'type ไม่ถูกต้อง'];

  // SS-8 + SS-9: recurring vs per-date are MUTUALLY EXCLUSIVE shapes.
  // recurring → uses dayOfWeek (0..6), no date
  // everything else → uses date (YYYY-MM-DD), no dayOfWeek
  if (type === 'recurring') {
    const dow = form.dayOfWeek;
    const dowNum = typeof dow === 'string' ? parseInt(dow, 10) : dow;
    if (!Number.isInteger(dowNum) || dowNum < 0 || dowNum > 6) {
      return ['dayOfWeek', 'dayOfWeek ต้องเป็นเลข 0-6 (0=อาทิตย์, 6=เสาร์)'];
    }
    if (form.date != null && trim(form.date)) {
      return ['date', 'recurring entry ห้ามมี date (ใช้ dayOfWeek แทน)'];
    }
  } else {
    // Per-date types must have date; dayOfWeek is forbidden.
    const date = trim(form.date);
    if (!date) return ['date', 'ต้องระบุ date'];
    if (!DATE_ISO_RE.test(date)) return ['date', 'date ต้องเป็น YYYY-MM-DD'];
    if (form.dayOfWeek != null && form.dayOfWeek !== '') {
      return ['dayOfWeek', 'per-date entry ห้ามมี dayOfWeek (ใช้ date แทน)'];
    }
  }

  // SS-4 + SS-7: time fields required for working types (recurring, work, halfday).
  if (WORKING_TIME_TYPES.has(type)) {
    const startTime = trim(form.startTime ?? form.start_time);
    const endTime = trim(form.endTime ?? form.end_time);
    if (!startTime) return ['startTime', 'ต้องระบุเวลาเริ่ม'];
    if (!endTime) return ['endTime', 'ต้องระบุเวลาสิ้นสุด'];
    if (!TIME_HHMM_RE.test(startTime)) return ['startTime', 'รูปแบบเวลาไม่ถูกต้อง (HH:MM)'];
    if (!TIME_HHMM_RE.test(endTime)) return ['endTime', 'รูปแบบเวลาไม่ถูกต้อง (HH:MM)'];
    // SS-5
    if (toMinutes(endTime) <= toMinutes(startTime)) {
      return ['endTime', 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม'];
    }
  }

  // SS-6: id format when present
  const id = trim(form.id);
  if (id && !SCHEDULE_ID_RE.test(id)) {
    return ['id', 'id ต้องเป็น STFSCH-MMYY-8hex'];
  }

  // V56 / BS-15 (2026-05-08) — SS-10 doctor + working type requires
  // non-empty roomIds[]. SS-11 assistant entries forbid roomIds field.
  // staffKind is a caller-provided pure-validator parameter (NOT stored
  // on the doc) — DoctorSchedulesTab passes 'doctor', EmployeeSchedulesTab
  // passes 'assistant'. Absent staffKind → backward-compat (SS-10/SS-11
  // not enforced) so legacy callers continue working.
  //
  // SS-11 rejects ANY non-null roomIds value including []. Empty array
  // is NOT a valid "no rooms" signal for assistants — the field must be
  // absent. Defensive form initialization to [] on assistant entries is
  // a bug; the modal save handler must strip the field entirely (see
  // ScheduleEntryFormModal handleSubmit, Task 2).
  if (form.staffKind === 'doctor' && WORKING_TIME_TYPES.has(type)) {
    const rooms = form.roomIds;
    const valid =
      Array.isArray(rooms) && rooms.length >= 1 && rooms.every((r) => typeof r === 'string' && r.length > 0);
    if (!valid) return ['roomIds', 'ต้องเลือกห้องอย่างน้อย 1 ห้อง'];
  }
  if (form.staffKind === 'assistant' && form.roomIds != null) {
    return ['roomIds', 'ผู้ช่วยไม่ต้องเลือกห้อง'];
  }

  return null;
}

export function emptyStaffScheduleForm() {
  return {
    id: '',
    staffId: '',
    staffName: '',
    date: '',
    dayOfWeek: null,    // 0..6 for type='recurring'; null for per-date
    type: 'work',
    startTime: '',
    endTime: '',
    note: '',
    createdBy: '',
    branchId: '',
  };
}

/**
 * V56 / BS-15 (2026-05-08) — IMPORTANT: this function MUST preserve
 * `staffKind` (validation-only pure-parameter passed through to
 * validateStaffScheduleStrict for SS-10/SS-11) AND `roomIds` (V56 schema
 * field on doctor entries). Future whitelist-style refactors that drop
 * unknown fields would silently disable SS-10/SS-11 enforcement — DO NOT
 * strip these two fields.
 */
export function normalizeStaffSchedule(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) return form;
  const out = { ...form };
  out.id = trim(out.id);
  out.staffId = trim(out.staffId ?? out.staff_id);
  out.staffName = trim(out.staffName ?? out.staff_name);
  const rawType = out.type ?? 'work';
  out.type = TYPE_OPTIONS.includes(rawType) ? rawType : 'work';

  // SS-8 + SS-9: shape per type
  if (out.type === 'recurring') {
    // recurring uses dayOfWeek (0..6), NO date
    const rawDow = out.dayOfWeek ?? out.day_of_week;
    const dow = typeof rawDow === 'string' ? parseInt(rawDow, 10) : rawDow;
    out.dayOfWeek = (Number.isInteger(dow) && dow >= 0 && dow <= 6) ? dow : null;
    out.date = '';   // forbidden on recurring
  } else {
    // per-date types use date, NO dayOfWeek
    out.date = trim(out.date);
    out.dayOfWeek = null;
  }

  // Non-working types have no time — scrub to keep schema lean.
  if (WORKING_TIME_TYPES.has(out.type)) {
    out.startTime = trim(out.startTime ?? out.start_time);
    out.endTime = trim(out.endTime ?? out.end_time);
  } else {
    out.startTime = '';
    out.endTime = '';
  }
  out.note = trim(out.note);
  out.branchId = trim(out.branchId ?? out.branch_id);
  out.createdBy = trim(out.createdBy ?? out.created_by);
  return out;
}

// Compute JS dayOfWeek (0=Sun..6=Sat) for a YYYY-MM-DD date string. UTC-based
// so Thai timezone offset doesn't shift the day. Returns NaN for invalid input.
export function dayOfWeekFromDate(dateStr) {
  if (typeof dateStr !== 'string' || !DATE_ISO_RE.test(dateStr)) return NaN;
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  // Use Date.UTC to avoid local-timezone DST/offset bugs (V14-style trap).
  const ts = Date.UTC(y, m - 1, d);
  if (Number.isNaN(ts)) return NaN;
  return new Date(ts).getUTCDay();
}

/**
 * Phase 13.2.6 — merge per-date overrides + recurring weekly shifts into the
 * effective schedule for a single date. Per-date entries WIN over recurring
 * (matches ProClinic's งานรายวัน/วันลา > งานประจำสัปดาห์ semantics).
 *
 * Pure helper — accepts pre-fetched entries; no Firestore reads. Tests +
 * production listenToScheduleByDay both use this.
 *
 * @param {string} targetDate - YYYY-MM-DD
 * @param {Array<{staffId, type, date?, dayOfWeek?, startTime, endTime, ...}>} entries
 * @param {Array<string>} [staffIdsFilter] - optional whitelist
 * @returns {Array<{staffId, type, source: 'override'|'recurring', startTime, endTime, ...}>}
 */
export function mergeSchedulesForDate(targetDate, entries, staffIdsFilter) {
  if (!targetDate || !DATE_ISO_RE.test(targetDate)) {
    throw new Error('mergeSchedulesForDate: targetDate must be YYYY-MM-DD');
  }
  const dow = dayOfWeekFromDate(targetDate);
  const filterSet = staffIdsFilter && staffIdsFilter.length > 0
    ? new Set(staffIdsFilter.map(String))
    : null;

  // Group matching entries by staffId
  const byStaff = new Map();
  for (const e of entries || []) {
    if (!e || !e.staffId) continue;
    const sid = String(e.staffId);
    if (filterSet && !filterSet.has(sid)) continue;

    const isOverride = e.date === targetDate && e.type !== 'recurring';
    const isRecurringMatch = e.type === 'recurring' && Number(e.dayOfWeek) === dow;
    if (!isOverride && !isRecurringMatch) continue;

    if (!byStaff.has(sid)) byStaff.set(sid, []);
    byStaff.get(sid).push({ ...e, _source: isOverride ? 'override' : 'recurring' });
  }

  // Per staff: per-date override wins; otherwise return all recurring entries
  // (a staff CAN have multiple recurring entries on the same dayOfWeek — e.g.
  // morning + evening shifts; ProClinic supports this and we display both).
  const result = [];
  for (const [, list] of byStaff) {
    const overrides = list.filter((e) => e._source === 'override');
    if (overrides.length > 0) {
      // Override wins; we keep ALL overrides for that date (could be multiple
      // entries like leave + holiday — caller decides priority).
      for (const o of overrides) result.push({ ...o, source: 'override' });
    } else {
      // All recurring entries for this dayOfWeek
      for (const r of list) result.push({ ...r, source: 'recurring' });
    }
  }
  return result;
}

/**
 * V56 / BS-15 (2026-05-08) — resolve a schedule entry's effective room ids
 * for display purposes (TodaysDoctorsPanel chips). Pure helper.
 *
 * - Doctor entry with non-empty roomIds → filter to ids present in
 *   branchExamRooms (silent stale-skip) → return that filtered list.
 * - Legacy entry (no roomIds) OR assistant entry → return all branch
 *   doctor-kind room ids (the "ทุกห้อง" semantic).
 *
 * @param {{roomIds?: string[]}} entry
 * @param {Array<{id: string, kind: string}>} branchExamRooms
 * @returns {string[]} resolved room ids
 */
export function expandRoomIdsForDisplay(entry, branchExamRooms) {
  const branchRooms = Array.isArray(branchExamRooms) ? branchExamRooms : [];
  // V57 / AV30 — defensive default `kind ?? 'doctor'` so legacy
  // be_exam_rooms entries (Phase 18.0 pre-V57 schema gap) are treated as
  // doctor-rooms. V57 backfill stamps `kind: 'doctor'` on existing rooms;
  // this guard keeps consumers working before/during/after migration.
  const doctorRooms = branchRooms.filter((r) => r && (r.kind ?? 'doctor') === 'doctor');
  const allDoctorIds = doctorRooms.map((r) => String(r.id));
  if (!entry || !Array.isArray(entry.roomIds) || entry.roomIds.length === 0) {
    return allDoctorIds;
  }
  const allowed = new Set(allDoctorIds);
  return entry.roomIds.filter((rid) => allowed.has(String(rid))).map(String);
}

/**
 * V56 / BS-15 (2026-05-08) — derive auto-closure dates for V55 schedule
 * link generation. For each date in datesISO, resolves the picked
 * doctor's effective schedule entry (recurring + per-date override) and
 * checks whether picked roomId is in entry.roomIds. If NOT licensed,
 * the date is added to the auto-closure result.
 *
 * Legacy entries (no roomIds) → not closed (preserves pre-V56 behavior).
 * If doctor has no entry on a date (no shift) → not closed by THIS rule
 * (V55's existing closure mechanisms handle "no shift" separately).
 *
 * @param {object} opts
 * @param {string|null|undefined} opts.doctorId
 * @param {string|null|undefined} opts.roomId
 * @param {Array<{staffId: string, type: string, dayOfWeek?: number, date?: string, startTime?: string, endTime?: string, roomIds?: string[]}>} opts.allEntries — all be_staff_schedules entries for the
 *   branch (recurring + per-date mixed). Pass listStaffSchedules() output.
 * @param {string[]} opts.datesISO — array of YYYY-MM-DD strings
 * @returns {string[]} sorted, deduplicated date strings to auto-close
 */
export function derivedAutoClosedDates({ doctorId, roomId, allEntries, datesISO }) {
  if (!doctorId || !roomId || !Array.isArray(allEntries) || !Array.isArray(datesISO)) {
    return [];
  }
  const closed = new Set();
  for (const dateISO of datesISO) {
    if (typeof dateISO !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) continue;
    const merged = mergeSchedulesForDate(dateISO, allEntries, [String(doctorId)]);
    const entry = merged.find((m) => String(m.staffId) === String(doctorId));
    if (!entry) continue; // no shift → V55 handles separately
    if (!Array.isArray(entry.roomIds) || entry.roomIds.length === 0) continue; // legacy → not closed
    // V56 / BS-15 — Set lookup beats .map(String).includes() in the
    // per-date loop (O(1) vs O(roomIds.length)).
    const roomSet = new Set(entry.roomIds.map(String));
    if (!roomSet.has(String(roomId))) {
      closed.add(dateISO);
    }
  }
  return [...closed].sort();
}

/**
 * V60 (2026-05-08) — derive a doctor's working days for a months-window
 * from their `be_staff_schedules` entries. The CANONICAL "when does the
 * doctor work" source for V55 schedule-link generation. Pure helper —
 * accepts pre-fetched entries, no Firestore reads.
 *
 * Mirror of `derivedAutoClosedDates` shape (V56 / BS-15) but for the
 * positive-side: it returns dates where the doctor HAS a working entry
 * (recurring weekly OR per-date `work`/`halfday`). Excludes leave / holiday
 * / sick (those should NOT show as "หมอเข้า" on customer-facing links).
 *
 * Designed to replace `[...schedDoctorDays]` (admin's manual paint Set
 * from `clinic_settings/schedule_prefs__{branch}`) as the canonical
 * source when admin has selected a specific doctor in the schedule-link
 * modal. The legacy manual paint stays available as an admin override
 * UNION layer (admin can still ADD ad-hoc doctor days beyond the schedule).
 *
 * Class-of-bug closed: V12 multi-reader-sweep at the schedule-link save
 * boundary — V56/BS-15 introduced canonical source for room auto-closure
 * but `doctorDays` save kept reading from legacy admin-state-only Set.
 *
 * @param {object} opts
 * @param {string|null|undefined} opts.doctorId
 * @param {Array<{staffId: string, type: string, dayOfWeek?: number, date?: string, startTime?: string, endTime?: string}>} opts.allEntries — be_staff_schedules entries (recurring + per-date mixed)
 * @param {string[]} opts.datesISO — array of YYYY-MM-DD strings (the months window)
 * @returns {string[]} sorted, deduplicated date strings where doctor has a working entry
 */
export function derivedDoctorDaysFromSchedules({ doctorId, allEntries, datesISO }) {
  if (!doctorId || !Array.isArray(allEntries) || !Array.isArray(datesISO)) {
    return [];
  }
  const result = new Set();
  for (const dateISO of datesISO) {
    if (typeof dateISO !== 'string' || !DATE_ISO_RE.test(dateISO)) continue;
    const merged = mergeSchedulesForDate(dateISO, allEntries, [String(doctorId)]);
    // Per-date override wins via mergeSchedulesForDate semantics. We only
    // count the date as a "doctor day" when the EFFECTIVE entry is a
    // working type (recurring / work / halfday). leave / holiday / sick
    // explicitly EXCLUDE the date even if a recurring shift exists for
    // that dayOfWeek — the override correctly cancels the recurring.
    const entry = merged.find((m) => String(m.staffId) === String(doctorId));
    if (!entry) continue;
    if (!WORKING_TIME_TYPES.has(entry.type)) continue;
    result.add(dateISO);
  }
  return [...result].sort();
}

/**
 * V61 / AV33 (2026-05-08) — derive the union of room IDs touched by
 * working entries across a date window. Used by the schedule-link modal
 * (`AdminDashboard.jsx handleGenScheduleLink`) to populate the room
 * dropdown based on REAL schedule data — NOT `be_exam_rooms.kind` static
 * filter (V57).
 *
 * Q1=B refined (user 2026-05-08): "แพทย์ทุกคน" + window → union of ALL
 * doctors' rooms in window; specific doctor + window → that doctor's
 * rooms. Customer doesn't care which doctor; cares that the room is
 * available + some doctor will be there.
 *
 * - `doctorIds = ['DOC-X']`        → only that doctor's rooms (specific)
 * - `doctorIds = ['DOC-X', 'DOC-Y']` → union of those doctors' rooms (multi-pick future-proof)
 * - `doctorIds = null/undefined`    → ALL doctors (แพทย์ทุกคน mode aggregate)
 *
 * Excludes leave/holiday/sick (off-shift; no roomIds on those types).
 * Per-date override semantics via `mergeSchedulesForDate` (per-date leave
 * cancels recurring-weekday → that date's roomIds NOT counted).
 *
 * Pure JS — testable without Firestore mocks. `allEntries` should already
 * be branch-scoped (caller's responsibility — pass branch's
 * `be_staff_schedules` query result).
 *
 * Class-of-bug closed: V12 multi-reader-sweep at the schedule-link MODAL
 * UI boundary. Sister to:
 *   - `derivedDoctorDaysFromSchedules` (V60 / AV32) — save-time doctorDays
 *   - `derivedAutoClosedDates` (V56 / BS-15) — save-time auto-closure
 *
 * @param {object} opts
 * @param {string[]|null|undefined} opts.doctorIds — null = ALL doctors aggregated
 * @param {Array<{staffId, type, dayOfWeek?, date?, roomIds?: string[]}>} opts.allEntries
 * @param {string[]} opts.datesISO — array of YYYY-MM-DD strings (months window)
 * @returns {string[]} sorted, deduped room IDs touched in window
 */
export function deriveDoctorRoomIdsForWindow({ doctorIds, allEntries, datesISO }) {
  if (!Array.isArray(allEntries) || !Array.isArray(datesISO)) return [];
  const filterIds = Array.isArray(doctorIds) && doctorIds.length > 0
    ? doctorIds.map(String)
    : null;
  const result = new Set();
  for (const dateISO of datesISO) {
    if (typeof dateISO !== 'string' || !DATE_ISO_RE.test(dateISO)) continue;
    // Pass null filter to mergeSchedulesForDate when aggregating ALL doctors
    // so per-date override semantics apply to every doctor in the entries.
    const merged = mergeSchedulesForDate(dateISO, allEntries, filterIds);
    for (const entry of merged) {
      if (!entry || !WORKING_TIME_TYPES.has(entry.type)) continue;
      if (filterIds && !filterIds.includes(String(entry.staffId))) continue;
      if (!Array.isArray(entry.roomIds)) continue;
      for (const rid of entry.roomIds) {
        if (rid != null && rid !== '') result.add(String(rid));
      }
    }
  }
  return [...result].sort();
}

/**
 * V61 / AV33 (2026-05-08) — derive room IDs in `branchExamRooms` that
 * are NOT touched by any working entry across the date window. Used by
 * the ไม่พบแพทย์ mode dropdown.
 *
 * Logic:
 *   1. Aggregate union of all `roomIds` across all working entries in
 *      window via `deriveDoctorRoomIdsForWindow({ doctorIds: null, ... })`
 *   2. Filter `branchExamRooms` (status='ใช้งาน') to those NOT in the union
 *
 * V57 `kind` field is IGNORED here — filter is schedule-DRIVEN, not
 * kind-driven. A "kind=doctor" room that no doctor enters in this window
 * appears here (correct: it IS a non-doctor room for THIS window). A
 * "kind=staff" room that some doctor uses for procedures will NOT appear
 * (correct: it IS touched by a doctor schedule).
 *
 * @param {object} opts
 * @param {Array<{id, name, status?: string}>} opts.branchExamRooms
 * @param {Array<entry>} opts.allEntries — branch-scoped be_staff_schedules
 * @param {string[]} opts.datesISO
 * @returns {string[]} sorted, deduped room IDs (subset of branchExamRooms ids)
 */
export function deriveNonDoctorRoomIdsForWindow({ branchExamRooms, allEntries, datesISO }) {
  if (!Array.isArray(branchExamRooms) || !Array.isArray(allEntries) || !Array.isArray(datesISO)) {
    return [];
  }
  const touchedRoomIds = new Set(
    deriveDoctorRoomIdsForWindow({
      doctorIds: null,
      allEntries,
      datesISO,
    }),
  );
  // Candidate set: rooms with status='ใช้งาน' (active) — schema declared in
  // examRoomValidation.js. Rooms with other status (e.g. archived) are
  // excluded from the customer-facing picker.
  const candidates = branchExamRooms.filter((r) =>
    r && r.id != null && (r.status == null || r.status === 'ใช้งาน'),
  );
  const result = new Set();
  for (const r of candidates) {
    const rid = String(r.id);
    if (!touchedRoomIds.has(rid)) result.add(rid);
  }
  return [...result].sort();
}

export function generateStaffScheduleId(nowMs = Date.now()) {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) {
    throw new Error('crypto.getRandomValues unavailable');
  }
  const thai = new Date(nowMs + 7 * 3600000);
  const mm = String(thai.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(thai.getUTCFullYear()).slice(-2);
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `STFSCH-${mm}${yy}-${hex}`;
}

/**
 * Collision check for Phase 13.2.4 AppointmentTab integration.
 * Given a candidate appointment window + staff's schedule entries (raw
 * mix of recurring + per-date), return a result describing whether the
 * staff member is available. Pure (no Firestore reads).
 *
 * Phase 13.2.6 (2026-04-26): now handles `recurring` entries via
 * mergeSchedulesForDate — per-date override wins; falls back to weekly
 * recurring pattern. ProClinic-fidelity semantics.
 *
 * @param {string} staffId
 * @param {string} date  - YYYY-MM-DD (the appointment date)
 * @param {string} aptStart - HH:MM
 * @param {string} aptEnd - HH:MM
 * @param {Array<{staffId, date?, dayOfWeek?, type, startTime, endTime}>} scheduleEntries
 * @returns {{ available: boolean, reason: string, entry: object|null, source?: string }}
 */
export function checkAppointmentCollision(staffId, date, aptStart, aptEnd, scheduleEntries) {
  // Resolve effective schedule for the date (override > recurring) for THIS staff
  const effective = mergeSchedulesForDate(date, scheduleEntries || [], [staffId]);
  if (effective.length === 0) {
    // No schedule entry resolved → assume available (legacy behaviour).
    return { available: true, reason: 'ไม่มีตารางงานบันทึก', entry: null };
  }
  const aptStartMin = toMinutes(aptStart);
  const aptEndMin = toMinutes(aptEnd);
  if (!Number.isFinite(aptStartMin) || !Number.isFinite(aptEndMin)) {
    return { available: false, reason: 'เวลานัดไม่ถูกต้อง', entry: null };
  }
  // Blocking types take priority — check first.
  for (const e of effective) {
    if (e.type === 'holiday') return { available: false, reason: 'วันหยุด', entry: e, source: e.source };
    if (e.type === 'leave')   return { available: false, reason: 'ลา',     entry: e, source: e.source };
    if (e.type === 'sick')    return { available: false, reason: 'ลาป่วย', entry: e, source: e.source };
  }
  // Working types — try to fit appointment into any working window.
  for (const e of effective) {
    if (!WORKING_TIME_TYPES.has(e.type)) continue;
    const sMin = toMinutes(e.startTime);
    const eMin = toMinutes(e.endTime);
    if (!Number.isFinite(sMin) || !Number.isFinite(eMin)) continue;
    if (aptStartMin >= sMin && aptEndMin <= eMin) {
      return { available: true, reason: TYPE_LABEL[e.type] || e.type, entry: e, source: e.source };
    }
  }
  return { available: false, reason: 'นอกเวลาทำงาน', entry: effective[0] || null, source: effective[0]?.source };
}
