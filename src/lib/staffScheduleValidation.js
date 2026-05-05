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
