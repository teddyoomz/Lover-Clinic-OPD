// ─── Holiday validation — Phase 11.5 pure helpers ─────────────────────────
// Triangle (Rule F, 2026-04-20): ProClinic form `/admin/holiday` captures
// `holiday_date` (multi-date flatpickr) + `holiday_note`. Weekly closure is
// a separate table in the UI (day-of-week toggle) — we unify both into one
// collection via a `type` discriminator.
//
// Two types:
//   - `specific` — 1+ calendar dates (e.g. สงกรานต์ 2026-04-13..16)
//   - `weekly`   — a day-of-week closure (0=Sun .. 6=Sat)
//
// isDateHoliday() is the pure decider consumed by AppointmentTab +
// scheduleFilterUtils (wiring lands in 11.8).

export const HOLIDAY_TYPES = Object.freeze(['specific', 'weekly']);
export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน']);
export const NOTE_MAX_LENGTH = 200;
export const MAX_SPECIFIC_DATES = 60;         // e.g. full year of rare 1-day holidays
export const DAY_OF_WEEK_LABELS = Object.freeze([
  'อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateHoliday(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }
  if (!HOLIDAY_TYPES.includes(form.type)) {
    return ['type', 'ประเภทวันหยุดไม่ถูกต้อง'];
  }

  if (form.type === 'specific') {
    if (!Array.isArray(form.dates) || form.dates.length === 0) {
      return ['dates', 'กรุณาเลือกวันที่อย่างน้อย 1 วัน'];
    }
    if (form.dates.length > MAX_SPECIFIC_DATES) {
      return ['dates', `เลือกวันหยุดเกิน ${MAX_SPECIFIC_DATES} วัน — แบ่งเป็นหลายรายการ`];
    }
    const seen = new Set();
    for (let i = 0; i < form.dates.length; i++) {
      const d = form.dates[i];
      if (!ISO_DATE_RE.test(String(d))) {
        return [`dates.${i}`, `วันที่แถว ${i + 1} ไม่ถูกต้อง (YYYY-MM-DD)`];
      }
      if (seen.has(d)) {
        return [`dates.${i}`, `วันที่ ${d} ซ้ำในรายการ`];
      }
      seen.add(d);
    }
  }

  if (form.type === 'weekly') {
    const dow = Number(form.dayOfWeek);
    if (!Number.isFinite(dow) || !Number.isInteger(dow) || dow < 0 || dow > 6) {
      return ['dayOfWeek', 'เลือกวันในสัปดาห์ (0-6)'];
    }
  }

  if (form.note != null && form.note !== '') {
    if (typeof form.note !== 'string') return ['note', 'note ต้องเป็นข้อความ'];
    if (form.note.length > NOTE_MAX_LENGTH) {
      return ['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`];
    }
  }

  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  return null;
}

export function emptyHolidayForm(type = 'specific') {
  return {
    type,
    dates: [],            // used when type === 'specific'
    dayOfWeek: 0,         // used when type === 'weekly' — 0=อาทิตย์
    note: '',
    status: 'ใช้งาน',
  };
}

export function normalizeHoliday(form) {
  const out = {
    ...form,
    type: HOLIDAY_TYPES.includes(form.type) ? form.type : 'specific',
    note: typeof form.note === 'string' ? form.note.trim() : '',
    status: form.status || 'ใช้งาน',
  };
  if (out.type === 'specific') {
    // Deduplicate + sort ascending for predictable display/storage.
    const set = new Set((form.dates || []).filter(d => ISO_DATE_RE.test(String(d))));
    out.dates = Array.from(set).sort();
    delete out.dayOfWeek;
  } else {
    out.dayOfWeek = Math.max(0, Math.min(6, Number(form.dayOfWeek) || 0));
    delete out.dates;
  }
  return out;
}

/**
 * Is the given YYYY-MM-DD a holiday? Returns the FIRST matching holiday
 * record (or null). Skips `status: "พักใช้งาน"` holidays. Pure — inputs
 * list comes from listHolidays() or an in-memory cache.
 *
 * Day-of-week extraction uses UTC to avoid the browser-TZ drift at
 * 00:00-06:59 GMT+7 (same hazard as thaiTodayISO elsewhere).
 */
export function isDateHoliday(dateStr, holidays) {
  if (!dateStr || !ISO_DATE_RE.test(String(dateStr))) return null;
  if (!Array.isArray(holidays) || holidays.length === 0) return null;

  const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();

  for (const h of holidays) {
    if (!h || (h.status && h.status !== 'ใช้งาน')) continue;
    if (h.type === 'specific' && Array.isArray(h.dates)) {
      if (h.dates.includes(dateStr)) return h;
    } else if (h.type === 'weekly') {
      if (Number(h.dayOfWeek) === dow) return h;
    }
  }
  return null;
}
