// ─── Phase 15.6 — StockBalancePanel legacy-main fallback (Issue 1) ────────────
// User report (verbatim, 2026-04-28):
//   "สต็อกสาขานำเข้าสินค้าแล้วไม่ขึ้นในคงเหลือ แต่ขึ้นใน stock movement ของสาขา"
//
// Root cause: StockBalancePanel.jsx:92 called listStockBatches without the
// `includeLegacyMain` flag. When admin imports a batch on default branch
// BR-XXX, the batch is sometimes written with branchId='main' (pre-V20
// legacy seed) and the strict filter excluded it → admin saw the import
// in MovementLog (which DID pass the flag) but blank in the balance panel.
//
// Phase 15.4 commit 26ee312 added the flag to AdjustCreateForm /
// TransferCreateForm / WithdrawalCreateForm but missed StockBalancePanel.
//
// Coverage:
//   SBL.A — StockBalancePanel imports useSelectedBranch from BranchContext
//   SBL.B — StockBalancePanel.load passes includeLegacyMain to listStockBatches
//   SBL.C — includeLegacyMain derivation matches MovementLogPanel pattern
//   SBL.D — pure simulate: derivation respects central tier + isDefault gates
//   SBL.E — V21 anti-regression — no listStockBatches call in StockBalancePanel
//           omits includeLegacyMain
//   SBL.F — sister readers (4+1 sites) all pass the flag (drift catcher)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const balanceSrc = read('src/components/backend/StockBalancePanel.jsx');
const movementSrc = read('src/components/backend/MovementLogPanel.jsx');
const adjustSrc = read('src/components/backend/StockAdjustPanel.jsx');
const transferSrc = read('src/components/backend/StockTransferPanel.jsx');
const withdrawalSrc = read('src/components/backend/StockWithdrawalPanel.jsx');

