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

// ─── Archive retention (2026-07-19 — punchlist #22 residual) ─────────────────
//
// The cleanup sweep above SKIPS every isArchived doc → archived intake
// sessions accumulated FOREVER (143/155 prod docs at design time; patient
// data retained indefinitely). User-approved policy: safe-delete archived
// sessions older than 180 days, guarded by every referenced-session class.
// Deleted docs are captured by the nightly whole-system backup (03:00 BKK,
// runs BEFORE the 03:20 retention cron — recoverable for the backup window).

export const ARCHIVE_RETENTION_DAYS = 180;

// Dual-type timestamp coercion — Firestore Timestamp | {_seconds} | number |
// ISO string. The chat-history retention cron was DEAD for 46 runs because it
// assumed ONE type (2026-07-07 dead-cron lesson); never assume here.
export function anyTimestampMs(v) {
  if (!v) return null;
  if (typeof v.toMillis === 'function') {
    try { return v.toMillis(); } catch { return null; }
  }
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v._seconds === 'number') {
    return v._seconds * 1000 + ((v._nanoseconds || 0) / 1e6);
  }
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * Decide whether ONE archived opd_session may be retention-deleted.
 *
 * Guards (every one V23-aware — decided in JS over a FULL scan, never via a
 * server-side where() that would silently exclude missing-field docs):
 *   - not archived                        → skip (the cleanup sweep owns it)
 *   - isPermanent                          → skip (permanent links never age out)
 *   - live patient link (token + enabled)  → skip (deleting breaks the customer's URL;
 *                                            /api/patient-view still resolves legacy
 *                                            opd_session tokens)
 *   - referenced by be_appointments/be_deposits.linkedOpdSessionId → skip
 *     (admin flows dereference the session to open/serve-complete it)
 *   - no resolvable timestamp              → skip (conservative — never guess age)
 *   - age ≤ retentionDays                  → skip
 *   - else                                 → delete
 *
 * Age anchor fallback chain: archivedAt (cron-stamped since 2026-05-24; legacy
 * archived docs may lack it) → updatedAt (⚠ ISO string on one admin path) →
 * submittedAt → createdAt. All via anyTimestampMs (dual-type).
 *
 * @param {string} id — doc id (checked against referencedIds)
 * @param {object} data — doc data
 * @param {{nowMs?: number, retentionDays?: number, referencedIds?: Set<string>}} opts
 */
export function decideArchiveRetention(id, data, { nowMs = Date.now(), retentionDays = ARCHIVE_RETENTION_DAYS, referencedIds } = {}) {
  if (!data || typeof data !== 'object') return { action: 'skip', reason: 'invalid-data' };
  if (!data.isArchived) return { action: 'skip', reason: 'not-archived' };
  if (data.isPermanent) return { action: 'skip', reason: 'permanent-link' };
  if (data.patientLinkToken && data.patientLinkEnabled === true) {
    return { action: 'skip', reason: 'live-patient-link' };
  }
  if (referencedIds instanceof Set && referencedIds.has(String(id))) {
    return { action: 'skip', reason: 'referenced-by-booking' };
  }
  const ms = anyTimestampMs(data.archivedAt)
    ?? anyTimestampMs(data.updatedAt)
    ?? anyTimestampMs(data.submittedAt)
    ?? anyTimestampMs(data.createdAt);
  if (ms == null) return { action: 'skip', reason: 'no-timestamp' };
  const ageMs = nowMs - ms;
  if (ageMs <= retentionDays * 24 * 60 * 60 * 1000) {
    return { action: 'skip', reason: 'younger-than-retention' };
  }
  return { action: 'delete', reason: 'archived-older-than-retention' };
}
