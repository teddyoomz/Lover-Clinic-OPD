// ─── BranchContext — global selected-branch state ──────────────────────
// Phase 14.7.H follow-up A (2026-04-26)
//
// User directive 2026-04-26: "ตอนนี้มี 1 สาขา อยากทำให้รองรับการเปิดสาขา
// เพิ่มเติมแบบเต็มรูปแบบทีเดียวไปเลย" (currently single-branch; want full
// multi-branch infrastructure ready when more branches open).
//
// Pre-Phase-15 audit surfaced that BRANCH_ID was hardcoded to 'main' in
// 6 components (SaleTab, OrderPanel, MovementLogPanel, StockAdjustPanel,
// StockSeedPanel, TreatmentFormPage's 5 sites). Phase 15 (Central Stock)
// requires a real selectedBranchId so transfers + withdrawals attribute
// correctly.
//
// This module:
//   1. Loads `be_branches` via onSnapshot listener (so admin can edit
//      branches in BranchesTab and the selector updates live).
//   2. Auto-selects the `isDefault=true` branch on first load.
//   3. Persists last-picked branch to localStorage so refresh keeps it.
//   4. Exposes `useSelectedBranch()` hook returning {branchId, branches,
//      selectBranch, isReady}.
//   5. Single-branch case: hook returns the only branch's id; no dropdown
//      needed in UI. The branch-selector dropdown component below auto-
//      hides when `branches.length < 2`.

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

/**
 * Provider — wrap BackendDashboard (or any subtree that needs branch context).
 * Auto-loads `be_branches` via listener; once docs arrive, picks the
 * `isDefault=true` branch (or the first one) unless localStorage has a
 * still-valid pick.
 */
export function BranchProvider({ children }) {
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchIdState] = useState(() => {
    try {
      const cached = typeof window !== 'undefined'
        ? window.localStorage?.getItem(STORAGE_KEY)
        : null;
      return cached || FALLBACK_ID;
    } catch {
      return FALLBACK_ID;
    }
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let unsubscribe = () => {};
    try {
      unsubscribe = onSnapshot(branchesCol(), (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setBranches(list);
        // V36 (2026-04-29) — phantom-branch defensive fallback. Pre-V36
        // logic only validated the cached selectedBranchId on FIRST snapshot
        // (when isReady===false). If branches changed after that (e.g.
        // admin deleted a branch via cleanup-phantom-branch endpoint while
        // the page was already open OR the user's localStorage retained a
        // since-deleted branch from a prior session), selectedBranchId
        // stayed stale → all stock writes attributed to a phantom branch
        // → user reported "Movement log สาขาหายไปหมด" because the reader
        // filter excluded everything.
        //
        // V36 fix: validate current selectedBranchId on EVERY snapshot.
        // If the current selection no longer matches any branch doc AND
        // it's not the legacy 'main' fallback, fall back to default branch
        // or 'main'. This re-fires even after isReady=true so admin can
        // delete a branch and the UI immediately re-resolves.
        const currentSel = (() => {
          try { return window.localStorage?.getItem(STORAGE_KEY) || ''; } catch { return ''; }
        })();
        const selectionStillValid = currentSel === FALLBACK_ID ||
          (list.length > 0 && list.some(b => (b.branchId || b.id) === currentSel));

        if (!isReady && list.length > 0) {
          // First-load default-branch resolution.
          if (!selectionStillValid) {
            const def = list.find(b => b.isDefault) || list[0];
            const id = def?.branchId || def?.id || FALLBACK_ID;
            setSelectedBranchIdState(id);
            try { window.localStorage?.setItem(STORAGE_KEY, id); } catch {}
          }
          setIsReady(true);
        } else if (!isReady && list.length === 0) {
          // No branches in Firestore yet — keep FALLBACK_ID so existing
          // hardcoded 'main' callsites continue to work unchanged.
          if (!selectionStillValid) {
            setSelectedBranchIdState(FALLBACK_ID);
            try { window.localStorage?.setItem(STORAGE_KEY, FALLBACK_ID); } catch {}
          }
          setIsReady(true);
        } else if (isReady && !selectionStillValid) {
          // V36 fallback: branch doc disappeared (admin cleanup OR phantom
          // never existed). Re-resolve to default-branch or main fallback.
          const def = list.find(b => b.isDefault) || list[0];
          const id = def?.branchId || def?.id || FALLBACK_ID;
          setSelectedBranchIdState(id);
          try { window.localStorage?.setItem(STORAGE_KEY, id); } catch {}
        }
      }, () => setIsReady(true));
    } catch {
      setIsReady(true);
    }
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectBranch = useMemo(() => (id) => {
    if (!id) return;
    setSelectedBranchIdState(id);
    try { window.localStorage?.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  const value = useMemo(() => ({
    branchId: selectedBranchId,
    branches,
    selectBranch,
    isReady,
  }), [selectedBranchId, branches, selectBranch, isReady]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

/**
 * Hook — returns { branchId, branches, selectBranch, isReady }.
 * Defensive: if no provider mounted, returns FALLBACK_ID so legacy
 * hardcoded callsites keep working in tests + storybook.
 */
export function useSelectedBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) {
    return { branchId: FALLBACK_ID, branches: [], selectBranch: () => {}, isReady: true };
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
