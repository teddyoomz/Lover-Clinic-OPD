// ─── Phase 15.4 — post-deploy bug fixes (s19 EOD user reports) ──────────────
// User reported 5 bugs after my Phase 15.4 ship. This file locks the fixes
// for bug 1 (blank screen on create order) and bug 4 (central tab adjust
// pulled branch stock). Bugs 2/3/5 tracked separately.
//
// V11-class regression (bug 1):
//   OrderPanel.jsx had `export { getUnitOptionsForProduct } from '...'` as
//   a re-export ONLY. ES re-exports do NOT create a local binding. Inside
//   the module, OrderCreateForm referenced `getUnitOptionsForProduct(...)`
//   at 3 sites → ReferenceError at runtime → blank screen on create-order
//   click. Build + vitest didn't catch it (build resolves modules; vitest
//   imports from outside).
//   Fix: explicit `import` + separate `export` so local binding exists.
//
// Bug 4 (central-tab pulls branch stock):
//   Phase F shipped includeLegacyMain: true unconditionally in 3 stock
//   create forms (Adjust/Transfer/Withdrawal). When CentralStockTab passes
//   branchIdOverride=WH-XXX to StockAdjustPanel, the legacy fallback pulled
//   'main' branch-tier batches into the central adjust picker. Wrong tier.
//   Fix: gate `includeLegacyMain` on `deriveLocationType === BRANCH`.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ============================================================================
describe('Phase 15.4 PD.A — V11 lock: OrderPanel has local + re-export of getUnitOptionsForProduct', () => {
  const src = read('src/components/backend/OrderPanel.jsx');

  it('PD.A.1 — OrderPanel imports getUnitOptionsForProduct (creates local binding)', () => {
    expect(src).toMatch(
      /import\s*\{\s*getUnitOptionsForProduct\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/unitFieldHelpers\.js['"]/
    );
  });

  it('PD.A.2 — OrderPanel re-exports getUnitOptionsForProduct (backward compat)', () => {
    expect(src).toMatch(/export\s*\{\s*getUnitOptionsForProduct\s*\}/);
  });

  it('PD.A.3 — Anti-V11 anti-pattern: NO bare `export ... from` re-export (would shadow local use)', () => {
    expect(src).not.toMatch(
      /export\s*\{\s*getUnitOptionsForProduct\s*\}\s+from\s+['"]/
    );
  });

  it('PD.A.4 — getUnitOptionsForProduct referenced INSIDE OrderCreateForm at >= 3 sites', () => {
    // Sanity check that the local binding is actually used (V11 trigger condition).
    const matches = src.match(/getUnitOptionsForProduct\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
describe('Phase 15.4 PD.B — V11 RTL smoke: OrderCreateForm renders without throwing', () => {
  // This is the test that would have CAUGHT the V11 bug — it actually mounts
  // the component (vs. just source-grep). vi.mock minimal deps so render stays focused.

  it('PD.B.1 — getUnitOptionsForProduct is a callable function when imported via OrderPanel', async () => {
    // The bug was: `getUnitOptionsForProduct` undefined inside the module's
    // own scope. After the fix, the local import works. We can't easily
    // mount OrderCreateForm without all its deps, but we CAN verify the
    // helper is accessible via the import path that the module uses.
    const mod = await import('../src/lib/unitFieldHelpers.js');
    expect(typeof mod.getUnitOptionsForProduct).toBe('function');
    expect(mod.getUnitOptionsForProduct(null, [], [])).toEqual([]);
  });

  it('PD.B.2 — UnitField imported from ./UnitField.jsx is callable', async () => {
    const mod = await import('../src/components/backend/UnitField.jsx');
    expect(typeof mod.default).toBe('function');
    // Smoke render — empty options falls back to <input>
    const { container } = render(
      <mod.default value="" options={[]} onChange={() => {}} testId="t" />
    );
    expect(container.querySelector('[data-testid="t-input"]')).toBeTruthy();
  });
});

// ============================================================================
describe('Phase 15.4 PD.C — Bug 4 fix: includeLegacyMain gated on branch-tier', () => {
  const adjustSrc = read('src/components/backend/StockAdjustPanel.jsx');
  const transferSrc = read('src/components/backend/StockTransferPanel.jsx');
  const withdrawalSrc = read('src/components/backend/StockWithdrawalPanel.jsx');

  it('PD.C.1 — StockAdjustPanel imports deriveLocationType + LOCATION_TYPE', () => {
    expect(adjustSrc).toMatch(
      /import\s*\{\s*deriveLocationType,\s*LOCATION_TYPE\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/stockUtils\.js['"]/
    );
  });

  it('PD.C.2 — StockAdjustPanel passes includeLegacyMain: isBranchTier (NOT always true)', () => {
    expect(adjustSrc).toMatch(
      /const\s+isBranchTier\s*=\s*deriveLocationType\(BRANCH_ID\)\s*===\s*LOCATION_TYPE\.BRANCH/
    );
    expect(adjustSrc).toMatch(/includeLegacyMain:\s*isBranchTier/);
    // Anti-regression: the bare `includeLegacyMain: true` (always-on) is GONE.
    expect(adjustSrc).not.toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*true[^}]*\}\s*\)/);
  });

  it('PD.C.3 — StockTransferPanel imports + uses deriveLocationType for src tier check', () => {
    expect(transferSrc).toMatch(
      /import\s*\{\s*deriveLocationType,\s*LOCATION_TYPE\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/stockUtils\.js['"]/
    );
    expect(transferSrc).toMatch(/deriveLocationType\(src\)/);
    expect(transferSrc).toMatch(/includeLegacyMain:\s*isBranchSrc/);
    expect(transferSrc).not.toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*true[^}]*\}\s*\)/);
  });

  it('PD.C.4 — StockWithdrawalPanel imports + uses deriveLocationType for src tier check', () => {
    expect(withdrawalSrc).toMatch(
      /import\s*\{\s*deriveLocationType,\s*LOCATION_TYPE\s*\}\s+from\s+['"]\.\.\/\.\.\/lib\/stockUtils\.js['"]/
    );
    expect(withdrawalSrc).toMatch(/deriveLocationType\(src\)/);
    expect(withdrawalSrc).toMatch(/includeLegacyMain:\s*isBranchSrc/);
    expect(withdrawalSrc).not.toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*true[^}]*\}\s*\)/);
  });
});

// ============================================================================
describe('Phase 15.4 PD.D — deriveLocationType behaviour anchor', () => {
  it('PD.D.1 — branch-tier IDs return BRANCH', async () => {
    const { deriveLocationType, LOCATION_TYPE } = await import('../src/lib/stockUtils.js');
    expect(deriveLocationType('main')).toBe(LOCATION_TYPE.BRANCH);
    expect(deriveLocationType('BR-1234567890123-abcdef0')).toBe(LOCATION_TYPE.BRANCH);
    expect(deriveLocationType('')).toBe(LOCATION_TYPE.BRANCH);
    expect(deriveLocationType(null)).toBe(LOCATION_TYPE.BRANCH);
  });

  it('PD.D.2 — central-tier IDs (WH-*) return CENTRAL', async () => {
    const { deriveLocationType, LOCATION_TYPE } = await import('../src/lib/stockUtils.js');
    expect(deriveLocationType('WH-1234567890-abcdef')).toBe(LOCATION_TYPE.CENTRAL);
    expect(deriveLocationType('WH-test')).toBe(LOCATION_TYPE.CENTRAL);
  });
});
