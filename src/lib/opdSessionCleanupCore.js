// src/lib/opdSessionCleanupCore.js
//
// Pure decision logic for opd_sessions auto-cleanup. Mirror of the
// inline cleanup that USED TO live in AdminDashboard.jsx (line 2256-2287)
// inside the opd_sessions onSnapshot listener.
//
// 2026-05-24 — moved OUT of the listener into a Vercel cron because:
//   (a) inline cleanup wrote to opd_sessions on every fire → snapshot
//       cascade (each write triggered ANOTHER snapshot, repeating until
//       all expired docs reached terminal state) — listener pool saturation.
//   (b) the cleanup also ran on every snapshot for every admin tab. With
//       N tabs open, N cleanup runs racing for the same docs → conflicting
//       writes.
//   (c) Frontend slowness (per user 2026-05-24): opd_sessions listener pulled
//       all 110 docs each fire + cascading writes amplified per-fire work.
//
// Moving cleanup to cron (api/cron/opd-session-cleanup-sweep.js, every 30 min):
//   - Listener becomes pure read-only (Phase 3 will also add server-side
//     filter to drop archived docs from the read).
//   - Single owner of the cleanup writes → no race.
//   - Cleanup latency: up to 30 min vs sub-second inline. Acceptable for
//     archive/hide operations (admin doesn't wait on these).
//
// Rule of 3 — shared between cron + CLI script (scripts/opd-session-cleanup-sweep.mjs)
// + the legacy AdminDashboard logic (which is REMOVED in the same Phase 2 commit).

// Default 2 hours, matching legacy SESSION_TIMEOUT_MS in src/constants.js.
export const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000;

// Extract createdAt as milliseconds. Same conversion as chatHistoryRetentionCore.
export function createdAtMs(data) {
  const c = data?.createdAt;
  if (!c) return null;
  if (typeof c.toMillis === 'function') {
    try { return c.toMillis(); } catch { return null; }
  }
  if (typeof c === 'number') return Number.isFinite(c) ? c : null;
  if (typeof c._seconds === 'number') {
    return c._seconds * 1000 + ((c._nanoseconds || 0) / 1e6);
  }
  if (typeof c === 'string') {
    const ms = Date.parse(c);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Decide what to do with one opd_session doc.
 * Mirror of AdminDashboard.jsx:2262-2287 inline logic.
 *
 * Returns one of:
 *   { action: 'skip', reason: string }
 *   { action: 'hide', reason: string }   — set isHiddenFromQueue:true, hiddenFromQueueAt:serverTimestamp()
 *   { action: 'archive', reason: string } — set isArchived:true, archivedAt:serverTimestamp()
 *   { action: 'delete', reason: string }  — deleteDoc
 *
 * Decision tree (preserved exactly from legacy inline):
 *   - isArchived/isPermanent/no createdAt        → skip (already terminal OR cannot age out)
 *   - _v82FollowupOpdResetAt stamp                → skip (admin-explicit opt-out)
 *   - ③ (2026-05-26) appointmentDate < todayISO   → delete (linked appt passed; overrides V116; even with patientData)
 *   - createdAt within SESSION_TIMEOUT_MS         → skip (still active)
 *   - expired + has patientData                   → archive
 *   - expired + no patientData + has linked booking (V116)
 *                                                 → hide (preserve session URL)
 *   - expired + no patientData + no link          → delete
 */
export function decideCleanupAction(data, nowMs = Date.now(), timeoutMs = SESSION_TIMEOUT_MS, todayISO = null) {
  if (!data || typeof data !== 'object') {
    return { action: 'skip', reason: 'invalid-data' };
  }
  if (data.isArchived) return { action: 'skip', reason: 'already-archived' };
  if (data.isPermanent) return { action: 'skip', reason: 'permanent-link' };
  if (data._v82FollowupOpdResetAt) {
    return { action: 'skip', reason: 'v82-followup-opt-out' };
  }
  // ③ (2026-05-26) — appt-date-passed → HARD DELETE. Overrides V116 hide AND
  // fires even with patientData (Q3=A: delete filled-but-unsaved too). todayISO
  // = Bangkok 'YYYY-MM-DD'; data.appointmentDate is the linked appointment's
  // date (the cron joins be_appointments to populate it — sessions don't store
  // it). Above the age check so a fresh session whose appt already passed is
  // still removed. AV131.
  if (typeof todayISO === 'string'
      && typeof data.appointmentDate === 'string'
      && data.appointmentDate
      && data.appointmentDate < todayISO) {
    return { action: 'delete', reason: 'appt-date-passed' };
  }
  const ms = createdAtMs(data);
  if (ms == null) {
    return { action: 'skip', reason: 'no-createdAt' };
  }
  if ((nowMs - ms) <= timeoutMs) {
    return { action: 'skip', reason: 'still-fresh' };
  }
  // Expired. Branch on patientData + booking link:
  if (data.patientData) {
    return { action: 'archive', reason: 'expired-with-patientData' };
  }
  if (data.linkedAppointmentId || data.linkedDepositId) {
    return { action: 'hide', reason: 'expired-no-data-but-linked-booking-V116' };
  }
  return { action: 'delete', reason: 'expired-no-data-no-link' };
}
