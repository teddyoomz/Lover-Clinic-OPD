// ─── Branch Selection — pure JS storage helpers ──────────────────────────
// Phase BS (2026-05-06) + Phase 17.2 (2026-05-05): extracted from
// BranchContext.jsx so the data layer (backendClient.js, cloneOrchestrator.js,
// /api/* helpers) can resolve the current selected branch WITHOUT importing
// a React-flavored .jsx file. V36 audit invariant G.51 forbids
// `BranchContext.jsx` imports in backendClient.js to prevent React context
// leaking into the data layer.
//
// Phase 17.2 (2026-05-05): Branch equality + no-'main'.
//   - FALLBACK_ID is now `null` (was `'main'`). Pre-V20 single-branch
//     deployments are gone; no synthetic 'main' branch is ever conjured.
//   - Callers MUST guard on `!branchId` (resolveSelectedBranchId may
//     return null when no branches exist or localStorage hasn't been
//     primed yet).
//
// Single source of truth for:
//   - localStorage key the BranchProvider persists to (per-uid suffix
//     handled inside BranchContext.jsx; this module reads the legacy
//     unkeyed key as a last-resort fallback only).
//   - FALLBACK_ID (null) — sentinel for "no selection persisted yet".
//   - resolveSelectedBranchId() — synchronous getter for non-React code
//     (lib helpers, async handlers, server endpoints unaware of React).
//
// BranchContext.jsx re-exports these for back-compat so existing
// component callsites importing from BranchContext.jsx keep working.

export const STORAGE_KEY = 'selectedBranchId';
export const FALLBACK_ID = null;

/**
 * Synchronous getter for the currently selected branchId. Reads
 * localStorage directly; returns FALLBACK_ID (null) when localStorage is
 * unavailable (SSR, sandbox) or empty (first run before BranchProvider
 * has resolved newest-default).
 *
 * @returns {string|null}
 */
export function resolveSelectedBranchId() {
  try {
    if (typeof window === 'undefined') return FALLBACK_ID;
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return stored || FALLBACK_ID;
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
