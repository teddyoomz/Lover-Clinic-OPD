// ─── BranchContext — global selected-branch state ──────────────────────
// Phase 14.7.H follow-up A (2026-04-26)
//
// Phase 17.2 (2026-05-05) — Removed 'main' fallback semantic. Per-user uid
// localStorage key (`selectedBranchId:${uid}`). Newest-created accessible
// branch is the first-login default. Single-branch users hide the selector
// entirely (see useBranchVisibility helper). Legacy unkeyed `selectedBranchId`
// localStorage entries are migrated to the per-uid key on first read so
// existing sessions resume seamlessly.
//
// User directive 2026-04-26: "ตอนนี้มี 1 สาขา อยากทำให้รองรับการเปิดสาขา
// เพิ่มเติมแบบเต็มรูปแบบทีเดียวไปเลย" (currently single-branch; want full
// multi-branch infrastructure ready when more branches open).
//
// Pre-Phase-15 audit surfaced that BRANCH_ID was hardcoded to 'main' in
// 6 components (SaleTab, OrderPanel, MovementLogPanel, StockAdjustPanel,
// StockSeedPanel, TreatmentFormPage's 5 sites). Phase 15 (Central Stock)
// requires a real selectedBranchId so transfers + withdrawals attribute
// correctly. Phase 17.2 closes the loop by removing the 'main' fallback
// entirely — every branch is a peer; the migration script reassigns any
// legacy `branchId === 'main'` data to the current default branch.
//
// This module:
//   1. Loads `be_branches` via onSnapshot listener (so admin can edit
//      branches in BranchesTab and the selector updates live).
//   2. Resolves first-login default = newest-created branch among the
//      caller's accessible set (staff.branchIds[]). No isDefault flag.
//   3. Persists last-picked branch to per-uid localStorage so refresh keeps
//      it AND a different user on the same device gets their own pick.
//   4. Exposes `useSelectedBranch()` hook returning {branchId, branches,
//      selectBranch, isReady}.
//   5. Single-branch case: `useBranchVisibility().showSelector === false`
//      so BranchSelector renders a static label (no dropdown).

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { useUserPermission } from '../contexts/UserPermissionContext.jsx';
// Phase BS (2026-05-06): pure JS branch-selection helpers extracted to
// branchSelection.js so non-React lib code can read selectedBranchId
// without importing this .jsx file (V36 audit G.51 — no React leak into
// data layer). Re-exported below for back-compat with existing callers.
import {
  STORAGE_KEY,
  FALLBACK_ID,
  resolveSelectedBranchId as resolveSelectedBranchIdImpl,
  setSelectedBranchId,
  resetBranchSelection as resetBranchSelectionImpl,
} from './branchSelection.js';

const BranchContext = createContext(null);

function branchesCol() {
  return collection(db, 'artifacts', appId, 'public', 'data', 'be_branches');
}

// ─── Phase 17.2 helpers — per-user uid localStorage + newest-default ────
// Per-uid key prevents cross-account leakage on shared devices (admin
// logs out → staff logs in → staff still saw admin's last branch).
// Newest-created selection replaces the removed isDefault flag — admins
// no longer have to mark a "main" branch; whatever they created last is
// the default for first-login. Existing users get a one-time migration
// from the legacy unkeyed `selectedBranchId` so their stored pick carries
// forward without a re-pick prompt.

function localStorageKey(uid) {
  return `selectedBranchId:${uid}`;
}

function readSelected(uid) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const v = window.localStorage.getItem(localStorageKey(uid));
    if (v) return v;
    // Phase 17.2 graceful upgrade — read legacy unkeyed value once,
    // migrate to per-user key, delete old. Idempotent: legacy key absent
    // → no-op. Legacy 'main' value falls through to readSelected returning
    // 'main' once → caller (`pickFirstLoginDefault` fallback) replaces it
    // with a real branchId on next branches-snapshot resolution.
    const legacy = window.localStorage.getItem(STORAGE_KEY);
    if (legacy) {
      window.localStorage.setItem(localStorageKey(uid), legacy);
      window.localStorage.removeItem(STORAGE_KEY);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

function writeSelected(uid, branchId) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (branchId) {
      window.localStorage.setItem(localStorageKey(uid), String(branchId));
    } else {
      window.localStorage.removeItem(localStorageKey(uid));
    }
  } catch {
    // localStorage may be disabled in private mode; failure is non-fatal.
  }
}

