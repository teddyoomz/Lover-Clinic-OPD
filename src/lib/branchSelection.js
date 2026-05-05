// ─── Branch Selection — pure JS storage helpers ──────────────────────────
// Phase BS (2026-05-06) + Phase 17.2 (2026-05-05) + Phase 17.2-bis (2026-05-05):
// extracted from BranchContext.jsx so the data layer (backendClient.js,
// cloneOrchestrator.js, /api/* helpers) can resolve the current selected
// branch WITHOUT importing a React-flavored .jsx file. V36 audit invariant
// G.51 forbids `BranchContext.jsx` imports in backendClient.js to prevent
// React context leaking into the data layer.
//
// Phase 17.2 (2026-05-05): Branch equality + no-'main'.
//   - FALLBACK_ID is now `null` (was `'main'`). Pre-V20 single-branch
//     deployments are gone; no synthetic 'main' branch is ever conjured.
//   - Callers MUST guard on `!branchId` (resolveSelectedBranchId may
//     return null when no branches exist or localStorage hasn't been
//     primed yet).
//
// Phase 17.2-bis (2026-05-05): per-user-key resolution. Phase 17.2 made
// BranchContext write to `selectedBranchId:${uid}` (per-user keyed) but
// resolveSelectedBranchId() was still reading the legacy unkeyed key —
// after BranchContext's first-mount migration deleted the unkeyed key,
// resolveSelectedBranchId() returned null forever, causing every
// scopedDataLayer auto-inject to pass null and every raw lister to fall
// back to a CROSS-BRANCH read (since `useFilter = branchId && !allBranches`
// evaluates `null && !false = false`, skipping the where-clause). User
// reported "ทุกปุ่มมั่วไปหมด" on TFP after switching branches.
//
// Fix: read auth.currentUser.uid synchronously from the initialized firebase
// app + read `selectedBranchId:${uid}` first. Falls back to unkeyed legacy
// key for backwards compat (BranchProvider's first-mount shim migrates
// legacy → keyed; this branch handles edge cases where lib code runs
// before the React mount).
//
// firebase/auth import is permitted under V36.G.51 — the lock is on REACT
// imports (no JSX, no useContext from a React .jsx file). firebase/auth
// is plain JS with a synchronous `currentUser` accessor.

import { auth } from '../firebase.js';

export const STORAGE_KEY = 'selectedBranchId';
export const FALLBACK_ID = null;

/**
 * Build the per-user localStorage key. Mirrors BranchContext.jsx
 * `localStorageKey(uid)` so React + lib paths read the same value.
 */
function perUserKey(uid) {
  return `${STORAGE_KEY}:${uid}`;
}

/**
 * Synchronous getter for the currently selected branchId.
 *
 * Resolution order:
 *   1. Per-user keyed value `selectedBranchId:${auth.currentUser.uid}`
 *      (Phase 17.2 canonical location).
 *   2. Legacy unkeyed `selectedBranchId` (pre-Phase-17.2 — BranchProvider
 *      migrates this to per-user key on first mount; only present in
 *      sessions that haven't mounted React yet).
 *   3. FALLBACK_ID (null) when neither key is present.
 *
 * Returns null when no selection persisted yet — callers MUST guard.
 *
 * @returns {string|null}
 */
export function resolveSelectedBranchId() {
  try {
    if (typeof window === 'undefined') return FALLBACK_ID;

    // Phase 17.2-bis — try per-user key first (canonical location).
    let uid = null;
    try {
      uid = auth?.currentUser?.uid || null;
    } catch {
      uid = null;  // auth not initialized / SSR / sandbox
    }
    if (uid) {
      const keyed = window.localStorage?.getItem(perUserKey(uid));
      if (keyed) return keyed;
    }

    // Fallback: legacy unkeyed (BranchProvider migrates on next React mount).
    const legacy = window.localStorage?.getItem(STORAGE_KEY);
    return legacy || FALLBACK_ID;
  } catch {
    return FALLBACK_ID;
  }
}

/**
 * Synchronous setter for the selected branchId. Used by lib code that
 * needs to update the persisted choice without going through React
 * (e.g. one-shot migration scripts, admin tools).
 *
 * @param {string} id
 */
export function setSelectedBranchId(id) {
  try {
    if (typeof window === 'undefined' || !id) return;
    window.localStorage?.setItem(STORAGE_KEY, String(id));
  } catch { /* localStorage unavailable — non-fatal */ }
}

/**
 * Wipe the persisted choice so the next BranchProvider mount re-resolves
 * to the newest-created branch (or FALLBACK_ID/null if no branches exist).
 */
export function resetBranchSelection() {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage?.removeItem(STORAGE_KEY);
  } catch { /* localStorage unavailable — non-fatal */ }
}
