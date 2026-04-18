// ─── Shared date-formatting helpers — Rule of 3 dedupe (2026-04-19) ─────────
//
// Before this module existed, 11 files duplicated ~identical fmtDate/fmtThaiDate/
// fmtDateTime functions + 7 files duplicated the THAI_MONTHS_SHORT / _FULL arrays.
// That's a classic vibe-code smell (rule 08): copy-paste rather than extract.
//
// NOTE about dropdown vs formatting arrays:
//   src/utils.js exports `THAI_MONTHS` as `[{value, label}]` for <select> options.
//   Those arrays are a DIFFERENT shape than the simple string arrays used by
//   date-formatting code. Keeping both — different consumers, same truth.

export const THAI_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const THAI_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

/**
 * Format a date-like input as Thai Buddhist-Era text.
 * Examples: "2026-04-19" → "19 เม.ย. 2569" (defaults)
 *           "2026-04-19" → "19 เม.ย. 69"   ({yearStyle:'short'})
 *           "2026-04-19" → "19 เมษายน 2569" ({monthStyle:'full'})
 *
 * Pure YYYY-MM-DD strings are treated as calendar dates (no TZ math) so that
 * a "2026-04-19" field stays April 19 regardless of the host's timezone.
 * Anything else (ISO with T/Z, Date object) is parsed via `new Date()` — the
 * host's local timezone applies, same behaviour as the old per-file helpers.
 */
export function fmtThaiDate(input, { monthStyle = 'short', yearStyle = 'full' } = {}) {
  if (!input && input !== 0) return '-';
  let y, m, d;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    [y, m, d] = input.split('-').map(Number);
  } else {
    const dt = input instanceof Date ? input : new Date(input);
    if (isNaN(dt.getTime())) return String(input);
    y = dt.getFullYear(); m = dt.getMonth() + 1; d = dt.getDate();
  }
  const months = monthStyle === 'full' ? THAI_MONTHS_FULL : THAI_MONTHS_SHORT;
  const be = y + 543;
  const yearStr = yearStyle === 'short' ? String(be).slice(-2) : String(be);
  return `${d} ${months[m - 1]} ${yearStr}`;
}

/**
 * Format a timestamp as Thai-style slash date, optionally with 24-hour time.
 * Examples: "2026-04-19T09:30:00Z" → "19/04/2026 16:30" (BKK local, default)
 *                                 → "19/04/2026"       ({withTime:false})
 *
 * Callers were almost all doing exactly the same `padStart(2,'0')` dance —
 * any new site should import from here instead of reinventing it.
 */
export function fmtSlashDateTime(input, { withTime = true } = {}) {
  if (!input) return '-';
  try {
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) return String(input);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    if (!withTime) return `${dd}/${mm}/${yyyy}`;
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  } catch {
    return String(input);
  }
}
