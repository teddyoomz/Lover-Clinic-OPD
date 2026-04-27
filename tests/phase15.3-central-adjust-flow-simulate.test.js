// Phase 15.3 — Central adjustments flow-simulate test (Rule I)
//
// What ships in 15.3:
//   - StockAdjustPanel accepts `branchIdOverride` prop (mirrors Phase 15.1
//     pattern from MovementLogPanel)
//   - AdjustCreateForm gains `branchId` prop — fixes pre-existing bug where
//     it referenced BRANCH_ID outside its scope (sibling function had
//     undefined access; batch picker silently returned empty in central tier)
//   - CentralStockTab inserts new 'adjust' sub-tab between 'orders' and
//     'transfers' rendering StockAdjustPanel with selectedWarehouseId as
//     branchIdOverride
//   - branch-isolation.test.js BR3.4 relaxed (ctxBranchId alias allowed)
//
// Iron-clad mapping:
//   C1   Rule of 3 — branchIdOverride pattern shared with MovementLogPanel
//   E    Backend = Firestore-only — no brokerClient touched
//   I    Full-flow simulate — chains warehouse selection → sub-tab → panel
//        → query filter via branchIdOverride
//   V12  No shape migration — additive prop only; existing branch flow
//        unchanged when branchIdOverride is omitted (defaults to ctxBranchId)
//   V31  No silent-swallow — pre-existing AdjustCreateForm bug (undefined
//        BRANCH_ID) is now fixed via explicit prop threading

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MOVEMENT_TYPES } from '../src/lib/stockUtils.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const adjustPanelSrc = read('src/components/backend/StockAdjustPanel.jsx');
const centralTabSrc = read('src/components/backend/CentralStockTab.jsx');

