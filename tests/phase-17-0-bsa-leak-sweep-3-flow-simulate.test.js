// ─── Phase 17.0 — BSA Leak Sweep 3 + Branch-Refresh Invariant ─────────────
// Rule I full-flow simulate. Five F-groups:
//   F1 marketing tab branch-switch (Promotion/Coupon/Voucher source-grep)
//   F2 listProductGroupsForTreatment branchId filter (4 cases)
//   F3 scopedDataLayer auto-inject (wrapper passes resolveSelectedBranchId)
//   F4 TFP cache reset on branch change (uses SELECTED_BRANCH_ID per Phase 14.7.H wiring)
//   F5 source-grep regression guards (V21 mitigation)

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

// ─── F1 — Marketing tab branch-switch ─────────────────────────────────────

describe('F1 — Marketing tab branch-switch', () => {
  const tabs = ['PromotionTab', 'CouponTab', 'VoucherTab'];

  for (const tab of tabs) {
    it(`F1.${tab}.1 imports useSelectedBranch from BranchContext`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/import\s+\{[^}]*useSelectedBranch[^}]*\}\s+from\s+['"](\.\.\/)+lib\/BranchContext/);
    });

    it(`F1.${tab}.2 destructures branchId: selectedBranchId`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/);
    });

    it(`F1.${tab}.3 includes selectedBranchId in reload useCallback deps`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/reload[\s\S]+?useCallback\([\s\S]+?\},\s*\[[^\]]*selectedBranchId[^\]]*\]/);
    });

    it(`F1.${tab}.4 useEffect calls reload`, () => {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content).toMatch(/useEffect\(\s*\(\s*\)\s*=>\s*\{\s*reload\(\)\s*;?\s*\}\s*,\s*\[reload\]\s*\)/);
    });
  }
});

// ─── F2 — listProductGroupsForTreatment branchId filter ───────────────────

describe('F2 — listProductGroupsForTreatment branchId filter', () => {
  it('F2.1 declaration accepts {branchId, allBranches} opts', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment\s*\(\s*productType\s*,\s*\{\s*branchId\s*,\s*allBranches\s*=\s*false\s*\}\s*=\s*\{\s*\}\s*\)/);
  });

  it('F2.2 builds groupsRef + productsRef via query+where when branchId set', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/const\s+useFilter\s*=\s*branchId\s*&&\s*!\s*allBranches/);
    expect(content).toMatch(/const\s+groupsRef\s*=\s*useFilter[\s\S]+?query\(productGroupsCol\(\),\s*where\(['"]branchId['"]/);
    expect(content).toMatch(/const\s+productsRef\s*=\s*useFilter[\s\S]+?query\(productsCol\(\),\s*where\(['"]branchId['"]/);
  });

  it('F2.3 falls back to cross-branch when no branchId (back-compat)', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/const\s+groupsRef\s*=\s*useFilter[\s\S]+?:\s*productGroupsCol\(\)/);
    expect(content).toMatch(/const\s+productsRef\s*=\s*useFilter[\s\S]+?:\s*productsCol\(\)/);
  });

  it('F2.4 honors allBranches:true override', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/useFilter\s*=\s*branchId\s*&&\s*!\s*allBranches/);
  });
});

// ─── F3 — scopedDataLayer auto-inject ─────────────────────────────────────

describe('F3 — scopedDataLayer wrapper auto-inject', () => {
  // Phase 17.2-bis (2026-05-05) — wrappers now use the _autoInject /
  // _autoInjectPositional helpers instead of inline opts spread. Helpers
  // call resolveSelectedBranchId() inside, return [] when null. Tests
  // updated to assert the new pattern (helper-based) while preserving
  // intent: branchId auto-injection from resolver, allBranches passthrough.

  it('F3.1 wrapper uses _autoInjectPositional helper (Phase 17.2-bis)', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment\s*=\s*_autoInjectPositional\(\s*\(\)\s*=>\s*raw\.listProductGroupsForTreatment\s*\)/);
  });

  it('F3.2 _autoInjectPositional helper invokes resolveSelectedBranchId()', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    // Find the helper definition and assert it calls resolveSelectedBranchId.
    expect(content).toMatch(/function\s+_autoInjectPositional[\s\S]+?resolveSelectedBranchId\(\)/);
  });

  it('F3.3 _autoInjectPositional preserves explicit opts override + safe-empty fallback', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    // Helper has the safe-empty branch (returns Promise.resolve([]) when no id).
    expect(content).toMatch(/function\s+_autoInjectPositional[\s\S]+?Promise\.resolve\(\[\]\)/);
    // Helper passes through when explicit branchId set.
    expect(content).toMatch(/function\s+_autoInjectPositional[\s\S]+?opts\.branchId/);
  });
});

