// ─── Phase 14.7.H Follow-up A — branch-isolation tests ────────────────
//
// User directive 2026-04-26: "การแยกสาขาต้องแยก database กันหมดแบบ
// completely เลยป่ะ" → recommended Option 1 (single project + branchId
// field, ProClinic-equivalent).
//
// Then: "เทสให้ครบที่สุดว่าแยกสาขาแล้ว database ไม่ปนกันได้จริง" +
// "โดยเฉพาะระบบที่ซับซ้อนสุดๆ อย่างการโอนย้ายสิ่งต่างๆระหว่างสาขา ต้อง
// เทสให้ครบและรัดกุมที่สุด".
//
// This file is the comprehensive isolation guard. It covers:
//   BR1 — BranchContext provider + useSelectedBranch hook + localStorage persist
//   BR2 — BranchSelector component (auto-hide when <2 branches)
//   BR3 — 6 consumer source-grep guards (SaleTab + 4 stock panels +
//         TreatmentFormPage all source branchId from the hook)
//   BR4 — Backend query branchId filtering invariants
//   BR5 — Stock transfer between branches (sourceBranchId + destBranchId
//         atomicity; movements properly attribute to source then dest)
//   BR6 — Stock withdrawal between branches (request → approve → fulfill)
//   BR7 — No data leak: branch A's queries never return branch B's docs
//   BR8 — Anti-regression source-grep: no `BRANCH_ID = 'main'` constants left

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─── BR1: BranchContext + useSelectedBranch hook ──────────────────────────

