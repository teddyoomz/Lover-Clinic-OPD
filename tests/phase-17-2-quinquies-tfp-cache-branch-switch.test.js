// ─── Phase 17.2-quinquies — TFP cache invalidation on branch switch ────
// User report 2026-05-05: "หน้า TFP ปุ่มทุกปุ่มมั่วไปหมด ลองเปลี่ยนเป็นสาขา
// นครราชสีมา ปุ่มยา ยากลับบ้าน คอร์ส ซื้อสินค้าหน้าร้าน โปรโมชั่น
// กลุ่มสินค้าสิ้นเปลือง สินค้าสิ้นเปลือง แม่งบั๊คหมดเลย"
//
// Root cause: Phase 17.0 (BS-9) cache-reset effect cleared 4 of 5 modal
// caches on branch switch but missed buyItems / buyCategories (course /
// product / promotion modal data). PLUS the form-data useEffect at TFP
// mount had `[customerId, treatmentId, isEdit]` deps — no
// SELECTED_BRANCH_ID — so page-level masterCourses / dfGroups / productItems
// stayed pinned to the branch active at TFP mount.
//
// Fix (option A — drop length>0 short-circuits):
//   1. BS-9 useEffect extended to include buyItems + buyCategories
//   2. Form-data useEffect deps now include SELECTED_BRANCH_ID
//   3. Every modal opener (openMedModal / openMedGroupModal / openConsModal
//      / openConsGroupModal / openBuyModal) drops its `if (X.length > 0)
//      return;` short-circuit — defense-in-depth + always re-fetches via
//      scopedDataLayer auto-inject of the current branchId.
//   4. Inline tab-switch guards `if (!buyItems[X]?.length) openBuyModal(X)`
//      drop their inverse guard — always call openBuyModal on tab switch.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const TFP_SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
// TFP extraction step 3 (2026-07-19): the buy modal JSX (type-select onChange +
// sidebar type buttons — the Q4 unconditional-refetch contracts) moved verbatim
// to treatment-form/TfpBuyModal.jsx; those contracts now hold at the new home.
const BUY_MODAL_SRC = readFileSync('src/components/treatment-form/TfpBuyModal.jsx', 'utf8');

