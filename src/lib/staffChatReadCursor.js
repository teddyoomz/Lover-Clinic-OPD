// V82 — Staff Chat persistent read cursor
//
// Per-(device, branch) localStorage cursor that tracks the latest message
// the local user has read. Closes V73 useStaffChat Bug #2 (in-memory
// `useRef(new Set())` lost dedup state on every remount → badge spam after
// every tab switch / Frontend↔Backend toggle / browser reload).
//
// Design (spec section 1, Q-locks Q1=B + Q2=A + Q4a=Date.now):
// - Storage: localStorage, one key per branchId (`staffChat:cursor:{branchId}`)
//   → per-device by definition (localStorage is browser-local)
//   → branch switch reads a different cursor, zero cross-pollution
// - Shape: { lastReadId, lastReadCreatedAtMs, updatedAt }
// - First-load default: cursor missing → seed with latest message's
//   createdAt (or Date.now() if collection empty) → backlog silent
// - isMessageUnread: compares message.createdAt > cursor.lastReadCreatedAtMs
//   AND message.deviceId !== selfDeviceId (own messages never count)
//
// Pure JS — no React, no Firebase, no external imports beyond globalThis.
// Graceful degradation on localStorage failure (quota / private browsing /
// SSR) → catch + console.warn; caller may still hold the cursor in memory.
//
// Audit: AV76 codified — in-memory dedup of Firestore listener results
// crashes on remount; persist the cursor instead. See
// `.agents/skills/audit-anti-vibe-code/SKILL.md` AV76.

/**
 * Prefix for all staff-chat cursor localStorage keys. Exported so tests +
 * future cross-branch cleanup tooling can enumerate them.
 */
export const STAFF_CHAT_CURSOR_KEY_PREFIX = 'staffChat:cursor:';

/**
 * Build the canonical localStorage key for a given branchId.
 * @param {string} branchId
 * @returns {string}
 */
export function CURSOR_STORAGE_KEY(branchId) {
  return `${STAFF_CHAT_CURSOR_KEY_PREFIX}${String(branchId || '')}`;
}

function _getLocalStorage() {
  try {
    if (typeof globalThis === 'undefined') return null;
    const ls = globalThis.localStorage;
    if (!ls || typeof ls.getItem !== 'function' || typeof ls.setItem !== 'function') {
      return null;
    }
    return ls;
  } catch (_e) {
    return null;
  }
}

function _isValidBranchId(branchId) {
  return typeof branchId === 'string' && branchId.length > 0;
}

/**
 * Read the current cursor for a branch.
 *
 * @param {string} branchId
 * @returns {{ lastReadId: string, lastReadCreatedAtMs: number, updatedAt: number } | null}
 *          null when: branchId invalid, localStorage unavailable, key absent,
 *          OR stored value fails parse / shape validation (treated as absent
 *          so caller falls through to `initCursorIfMissing`).
 */
export function getCursor(branchId) {
  if (!_isValidBranchId(branchId)) return null;
  const ls = _getLocalStorage();
  if (!ls) return null;
  let raw;
  try {
    raw = ls.getItem(CURSOR_STORAGE_KEY(branchId));
  } catch (_e) {
    return null;
  }
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_e) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const { lastReadId, lastReadCreatedAtMs, updatedAt } = parsed;
  if (typeof lastReadCreatedAtMs !== 'number' || !Number.isFinite(lastReadCreatedAtMs)) {
    return null;
  }
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    return null;
  }
  return {
    lastReadId: typeof lastReadId === 'string' ? lastReadId : '',
    lastReadCreatedAtMs,
    updatedAt,
  };
}

/**
 * Advance the cursor for a branch. Accepts a partial — merges over the
 * existing cursor (if any) so callers can update just `lastReadId +
 * lastReadCreatedAtMs` without re-stamping `updatedAt` explicitly.
 *
 * `updatedAt` always becomes Date.now() at the write, regardless of partial
 * (writes ARE the timestamp event).
 *
 * Throws nothing on localStorage failure — catches + console.warn so caller
 * doesn't crash on quota / private browsing. Cursor stays in-memory for hook
 * lifetime in that case (graceful degrade to V73-pre behavior).
 *
 * @param {string} branchId
 * @param {{ lastReadId?: string, lastReadCreatedAtMs?: number, updatedAt?: number }} partial
 * @returns {void}
 */
