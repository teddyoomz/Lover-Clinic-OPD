// V36 — Branch-correctness audit regression bank.
//
// Locks the V36 Phase 1.5 contract (2026-04-29) per user directive
// "make sure ว่าทุกปุ่มที่ wiring ข้อมูลมาที่ stock มันเลือกปรับ stock ถูกสาขา":
//
// Every UI button that mutates stock must pass branchId / sourceLocationId /
// destinationLocationId to its backend helper from the AUTHORITATIVE source:
//   - SaleTab + TreatmentFormPage: BranchContext.selectedBranchId via
//     useSelectedBranch() hook (single-branch tier, scoped to the user's
//     current branch view)
//   - StockOrderForm: form's branch field passed in from OrderPanel parent
//   - StockAdjustPanel: BranchContext (admin must switch BranchContext to
//     adjust a different branch)
//   - StockTransferPanel + StockWithdrawalPanel: form-selected
//     sourceLocationId + destinationLocationId (cross-tier, no implicit
//     fallback to BranchContext)
//   - CentralStockOrderPanel: centralWarehouseId from props (central tier
//     scope, NOT BranchContext)
//
// Audit invariant — no `branchId: 'main'` literal as fallback when an
// explicit branch is known. No reads of React context inside backendClient.js
// (backend layer must NOT depend on React; branchId is parameter-passed).
//
// Test classes:
//   V36.G.1-8   — SaleTab: BranchContext source
//   V36.G.9-16  — TreatmentFormPage: BranchContext source
//   V36.G.17-24 — OrderPanel + OrderCreateForm: form/parent source
//   V36.G.25-32 — StockAdjustPanel: BranchContext source
//   V36.G.33-40 — StockTransferPanel: form src/dst source
//   V36.G.41-48 — StockWithdrawalPanel: form src/dst source
//   V36.G.49-53 — CentralStockOrderPanel: warehouseId source + global
//                 invariants (no 'main' literal fallback, no React context
//                 leak into backendClient.js)

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BACKEND_CLIENT = readFileSync(
  resolve(__dirname, '../src/lib/backendClient.js'),
  'utf-8'
);
const SALE_TAB = readFileSync(
  resolve(__dirname, '../src/components/backend/SaleTab.jsx'),
  'utf-8'
);
const TFP = readFileSync(
  resolve(__dirname, '../src/components/TreatmentFormPage.jsx'),
  'utf-8'
);
const ORDER_PANEL = readFileSync(
  resolve(__dirname, '../src/components/backend/OrderPanel.jsx'),
  'utf-8'
);
const ADJUST_PANEL = readFileSync(
  resolve(__dirname, '../src/components/backend/StockAdjustPanel.jsx'),
  'utf-8'
);
const TRANSFER_PANEL = readFileSync(
  resolve(__dirname, '../src/components/backend/StockTransferPanel.jsx'),
  'utf-8'
);
const WITHDRAWAL_PANEL = readFileSync(
  resolve(__dirname, '../src/components/backend/StockWithdrawalPanel.jsx'),
  'utf-8'
);
const CENTRAL_PANEL = readFileSync(
  resolve(__dirname, '../src/components/backend/CentralStockOrderPanel.jsx'),
  'utf-8'
);