/**
 * First-login default branch resolver.
 * - branches null/empty → null
 * - accessibleBranchIds null/empty → fall back to ALL branches (bootstrap
 *   admin / legacy staff records pre-Phase-BS where branchIds[] is empty
 *   meaning "all branches")
 * - accessibleBranchIds non-empty → filter to that subset
 * - sort accessible by createdAt DESC (newest first); secondary stable
 *   sort on id for determinism when timestamps tie
 * - return first.branchId || first.id; null if no accessible branches
 */
function pickFirstLoginDefault({ branches, accessibleBranchIds }) {
  if (!Array.isArray(branches) || branches.length === 0) return null;
  const hasAccessFilter = Array.isArray(accessibleBranchIds) && accessibleBranchIds.length > 0;
  const allowed = hasAccessFilter ? new Set(accessibleBranchIds.map((x) => String(x))) : null;
  const accessible = hasAccessFilter
    ? branches.filter((b) => allowed.has(String(b.branchId || b.id)))
    : branches;
  if (accessible.length === 0) return null;
  const sorted = [...accessible].sort((a, b) => {
    const ca = a.createdAt || '';
    const cb = b.createdAt || '';
    if (ca !== cb) return String(cb).localeCompare(String(ca)); // DESC
    return String(a.branchId || a.id).localeCompare(String(b.branchId || b.id));
  });
  return sorted[0].branchId || sorted[0].id || null;
}

/**
 * Provider — wrap App (Phase 17.2 — hoisted from BackendDashboard so the
 * same selectedBranchId state is visible to public-link surfaces, admin
 * dashboard, AND backend dashboard).
 *
 * Phase 17.2 — auto-loads `be_branches` via listener; on first snapshot
 * picks `pickFirstLoginDefault({branches, accessibleBranchIds})` (newest-
 * created accessible branch) unless localStorage at the per-uid key has a
 * still-valid pick. Persists selection per-uid so logout-login as a
 * different user on the same device doesn't leak the previous pick.
 *
 * Defensive shape: when `useUserPermission()` is outside its provider
 * (legacy mounts, tests), it returns `{user: null, staff: null}`. We then
 * skip localStorage I/O (uid required) but the in-memory selection still
 * works — the branch picked by `pickFirstLoginDefault` lives in state for
 * the page lifetime.
 */
