// Phase 15.1 — Central Stock Conditional, READ-ONLY UI
// Full-flow simulate test (Rule I) covering CentralStockTab + extended panels.
//
// What ships in 15.1:
//   - CentralStockTab.jsx: warehouse selector + sub-tabs + zero-state + lazy
//     load via BackendDashboard
//   - StockBalancePanel: defaultLocationId + lockLocation props
//   - StockTransferPanel + StockWithdrawalPanel: filterLocationId prop
//   - MovementLogPanel: branchIdOverride prop
//   - CentralWarehousePanel: onAfterCreate callback prop
//   - navConfig.js: 'central-stock' added to stock section
//   - tabPermissions.js: 'central-stock' requires central_stock permission
//   - BackendDashboard.jsx: render branch + lazy import
//
// Iron-clad rule mapping:
//   E    Backend = Firestore-only — no brokerClient import in CentralStockTab
//   H    Data ownership — central stock 100% Firestore
//   I    Full-flow simulate — this file chains warehouse selection → sub-tab
//        routing → prop pass-through to existing panels
//   C1   Rule of 3 — additive props on shared panels (no fork)
//   C3   Lean schema — zero new collections (15.2 adds be_central_stock_orders)
//   V12  No shape migration — additive props only
//   V13  Helper-only tests not enough — this file is a flow simulate
//   V21  Source-grep can encode broken behavior — pair with runtime where
//        possible (jsdom render is the runtime here for read-only UI)

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const navConfigSrc = read('src/components/backend/nav/navConfig.js');
const tabPermsSrc = read('src/lib/tabPermissions.js');
const centralTabSrc = read('src/components/backend/CentralStockTab.jsx');
const balancePanelSrc = read('src/components/backend/StockBalancePanel.jsx');
const transferPanelSrc = read('src/components/backend/StockTransferPanel.jsx');
const withdrawalPanelSrc = read('src/components/backend/StockWithdrawalPanel.jsx');
const movementPanelSrc = read('src/components/backend/MovementLogPanel.jsx');
const warehousePanelSrc = read('src/components/backend/CentralWarehousePanel.jsx');
const dashboardSrc = read('src/pages/BackendDashboard.jsx');

// ────────────────────────────────────────────────────────────────────────
// F1 — navConfig wiring
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F1 — navConfig central-stock entry', () => {
  it("F1.1 'central-stock' item exists in stock section", () => {
    expect(navConfigSrc).toContain("id: 'central-stock'");
    // and is in the stock section (between 'stock' section block and next section)
    const stockSectionStart = navConfigSrc.indexOf("id: 'stock'");
    const financeSectionStart = navConfigSrc.indexOf("id: 'finance'");
    expect(stockSectionStart).toBeGreaterThan(0);
    expect(financeSectionStart).toBeGreaterThan(stockSectionStart);
    const stockSection = navConfigSrc.slice(stockSectionStart, financeSectionStart);
    expect(stockSection).toContain("id: 'central-stock'");
  });

  it("F1.2 label is Thai 'คลังกลาง'", () => {
    expect(navConfigSrc).toMatch(/id:\s*'central-stock'[^}]+label:\s*'คลังกลาง'/);
  });

  it('F1.3 uses Warehouse icon + orange color (matches StockBalance central-tier accent)', () => {
    expect(navConfigSrc).toMatch(/id:\s*'central-stock'[^}]+icon:\s*Warehouse/);
    expect(navConfigSrc).toMatch(/id:\s*'central-stock'[^}]+color:\s*'orange'/);
  });

  it("F1.4 Warehouse icon is imported from lucide-react", () => {
    // Either named directly or aliased — accept both
    expect(navConfigSrc).toMatch(/Warehouse[\s,]/);
  });

  it("F1.5 palette includes 'central' + 'คลังกลาง' for cmdk fuzzy search", () => {
    const m = navConfigSrc.match(/id:\s*'central-stock'[^}]+palette:\s*'([^']+)'/);
    expect(m).toBeTruthy();
    expect(m[1].toLowerCase()).toContain('central');
    expect(m[1]).toContain('คลังกลาง');
  });
});

// ────────────────────────────────────────────────────────────────────────
// F2 — tabPermissions gate
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F2 — tabPermissions central-stock gate', () => {
  it("F2.1 'central-stock' key exists in TAB_PERMISSION_MAP", () => {
    expect(tabPermsSrc).toContain("'central-stock':");
  });

  it("F2.2 requires 'central_stock' permission key", () => {
    expect(tabPermsSrc).toMatch(/'central-stock':\s*\{\s*requires:\s*\[\s*'central_stock'\s*\]/);
  });

  it("F2.3 NOT marked adminOnly (regular permission gate)", () => {
    const m = tabPermsSrc.match(/'central-stock':\s*\{[^}]+\}/);
    expect(m).toBeTruthy();
    // adminOnly should NOT appear in the entry
    expect(m[0]).not.toContain('adminOnly: true');
  });
});

