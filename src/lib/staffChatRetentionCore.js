// src/lib/staffChatRetentionCore.js
// Staff-chat image attachments — PURE shared core (Rule of 3): imported by the
// retention cron, the Rule-M CLI mirror, the React components, and the tests.
// NO firebase imports here — keep it pure + unit-testable.
//
// (2026-05-22) Multi-image staff chat. Q1=auto-retention-only, Q3=delete whole
// message + images, Q4=30 days, Q5=≤10 images/message. Per-message Storage
// folder (staff-chat-attachments/{branchId}/{messageId}/) so deletion is a
// prefix-sweep → guarantees no orphan ("ลบจริงหายจริง").

export const RETENTION_DAYS = 30;
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000; // 1 day
export const STAFF_CHAT_STORAGE_ROOT = 'staff-chat-attachments';
export const STAFF_CHAT_MAX_IMAGES = 10;

export function storagePrefixForMessage(branchId, messageId) {
  return `${STAFF_CHAT_STORAGE_ROOT}/${branchId}/${messageId}/`;
}

export function storagePrefixForBranch(branchId) {
  return `${STAFF_CHAT_STORAGE_ROOT}/${branchId}/`;
}

// True when a message is older than `days` (default 30). Defensive on bad input.
export function isExpired(createdAtMs, nowMs, days = RETENTION_DAYS) {
  if (typeof createdAtMs !== 'number' || !Number.isFinite(createdAtMs)) return false;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return false;
  return (nowMs - createdAtMs) > days * 24 * 60 * 60 * 1000;
}

// Extract the Storage object path from a Firebase download URL. Legacy V73
// single-image messages stored `attachmentUrl` (a download URL) for a file at
// staff-chat-attachments/{branchId}/{ts}-{hex}.jpg (NOT under a {messageId}/
// folder), so the cron must derive its path from the URL to delete it.
// Returns null when not parseable.
export function extractStoragePathFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/\/o\/([^?]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return null; }
}

// A {messageId} Storage folder is an ORPHAN (safe to sweep) when no message doc
// exists for it AND it is older than the grace window — so we never nuke a
// folder whose doc is mid-creation (upload finishes, setDoc a beat later).
// Unknown folder age + no doc → treat as orphan (it has been abandoned).
export function isOrphanFolder({ docExists, folderCreatedMs, nowMs, graceMs = ORPHAN_GRACE_MS } = {}) {
  if (docExists) return false;
  if (typeof folderCreatedMs !== 'number' || !Number.isFinite(folderCreatedMs)) return true;
  return (nowMs - folderCreatedMs) > graceMs;
}

// Adaptive grid descriptor for N attachments (LINE/WhatsApp style). PURE so the
// layout is unit-testable. The component applies these as inline grid styles.
//   1   → full
//   2   → 1×2
//   3   → big-left (row-span 2) + 2 stacked right
//   4+  → 2×2, the 4th tile shows a "+overflow" overlay when count > 4
export function gridLayoutFor(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 1) return { show: Math.min(n, 1), overflow: 0, cols: '1fr', rows: null, firstBig: false };
  if (n === 2) return { show: 2, overflow: 0, cols: '1fr 1fr', rows: null, firstBig: false };
  if (n === 3) return { show: 3, overflow: 0, cols: '2fr 1fr', rows: '1fr 1fr', firstBig: true };
  return { show: 4, overflow: n - 4, cols: '1fr 1fr', rows: '1fr 1fr', firstBig: false };
}