export function BranchProvider({ children }) {
  const { user, staff } = useUserPermission();
  const currentUid = user?.uid || '';
  // Empty/missing branchIds[] → "all branches" (bootstrap admin + legacy
  // staff records pre-Phase-BS). Non-empty → scoped accessible list.
  const staffAccessible = useMemo(() => (
    Array.isArray(staff?.branchIds) ? staff.branchIds.map((x) => String(x)) : []
  ), [staff]);

  const [branches, setBranches] = useState([]);
  // Phase 17.2 — initial state is null until the be_branches snapshot
  // arrives. localStorage read happens inside the snapshot effect (so it
  // can run after currentUid is known + the legacy-key migration runs).
  const [selectedBranchId, setSelectedBranchIdState] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onSnapshot(branchesCol(), (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setBranches(list);

        // V36 (2026-04-29) — phantom-branch defensive fallback. Pre-V36
        // logic only validated the cached selectedBranchId on FIRST
        // snapshot (when isReady===false). If branches changed after that
        // (admin deleted a branch via cleanup-phantom-branch while the
        // page was already open OR localStorage retained a since-deleted
        // branch), selectedBranchId stayed stale → all stock writes
        // attributed to a phantom branch → user reported "Movement log
        // สาขาหายไปหมด". V36 fix: validate on EVERY snapshot. Phase 17.2
        // preserves this behaviour — fallback target is now
        // pickFirstLoginDefault (newest-created accessible) instead of
        // isDefault=true / 'main'.
        const stored = readSelected(currentUid);
        const selectionStillValid = !!stored &&
          list.length > 0 && list.some((b) => String(b.branchId || b.id) === String(stored));

        if (!isReady && list.length > 0) {
          if (selectionStillValid) {
            setSelectedBranchIdState(stored);
          } else {
            const id = pickFirstLoginDefault({ branches: list, accessibleBranchIds: staffAccessible });
            setSelectedBranchIdState(id);
            if (id) writeSelected(currentUid, id);
          }
          setIsReady(true);
        } else if (!isReady && list.length === 0) {
          // No branches in Firestore yet — keep null. Callers should guard
          // on isReady + branchId. Phase 17.2 explicitly does NOT fall back
          // to a 'main' sentinel; UI components either render a "no branch"
          // empty state or wait for isReady.
          setSelectedBranchIdState(null);
          setIsReady(true);
        } else if (isReady && !selectionStillValid) {
          // Phantom-branch fallback (V36 contract): re-resolve to newest
          // accessible.
          const id = pickFirstLoginDefault({ branches: list, accessibleBranchIds: staffAccessible });
          setSelectedBranchIdState(id);
          if (id) writeSelected(currentUid, id);
        }
      }, () => setIsReady(true));
    } catch {
      setIsReady(true);
    }
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUid, staffAccessible]);

  const selectBranch = useMemo(() => (id) => {
    if (!id) return;
    setSelectedBranchIdState(id);
    writeSelected(currentUid, id);
  }, [currentUid]);

  const value = useMemo(() => ({
    branchId: selectedBranchId,
    branches,
    selectBranch,
    isReady,
    accessibleBranchIds: staffAccessible,
  }), [selectedBranchId, branches, selectBranch, isReady, staffAccessible]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

/**
 * Hook — returns { branchId, branches, selectBranch, isReady, accessibleBranchIds }.
 *
 * Phase 17.2 — defensive shape outside provider returns `branchId: null`
 * (previously `FALLBACK_ID === 'main'`). Callers MUST guard on `isReady &&
 * branchId` before using; the 'main' sentinel is no longer a valid value
 * because the migration script reassigns any legacy `branchId === 'main'`
 * docs to the current default branch. Tests + storybook should mount
 * `<BranchProvider>` for realistic behaviour.
 */
export function useSelectedBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    return { branchId: null, branches: [], selectBranch: () => {}, isReady: true, accessibleBranchIds: [] };
  }
  return ctx;
}

/**
 * One-shot resolver for places that need the selected branch outside of
 * React render (e.g. lib code, async handlers). Reads localStorage.
 * Returns FALLBACK_ID if nothing stored. Re-exported from
 * branchSelection.js (Phase BS — pure JS module, no React).
 */
export const resolveSelectedBranchId = resolveSelectedBranchIdImpl;

/**
 * Reset to default (first-time setup, tests). Wipes localStorage so the
 * provider re-resolves on next mount. Re-exported from branchSelection.js.
 */
export const resetBranchSelection = resetBranchSelectionImpl;

// Re-export for callers that need the synchronous setter outside React.
export { setSelectedBranchId };

export const __BRANCH_FALLBACK_ID = FALLBACK_ID;

/**
 * Resolve a human-readable branch name from a branch id.
 *
 * V22 pattern (2026-04-26 user lock: "ทุกที่แสดงชื่อ ... เป็น text ไม่ใช่
 * ตัวเลข"). User report 2026-04-27: "สาขา BR-1777095572005-ae97f911 เป็นโค๊ด
 * อ่านไม่รู้เรื่อง ต้องการชื่อสาขาแบบมนุษย์อ่านรู้เรื่อง". Helper centralizes
 * the lookup so future render paths can't accidentally leak the raw id.
 *
 * Lookup chain:
 *   1. branches[].name (canonical from be_branches)
 *   2. branches[].nameEn (English fallback if Thai missing)
 *   3. ''  ← V22 contract: caller decides UI placeholder ('สาขาหลัก' / '-')
 *
 * Returns empty string when branchId is empty/falsy OR when the branch
 * isn't loaded yet (BranchProvider hasn't fired its onSnapshot). Caller
 * should guard accordingly OR pass `'main'` semantic fallback.
 *
 * @param {string} branchId
 * @param {Array<{id, branchId?, name?, nameEn?}>} branches
 * @returns {string}
 */