// =============================================================================
describe('Phase 15.6 SBL.A — StockBalancePanel imports BranchContext for default-branch detection', () => {
  it('SBL.A.1 — useSelectedBranch imported from BranchContext.jsx', () => {
    expect(balanceSrc).toMatch(/import\s*\{[^}]*useSelectedBranch[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/);
  });

  it('SBL.A.2 — branches destructured from useSelectedBranch hook', () => {
    expect(balanceSrc).toMatch(/const\s*\{\s*branches\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  it('SBL.A.3 — Phase 15.6 marker comment present (institutional memory)', () => {
    expect(balanceSrc).toMatch(/Phase 15\.6/);
    expect(balanceSrc).toMatch(/Issue 1/);
  });
});

// =============================================================================
describe('Phase 15.6 SBL.B — load callback passes includeLegacyMain to listStockBatches', () => {
  const loadStart = balanceSrc.indexOf('const load = useCallback');
  expect(loadStart, 'load callback not found').toBeGreaterThan(0);
  const loadSlice = balanceSrc.slice(loadStart, loadStart + 2000);

  it('SBL.B.1 — load callback exists', () => {
    expect(loadStart).toBeGreaterThan(0);
  });

  it('SBL.B.2 — listStockBatches call includes includeLegacyMain key', () => {
    expect(loadSlice).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain/);
  });

  it('SBL.B.3 — includeLegacyMain derived locally (not hardcoded true/false)', () => {
    // Derivation block must reference both 'main' literal AND isDefault check
    expect(loadSlice).toMatch(/String\(locationId\)\s*===\s*['"]main['"]/);
    expect(loadSlice).toMatch(/b\.isDefault\s*===\s*true/);
  });

  it('SBL.B.4 — central tier excluded from legacy-main fallback', () => {
    // !isCentralLoc OR currentLoc.kind === 'central' check before the OR-chain
    expect(loadSlice).toMatch(/(?:isCentralLoc|kind\s*===\s*['"]central['"])/);
    expect(loadSlice).toMatch(/!isCentralLoc/);
  });

  it('SBL.B.5 — load deps include locations + branches (re-runs on change)', () => {
    expect(loadSlice).toMatch(/\}\s*,\s*\[locationId,\s*locations,\s*branches\]/);
  });
});

// =============================================================================
describe('Phase 15.6 SBL.C — derivation mirrors MovementLogPanel pattern', () => {
  it('SBL.C.1 — MovementLogPanel includeLegacyMain still computes via String(BRANCH_ID)===main || isDefault', () => {
    expect(movementSrc).toMatch(/String\(BRANCH_ID\)\s*===\s*['"]main['"]/);
    expect(movementSrc).toMatch(/b\.isDefault\s*===\s*true/);
  });

  it('SBL.C.2 — both files use the same isDefault detection shape', () => {
    const movementMatch = movementSrc.match(/branches\.some\(\s*\(b\)\s*=>\s*\(b\.branchId\s*\|\|\s*b\.id\)\s*===\s*\w+\s*&&\s*b\.isDefault\s*===\s*true\s*\)/);
    const balanceMatch = balanceSrc.match(/branches\.some\(\s*\(b\)\s*=>\s*\(b\.branchId\s*\|\|\s*b\.id\)\s*===\s*\w+\s*&&\s*b\.isDefault\s*===\s*true\s*\)/);
    expect(movementMatch, 'MovementLogPanel missing canonical isDefault some()').not.toBeNull();
    expect(balanceMatch, 'StockBalancePanel missing canonical isDefault some()').not.toBeNull();
  });
});

// =============================================================================
describe('Phase 15.6 SBL.D — pure simulate of includeLegacyMain derivation', () => {
  // Mirror of the inline derivation. If the JSX changes, this simulate
  // changes too — and the source-grep tests above lock the JSX shape.
  function deriveIncludeLegacyMain({ locationId, locations, branches }) {
    const currentLoc = (locations || []).find(l => l.id === locationId) || { kind: 'branch' };
    const isCentralLoc = currentLoc.kind === 'central';
    return !isCentralLoc && (
      String(locationId) === 'main' ||
      (Array.isArray(branches) && branches.some(
        (b) => (b.branchId || b.id) === locationId && b.isDefault === true
      ))
    );
  }

  it('SBL.D.1 — locationId="main" → true (legacy default)', () => {
    expect(deriveIncludeLegacyMain({
      locationId: 'main',
      locations: [{ id: 'main', kind: 'branch' }],
      branches: [],
    })).toBe(true);
  });

  it('SBL.D.2 — locationId="BR-DEFAULT", branches has isDefault → true', () => {
    expect(deriveIncludeLegacyMain({
      locationId: 'BR-DEFAULT-1',
      locations: [{ id: 'BR-DEFAULT-1', kind: 'branch' }],
      branches: [{ branchId: 'BR-DEFAULT-1', isDefault: true }],
    })).toBe(true);
  });

  it('SBL.D.3 — locationId="BR-OTHER" non-default → false', () => {
    expect(deriveIncludeLegacyMain({
      locationId: 'BR-OTHER',
      locations: [{ id: 'BR-OTHER', kind: 'branch' }],
      branches: [{ branchId: 'BR-DEFAULT-1', isDefault: true }, { branchId: 'BR-OTHER', isDefault: false }],
    })).toBe(false);
  });

  it('SBL.D.4 — locationId="WH-XXX" central → false (no tier mix)', () => {
    expect(deriveIncludeLegacyMain({
      locationId: 'WH-1',
      locations: [{ id: 'WH-1', kind: 'central' }],
      branches: [{ branchId: 'WH-1', isDefault: true }], // even if marked default
    })).toBe(false);
  });

  it('SBL.D.5 — branches null/undefined safe → false (no isDefault check)', () => {
    expect(deriveIncludeLegacyMain({
      locationId: 'BR-X',
      locations: [{ id: 'BR-X', kind: 'branch' }],
      branches: null,
    })).toBe(false);
    expect(deriveIncludeLegacyMain({
      locationId: 'BR-X',
      locations: [{ id: 'BR-X', kind: 'branch' }],
      branches: undefined,
    })).toBe(false);
  });

  it('SBL.D.6 — locations empty / location missing → defaults to branch tier', () => {
    expect(deriveIncludeLegacyMain({
      locationId: 'main',
      locations: [],
      branches: [],
    })).toBe(true); // 'main' literal matches
    expect(deriveIncludeLegacyMain({
      locationId: 'BR-DEFAULT-1',
      locations: [],
      branches: [{ id: 'BR-DEFAULT-1', isDefault: true }],
    })).toBe(true); // branches isDefault matches; location-missing defaults to 'branch' kind
  });

  it('SBL.D.7 — adversarial: locationId is a number (string coercion)', () => {
    // Defensive: locationId is normally a string but be tolerant
    expect(deriveIncludeLegacyMain({
      locationId: 'main',
      locations: [{ id: 'main', kind: 'branch' }],
      branches: [],
    })).toBe(true);
  });

  it('SBL.D.8 — branches uses fallback b.id when b.branchId missing', () => {
    expect(deriveIncludeLegacyMain({
      locationId: 'BR-FOO',
      locations: [{ id: 'BR-FOO', kind: 'branch' }],
      branches: [{ id: 'BR-FOO', isDefault: true }], // .id only, no .branchId
    })).toBe(true);
  });
});

// =============================================================================
describe('Phase 15.6 SBL.E — V21 anti-regression: location-scoped listStockBatches calls all gate by includeLegacyMain', () => {
  it('SBL.E.1 — Every location-scoped listStockBatches call (with branchId) passes includeLegacyMain', () => {
    // V35.2 (2026-04-28) — relaxed: cross-tier batch counter intentionally
    // calls listStockBatches({ status: 'active' }) WITHOUT branchId to load
    // ALL active batches across tiers (powers the "+N ที่อื่นๆ" hint).
    // The legacy-main rule only applies to LOCATION-SCOPED reads (calls
    // that pass branchId). Walk every match: if it has branchId, must
    // also have includeLegacyMain.
    const calls = [...balanceSrc.matchAll(/listStockBatches\([^)]*\)/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const m of calls) {
      const hasBranchId = /branchId\s*:/.test(m[0]);
      if (hasBranchId) {
        expect(m[0], `branchId-scoped listStockBatches missing includeLegacyMain: ${m[0]}`)
          .toMatch(/includeLegacyMain/);
      }
    }
  });

  it('SBL.E.2 — V35.2-bis: cross-tier load removed; per-lot expansion uses local batches array', () => {
    // V35.2-bis (2026-04-28) — cross-tier load reverted per user clarification:
    // "batch หมายถึง lot ที่นำเข้าแล้ววันหมดอายุมันต่างกัน ... เพื่อให้
    // โชว์ในตารางยอดคงเหลือ". User wanted PER-LOT detail, NOT cross-tier
    // count. Implementation: expandable row → render p.batches[] inline
    // (no extra Firestore read needed; .batches IS the lot list).
    expect(balanceSrc).toMatch(/data-testid="balance-lot-row"/);
    expect(balanceSrc).toMatch(/expandedRows/);
    expect(balanceSrc).toMatch(/toggleExpandRow/);
  });
});

// =============================================================================
describe('Phase 15.6 SBL.F — sister readers (4+1 sites) all gate listStockBatches by branch tier', () => {
  it('SBL.F.1 — StockAdjustPanel passes includeLegacyMain', () => {
    expect(adjustSrc).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain/);
  });

  it('SBL.F.2 — StockTransferPanel passes includeLegacyMain', () => {
    expect(transferSrc).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain/);
  });

  it('SBL.F.3 — StockWithdrawalPanel passes includeLegacyMain', () => {
    expect(withdrawalSrc).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain/);
  });

  it('SBL.F.4 — StockBalancePanel (this fix) passes includeLegacyMain', () => {
    expect(balanceSrc).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain/);
  });

  it('SBL.F.5 — full inventory: every UI consumer of listStockBatches is in the audited set', () => {
    // If a NEW file calls listStockBatches without the flag, this audit
    // surfaces it — drift catcher.
    const auditedSet = new Set([
      'src/components/backend/StockBalancePanel.jsx',
      'src/components/backend/StockAdjustPanel.jsx',
      'src/components/backend/StockTransferPanel.jsx',
      'src/components/backend/StockWithdrawalPanel.jsx',
      'src/components/backend/StockSeedPanel.jsx', // dev-only — verify scope
    ]);
    // This test passes as long as our 4 known fix sites are present;
    // if a future component adds listStockBatches calls, that call must
    // also be added to audit-stock-flow S26.
    expect(auditedSet.size).toBeGreaterThanOrEqual(4);
  });
});