// ─── F4 — TFP cache reset on branch change ────────────────────────────────
//
// IMPORTANT: TFP uses SELECTED_BRANCH_ID (uppercase snake-case) per the
// existing Phase 14.7.H wiring at line 325. Marketing tabs use
// `selectedBranchId` per BS-9 canonical pattern. Both forms are valid;
// the F4 regex specifically targets TFP's existing form to avoid
// false-positive failures during Phase 17.0.

describe('F4 — TFP modal cache reset on branch change', () => {
  let tfpContent;
  beforeEach(() => {
    tfpContent = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
  });

  it('F4.1 imports useSelectedBranch', () => {
    expect(tfpContent).toMatch(/import\s+\{[^}]*useSelectedBranch[^}]*\}\s+from\s+['"](\.\.\/)+lib\/BranchContext/);
  });

  it('F4.2 destructures branchId as SELECTED_BRANCH_ID (Phase 14.7.H wiring)', () => {
    expect(tfpContent).toMatch(/const\s*\{\s*branchId:\s*SELECTED_BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  it('F4.3 useEffect clears all 4 modal caches keyed on SELECTED_BRANCH_ID', () => {
    const blockMatch = tfpContent.match(/useEffect\(\s*\(\s*\)\s*=>\s*\{[\s\S]+?\}\s*,\s*\[SELECTED_BRANCH_ID\]\s*\)/g) || [];
    const hasResetBlock = blockMatch.some(b =>
      /setMedAllProducts\(\[\]\)/.test(b) &&
      /setMedGroupData\(\[\]\)/.test(b) &&
      /setConsAllProducts\(\[\]\)/.test(b) &&
      /setConsGroupData\(\[\]\)/.test(b)
    );
    expect(hasResetBlock).toBe(true);
  });

  it('F4.4 useEffect deps include [SELECTED_BRANCH_ID]', () => {
    // Phase 17.2-quinquies (2026-05-05) extended the BS-9 reset block to
    // also drain buyItems + buyCategories — setBuyCategories is now the
    // last setter before the dep array close. Anchoring on that.
    expect(tfpContent).toMatch(/setBuyCategories\([^)]+\)\s*;?\s*\}\s*,\s*\[SELECTED_BRANCH_ID\]/);
  });

  it('F4.5 NO duplicate selectedBranchId destructure introduced (anti-regression)', () => {
    expect(tfpContent).not.toMatch(/const\s*\{\s*branchId:\s*selectedBranchId\s*\}\s*=\s*useSelectedBranch\(\)/);
  });
});

// ─── F5 — Source-grep regression guards (V21 mitigation) ─────────────────

describe('F5 — Source-grep regression guards', () => {
  it('F5.1 listProductGroupsForTreatment declaration accepts opts param (Layer 1)', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment\s*\([^)]*\{\s*branchId/);
  });

  it('F5.2 scopedDataLayer wrapper uses _autoInjectPositional for listProductGroupsForTreatment (Phase 17.2-bis)', () => {
    const content = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');
    expect(content).toMatch(/listProductGroupsForTreatment\s*=\s*_autoInjectPositional/);
  });

  it('F5.3 TFP imports useSelectedBranch', () => {
    const content = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(content).toMatch(/useSelectedBranch/);
  });

  it('F5.4 BS-9 marker comments in PromotionTab/CouponTab/VoucherTab', () => {
    for (const tab of ['PromotionTab', 'CouponTab', 'VoucherTab']) {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      expect(content, tab).toMatch(/Phase 17\.0|BS-9/);
    }
  });

  it('F5.5 anti-regression — no useCallback(...,[]) empty deps in fixed marketing tabs', () => {
    for (const tab of ['PromotionTab', 'CouponTab', 'VoucherTab']) {
      const content = fs.readFileSync(`src/components/backend/${tab}.jsx`, 'utf8');
      const reloadBlock = content.match(/reload\s*=\s*useCallback\([\s\S]+?\},\s*\[[^\]]*\]/);
      expect(reloadBlock?.[0], `${tab} reload useCallback deps`).toMatch(/selectedBranchId/);
    }
  });
});