export function resolveBranchName(branchId, branches) {
  if (branchId == null || branchId === '') return '';
  if (!Array.isArray(branches) || branches.length === 0) return '';
  const idStr = String(branchId);
  const match = branches.find((b) => {
    if (!b) return false;
    return String(b.branchId || b.id) === idStr;
  });
  if (!match) return '';
  if (typeof match.name === 'string' && match.name.trim()) return match.name.trim();
  if (typeof match.nameEn === 'string' && match.nameEn.trim()) return match.nameEn.trim();
  return '';
}

/**
 * Pure helper: merge be_branches doc INTO the global clinicSettings shape
 * so a single object carries branch-aware clinic info. Branch fields take
 * precedence over clinic_settings; brand assets (logo, accentColor) keep
 * coming from clinic_settings.
 *
 * Field map (be_branches → clinicSettings):
 *   branch.name      → clinic.clinicName
 *   branch.nameEn    → clinic.clinicNameEn
 *   branch.address   → clinic.address
 *   branch.phone     → clinic.phone
 *   branch.taxId     → clinic.taxId
 *   branch.licenseNo → clinic.licenseNo
 *   branch.website   → clinic.website
 *
 * Brand fields (logo, accentColor, clinicSubtitle) come from clinicSettings
 * unchanged because be_branches doesn't store branding.
 *
 * Defensive: empty string from branch is treated as "not set" → falls back
 * to clinicSettings. So a branch with empty `address` doesn't blank out
 * the global address.
 *
 * @param {object} clinicSettings
 * @param {object} branch — be_branches doc (optional)
 * @returns {object} merged effective settings
 */
export function mergeBranchIntoClinic(clinicSettings, branch) {
  const cs = clinicSettings || {};
  if (!branch || typeof branch !== 'object') return cs;
  const pick = (branchVal, csVal) => {
    if (typeof branchVal === 'string' && branchVal.trim()) return branchVal;
    return csVal;
  };
  // 2026-04-28 user directive: clinic name on receipts/quotations should be
  // "<brand> <branch>" (e.g. "Lover Clinic นครราชสีมา") so customer sees
  // both the brand AND the specific branch they bought from. cs.clinicName
  // is the brand (from clinic_settings/main); branch.name is the branch
  // identifier (e.g. "นครราชสีมา"). Concat with single space.
  const brandName = (typeof cs.clinicName === 'string' && cs.clinicName.trim()) ? cs.clinicName.trim() : '';
  const branchName = (typeof branch.name === 'string' && branch.name.trim()) ? branch.name.trim() : '';
  let effectiveClinicName;
  if (brandName && branchName) effectiveClinicName = `${brandName} ${branchName}`;
  else if (branchName) effectiveClinicName = branchName;
  else effectiveClinicName = brandName || cs.clinicName;
  return {
    ...cs,
    clinicName: effectiveClinicName,
    clinicNameEn: pick(branch.nameEn, cs.clinicNameEn),
    address: pick(branch.address, cs.address),
    phone: pick(branch.phone, cs.phone),
    taxId: pick(branch.taxId, cs.taxId),
    licenseNo: pick(branch.licenseNo, cs.licenseNo),
    website: pick(branch.website, cs.website),
  };
}

/**
 * Hook — returns clinicSettings merged with the currently selected
 * branch's data. Branch values override; brand (logo/accent) stays from
 * clinic_settings. Used by SalePrintView / QuotationPrintView /
 * DocumentPrintModal so PDFs render the SELECTED branch's address +
 * phone instead of the global clinic_settings doc.
 *
 * Defensive: when no BranchProvider is mounted (legacy callers), the
 * merge no-ops and returns clinicSettings unchanged.
 *
 * @param {object} clinicSettings
 * @returns {object} effective clinic info for current branch context
 */
export function useEffectiveClinicSettings(clinicSettings) {
  const { branchId, branches } = useSelectedBranch();
  return useMemo(() => {
    const branch = (branches || []).find((b) =>
      b && (String(b.branchId || b.id) === String(branchId))
    );
    return mergeBranchIntoClinic(clinicSettings, branch);
  }, [clinicSettings, branchId, branches]);
}

