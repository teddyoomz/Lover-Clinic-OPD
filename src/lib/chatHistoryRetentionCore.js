// src/lib/chatHistoryRetentionCore.js
//
// chat_history retention helpers — shared between cron (api/cron/chat-history-retention-sweep.js)
// + CLI script (scripts/chat-history-retention-sweep.mjs). Rule of 3 pattern,
// mirror of staffChatRetentionCore.js.
//
// User directive 2026-05-24 ("ทำให้ chat_history ลบเหลือเก็บแค่วันเดียวพอ"):
// retention = 1 day. Pre-cron, chat_history grew to 3,855 docs over ~2 months
// because the original in-listener auto-delete logic was missing. Frontend
// page load slowed because the ChatPanel listener pulled all 3,855 docs each
// snapshot fire (~7.5 MB on wire). One-shot Rule M cleanup (2026-05-24)
// reduced to 100 docs; this cron keeps it bounded going forward.

export const RETENTION_HOURS = 24; // 1 day

// Extract resolvedAt as milliseconds. Handles Firestore Timestamp, plain
// object shape (_seconds/_nanoseconds), number, and ISO string. Returns null
// if the field is missing or unparseable — caller treats null as
// "unknown age, do NOT delete" (conservative).
export function resolvedAtMs(data) {
  const r = data?.resolvedAt;
  if (!r) return null;
  if (typeof r.toMillis === 'function') {
    try { return r.toMillis(); } catch { return null; }
  }
  if (typeof r === 'number') return Number.isFinite(r) ? r : null;
  if (typeof r._seconds === 'number') {
    return r._seconds * 1000 + ((r._nanoseconds || 0) / 1e6);
  }
  if (typeof r === 'string') {
    const ms = Date.parse(r);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

// Predicate: is this doc older than retention window?
// Conservative: returns false (= KEEP) if resolvedMs is null/unknown — never
// delete a doc with missing timestamp.
export function isExpired(resolvedMs, nowMs = Date.now(), retentionHours = RETENTION_HOURS) {
  if (resolvedMs == null) return false;
  if (!Number.isFinite(resolvedMs)) return false;
  return (nowMs - resolvedMs) > retentionHours * 3600 * 1000;
}

// Compute cutoff timestamp (Firestore-compatible millis).
export function cutoffMs(nowMs = Date.now(), retentionHours = RETENTION_HOURS) {
  return nowMs - retentionHours * 3600 * 1000;
}