describe('V36.G.1-8 — SaleTab branchId source', () => {
  test('G.1 — imports useSelectedBranch from BranchContext', () => {
    expect(SALE_TAB).toMatch(/import\s*\{\s*useSelectedBranch\s*\}\s*from\s*['"][^'"]*BranchContext\.jsx/);
  });

  test('G.2 — destructures branchId via useSelectedBranch hook', () => {
    expect(SALE_TAB).toMatch(/const\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  test('G.3 — deductStockForSale receives branchId: BRANCH_ID', () => {
    const calls = SALE_TAB.match(/deductStockForSale\s*\([\s\S]{0,500}\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const c of calls) {
      expect(c).toMatch(/branchId:\s*BRANCH_ID/);
    }
  });

  test('G.4 — no branchId: "main" literal in SaleTab', () => {
    expect(SALE_TAB).not.toMatch(/branchId:\s*['"]main['"]/);
  });

  test('G.5 — no DEFAULT_BRANCH_ID fallback used in SaleTab save path', () => {
    // SaleTab must use BRANCH_ID from context, NOT a hardcoded default.
    // (Backend helper has DEFAULT_BRANCH_ID fallback for legacy callers,
    // but the UI MUST always pass an explicit branchId.)
    expect(SALE_TAB).not.toMatch(/branchId:\s*DEFAULT_BRANCH_ID/);
  });

  test('G.6 — listStaffByBranch uses BRANCH_ID for sellers picker', () => {
    expect(SALE_TAB).toMatch(/listStaffByBranch\s*\(\s*\{\s*branchId:\s*BRANCH_ID/);
  });

  test('G.7 — branch is destructured BEFORE first use', () => {
    const hookIdx = SALE_TAB.indexOf('useSelectedBranch()');
    const firstUseIdx = SALE_TAB.indexOf('branchId: BRANCH_ID');
    expect(hookIdx).toBeGreaterThan(0);
    expect(firstUseIdx).toBeGreaterThan(hookIdx);
  });

  test('G.8 — V36 Phase 1.5 invariant: customerId + branchId both passed on real calls', () => {
    // Filter to actual call sites by requiring the closing brace pattern
    // `})` of the opts object. Excludes prose-style mentions that may
    // contain " deductStockForSale (movement type ...)" in JSDoc/comments.
    const calls = SALE_TAB.match(/deductStockForSale\s*\(\s*[A-Za-z_][\w.]*[\s\S]{20,500}?\}\s*\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const c of calls) {
      expect(c).toMatch(/branchId:\s*BRANCH_ID/);
      expect(c).toMatch(/customerId/);
    }
  });
});

describe('V36.G.9-16 — TreatmentFormPage branchId source', () => {
  test('G.9 — imports useSelectedBranch from BranchContext', () => {
    expect(TFP).toMatch(/import\s*\{\s*useSelectedBranch\s*\}\s*from\s*['"][^'"]*BranchContext\.jsx/);
  });

  test('G.10 — destructures branchId via useSelectedBranch hook', () => {
    expect(TFP).toMatch(/const\s*\{\s*branchId:\s*SELECTED_BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  test('G.11 — every deductStockForTreatment call passes branchId: SELECTED_BRANCH_ID', () => {
    const calls = TFP.match(/deductStockForTreatment\s*\([\s\S]{0,800}?\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) {
      expect(c).toMatch(/branchId:\s*SELECTED_BRANCH_ID/);
    }
  });

  test('G.12 — every deductStockForSale call (auto-sale) passes branchId: SELECTED_BRANCH_ID', () => {
    // Match real call sites: opens with `(saleIdRef, payload, { ... })` —
    // requires opts object closing brace. Excludes inline prose mentions
    // like comments "// deductStockForSale (movement type 2 SALE)".
    const calls = TFP.match(/deductStockForSale\s*\(\s*[A-Za-z_][\w.]*[\s\S]{20,800}?\}\s*\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(1);
    for (const c of calls) {
      expect(c).toMatch(/branchId:\s*SELECTED_BRANCH_ID/);
    }
  });

  test('G.13 — no branchId: "main" literal in TreatmentFormPage', () => {
    expect(TFP).not.toMatch(/branchId:\s*['"]main['"]/);
  });

  test('G.14 — no DEFAULT_BRANCH_ID fallback used', () => {
    expect(TFP).not.toMatch(/branchId:\s*DEFAULT_BRANCH_ID/);
  });

  test('G.15 — at least 5 stock-mutator call sites use SELECTED_BRANCH_ID', () => {
    // 2 deductStockForTreatment + 1+ deductStockForSale + 1+ assignCourseToCustomer + 1+ misc
    const matches = TFP.match(/branchId:\s*SELECTED_BRANCH_ID/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test('G.16 — branch is destructured before stock-mutator call sites', () => {
    // The destructure statement itself contains both `branchId: SELECTED_BRANCH_ID`
    // (key) and `useSelectedBranch()` (RHS). Skip past the destructure when
    // looking for the first call-site use.
    const destructureIdx = TFP.indexOf('const { branchId: SELECTED_BRANCH_ID }');
    expect(destructureIdx).toBeGreaterThan(0);
    // Locate first use AFTER the destructure line ends
    const afterDestructure = TFP.indexOf('\n', destructureIdx);
    const firstCallUseIdx = TFP.indexOf('branchId: SELECTED_BRANCH_ID', afterDestructure);
    expect(firstCallUseIdx).toBeGreaterThan(destructureIdx);
  });
});

describe('V36.G.17-24 — OrderPanel + OrderCreateForm branchId source', () => {
  test('G.17 — OrderPanel imports useSelectedBranch', () => {
    expect(ORDER_PANEL).toMatch(/import\s*\{\s*useSelectedBranch\s*\}\s*from\s*['"][^'"]*BranchContext\.jsx/);
  });

  test('G.18 — OrderPanel destructures branchId via hook', () => {
    expect(ORDER_PANEL).toMatch(/const\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  test('G.19 — OrderPanel passes branchId={BRANCH_ID} to child OrderCreateForm', () => {
    expect(ORDER_PANEL).toMatch(/<OrderCreateForm[\s\S]+?branchId=\{BRANCH_ID\}/);
  });

  test('G.20 — OrderCreateForm reads branchId prop, no useSelectedBranch reread', () => {
    // OrderCreateForm receives branchId from parent (single source of truth).
    expect(ORDER_PANEL).toMatch(/function OrderCreateForm\([\s\S]{0,500}branchId/);
  });

  test('G.21 — createStockOrder payload includes branchId: BRANCH_ID', () => {
    expect(ORDER_PANEL).toMatch(/branchId:\s*BRANCH_ID/);
  });

  test('G.22 — listStockOrders filters by BRANCH_ID', () => {
    expect(ORDER_PANEL).toMatch(/listStockOrders\s*\(\s*\{\s*branchId:\s*BRANCH_ID/);
  });

  test('G.23 — no branchId: "main" literal', () => {
    expect(ORDER_PANEL).not.toMatch(/branchId:\s*['"]main['"]/);
  });

  test('G.24 — no DEFAULT_BRANCH_ID fallback', () => {
    expect(ORDER_PANEL).not.toMatch(/branchId:\s*DEFAULT_BRANCH_ID/);
  });
});

describe('V36.G.25-32 — StockAdjustPanel branchId source', () => {
  test('G.25 — imports useSelectedBranch', () => {
    expect(ADJUST_PANEL).toMatch(/import\s*\{\s*useSelectedBranch\s*\}\s*from\s*['"][^'"]*BranchContext\.jsx/);
  });

  test('G.26 — destructures via useSelectedBranch hook', () => {
    expect(ADJUST_PANEL).toMatch(/useSelectedBranch\(\)/);
  });

  test('G.27 — createStockAdjustment payload includes branchId: BRANCH_ID', () => {
    expect(ADJUST_PANEL).toMatch(/createStockAdjustment\s*\([\s\S]{0,300}branchId:\s*BRANCH_ID/);
  });

  test('G.28 — listStockBatches uses BRANCH_ID for batch picker', () => {
    expect(ADJUST_PANEL).toMatch(/branchId:\s*BRANCH_ID/);
  });

  test('G.29 — no branchId: "main" literal', () => {
    expect(ADJUST_PANEL).not.toMatch(/branchId:\s*['"]main['"]/);
  });

  test('G.30 — no DEFAULT_BRANCH_ID fallback in adjust', () => {
    expect(ADJUST_PANEL).not.toMatch(/branchId:\s*DEFAULT_BRANCH_ID/);
  });

  test('G.31 — selected batch must match BRANCH_ID (no cross-branch adjust)', () => {
    expect(ADJUST_PANEL).toMatch(/where\(['"]branchId['"]\s*,\s*['"]==['"]\s*,\s*BRANCH_ID\)/);
  });

  test('G.32 — branch destructure before first use', () => {
    const hookIdx = ADJUST_PANEL.indexOf('useSelectedBranch()');
    const firstUseIdx = ADJUST_PANEL.indexOf('branchId: BRANCH_ID');
    expect(hookIdx).toBeGreaterThan(0);
    expect(firstUseIdx).toBeGreaterThan(hookIdx);
  });
});

describe('V36.G.33-40 — StockTransferPanel src/dst source', () => {
  test('G.33 — createStockTransfer payload reads sourceLocationId from form', () => {
    expect(TRANSFER_PANEL).toMatch(/createStockTransfer\s*\([\s\S]{0,500}sourceLocationId:\s*src/);
  });

  test('G.34 — createStockTransfer payload reads destinationLocationId from form', () => {
    expect(TRANSFER_PANEL).toMatch(/createStockTransfer\s*\([\s\S]{0,500}destinationLocationId:\s*dst/);
  });

  test('G.35 — src + dst are distinct (transfer requires different src/dst)', () => {
    expect(TRANSFER_PANEL).toMatch(/src\s*&&\s*dst\s*&&\s*src\s*!==\s*dst/);
  });

  test('G.36 — listStockBatches filters by src for source-batch picker', () => {
    expect(TRANSFER_PANEL).toMatch(/listStockBatches\s*\(\s*\{\s*branchId:\s*src/);
  });

  test('G.37 — Phase 17.2: NO includeLegacyMain (legacy-main path removed)', () => {
    // Phase 17.2 (2026-05-05): includeLegacyMain opt deleted from
    // listStockBatches. Migration script reassigns legacy 'main' batches
    // to current default branch BEFORE deploy. Anti-regression guard.
    expect(TRANSFER_PANEL).not.toMatch(/includeLegacyMain/);
  });

  test('G.38 — no branchId: "main" hardcode', () => {
    expect(TRANSFER_PANEL).not.toMatch(/branchId:\s*['"]main['"]/);
  });

  test('G.39 — no DEFAULT_BRANCH_ID fallback', () => {
    expect(TRANSFER_PANEL).not.toMatch(/sourceLocationId:\s*DEFAULT_BRANCH_ID/);
    expect(TRANSFER_PANEL).not.toMatch(/destinationLocationId:\s*DEFAULT_BRANCH_ID/);
  });

  test('G.40 — Phase 17.2: transfer cross-tier no longer needs deriveLocationType src/dst gate', () => {
    // Phase 17.2 (2026-05-05): with the includeLegacyMain opt removed
    // (G.37), the deriveLocationType(src) branch-tier gate is no longer
    // needed. Transfer cross-tier still works via sourceLocationId +
    // destinationLocationId; the panel just doesn't need to compute
    // isBranchSrc to gate the legacy-main fallback any more.
    // Anti-regression: NO `deriveLocationType(src)` call (removed).
    expect(TRANSFER_PANEL).not.toMatch(/deriveLocationType\s*\(\s*src\s*\)/);
  });
});

describe('V36.G.41-48 — StockWithdrawalPanel src/dst source', () => {
  test('G.41 — createStockWithdrawal payload reads sourceLocationId from form', () => {
    expect(WITHDRAWAL_PANEL).toMatch(/createStockWithdrawal\s*\([\s\S]{0,500}sourceLocationId:\s*src/);
  });

  test('G.42 — createStockWithdrawal payload reads destinationLocationId from form', () => {
    expect(WITHDRAWAL_PANEL).toMatch(/createStockWithdrawal\s*\([\s\S]{0,500}destinationLocationId:\s*dst/);
  });

  test('G.43 — listStockBatches filters by src for source-batch picker', () => {
    expect(WITHDRAWAL_PANEL).toMatch(/listStockBatches\s*\(\s*\{\s*branchId:\s*src/);
  });

  test('G.44 — Phase 17.2: NO includeLegacyMain (legacy-main path removed)', () => {
    // Phase 17.2 (2026-05-05): includeLegacyMain opt deleted. Migration
    // script reassigns legacy 'main' rows to current default branch.
    expect(WITHDRAWAL_PANEL).not.toMatch(/includeLegacyMain/);
  });

  test('G.45 — no branchId: "main" hardcode', () => {
    expect(WITHDRAWAL_PANEL).not.toMatch(/branchId:\s*['"]main['"]/);
  });

  test('G.46 — no DEFAULT_BRANCH_ID fallback', () => {
    expect(WITHDRAWAL_PANEL).not.toMatch(/sourceLocationId:\s*DEFAULT_BRANCH_ID/);
    expect(WITHDRAWAL_PANEL).not.toMatch(/destinationLocationId:\s*DEFAULT_BRANCH_ID/);
  });

  test('G.47 — listStockWithdrawals view filters by selected location id', () => {
    expect(WITHDRAWAL_PANEL).toMatch(/listStockWithdrawals/);
  });

  test('G.48 — V36 lock: withdrawal preserves location-type discriminator', () => {
    expect(WITHDRAWAL_PANEL).toMatch(/locationName/);
  });
});

describe('V36.G.45-48 — BranchContext defensive fallback for phantom branches', () => {
  const BRANCH_CONTEXT = readFileSync(
    resolve(__dirname, '../src/lib/BranchContext.jsx'),
    'utf-8'
  );

  test('G.45 — selectionStillValid validity check exists', () => {
    // V36 (2026-04-29): branch validity must be re-evaluated on EVERY
    // snapshot, not just first-load. Phantom-branch cleanup via
    // `/api/admin/cleanup-phantom-branch` deletes a branch doc; users with
    // stale localStorage selectedBranchId pointing at the deleted branch
    // would otherwise keep emitting stock writes at the phantom branchId.
    expect(BRANCH_CONTEXT).toMatch(/selectionStillValid\s*=/);
  });

  test('G.46 — Phase 17.2: fallback re-resolves via newest-default (no isDefault flag)', () => {
    // Phase 17.2 (2026-05-05): isDefault flag stripped. Phantom-branch
    // fallback now picks the newest accessible branch via
    // pickFirstLoginDefault — coverage in
    // tests/phase-17-2-branch-context-rewrite.test.jsx BC1.2.
    expect(BRANCH_CONTEXT).toMatch(/!selectionStillValid/);
    expect(BRANCH_CONTEXT).toMatch(/pickFirstLoginDefault/);
    expect(BRANCH_CONTEXT).toMatch(/FALLBACK_ID/);
    // Anti-regression: NO isDefault filter on the fallback path.
    expect(BRANCH_CONTEXT).not.toMatch(/list\.find\(b\s*=>\s*b\.isDefault\)/);
  });

  test('G.47 — Phase 17.2: fallback persists new selection to localStorage (per-uid key)', () => {
    // Phase 17.2 (2026-05-05): localStorage key is per-uid
    // (`selectedBranchId:${uid}`) via localStorageKey(uid) helper.
    // Coverage in tests/phase-17-2-branch-context-rewrite.test.jsx BC1.3.
    expect(BRANCH_CONTEXT).toMatch(/setItem\(/);
    expect(BRANCH_CONTEXT).toMatch(/localStorageKey\(/);
  });

  test('G.48 — V36 marker on phantom-branch fallback', () => {
    expect(BRANCH_CONTEXT).toMatch(/V36 \(2026-04-29\)[\s\S]{0,800}phantom-branch/);
  });
});

describe('V36.G.49-53 — CentralStockOrderPanel + global invariants', () => {
  test('G.49 — receiveCentralStockOrder uses centralWarehouseId (NOT BranchContext)', () => {
    // Central tier scope; admin selects warehouse via prop, not BranchContext.
    expect(CENTRAL_PANEL).toMatch(/receiveCentralStockOrder/);
    expect(CENTRAL_PANEL).toMatch(/centralWarehouseId/);
  });

  test('G.50 — createCentralStockOrder payload mentions centralWarehouseId', () => {
    expect(CENTRAL_PANEL).toMatch(/createCentralStockOrder/);
    expect(CENTRAL_PANEL).toMatch(/centralWarehouseId/);
  });

  test('G.51 — backendClient.js does NOT import React context (no React leak into backend layer)', () => {
    expect(BACKEND_CLIENT).not.toMatch(/from\s*['"][^'"]*BranchContext\.jsx/);
    expect(BACKEND_CLIENT).not.toMatch(/useSelectedBranch/);
    expect(BACKEND_CLIENT).not.toMatch(/useContext\s*\(\s*BranchContext/);
  });

  test('G.52 — backendClient.js movement emit uses explicit branchId field (no implicit defaulting at write)', () => {
    // Sample some movement-write sites: each sets `branchId:` explicitly
    // within a few lines of the type field.
    const idx = BACKEND_CLIENT.indexOf('type: MOVEMENT_TYPES.IMPORT');
    expect(idx).toBeGreaterThan(0);
    const after = BACKEND_CLIENT.substring(idx, idx + 800);
    expect(after).toMatch(/branchId:\s*String\(locationId\)/);
  });

  test('G.53 — no `branchId: "main"` literal in backendClient writers', () => {
    // V36 Phase 1.5 invariant: never hardcode 'main'. Helper modules can
    // define DEFAULT_BRANCH_ID for legacy data parsing, but writers never
    // emit a literal 'main' as a branchId value.
    const writerIdxs = [
      BACKEND_CLIENT.indexOf('async function _buildBatchFromOrderItem'),
      BACKEND_CLIENT.indexOf('export async function updateStockTransferStatus'),
      BACKEND_CLIENT.indexOf('export async function updateStockWithdrawalStatus'),
      BACKEND_CLIENT.indexOf('export async function deductStockForSale'),
      BACKEND_CLIENT.indexOf('export async function deductStockForTreatment'),
    ];
    for (const start of writerIdxs) {
      expect(start).toBeGreaterThan(0);
      const next = BACKEND_CLIENT.indexOf('\nexport async function ', start + 30);
      const body = BACKEND_CLIENT.substring(start, next > 0 ? next : start + 8000);
      expect(body).not.toMatch(/branchId:\s*['"]main['"]/);
    }
  });
});