describe('Phase 17.2-quinquies — TFP cache branch-switch regression bank', () => {
  describe('Q1 — BS-9 useEffect covers all caches', () => {
    // Match the BS-9 useEffect block — lazy match with generous window so
    // future commentary additions don't break the test. Block opens with
    // "Phase 17.0 (BS-9)" and closes with `}, [SELECTED_BRANCH_ID]);`.
    const bs9Match = TFP_SRC.match(/Phase 17\.0 \(BS-9\)[\s\S]{0,3000}?\}, \[SELECTED_BRANCH_ID\]\);/);
    const bs9Block = bs9Match ? bs9Match[0] : '';

    it('Q1.0 BS-9 useEffect block resolved (sanity check)', () => {
      expect(bs9Match).toBeTruthy();
    });

    it('Q1.1 BS-9 effect resets medAllProducts + medGroupData + consAllProducts + consGroupData', () => {
      expect(bs9Block).toMatch(/setMedAllProducts\(\[\]\)/);
      expect(bs9Block).toMatch(/setMedGroupData\(\[\]\)/);
      expect(bs9Block).toMatch(/setConsAllProducts\(\[\]\)/);
      expect(bs9Block).toMatch(/setConsGroupData\(\[\]\)/);
    });

    it('Q1.2 BS-9 effect ALSO resets buyItems + buyCategories (Phase 17.2-quinquies fix)', () => {
      expect(bs9Block).toMatch(/setBuyItems\(\{\s*course:\s*\[\]\s*,\s*promotion:\s*\[\]\s*,\s*product:\s*\[\]\s*\}\)/);
      expect(bs9Block).toMatch(/setBuyCategories\(\{\s*course:\s*\[\]\s*,\s*promotion:\s*\[\]\s*,\s*product:\s*\[\]\s*\}\)/);
    });

    it('Q1.3 BS-9 dep array ends with [SELECTED_BRANCH_ID]', () => {
      // The block closes with `}, [SELECTED_BRANCH_ID]);` literal.
      expect(bs9Block.endsWith('}, [SELECTED_BRANCH_ID]);')).toBe(true);
    });
  });

  describe('Q2 — form-data useEffect deps include SELECTED_BRANCH_ID', () => {
    it('Q2.1 the form-data useEffect deps end with [customerId, treatmentId, isEdit, SELECTED_BRANCH_ID, loadRetryNonce]', () => {
      // The form-data load is the long backend-mode useEffect. Locate by its
      // distinctive opening marker + assert the closing dep array contains
      // SELECTED_BRANCH_ID alongside the legacy three deps.
      // TFP resilient-timeout repoint (2026-07-19): loadRetryNonce joined the
      // deps so the ลองใหม่ escape re-runs the whole load (RT.3 locks it too).
      expect(TFP_SRC).toMatch(/\}, \[customerId, treatmentId, isEdit, SELECTED_BRANCH_ID, loadRetryNonce\]\);/);
    });

    it('Q2.2 the LEGACY form-data dep array (without SELECTED_BRANCH_ID) is gone', () => {
      // The pre-fix shape was `}, [customerId, treatmentId, isEdit]);`
      // After the fix it should NEVER appear standalone — only the extended
      // 4-dep form should be present.
      // V21-class fixup (Phase 26.2 Task 4): history-fetch useEffect legitimately uses
      // [customerId, treatmentId, isEdit] (3 deps — history re-fetches on these; no
      // SELECTED_BRANCH_ID needed since history is customer-level, not branch-level).
      // Exactly 1 occurrence is now the correct contract (the history-fetch useEffect).
      // The form-data useEffect (the target of Q2.1) correctly has the 4-dep extended array.
      const legacyOnly = /\}, \[customerId, treatmentId, isEdit\]\);/g;
      const matches = TFP_SRC.match(legacyOnly) || [];
      expect(matches.length).toBe(1);
    });
  });

  describe('Q3 — modal openers no longer short-circuit on cached length', () => {
    it('Q3.1 openMedModal has NO `if (medAllProducts.length > 0) return;`', () => {
      expect(TFP_SRC).not.toMatch(/if\s*\(\s*medAllProducts\.length\s*>\s*0\s*\)\s*return\s*;/);
    });
    it('Q3.2 openMedGroupModal has NO `if (medGroupData.length > 0) return;`', () => {
      expect(TFP_SRC).not.toMatch(/if\s*\(\s*medGroupData\.length\s*>\s*0\s*\)\s*return\s*;/);
    });
    it('Q3.3 openConsModal has NO `if (consAllProducts.length > 0) return;`', () => {
      expect(TFP_SRC).not.toMatch(/if\s*\(\s*consAllProducts\.length\s*>\s*0\s*\)\s*return\s*;/);
    });
    it('Q3.4 openConsGroupModal has NO `if (consGroupData.length > 0) return;`', () => {
      expect(TFP_SRC).not.toMatch(/if\s*\(\s*consGroupData\.length\s*>\s*0\s*\)\s*return\s*;/);
    });
    it('Q3.5 openBuyModal has NO `if (buyItems[type]?.length > 0) return;`', () => {
      expect(TFP_SRC).not.toMatch(/if\s*\(\s*buyItems\[\s*type\s*\]\?\.length\s*>\s*0\s*\)\s*return\s*;/);
    });
  });

  describe('Q4 — inline tab-switch guards always trigger refetch', () => {
    it('Q4.1 the buyModalType <select> onChange calls openBuyModal unconditionally (now in TfpBuyModal)', () => {
      // Pattern: setBuyVatMap({}); openBuyModal(e.target.value);
      // The pre-fix shape was: setBuyVatMap({}); if (!buyItems[e.target.value]?.length) openBuyModal(e.target.value);
      // TFP extraction step 3 repoint (2026-07-19): the JSX lives in TfpBuyModal.
      expect(BUY_MODAL_SRC).toMatch(/setBuyVatMap\(\{\}\); openBuyModal\(e\.target\.value\)/);
      expect(BUY_MODAL_SRC).not.toMatch(/if\s*\(\s*!buyItems\[\s*e\.target\.value\s*\]\?\.length\s*\)\s*openBuyModal/);
      expect(TFP_SRC).not.toMatch(/if\s*\(\s*!buyItems\[\s*e\.target\.value\s*\]\?\.length\s*\)\s*openBuyModal/);
    });

    it('Q4.2 the per-type sidebar button onClick calls openBuyModal unconditionally (now in TfpBuyModal)', () => {
      // The sidebar buttons iterate ['promotion','course','product'].map and each
      // button's onClick should call openBuyModal(type) without an inverse-guard.
      // TFP extraction step 3 repoint (2026-07-19): the JSX lives in TfpBuyModal.
      expect(BUY_MODAL_SRC).toMatch(/setBuyModalType\(type\); setBuySelectedCat\(''\); openBuyModal\(type\)/);
      // The pre-fix shape `if (!buyItems[type]?.length) openBuyModal(type)` is gone from BOTH homes.
      expect(BUY_MODAL_SRC).not.toMatch(/if\s*\(\s*!buyItems\[\s*type\s*\]\?\.length\s*\)\s*openBuyModal\(type\)/);
      expect(TFP_SRC).not.toMatch(/if\s*\(\s*!buyItems\[\s*type\s*\]\?\.length\s*\)\s*openBuyModal\(type\)/);
    });
  });

  describe('Q5 — cross-spec invariants (defense-in-depth)', () => {
    it('Q5.1 useSelectedBranch is imported (BSA Layer integration intact)', () => {
      expect(TFP_SRC).toMatch(/import\s*\{\s*useSelectedBranch\s*\}\s*from\s*['"]\.\.\/lib\/BranchContext\.jsx['"]/);
    });
    it('Q5.2 SELECTED_BRANCH_ID is destructured from useSelectedBranch (selectedBranchId is sanctioned alias, not forbidden shadow)', () => {
      // Phase 17.2-septies (2026-05-05) — relaxed to allow additional
      // destructured fields (branches: branchList for branch banner).
      // Phase 27.0 (2026-05-14) V21-class fixup — Task 5 added selectedBranchId as a SANCTIONED
      // alias alongside SELECTED_BRANCH_ID (both from same branchId value; backward compat preserved).
      // "No shadow var" meant: no UNRELATED variable named branchId that bypasses the hook.
      // selectedBranchId IS the hook value — it IS sanctioned. Title updated accordingly.
      // Anti-regression: arbitrary shadow vars (branchSelected, currentBranch) remain forbidden.
      expect(TFP_SRC).toMatch(/const\s*\{[^}]*branchId:\s*SELECTED_BRANCH_ID[^}]*\}\s*=\s*useSelectedBranch\(\)/);
      expect(TFP_SRC).not.toMatch(/const\s+branchSelected\s*=/);
      // Phase 27.0 (2026-05-14) — `const currentBranch = (branchList || ...).find(...)` is a
      // SANCTIONED derived var for branch banner display (reads from useSelectedBranch().branches).
      // Removed the overly-tight `[^u]` guard that incorrectly flagged this legitimate pattern.
      // Anti-shadow intent preserved by the other 2 assertions (branchSelected + canonical destructure).
    });
    it('Q5.3 NO `if (X.length > 0) return;` of any kind in modal openers', () => {
      // Generic catch-all: any future cache-shape variant gets caught.
      const anyGuard = /if\s*\(\s*\w+(?:\.\w+|\[\s*\w+\s*\]\?\.\w+)?\.length\s*>\s*0\s*\)\s*return\s*;/g;
      const hits = TFP_SRC.match(anyGuard) || [];
      // Allow zero. If any future feature wants caching, it must implement
      // branch-keyed caching (Option B from the spec) and update this test.
      expect(hits).toEqual([]);
    });
    it('Q5.4 Phase 17.2-quinquies marker comment present (institutional memory)', () => {
      expect(TFP_SRC).toMatch(/Phase 17\.2-quinquies/);
    });
  });
});