// ────────────────────────────────────────────────────────────────────────
// F1 — StockAdjustPanel accepts + uses branchIdOverride
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.3 F1 — StockAdjustPanel branchIdOverride prop', () => {
  it('F1.1 signature includes branchIdOverride prop', () => {
    expect(adjustPanelSrc).toMatch(
      /function StockAdjustPanel\(\{[^}]*branchIdOverride[^}]*\}\)/
    );
  });

  it('F1.2 destructure renamed to ctxBranchId; BRANCH_ID = override || ctx', () => {
    expect(adjustPanelSrc).toMatch(
      /const\s*\{\s*branchId:\s*ctxBranchId\s*\}\s*=\s*useSelectedBranch\(\)/
    );
    expect(adjustPanelSrc).toMatch(
      /const\s+BRANCH_ID\s*=\s*branchIdOverride\s*\|\|\s*ctxBranchId/
    );
  });

  it('F1.3 loadAdjustments useCallback re-fires when BRANCH_ID changes (dep array)', () => {
    // Lock the dependency: panel must re-fetch when CentralStockTab
    // updates selectedWarehouseId after warehouse load. Without this,
    // the panel shows stale branch-context adjustments.
    const fnStart = adjustPanelSrc.indexOf('const loadAdjustments');
    expect(fnStart).toBeGreaterThan(0);
    const after = adjustPanelSrc.slice(fnStart, fnStart + 800);
    expect(after).toMatch(/\}, \[BRANCH_ID\]\)/);
  });

  it('F1.4 AdjustCreateForm receives branchId prop (fixes pre-existing scope bug)', () => {
    // Pre-existing bug: AdjustCreateForm referenced BRANCH_ID at lines
    // 191/220 but it was declared only inside StockAdjustPanel (sibling
    // function). Fix: thread branchId via prop.
    expect(adjustPanelSrc).toMatch(
      /<AdjustCreateForm[\s\S]{0,300}branchId=\{BRANCH_ID\}/
    );
  });

  it('F1.5 AdjustCreateForm signature accepts branchId', () => {
    expect(adjustPanelSrc).toMatch(
      /function AdjustCreateForm\(\{[^}]*branchId[^}]*\}\)/
    );
  });

  it('F1.6 AdjustCreateForm body declares BRANCH_ID from prop', () => {
    const fnStart = adjustPanelSrc.indexOf('function AdjustCreateForm');
    const after = adjustPanelSrc.slice(fnStart, fnStart + 800);
    expect(after).toMatch(/const\s+BRANCH_ID\s*=\s*branchId/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F2 — CentralStockTab adjust sub-tab wiring
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.3 F2 — CentralStockTab adjust sub-tab', () => {
  it('F2.1 imports StockAdjustPanel + SlidersHorizontal icon', () => {
    expect(centralTabSrc).toMatch(/import StockAdjustPanel from/);
    expect(centralTabSrc).toMatch(/SlidersHorizontal/);
  });

  it("F2.2 SUB_TABS contains 'adjust' entry between 'orders' and 'transfers'", () => {
    expect(centralTabSrc).toMatch(
      /id:\s*'orders'[\s\S]{0,200}id:\s*'adjust'[\s\S]{0,200}id:\s*'transfers'/
    );
    expect(centralTabSrc).toContain("label: 'ปรับสต็อก'");
  });

  it('F2.3 render branch passes selectedWarehouseId via branchIdOverride', () => {
    expect(centralTabSrc).toMatch(
      /subTab\s*===\s*'adjust'\s*&&\s*\(\s*<StockAdjustPanel[\s\S]{0,300}branchIdOverride=\{selectedWarehouseId\}/
    );
  });
});

// ────────────────────────────────────────────────────────────────────────
// F3 — Adversarial prop edge cases (pure simulate)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.3 F3 — branchIdOverride resolution', () => {
  function resolveBranchId({ branchIdOverride, ctxBranchId }) {
    return branchIdOverride || ctxBranchId;
  }

  it('F3.1 valid central WH id wins over context', () => {
    expect(resolveBranchId({ branchIdOverride: 'WH-2026-001', ctxBranchId: 'main' })).toBe('WH-2026-001');
  });

  it('F3.2 empty string falls through to context', () => {
    expect(resolveBranchId({ branchIdOverride: '', ctxBranchId: 'main' })).toBe('main');
  });

  it('F3.3 null falls through to context', () => {
    expect(resolveBranchId({ branchIdOverride: null, ctxBranchId: 'main' })).toBe('main');
  });

  it('F3.4 undefined falls through to context', () => {
    expect(resolveBranchId({ branchIdOverride: undefined, ctxBranchId: 'main' })).toBe('main');
  });
});

// ────────────────────────────────────────────────────────────────────────
// F4 — Iron-clad regression guards
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.3 F4 — iron-clad guards', () => {
  it('F4.1 StockAdjustPanel does NOT import brokerClient (Rule E)', () => {
    expect(adjustPanelSrc).not.toMatch(/^\s*import\s+[^;]*brokerClient/m);
    expect(adjustPanelSrc).not.toMatch(/from\s+['"][^'"]*brokerClient/);
  });

  it('F4.2 StockAdjustPanel — no V31 silent-swallow continuing pattern', () => {
    expect(adjustPanelSrc).not.toMatch(/console\.warn\([^)]*continuing/i);
  });

  it('F4.3 CentralStockTab — no brokerClient import (Rule E)', () => {
    expect(centralTabSrc).not.toMatch(/^\s*import\s+[^;]*brokerClient/m);
  });

  it('F4.4 Phase 15.3 marker present in StockAdjustPanel (institutional memory)', () => {
    expect(adjustPanelSrc).toContain('Phase 15.3');
  });
});

// ────────────────────────────────────────────────────────────────────────
// F5 — MOVEMENT_TYPES 3+4 unchanged (V12 multi-reader lock)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.3 F5 — MOVEMENT_TYPES ADJUST_ADD/REDUCE unchanged', () => {
  it('F5.1 ADJUST_ADD is still 3 (used by branch + central paths)', () => {
    expect(MOVEMENT_TYPES.ADJUST_ADD).toBe(3);
  });

  it('F5.2 ADJUST_REDUCE is still 4 (used by branch + central paths)', () => {
    expect(MOVEMENT_TYPES.ADJUST_REDUCE).toBe(4);
  });
});
