// src/lib/formatBadgeTime.js
//
// Phase 28 (2026-05-14) — extracted from CustomerDetailView.jsx (Phase 27.2)
// to enable Rule of 3 reuse: CDV stacked badges + new treatmentDisplayResolvers
// row-action helper + future timeline widgets.
//
// Original Phase 27.2 contract preserved verbatim — pure helpers, no React/
// Firestore deps. Returns ms accessor + HH:MM Bangkok-locale string.
//
// Treatment doc has multiple stage timestamps (vitalsignsRecordedAt /
// doctorRecordedAt / completedAt / recordedAt legacy / editedAt). For badge
// rendering we need (a) a uniform millisecond accessor across Firestore
// Timestamp / ISO string / {seconds, nanoseconds} object / Date instance,
// and (b) a HH:MM Thai-locale formatter.

/**
 * Convert any treatment-time field to milliseconds. Tolerates:
 *   - ISO string ('2026-05-14T04:13:00Z')
 *   - Firestore Timestamp ({ toDate: () => Date })
 *   - {seconds, nanoseconds} POJO
 *   - Date instance
 *   - falsy / unknown → 0
 */
export function toBadgeMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'string') {
    const n = new Date(ts).getTime();
    return Number.isNaN(n) ? 0 : n;
  }
  if (typeof ts.toDate === 'function') {
    try { return ts.toDate().getTime(); } catch { return 0; }
  }
  if (typeof ts.seconds === 'number') return ts.seconds * 1000;
  if (ts instanceof Date) return ts.getTime();
  return 0;
}

/**
 * Format a treatment timestamp as HH:MM in Bangkok timezone (24h).
 * Returns '' for falsy / invalid input.
 */
export function formatBadgeTime(ts) {
  const ms = toBadgeMs(ts);
  if (!ms) return '';
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
}