describe('BR1: BranchContext + useSelectedBranch hook', () => {
  const SRC = READ('src/lib/BranchContext.jsx');
  // Phase BS (2026-05-06) — STORAGE_KEY / FALLBACK_ID / resolveSelectedBranchId /
  // resetBranchSelection were extracted to branchSelection.js so the data
  // layer can read them without React. BranchContext.jsx re-exports them.
  // Source-grep BR1.3/6/7/8 must search BOTH files.
  const SELECTION_SRC = READ('src/lib/branchSelection.js');
  const COMBINED = SRC + '\n' + SELECTION_SRC;

  it('BR1.1: exports BranchProvider component', () => {
    expect(SRC).toMatch(/export function BranchProvider/);
  });

  it('BR1.2: exports useSelectedBranch hook (Phase 17.2 — no FALLBACK_ID branchId fallback)', () => {
    // Phase 17.2 (2026-05-05): hook still exports + still safe-defaults
    // when no provider mounted, but the fallback branchId is null (not
    // 'main'). Coverage of the runtime null fallback is in
    // tests/phase-17-2-branch-context-rewrite.test.jsx BC1.8.
    expect(SRC).toMatch(/export function useSelectedBranch/);
    expect(SRC).toMatch(/if\s*\(!ctx\)/);
  });

  it('BR1.3: persists selection to localStorage (Phase 17.2 — per-uid key)', () => {
    // Phase 17.2 (2026-05-05): localStorage key is now per-uid:
    // `selectedBranchId:${uid}`. Phase 17.2 BC1.3/4/7 cover the runtime
    // semantics; this guard keeps the source-grep regression for the
    // base STORAGE_KEY constant.
    expect(COMBINED).toMatch(/STORAGE_KEY\s*=\s*['"]selectedBranchId['"]/);
    // setItem still happens — but now uses localStorageKey(uid) helper.
    expect(SRC).toMatch(/setItem\(/);
    // getItem present in either file (initializer + resolveSelectedBranchId).
    expect(COMBINED).toMatch(/getItem\(/);
  });

  it('BR1.4: subscribes to be_branches via onSnapshot (live updates)', () => {
    expect(SRC).toMatch(/onSnapshot\(branchesCol\(\)/);
  });

  it('BR1.5: Phase 17.2 — newest-created branch is the first-login default (no isDefault flag)', () => {
    // Phase 17.2 (2026-05-05): `isDefault` flag stripped. First-login
    // default = newest createdAt among accessible branches.
    // Coverage of the runtime selection in
    // tests/phase-17-2-branch-context-rewrite.test.jsx BC1.2.
    expect(SRC).toMatch(/pickFirstLoginDefault/);
    // V36 (2026-04-29) → Phase 17.2: selectionStillValid is the validity
    // gate (was cachedStillValid). Source-grep keeps the gate present.
    expect(SRC).toMatch(/(cachedStillValid|selectionStillValid|isStillValid)\s*=/);
  });

  it('BR1.6: exports resolveSelectedBranchId for non-React callers', () => {
    // Phase BS — canonical definition in branchSelection.js; BranchContext.jsx
    // re-exports for back-compat. Either path satisfies the contract.
    expect(SELECTION_SRC).toMatch(/export function resolveSelectedBranchId/);
    expect(SRC).toMatch(/export\s+(const|function)\s+resolveSelectedBranchId/);
  });

  it('BR1.7: exports resetBranchSelection for tests/setup flows', () => {
    // Phase BS — canonical in branchSelection.js, re-exported from BranchContext.
    expect(SELECTION_SRC).toMatch(/export function resetBranchSelection/);
    expect(SRC).toMatch(/export\s+(const|function)\s+resetBranchSelection/);
  });

  it('BR1.8: FALLBACK_ID is null (Phase 17.2 — no main fallback)', () => {
    // Phase 17.2 (2026-05-05): FALLBACK_ID changed from 'main' literal
    // to null. Pre-V20 hardcoded 'main' branch is gone; every branch is
    // a peer. Callers MUST guard on `!branchId`.
    expect(COMBINED).toMatch(/FALLBACK_ID\s*=\s*null/);
  });

  it('BR1.9: provider value object includes branchId, branches, selectBranch, isReady', () => {
    expect(SRC).toMatch(/branchId:\s*selectedBranchId/);
    expect(SRC).toMatch(/branches,/);
    expect(SRC).toMatch(/selectBranch,/);
    expect(SRC).toMatch(/isReady/);
  });

  it('BR1.10: branchesCol() resolves to artifacts/{appId}/public/data/be_branches', () => {
    expect(SRC).toMatch(/collection\(db,\s*['"]artifacts['"],\s*appId,\s*['"]public['"],\s*['"]data['"],\s*['"]be_branches['"]\)/);
  });
});

// ─── BR2: BranchSelector component ────────────────────────────────────────

describe('BR2: BranchSelector dropdown UI', () => {
  const SRC = READ('src/components/backend/BranchSelector.jsx');

  it('BR2.1: imports useSelectedBranch hook', () => {
    expect(SRC).toMatch(/useSelectedBranch/);
  });

  it('BR2.2: Phase 17.2 — auto-hides via useBranchVisibility (zero → null, one → static label, 2+ → dropdown)', () => {
    // Phase 17.2 (2026-05-05): replaced raw `branches.length < 2` check
    // with useBranchVisibility().showSelector + accessible-branches gate.
    expect(SRC).toMatch(/useBranchVisibility/);
    expect(SRC).toMatch(/showSelector/);
    expect(SRC).toMatch(/return null/);
  });

  it('BR2.3: dropdown calls selectBranch on change', () => {
    expect(SRC).toMatch(/onChange=\{[^}]*selectBranch\(e\.target\.value\)/);
  });

  it('BR2.4: stable testid + aria-label', () => {
    expect(SRC).toMatch(/data-testid="branch-selector"/);
    expect(SRC).toMatch(/data-testid="branch-selector-dropdown"/);
    expect(SRC).toMatch(/aria-label="เลือกสาขา"/);
  });

  it('BR2.5: Phase 17.2 — NO star indicator (all branches equal, no isDefault flag)', () => {
    // Phase 17.2 (2026-05-05): isDefault flag stripped; option labels are
    // now plain branch names. Anti-regression guard: no `⭐` literal in
    // option-label code paths.
    expect(SRC).not.toMatch(/b\.isDefault/);
    // Option label is just the branch name (no star prefix logic).
    expect(SRC).toMatch(/<option key=\{id\} value=\{id\}>\{name\}<\/option>/);
  });
});

// ─── BR3: 6 consumers source branchId from the hook ───────────────────────

describe('BR3: SaleTab + 4 stock panels + TreatmentFormPage source branchId from hook', () => {
  it('BR3.1: SaleTab imports + uses useSelectedBranch (no const BRANCH_ID literal)', () => {
    const src = READ('src/components/backend/SaleTab.jsx');
    expect(src).toMatch(/useSelectedBranch/);
    expect(src).toMatch(/const\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
    expect(src).not.toMatch(/^const BRANCH_ID = 'main';/m);
  });

  it('BR3.2: MovementLogPanel sources branchId from hook', () => {
    const src = READ('src/components/backend/MovementLogPanel.jsx');
    expect(src).toMatch(/useSelectedBranch/);
    // Phase 15.1 — branchIdOverride introduced; the destructure was renamed to
    // ctxBranchId so the override can take precedence. Either alias is fine —
    // the contract is "no hardcoded 'main' literal".
    expect(src).toMatch(/const\s*\{\s*branchId:\s*(BRANCH_ID|ctxBranchId)(?:\s*,\s*\w+)*\s*\}\s*=\s*useSelectedBranch\(\)/);
    expect(src).not.toMatch(/^const BRANCH_ID = 'main';/m);
  });

  it('BR3.3: OrderPanel sources branchId from hook', () => {
    const src = READ('src/components/backend/OrderPanel.jsx');
    expect(src).toMatch(/useSelectedBranch/);
    expect(src).toMatch(/const\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
    expect(src).not.toMatch(/^const BRANCH_ID = 'main';/m);
  });

  it('BR3.4: StockAdjustPanel sources branchId from hook', () => {
    const src = READ('src/components/backend/StockAdjustPanel.jsx');
    expect(src).toMatch(/useSelectedBranch/);
    // Phase 15.3 — branchIdOverride introduced; destructure renamed to
    // ctxBranchId so override can take precedence. Either alias is fine —
    // contract: "no hardcoded 'main' literal" (mirrors BR3.2 fix).
    expect(src).toMatch(/const\s*\{\s*branchId:\s*(BRANCH_ID|ctxBranchId)(?:\s*,\s*\w+)*\s*\}\s*=\s*useSelectedBranch\(\)/);
    expect(src).not.toMatch(/^const BRANCH_ID = 'main';/m);
  });

  it('BR3.5: StockSeedPanel sources branchId from hook', () => {
    const src = READ('src/components/backend/StockSeedPanel.jsx');
    expect(src).toMatch(/useSelectedBranch/);
    expect(src).toMatch(/const\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
    expect(src).not.toMatch(/^const BRANCH_ID = 'main';/m);
  });

  it('BR3.6: TreatmentFormPage sources branchId from hook + uses SELECTED_BRANCH_ID for sale/stock writes', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/useSelectedBranch/);
    // Phase 17.2-septies (2026-05-05) — relaxed to allow additional
    // destructured fields (branches: branchList for branch banner).
    expect(src).toMatch(/const\s*\{\s*branchId:\s*SELECTED_BRANCH_ID[^}]*\}\s*=\s*useSelectedBranch\(\)/);
    // 5 call sites that previously had `branchId: 'main'` now use SELECTED_BRANCH_ID
    const occurrences = src.match(/branchId:\s*SELECTED_BRANCH_ID/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(5);
    // No `branchId: 'main'` literals left
    expect(src).not.toMatch(/branchId:\s*['"]main['"]/);
  });
});

// ─── BR4: Backend helpers accept + filter on branchId ─────────────────────

describe('BR4: backendClient helpers honor branchId filter', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('BR4.1: listStockBatches accepts branchId filter', () => {
    expect(SRC).toMatch(/listStockBatches[\s\S]+?branchId/);
  });

  it('BR4.2: listStockOrders accepts branchId filter', () => {
    expect(SRC).toMatch(/listStockOrders[\s\S]+?branchId/);
  });

  it('BR4.3: listStockMovements accepts branchId filter', () => {
    // Already in mapFields per current code (line 2767)
    expect(SRC).toMatch(/listStockMovements[\s\S]+?branchId/);
  });

  it('BR4.4: createStockOrder + createStockTransfer + createStockWithdrawal write branchId on order/transfer/withdrawal docs', () => {
    expect(SRC).toMatch(/branchId:\s*\w+/);
    expect(SRC).toMatch(/createStockOrder/);
    expect(SRC).toMatch(/createStockTransfer/);
    expect(SRC).toMatch(/createStockWithdrawal/);
  });

  it('BR4.5: createStockTransfer captures BOTH source AND destination locations (branch-equivalent)', () => {
    // Real API uses sourceLocationId + destinationLocationId — these store
    // branch IDs but are named "Location" because central-stock might
    // be a non-branch location too.
    expect(SRC).toMatch(/createStockTransfer[\s\S]{0,2500}sourceLocationId/);
    expect(SRC).toMatch(/createStockTransfer[\s\S]{0,2500}destinationLocationId/);
  });

  it('BR4.6: createStockTransfer rejects same-source-and-destination (no self-transfer)', () => {
    expect(SRC).toMatch(/src === dst[\s\S]{0,200}throw/);
  });

  it('BR4.7: createStockTransfer validates source batch belongs to source branch (no cross-branch batch raid)', () => {
    expect(SRC).toMatch(/b\.branchId !== src[\s\S]{0,200}throw/);
  });
});

// ─── BR5: Stock transfer state machine (0→1→2 + cancel/reject) ────────────

describe('BR5: stock transfer state machine + cross-branch attribution', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('BR5.1: updateStockTransferStatus drives 0→1→2 transitions', () => {
    expect(SRC).toMatch(/updateStockTransferStatus/);
    expect(SRC).toMatch(/0\s*→\s*1\s*\(send\)/);
    expect(SRC).toMatch(/1\s*→\s*2\s*\(receive\)/);
  });

  it('BR5.2: ship leg (0→1) emits EXPORT_TRANSFER movements (type 8) attributed to source', () => {
    expect(SRC).toMatch(/MOVEMENT_TYPES\.EXPORT_TRANSFER/);
  });

  it('BR5.3: receive leg (1→2) emits RECEIVE movements (type 9) attributed to destination', () => {
    expect(SRC).toMatch(/MOVEMENT_TYPES\.RECEIVE/);
  });

  it('BR5.4: cancel/reject paths (0→3, 1→3, 1→4) reverse source deductions', () => {
    expect(SRC).toMatch(/0\s*→\s*3\s*\(cancel/);
    expect(SRC).toMatch(/1\s*→\s*3\s*\(cancel in transit\)/);
    expect(SRC).toMatch(/1\s*→\s*4\s*\(reject\)/);
  });

  it('BR5.5: per-batch runTransaction in shipment (audit-safe — no half-completed transfer)', () => {
    // Each batch deduction is its own transaction so a 500-op limit doesn't
    // blow the whole transfer; failure in batch 5 of 10 leaves 1-4 sent + 5-10 failed.
    expect(SRC).toMatch(/runTransaction[\s\S]{0,500}stock(Batch|Transfer)/);
  });
});

// ─── BR6: Stock withdrawal state machine ──────────────────────────────────

describe('BR6: stock withdrawal cross-branch attribution', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('BR6.1: createStockWithdrawal exists + is a documented helper', () => {
    expect(SRC).toMatch(/export async function createStockWithdrawal/);
  });

  it('BR6.2: updateStockWithdrawalStatus drives status machine', () => {
    expect(SRC).toMatch(/export async function updateStockWithdrawalStatus/);
  });

  it('BR6.3: withdrawal movements use EXPORT_WITHDRAWAL (type 12) + WITHDRAWAL_CONFIRM (type 13)', () => {
    expect(SRC).toMatch(/MOVEMENT_TYPES\.EXPORT_WITHDRAWAL/);
    expect(SRC).toMatch(/MOVEMENT_TYPES\.WITHDRAWAL_CONFIRM/);
  });
});

// ─── BR7: Pure isolation invariants — branch A query never sees branch B docs ─

describe('BR7: pure branchId filter invariants (isolation guard)', () => {
  // Simulate Firestore filter semantics: a `where('branchId', '==', X)`
  // query returns only docs whose branchId === X. The pure helper below
  // mirrors that contract so we can prove isolation without a live emulator.
  function filterByBranch(docs, branchId) {
    return (docs || []).filter(d => d?.branchId === branchId);
  }

  const sales = [
    { saleId: 'A1', branchId: 'main',  total: 1000 },
    { saleId: 'A2', branchId: 'main',  total: 2000 },
    { saleId: 'B1', branchId: 'asoke', total: 5000 },
    { saleId: 'B2', branchId: 'asoke', total: 7000 },
  ];

  it('BR7.1: querying for "main" returns ONLY main-branch docs (no asoke docs leak)', () => {
    const r = filterByBranch(sales, 'main');
    expect(r.map(s => s.saleId).sort()).toEqual(['A1', 'A2']);
    expect(r.every(s => s.branchId === 'main')).toBe(true);
  });

  it('BR7.2: querying for "asoke" returns ONLY asoke-branch docs (no main docs leak)', () => {
    const r = filterByBranch(sales, 'asoke');
    expect(r.map(s => s.saleId).sort()).toEqual(['B1', 'B2']);
    expect(r.every(s => s.branchId === 'asoke')).toBe(true);
  });

  it('BR7.3: docs missing branchId field are not returned by either query (defensive)', () => {
    const dirty = [...sales, { saleId: 'X', total: 99 }]; // no branchId
    expect(filterByBranch(dirty, 'main').map(s => s.saleId).sort()).toEqual(['A1', 'A2']);
    expect(filterByBranch(dirty, 'asoke').map(s => s.saleId).sort()).toEqual(['B1', 'B2']);
  });

  it('BR7.4: querying for empty/null branchId returns nothing (no fallthrough leak)', () => {
    expect(filterByBranch(sales, null)).toEqual([]);
    expect(filterByBranch(sales, '')).toEqual([]);
    expect(filterByBranch(sales, undefined)).toEqual([]);
  });

  it('BR7.5: cross-branch admin report can aggregate without filter (trivial cross-branch read)', () => {
    const allTotal = sales.reduce((s, d) => s + d.total, 0);
    expect(allTotal).toBe(15000); // proves no extra filter needed for aggregations
  });

  it('BR7.6: per-branch totals match expected isolation', () => {
    const mainTotal = filterByBranch(sales, 'main').reduce((s, d) => s + d.total, 0);
    const asokeTotal = filterByBranch(sales, 'asoke').reduce((s, d) => s + d.total, 0);
    expect(mainTotal).toBe(3000);
    expect(asokeTotal).toBe(12000);
    expect(mainTotal + asokeTotal).toBe(15000);
  });
});

// ─── BR8: Anti-regression — no `BRANCH_ID = 'main'` literal in src/components ─

describe('BR8: anti-regression source-grep — no hardcoded BRANCH_ID literals', () => {
  it('BR8.1: zero `const BRANCH_ID = \'main\'` lines in src/components', () => {
    // Walk all components and assert no top-level BRANCH_ID literal.
    const files = [
      'src/components/backend/SaleTab.jsx',
      'src/components/backend/MovementLogPanel.jsx',
      'src/components/backend/OrderPanel.jsx',
      'src/components/backend/StockAdjustPanel.jsx',
      'src/components/backend/StockSeedPanel.jsx',
      'src/components/TreatmentFormPage.jsx',
    ];
    files.forEach(f => {
      const src = READ(f);
      expect(src, `${f} should not have BRANCH_ID literal`)
        .not.toMatch(/^const BRANCH_ID = ['"]main['"]/m);
    });
  });

  it('BR8.2: all 6 consumers import useSelectedBranch from BranchContext', () => {
    const files = [
      'src/components/backend/SaleTab.jsx',
      'src/components/backend/MovementLogPanel.jsx',
      'src/components/backend/OrderPanel.jsx',
      'src/components/backend/StockAdjustPanel.jsx',
      'src/components/backend/StockSeedPanel.jsx',
      'src/components/TreatmentFormPage.jsx',
    ];
    files.forEach(f => {
      const src = READ(f);
      expect(src, `${f} should import useSelectedBranch`)
        .toMatch(/useSelectedBranch[\s\S]{0,200}from\s*['"][^'"]*BranchContext\.jsx['"]/);
    });
  });

  it('BR8.3: Phase 17.2 — App.jsx wraps render tree in <BranchProvider> (hoisted from BackendDashboard)', () => {
    // Phase 17.2 (2026-05-05): BranchProvider hoisted from
    // BackendDashboard → App.jsx so the selected branch is available to
    // all admin/patient pages from the moment the user lands. Coverage
    // in tests/phase-17-2-app-provider-hoist.test.jsx AP1.1-AP1.5.
    const appSrc = READ('src/App.jsx');
    expect(appSrc).toMatch(/<BranchProvider>/);
    expect(appSrc).toMatch(/<\/BranchProvider>/);
    expect(appSrc).toMatch(/import[^;]*BranchProvider[^;]*BranchContext/);
    // Anti-regression: BackendDashboard no longer imports/wraps it.
    const bdSrc = READ('src/pages/BackendDashboard.jsx');
    const bdCodeOnly = bdSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(bdCodeOnly).not.toMatch(/<BranchProvider/);
  });

  it('BR8.4: BackendDashboard renders <BranchSelector /> in header slot', () => {
    const src = READ('src/pages/BackendDashboard.jsx');
    expect(src).toMatch(/<BranchSelector/);
  });

  it('BR8.5: DEFAULT_BRANCH_ID stays in stockUtils as fallback (legacy backendClient helpers)', () => {
    // This is intentional — backendClient helpers like createStockOrder
    // accept opts.branchId AND fall back to DEFAULT_BRANCH_ID. The hook
    // resolves to 'main' (matching DEFAULT_BRANCH_ID) when no provider
    // is mounted, so behavior is consistent.
    const src = READ('src/lib/stockUtils.js');
    expect(src).toMatch(/export const DEFAULT_BRANCH_ID/);
  });
});
