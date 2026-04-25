// ─── Medical Instrument validation — Phase 11.4 pure helpers ──────────────
// Triangle (Rule F, 2026-04-20): `opd.js forms /admin/medical-instrument`
// captured: medical_instrument_name (required) + medical_instrument_code
// (optional) + cost_price (number ≥ 0) + purchase_date (flatpickr) +
// maintenance_interval_months (number ≥ 0) + next_maintenance_date (flatpickr).
//
// We extend with `status`, `note`, and `maintenanceLog[]` for OUR clinic-use
// workflow (log of past service events per instrument).

import { thaiTodayISO } from '../utils.js';

export const STATUS_OPTIONS = Object.freeze(['ใช้งาน', 'พักใช้งาน', 'ซ่อมบำรุง']);

export const NAME_MAX_LENGTH = 120;
export const CODE_MAX_LENGTH = 40;
export const MAX_LOG_ENTRIES = 50;           // cap to keep doc < 1MB

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;   // YYYY-MM-DD — matches DateField output

/**
 * Validate a medical-instrument form. `null` = pass, `[field, msg]` = fail.
 * Optional fields are accepted when missing/empty; only `name` is required.
 */
export function validateMedicalInstrument(form) {
  if (!form || typeof form !== 'object' || Array.isArray(form)) {
    return ['form', 'missing form'];
  }

  // name — required
  if (typeof form.name !== 'string') {
    return ['name', 'กรุณากรอกชื่อเครื่องหัตถการ'];
  }
  const nm = form.name.trim();
  if (!nm) return ['name', 'กรุณากรอกชื่อเครื่องหัตถการ'];
  if (nm.length > NAME_MAX_LENGTH) {
    return ['name', `ชื่อเครื่องต้องไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`];
  }

  // code — optional
  if (form.code != null && form.code !== '') {
    if (typeof form.code !== 'string') return ['code', 'รหัสเครื่องต้องเป็นข้อความ'];
    if (form.code.trim().length > CODE_MAX_LENGTH) {
      return ['code', `รหัสเครื่องต้องไม่เกิน ${CODE_MAX_LENGTH} ตัวอักษร`];
    }
  }

  // costPrice — optional number ≥ 0
  if (form.costPrice != null && form.costPrice !== '') {
    const cp = Number(form.costPrice);
    if (!Number.isFinite(cp) || cp < 0) {
      return ['costPrice', 'ราคาทุนต้องเป็นตัวเลข ≥ 0'];
    }
  }

  // purchaseDate — optional YYYY-MM-DD
  if (form.purchaseDate) {
    if (!ISO_DATE_RE.test(String(form.purchaseDate))) {
      return ['purchaseDate', 'วันที่ซื้อไม่ถูกต้อง (รูปแบบ YYYY-MM-DD)'];
    }
  }

  // maintenanceIntervalMonths — optional integer ≥ 0
  if (form.maintenanceIntervalMonths != null && form.maintenanceIntervalMonths !== '') {
    const m = Number(form.maintenanceIntervalMonths);
    if (!Number.isFinite(m) || !Number.isInteger(m) || m < 0) {
      return ['maintenanceIntervalMonths', 'ระยะเวลาซ่อมบำรุงต้องเป็นจำนวนเต็ม ≥ 0'];
    }
  }

  // nextMaintenanceDate — optional YYYY-MM-DD
  if (form.nextMaintenanceDate) {
    if (!ISO_DATE_RE.test(String(form.nextMaintenanceDate))) {
      return ['nextMaintenanceDate', 'วันที่นัดซ่อมบำรุงไม่ถูกต้อง'];
    }
    // If purchaseDate also present, nextMaintenanceDate must be >= purchaseDate
    if (form.purchaseDate && String(form.nextMaintenanceDate) < String(form.purchaseDate)) {
      return ['nextMaintenanceDate', 'วันนัดซ่อมต้องไม่มาก่อนวันที่ซื้อ'];
    }
  }

  // status — enum if present
  if (form.status != null && !STATUS_OPTIONS.includes(form.status)) {
    return ['status', 'สถานะไม่ถูกต้อง'];
  }

  // maintenanceLog — array if present; per-entry shape-check
  if (form.maintenanceLog != null) {
    if (!Array.isArray(form.maintenanceLog)) {
      return ['maintenanceLog', 'maintenanceLog ต้องเป็น array'];
    }
    if (form.maintenanceLog.length > MAX_LOG_ENTRIES) {
      return ['maintenanceLog', `ประวัติเกิน ${MAX_LOG_ENTRIES} รายการ`];
    }
    for (let i = 0; i < form.maintenanceLog.length; i++) {
      const e = form.maintenanceLog[i];
      if (!e || typeof e !== 'object' || Array.isArray(e)) {
        return [`maintenanceLog.${i}`, `แถวประวัติที่ ${i + 1} ไม่ถูกต้อง`];
      }
      if (!e.date || !ISO_DATE_RE.test(String(e.date))) {
        return [`maintenanceLog.${i}.date`, `แถว ${i + 1}: กรุณาเลือกวันที่`];
      }
      if (e.cost != null && e.cost !== '') {
        const c = Number(e.cost);
        if (!Number.isFinite(c) || c < 0) {
          return [`maintenanceLog.${i}.cost`, `แถว ${i + 1}: ค่าใช้จ่ายต้อง ≥ 0`];
        }
      }
      // note / performedBy — optional strings; bail if non-string when present
      if (e.note != null && typeof e.note !== 'string') return [`maintenanceLog.${i}.note`, 'บันทึกต้องเป็นข้อความ'];
      if (e.performedBy != null && typeof e.performedBy !== 'string') return [`maintenanceLog.${i}.performedBy`, 'ผู้ดำเนินการต้องเป็นข้อความ'];
    }
  }

  return null;
}