export function setCursor(branchId, partial) {
  if (!_isValidBranchId(branchId)) return;
  const patch = (partial && typeof partial === 'object') ? partial : {};
  const ls = _getLocalStorage();
  const prior = getCursor(branchId) || {
    lastReadId: '',
    lastReadCreatedAtMs: 0,
    updatedAt: 0,
  };
  const nextLastReadId = (typeof patch.lastReadId === 'string')
    ? patch.lastReadId
    : prior.lastReadId;
  const nextLastReadCreatedAtMs = (typeof patch.lastReadCreatedAtMs === 'number'
    && Number.isFinite(patch.lastReadCreatedAtMs))
    ? patch.lastReadCreatedAtMs
    : prior.lastReadCreatedAtMs;
  // updatedAt: write event timestamp by default; allow explicit override
  // (tests + clock-skew scenarios).
  const nextUpdatedAt = (typeof patch.updatedAt === 'number'
    && Number.isFinite(patch.updatedAt))
    ? patch.updatedAt
    : Date.now();
  const next = {
    lastReadId: nextLastReadId,
    lastReadCreatedAtMs: nextLastReadCreatedAtMs,
    updatedAt: nextUpdatedAt,
  };
  if (!ls) return;
  try {
    ls.setItem(CURSOR_STORAGE_KEY(branchId), JSON.stringify(next));
  } catch (e) {
    // Quota / private browsing / SSR — graceful degrade. Cursor lives only
    // in memory for the current hook lifetime; next remount re-seeds via
    // initCursorIfMissing.
    try {
      // eslint-disable-next-line no-console
      console.warn('[V82 staffChatReadCursor] setCursor localStorage write failed:', e);
    } catch (_e2) { /* noop */ }
  }
}

/**
 * First-mount seed. If no cursor exists for the branch yet, write one with
 * `lastReadCreatedAtMs = latestCreatedAtMs` (the latest message in the
 * current snapshot, or `Date.now()` if collection empty).
 *
 * Effect: on first-ever load the entire backlog is silently treated as read.
 * Only newer messages arriving after this point count as unread → no 50
 * unread / 50 notification sounds on first widget open.
 *
 * Idempotent: if a cursor already exists, returns it unchanged.
 *
 * @param {string} branchId
 * @param {number} latestCreatedAtMs  Pass the latest message's createdAt
 *                                    (admin-tz unaware ms epoch) or
 *                                    Date.now() if no messages yet.
 * @returns {{ lastReadId: string, lastReadCreatedAtMs: number, updatedAt: number }}
 */
export function initCursorIfMissing(branchId, latestCreatedAtMs) {
  if (!_isValidBranchId(branchId)) {
    // Return a no-op cursor so caller can compare against it without
    // crashing. Will not be persisted because branchId invalid.
    const fallback = (typeof latestCreatedAtMs === 'number'
      && Number.isFinite(latestCreatedAtMs))
      ? latestCreatedAtMs
      : Date.now();
    return { lastReadId: '', lastReadCreatedAtMs: fallback, updatedAt: Date.now() };
  }
  const existing = getCursor(branchId);
  if (existing) return existing;
  const seedMs = (typeof latestCreatedAtMs === 'number'
    && Number.isFinite(latestCreatedAtMs))
    ? latestCreatedAtMs
    : Date.now();
  const now = Date.now();
  setCursor(branchId, {
    lastReadId: '',
    lastReadCreatedAtMs: seedMs,
    updatedAt: now,
  });
  // Re-read so we return the persisted shape (handles localStorage failure
  // gracefully — getCursor will return null, in which case we return the
  // in-memory shape).
  const persisted = getCursor(branchId);
  if (persisted) return persisted;
  return {
    lastReadId: '',
    lastReadCreatedAtMs: seedMs,
    updatedAt: now,
  };
}

/**
 * Decide whether a message is unread relative to the given cursor.
 *
 * Rules:
 * - If cursor is null → returns false (caller must call
 *   `initCursorIfMissing` first; this guard prevents the entire backlog
 *   from being flagged as unread on first-ever load).
 * - If message is from the local device → returns false (own messages
 *   never count as unread).
 * - Otherwise: returns true iff message.createdAt > cursor.lastReadCreatedAtMs.
 *
 * Robust against missing / malformed message shape — returns false rather
 * than crashing (safer default for listener consumers).
 *
 * @param {{ id?: string, createdAt?: number, deviceId?: string } | null} message
 * @param {{ lastReadCreatedAtMs?: number } | null} cursor
 * @param {string} selfDeviceId
 * @returns {boolean}
 */
export function isMessageUnread(message, cursor, selfDeviceId) {
  if (!cursor || typeof cursor !== 'object') return false;
  if (!message || typeof message !== 'object') return false;
  const cursorMs = cursor.lastReadCreatedAtMs;
  if (typeof cursorMs !== 'number' || !Number.isFinite(cursorMs)) return false;
  // V82 bug-fix (post-T9 vitest red, 2026-05-17) — accept either raw number OR
  // Firestore Timestamp object shape `{toMillis()}`. Real production messages
  // from Firestore SDK arrive as Timestamp instances, NOT numbers. Pre-fix
  // this function returned false for every real prod message → cursor never
  // detected unread → force-open + sound + auto-expand never fired. The spec
  // (section "Read Cursor Module") explicitly required dual-shape support;
  // initial impl lost it via over-narrowing.
  const raw = message.createdAt;
  let msgMs;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    msgMs = raw;
  } else if (raw && typeof raw.toMillis === 'function') {
    try { msgMs = raw.toMillis(); } catch { msgMs = NaN; }
  } else {
    msgMs = NaN;
  }
  if (typeof msgMs !== 'number' || !Number.isFinite(msgMs)) return false;
  if (typeof selfDeviceId === 'string'
    && selfDeviceId.length > 0
    && message.deviceId === selfDeviceId) {
    return false;
  }
  return msgMs > cursorMs;
}