// ─── Phase BS (2026-05-06) — User-scoped branch list ─────────────────────
// Per-staff branch access enforcement at the soft-gate UI layer. The
// BranchSelector dropdown should only show branches the current user can
// switch to — gated by `staff.branchIds[]` from be_staff doc.
//
// Backward-compat contract: empty/missing branchIds[] = "all branches"
// (legacy staff records pre-Phase-BS + bootstrap admin with no staff doc).
// Explicit non-empty branchIds[] = scoped subset. New staff added through
// StaffFormModal will set branchIds[] explicitly.
//
// Hard-gate (Firestore rules check `request.auth.token.branchIds`) is
// out of scope for v1 — soft-gate covers the UX requirement
// "user without permission cannot see other branches in the dropdown".

/**
 * Pure helper — filter branches by current staff's branchIds[].
 *
 * Empty/null inputs degrade gracefully:
 *   - branches null/non-array → returns []
 *   - staff null/missing → returns full list (backward compat)
 *   - staff.branchIds empty array OR missing → returns full list (backward compat)
 *   - staff.branchIds non-empty → filtered subset by id match
 *
 * Match key: branch.branchId OR branch.id (mirrors BranchSelector lookup).
 *
 * @param {Array<{id?, branchId?}>} branches
 * @param {{branchIds?: string[]} | null | undefined} staff
 * @returns {Array}
 */
export function filterBranchesByStaffAccess(branches, staff) {
  const list = Array.isArray(branches) ? branches : [];
  if (!staff || !Array.isArray(staff.branchIds) || staff.branchIds.length === 0) {
    return list;
  }
  const allowed = new Set(staff.branchIds.map((x) => String(x)));
  return list.filter((b) => {
    if (!b) return false;
    const id = String(b.branchId || b.id || '');
    return allowed.has(id);
  });
}

/**
 * Hook — same shape as useSelectedBranch() but `branches` is filtered by
 * current user's staff.branchIds[]. Use for the BranchSelector dropdown
 * and any UI that should hide branches the user can't switch to.
 *
 * Returns `allBranches` as well so consumers needing the unscoped list
 * (admin reports, system-config tab, etc.) don't need a second hook call.
 *
 * Must be called inside BOTH BranchProvider AND UserPermissionProvider.
 * Outside UserPermissionProvider (tests, storybook), useUserPermission()
 * returns a bootstrap-admin shape with staff=null → all branches returned.
 *
 * @returns {{ branchId, branches, selectBranch, isReady, allBranches }}
 */
export function useUserScopedBranches() {
  const { branchId, branches, selectBranch, isReady } = useSelectedBranch();
  const { staff } = useUserPermission();
  return useMemo(() => ({
    branchId,
    branches: filterBranchesByStaffAccess(branches, staff),
    selectBranch,
    isReady,
    allBranches: branches,
  }), [branchId, branches, selectBranch, isReady, staff]);
}

// ─── Phase 17.2 (2026-05-05) — Single-branch visibility helper ──────────
// User directive: when a clinic has only ONE branch (or the current user
// can only access ONE branch), the BranchSelector should NOT render a
// dropdown at all — show a static label instead. This mirrors a similar
// affordance in modern admin tools (e.g. AWS console hides region picker
// when single-region account).
//
// Returns { showSelector, branches }:
//   - showSelector === true  → BranchSelector renders the dropdown
//   - showSelector === false → BranchSelector renders `<span>{name}</span>`
//   - branches is the staff-accessible filtered list
//
// Single-branch detection uses the staff-accessible list (not the raw
// branches list) because a multi-branch clinic where the current user is
// scoped to one branch should also hide the selector.

/**
 * @returns {{ showSelector: boolean, branches: Array }}
 */
export function useBranchVisibility() {
  const { branches } = useSelectedBranch();
  const { staff } = useUserPermission();
  return useMemo(() => {
    const accessible = filterBranchesByStaffAccess(branches, staff);
    return {
      showSelector: accessible.length > 1,
      branches: accessible,
    };
  }, [branches, staff]);
}
