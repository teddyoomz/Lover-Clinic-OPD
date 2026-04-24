// ─── Staff Schedule validation — Phase 13.2.1 pure helpers ────────────────
// Triangle (Rule F, 2026-04-20): detailed-adminscheduleemployee.json +
// detailed-adminscheduledoctor.json captured 5+ forms. ProClinic splits into
// /admin/schedule/employee + /admin/schedule/doctor + /admin/schedule/holiday
// but the underlying shape is the same (staff + date + start/end time + type).
//
// We collapse into ONE `be_staff_schedules` collection with a `type` enum
// covering work / halfday / holiday / leave / sick. Doctor schedules and
// employee schedules share this collection — role distinction lives on the
// referenced be_staff/be_doctors doc, not on the schedule entry.
//
// Rule E: OUR data in Firestore. Rule H: never written back to ProClinic.
//
// Invariants (strict mode):
//   SS-1 staffId required
//   SS-2 date required + YYYY-MM-DD
//   SS-3 type in TYPE_OPTIONS
//   SS-4 type='work' or type='halfday' requires startTime + endTime (HH:MM)
//   SS-5 endTime > startTime when both present
//   SS-6 id format matches STFSCH-{MMYY}-{8hex} when present
//   SS-7 startTime/endTime must be valid HH:MM (00-23 hours, 00-59 minutes)

export const TYPE_OPTIONS = Object.freeze(['work', 'halfday', 'holiday', 'leave', 'sick']);
export const TYPE_LABEL = Object.freeze({
  work:    'ทำงาน',
  halfday: 'ครึ่งวัน',
  holiday: 'วันหยุด',
  leave:   'ลา',
  sick:    'ลาป่วย',
});

// Canonical 30-min time slot list — matches ProClinic dropdown (08:30-22:00).
export const TIME_SLOTS = Object.freeze((() => {
  const slots = [];
  for (let h = 8; h <= 22; h++) {
    for (const m of [0, 30]) {
      if (h === 8 && m === 0) continue; // start at 08:30
      if (h === 22 && m === 30) continue; // end at 22:00
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

  const date = trim(form.date);
  if (!date) return ['date', 'ต้องระบุ date'];
  if (!DATE_ISO_RE.test(date)) return ['date', 'date ต้องเป็น YYYY-MM-DD'];

  const type = form.type ?? 'work';
  if (!TYPE_OPTIONS.includes(type)) return ['type', 'type ไม่ถูกต้อง'];

  // SS-4 + SS-7: time fields when type needs them
  if (type === 'work' || type === 'halfday') {
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
  out.date = trim(out.date);
  const rawType = out.type ?? 'work';
  out.type = TYPE_OPTIONS.includes(rawType) ? rawType : 'work';
  // Non-work types have no time — scrub to keep schema lean.
  if (out.type === 'work' || out.type === 'halfday') {
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
 * Given a candidate appointment window + staff's schedule entries for the
 * same date, return a result describing whether the staff member is
 * available. Pure (no Firestore reads).
 *
 * @param {string} staffId
 * @param {string} date  - YYYY-MM-DD
 * @param {string} aptStart - HH:MM
 * @param {string} aptEnd - HH:MM
 * @param {Array<{staffId, date, type, startTime, endTime}>} scheduleEntries
 * @returns {{ available: boolean, reason: string, entry: object|null }}
 */
export function checkAppointmentCollision(staffId, date, aptStart, aptEnd, scheduleEntries) {
  const entries = (scheduleEntries || []).filter((e) =>
    String(e.staffId) === String(staffId) && e.date === date,
  );
  if (entries.length === 0) {
    // No schedule entry for the day → assume available (legacy behaviour).
    return { available: true, reason: 'ไม่มีตารางงานบันทึก', entry: null };
  }
  const aptStartMin = toMinutes(aptStart);
  const aptEndMin = toMinutes(aptEnd);
  if (!Number.isFinite(aptStartMin) || !Number.isFinite(aptEndMin)) {
    return { available: false, reason: 'เวลานัดไม่ถูกต้อง', entry: null };
  }
  for (const e of entries) {
    if (e.type === 'holiday') {
      return { available: false, reason: 'วันหยุด', entry: e };
    }
    if (e.type === 'leave') {
      return { available: false, reason: 'ลา', entry: e };
    }
    if (e.type === 'sick') {
      return { available: false, reason: 'ลาป่วย', entry: e };
    }
    if (e.type === 'work' || e.type === 'halfday') {
      const sMin = toMinutes(e.startTime);
      const eMin = toMinutes(e.endTime);
      if (!Number.isFinite(sMin) || !Number.isFinite(eMin)) continue;
      // Appointment must fit entirely within the working window.
      if (aptStartMin >= sMin && aptEndMin <= eMin) {
        return { available: true, reason: TYPE_LABEL[e.type] || e.type, entry: e };
      }
    }
  }
  return { available: false, reason: 'นอกเวลาทำงาน', entry: entries[0] || null };
}