/**
 * Starting blank form — matches the UI's field order.
 */
export function emptyMedicalInstrumentForm() {
  return {
    name: '',
    code: '',
    costPrice: '',
    purchaseDate: '',
    maintenanceIntervalMonths: '',
    nextMaintenanceDate: '',
    maintenanceLog: [],
    status: 'ใช้งาน',
    note: '',
  };
}

/**
 * Normalize for persistence: trims strings, coerces numbers, defaults
 * status + array, drops empty maintenanceLog entries.
 */
export function normalizeMedicalInstrument(form) {
  const coerceNumber = (v) => (v === '' || v == null) ? null : Number(v);
  const trimOrEmpty = (v) => typeof v === 'string' ? v.trim() : '';

  const log = Array.isArray(form.maintenanceLog) ? form.maintenanceLog : [];
  return {
    ...form,
    name: trimOrEmpty(form.name),
    code: trimOrEmpty(form.code),
    costPrice: coerceNumber(form.costPrice),
    purchaseDate: form.purchaseDate || '',
    maintenanceIntervalMonths: coerceNumber(form.maintenanceIntervalMonths),
    nextMaintenanceDate: form.nextMaintenanceDate || '',
    maintenanceLog: log
      .filter(e => e && e.date)
      .map(e => ({
        date: e.date,
        cost: coerceNumber(e.cost),
        note: trimOrEmpty(e.note),
        performedBy: trimOrEmpty(e.performedBy),
      })),
    status: form.status || 'ใช้งาน',
    note: trimOrEmpty(form.note),
  };
}

/**
 * Compute days until next maintenance. Returns null if no nextMaintenanceDate.
 * Negative = overdue.
 */
export function daysUntilMaintenance(nextMaintenanceDate, today) {
  if (!nextMaintenanceDate || !ISO_DATE_RE.test(String(nextMaintenanceDate))) return null;
  // Audit P2 (2026-04-26 TZ1 medium): default fallback uses Bangkok TZ
  // helper instead of UTC `.toISOString().slice(0,10)` so a Bangkok admin
  // viewing the maintenance list at 02:00 doesn't see "due tomorrow"
  // become "due today" purely from the UTC date roll-over.
  const t = today || thaiTodayISO();
  // Treat both as UTC-midnight; difference in calendar days is accurate within
  // same TZ assumption (backend uses admin's local — per rule we'd use
  // thaiTodayISO at the caller site; the helper itself is pure).
  const dueMs = new Date(nextMaintenanceDate + 'T00:00:00Z').getTime();
  const nowMs = new Date(t + 'T00:00:00Z').getTime();
  return Math.round((dueMs - nowMs) / 86400000);
}