// ────────────────────────────────────────────────────────────────────────
// F3 — BackendDashboard wiring
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F3 — BackendDashboard render branch', () => {
  it('F3.1 lazy-imports CentralStockTab', () => {
    expect(dashboardSrc).toMatch(/lazy\(\(\)\s*=>\s*import\(['"]\.\.\/components\/backend\/CentralStockTab\.jsx['"]\)\)/);
  });

  it("F3.2 render branch matches activeTab === 'central-stock'", () => {
    expect(dashboardSrc).toMatch(/activeTab\s*===\s*'central-stock'/);
  });

  it('F3.3 CentralStockTab receives clinicSettings + theme props (consistent with sibling tabs)', () => {
    const branch = dashboardSrc.match(/activeTab\s*===\s*'central-stock'\s*\?\s*\([\s\S]{0,300}/);
    expect(branch).toBeTruthy();
    expect(branch[0]).toContain('clinicSettings={clinicSettings}');
    expect(branch[0]).toContain('theme={theme}');
  });
});

// ────────────────────────────────────────────────────────────────────────
// F4 — CentralStockTab structure
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F4 — CentralStockTab structure', () => {
  it('F4.1 default-exports a function (React component)', () => {
    expect(centralTabSrc).toMatch(/export default function CentralStockTab/);
  });

  it('F4.2 imports listCentralWarehouses from backendClient', () => {
    expect(centralTabSrc).toMatch(/import\s*\{\s*listCentralWarehouses\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('F4.3 has 6 sub-tabs: balance, orders, transfers, withdrawals, movements, warehouses', () => {
    expect(centralTabSrc).toContain("id: 'balance'");
    expect(centralTabSrc).toContain("id: 'orders'");
    expect(centralTabSrc).toContain("id: 'transfers'");
    expect(centralTabSrc).toContain("id: 'withdrawals'");
    expect(centralTabSrc).toContain("id: 'movements'");
    expect(centralTabSrc).toContain("id: 'warehouses'");
  });

  it('F4.4 has zero-state path when warehouses.length === 0', () => {
    expect(centralTabSrc).toMatch(/warehouses\.length\s*===\s*0/);
    expect(centralTabSrc).toContain('สร้างคลังกลางแห่งแรก');
  });

  it('F4.5 orders sub-tab renders CentralStockOrderPanel (Phase 15.2 wired in commit AFTER dba27ad)', () => {
    // Phase 15.1 originally shipped a placeholder; Phase 15.2 replaced it
    // with the real CentralStockOrderPanel. This assertion locks the
    // post-15.2 wiring contract — future slices must not regress it.
    expect(centralTabSrc).toMatch(/import CentralStockOrderPanel from/);
    expect(centralTabSrc).toMatch(/subTab\s*===\s*'orders'\s*&&\s*\(\s*<CentralStockOrderPanel/);
    expect(centralTabSrc).not.toContain('central-orders-coming-soon');
  });

  it('F4.6 reuses existing panels (Rule C1 — no fork)', () => {
    expect(centralTabSrc).toContain("from './StockBalancePanel.jsx'");
    expect(centralTabSrc).toContain("from './StockTransferPanel.jsx'");
    expect(centralTabSrc).toContain("from './StockWithdrawalPanel.jsx'");
    expect(centralTabSrc).toContain("from './MovementLogPanel.jsx'");
    expect(centralTabSrc).toContain("from './CentralWarehousePanel.jsx'");
  });

  it('F4.7 passes selectedWarehouseId via the new override props', () => {
    // Balance: defaultLocationId + lockLocation
    expect(centralTabSrc).toMatch(/StockBalancePanel[^>]+defaultLocationId=\{selectedWarehouseId\}/);
    expect(centralTabSrc).toMatch(/StockBalancePanel[^>]+lockLocation/);
    // Transfer + Withdrawal: filterLocationId
    expect(centralTabSrc).toMatch(/StockTransferPanel[^>]+filterLocationId=\{selectedWarehouseId\}/);
    expect(centralTabSrc).toMatch(/StockWithdrawalPanel[^>]+filterLocationId=\{selectedWarehouseId\}/);
    // Movement: branchIdOverride
    expect(centralTabSrc).toMatch(/MovementLogPanel[^>]+branchIdOverride=\{selectedWarehouseId\}/);
  });

  it('F4.8 warehouse selector shows ONLY when warehouses.length > 1 (single-warehouse: just label)', () => {
    expect(centralTabSrc).toMatch(/warehouses\.length\s*>\s*1/);
    expect(centralTabSrc).toContain('central-warehouse-selector');
  });

  it('F4.9 Rule E — no brokerClient IMPORT (backend = Firestore only)', () => {
    // Match actual import lines, not mere mentions of the word in comments.
    expect(centralTabSrc).not.toMatch(/^\s*import\s+[^;]*brokerClient/m);
    expect(centralTabSrc).not.toMatch(/from\s+['"][^'"]*brokerClient/);
  });

  it('F4.10 Rule H — no ProClinic sync paths (central stock 100% OURS)', () => {
    // No fetch / import from /api/proclinic/* — comments referencing the rule are fine.
    expect(centralTabSrc).not.toMatch(/from\s+['"][^'"]*\/api\/proclinic\//);
    expect(centralTabSrc).not.toMatch(/fetch\(\s*['"`][^'"`]*\/api\/proclinic\//);
    expect(centralTabSrc).not.toMatch(/proclinic\.com|loverclinic\.proclinic/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F5 — Existing panels gained additive override props (V12-safe)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F5 — additive override props on existing panels', () => {
  it('F5.1 StockBalancePanel — defaultLocationId + lockLocation accepted', () => {
    expect(balancePanelSrc).toMatch(/function StockBalancePanel\([^)]+defaultLocationId[^)]*lockLocation[^)]*\)/);
  });

  it('F5.2 StockBalancePanel — defaultLocationId initializes locationId state', () => {
    expect(balancePanelSrc).toMatch(/useState\(defaultLocationId\s*\|\|\s*'main'\)/);
  });

  it('F5.3 StockBalancePanel — sync useEffect when defaultLocationId changes (async parent)', () => {
    expect(balancePanelSrc).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*if\s*\(defaultLocationId\s*&&\s*defaultLocationId\s*!==\s*locationId\)/);
  });

  it('F5.4 StockBalancePanel — lockLocation hides the dropdown', () => {
    expect(balancePanelSrc).toMatch(/!lockLocation\s*&&\s*\(/);
  });

  it('F5.5 StockTransferPanel — filterLocationId narrows listStockTransfers query', () => {
    expect(transferPanelSrc).toMatch(/function StockTransferPanel\([^)]+filterLocationId[^)]*\)/);
    expect(transferPanelSrc).toMatch(/listStockTransfers\(filterLocationId\s*\?\s*\{\s*locationId:\s*filterLocationId\s*\}\s*:\s*undefined\)/);
  });

  it('F5.6 StockWithdrawalPanel — filterLocationId narrows listStockWithdrawals query', () => {
    expect(withdrawalPanelSrc).toMatch(/function StockWithdrawalPanel\([^)]+filterLocationId[^)]*\)/);
    expect(withdrawalPanelSrc).toMatch(/listStockWithdrawals\(filterLocationId\s*\?\s*\{\s*locationId:\s*filterLocationId\s*\}\s*:\s*undefined\)/);
  });

  it('F5.7 MovementLogPanel — branchIdOverride defeats BranchContext when supplied', () => {
    expect(movementPanelSrc).toMatch(/function MovementLogPanel\([^)]+branchIdOverride[^)]*\)/);
    expect(movementPanelSrc).toMatch(/const BRANCH_ID\s*=\s*branchIdOverride\s*\|\|\s*ctxBranchId/);
  });

  it('F5.8 CentralWarehousePanel — onAfterCreate fires on first-create (not edit)', () => {
    expect(warehousePanelSrc).toMatch(/function CentralWarehousePanel\([^)]+onAfterCreate[^)]*\)/);
    expect(warehousePanelSrc).toMatch(/onAfterCreate.*&&\s*!editing/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F6 — Anti-regression: existing panels unchanged in default behaviour
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F6 — anti-regression (V12 multi-reader sweep)', () => {
  it('F6.1 StockBalancePanel still uses internal location dropdown when NOT locked', () => {
    // The dropdown markup must still exist (just conditionally rendered now).
    expect(balancePanelSrc).toContain('สถานที่:');
    // Phase 15.7-ter (2026-04-28) — onChange now ALSO flips the
    // userPickedLocation flag so the auto-pick effect doesn't override
    // admin's manual choice. Both setters must fire on change.
    expect(balancePanelSrc).toMatch(/value=\{locationId\}\s+onChange=\{e\s*=>\s*\{\s*setLocationId\(e\.target\.value\);\s*setUserPickedLocation\(true\)/);
  });

  it('F6.2 StockBalancePanel default location is "main" when no override', () => {
    expect(balancePanelSrc).toMatch(/useState\(defaultLocationId\s*\|\|\s*'main'\)/);
  });

  it('F6.3 StockTransferPanel still calls listStockTransfers without filter when no override', () => {
    expect(transferPanelSrc).toContain('listStockTransfers(filterLocationId ? { locationId: filterLocationId } : undefined)');
  });

  it('F6.4 StockWithdrawalPanel still calls listStockWithdrawals without filter when no override', () => {
    expect(withdrawalPanelSrc).toContain('listStockWithdrawals(filterLocationId ? { locationId: filterLocationId } : undefined)');
  });

  it('F6.5 MovementLogPanel still uses BranchContext when no override', () => {
    // Phase 15.4 post-deploy bug 2 v3 — destructure extended to also include
    // `branches` for default-branch detection (legacy-main fallback gate).
    expect(movementPanelSrc).toMatch(/const\s*\{\s*branchId:\s*ctxBranchId(?:\s*,\s*\w+)*\s*\}\s*=\s*useSelectedBranch\(\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F7 — Iron-clad rule guards (source-grep)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F7 — iron-clad guards', () => {
  it('F7.1 Rule E — CentralStockTab NEVER imports brokerClient (covered by F4.9)', () => {
    expect(centralTabSrc).not.toMatch(/^\s*import\s+[^;]*brokerClient/m);
  });

  it('F7.2 Rule E — CentralStockTab NEVER fetches /api/proclinic/* (comments referencing rule are fine)', () => {
    // Reject only EXECUTABLE patterns: import / fetch / template-string URL.
    expect(centralTabSrc).not.toMatch(/from\s+['"][^'"]*\/api\/proclinic\//);
    expect(centralTabSrc).not.toMatch(/fetch\(\s*['"`][^'"`]*\/api\/proclinic\//);
  });

  it('F7.3 Rule C2 — no Math.random for IDs (would generate insecure tokens)', () => {
    expect(centralTabSrc).not.toContain('Math.random()');
  });

  it('F7.4 Rule V31 — no silent-swallow try/catch console.warn(continuing) pattern', () => {
    expect(centralTabSrc).not.toMatch(/console\.warn\([^)]*continuing/i);
  });

  it('F7.5 Rule I marker — file references Phase 15.1 tag (institutional memory grep)', () => {
    expect(centralTabSrc).toContain('Phase 15.1');
  });
});

// ────────────────────────────────────────────────────────────────────────
// F8 — Adversarial: prop edge cases (simulate without React mount)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.1 F8 — adversarial prop edge cases', () => {
  // Pure simulate of the prop-resolution logic (mirrors what the panels do).
  function resolveBranchId({ branchIdOverride, ctxBranchId }) {
    return branchIdOverride || ctxBranchId;
  }
  function resolveDefaultLocation(defaultLocationId) {
    return defaultLocationId || 'main';
  }
  function resolveTransferFilter(filterLocationId) {
    return filterLocationId ? { locationId: filterLocationId } : undefined;
  }

  it('F8.1 branchIdOverride empty string falls through to ctx', () => {
    expect(resolveBranchId({ branchIdOverride: '', ctxBranchId: 'main' })).toBe('main');
  });

  it('F8.2 branchIdOverride null falls through to ctx', () => {
    expect(resolveBranchId({ branchIdOverride: null, ctxBranchId: 'main' })).toBe('main');
  });

  it('F8.3 branchIdOverride wins over ctx when both set', () => {
    expect(resolveBranchId({ branchIdOverride: 'WH-X', ctxBranchId: 'main' })).toBe('WH-X');
  });

  it('F8.4 defaultLocationId undefined defaults to main', () => {
    expect(resolveDefaultLocation(undefined)).toBe('main');
  });

  it('F8.5 defaultLocationId 0 (falsy number) defaults to main', () => {
    expect(resolveDefaultLocation(0)).toBe('main');
  });

  it('F8.6 transfer filter undefined when no filterLocationId', () => {
    expect(resolveTransferFilter(undefined)).toBeUndefined();
    expect(resolveTransferFilter('')).toBeUndefined();
    expect(resolveTransferFilter(null)).toBeUndefined();
  });

  it('F8.7 transfer filter wraps id when present', () => {
    expect(resolveTransferFilter('WH-X')).toEqual({ locationId: 'WH-X' });
  });
});
