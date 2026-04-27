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

const STORAGE_KEY = 'selectedBranchId';
const FALLBACK_ID = 'main'; // Pre-be_branches deployments default to this.

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
        // First-load default-branch resolution.
        if (!isReady && list.length > 0) {
          const cached = (() => {
            try { return window.localStorage?.getItem(STORAGE_KEY); } catch { return null; }
          })();
          const cachedStillValid = cached && list.some(b => (b.branchId || b.id) === cached);
          if (!cachedStillValid) {
            const def = list.find(b => b.isDefault) || list[0];
            const id = def?.branchId || def?.id || FALLBACK_ID;
            setSelectedBranchIdState(id);
            try { window.localStorage?.setItem(STORAGE_KEY, id); } catch {}
          }
          setIsReady(true);
        } else if (list.length === 0 && !isReady) {
          // No branches in Firestore yet — keep FALLBACK_ID so existing
          // hardcoded 'main' callsites continue to work unchanged.
          setIsReady(true);
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
 * Returns FALLBACK_ID if nothing stored.
 */
export function resolveSelectedBranchId() {
  try {
    return (typeof window !== 'undefined' && window.localStorage?.getItem(STORAGE_KEY)) || FALLBACK_ID;
  } catch {
    return FALLBACK_ID;
  }
}

/**
 * Reset to default (first-time setup, tests). Wipes localStorage so the
 * provider re-resolves on next mount.
 */
export function resetBranchSelection() {
  try { window.localStorage?.removeItem(STORAGE_KEY); } catch {}
}

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
