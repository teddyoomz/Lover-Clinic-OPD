// ─── Phase 15.4 post-deploy s23 — TIER-SCOPED product filter for AdjustForm
// User report (with screenshot, after V15 #2 + s22 deploys):
//   "ในหน้าปรับสต็อคของคลังกลาง เวลากดปุ่มปรับสต็อคใหม่ แล้วมันไปเอาสินค้า
//    จากคลังสาขามาให้เลือก ไม่ใช่สินค้าในคลังกลาง แถว batch lot ก็เลือกไม่ได้
//    เป็นเหี้ยอะไรบอกไปหลายรอบแล้วมึงไม่แก้"
//
// Root cause: AdjustCreateForm dropdown listed ALL master products via
// listProducts(). At central tab the user picks branch-only products → batch
// dropdown stays empty → "ไม่มี batch — สร้าง Order ก่อน" → confusion.
//
// Fix: pre-load all active batches at THIS tier, derive unique productIds,
// filter the products dropdown to that set. Empty result → CTA to create
// order first. Same fix applies to branch tier (cleaner UX everywhere).
//
// Coverage:
//   S23.A — source-grep: availableProductIds state + load + derive
//   S23.B — source-grep: dropdown uses availableProducts (filtered) NOT raw products
//   S23.C — source-grep: empty-state CTA + loading state
//   S23.D — V14 + V21 anti-regression

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const adjustPanelSrc = read('src/components/backend/StockAdjustPanel.jsx');

// ============================================================================
describe('Phase 15.4 S23.A — availableProductIds state + load logic', () => {
  it('S23.A.1 — availableProductIds state initialized to null (loading sentinel)', () => {
    expect(adjustPanelSrc).toMatch(/const\s+\[availableProductIds,\s*setAvailableProductIds\]\s*=\s*useState\(null\)/);
  });

  it('S23.A.2 — useEffect loads batches at BRANCH_ID + status:active', () => {
    expect(adjustPanelSrc).toMatch(/listStockBatches\(\s*\{\s*branchId:\s*BRANCH_ID[\s\S]{0,200}status:\s*['"]active['"]/);
  });

  it('S23.A.3 — preload uses includeLegacyMain gated by isBranchTier', () => {
    // The preload MUST honor the same legacy-main gate as the per-product load.
    // 2 occurrences expected: per-product load + tier-scoped preload, both gated.
    const matches = adjustPanelSrc.match(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*isBranchTier[^}]*\}\s*\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('S23.A.4 — derives Set of productIds from loaded batches', () => {
    expect(adjustPanelSrc).toMatch(/const\s+ids\s*=\s*new\s+Set\(\)/);
    expect(adjustPanelSrc).toMatch(/ids\.add\(String\(b\.productId\)\)/);
  });

  it('S23.A.5 — useEffect re-fires when BRANCH_ID changes', () => {
    // Tier change (e.g. selectedWarehouseId switch) must reload available products.
    expect(adjustPanelSrc).toMatch(/setAvailableProductIds[\s\S]{0,1000}\}\s*,\s*\[BRANCH_ID,\s*isBranchTier\]\)/);
  });

  it('S23.A.6 — V31 no-silent-swallow on preload error', () => {
    expect(adjustPanelSrc).toMatch(/preload available batches failed/);
    // Falls back to empty Set on error, not undefined
    expect(adjustPanelSrc).toMatch(/setAvailableProductIds\(new\s+Set\(\)\)/);
  });
});

// ============================================================================
describe('Phase 15.4 S23.B — dropdown uses tier-scoped availableProducts', () => {
  it('S23.B.1 — availableProducts useMemo filters products by availableProductIds', () => {
    expect(adjustPanelSrc).toMatch(/const\s+availableProducts\s*=\s*useMemo/);
    expect(adjustPanelSrc).toMatch(/availableProductIds\.has\(String\(p\.id\)\)/);
  });

  it('S23.B.2 — products picker passes availableProducts to ProductSelectField (V35 migration)', () => {
    // Phase 15.6 / V35 migration: <select>{availableProducts.map(...)} replaced
    // by <ProductSelectField options={availableProducts} ... />. Tier scope
    // still enforced upstream — picker is a presentation wrapper.
    const idx = adjustPanelSrc.indexOf('adjust-product-select');
    expect(idx).toBeGreaterThan(0);
    // Look back ~600 chars from testid to find the props block
    const block = adjustPanelSrc.slice(Math.max(0, idx - 600), idx + 200);
    // V35 shape: ProductSelectField with options={availableProducts}
    expect(block).toMatch(/ProductSelectField/);
    expect(block).toMatch(/options=\{availableProducts\}/);
    // Anti-regression: NO raw products.map() in the picker block
    expect(block).not.toMatch(/\{products\.map\(/);
  });

  it('S23.B.3 — V21 + V35 anti-regression: no raw products.map in product picker block', () => {
    // V21 lock: the OLD pattern was `{products.map(...)}` directly in the
    // <select>. V35 migration: <select> replaced by ProductSelectField.
    // The placeholder string is now the component's internal default; gate
    // by the testid wrapper instead.
    const idx = adjustPanelSrc.indexOf('adjust-product-select');
    expect(idx).toBeGreaterThan(0);
    const block = adjustPanelSrc.slice(Math.max(0, idx - 600), idx + 200);
    // V35: tier-scope passed to picker via options={availableProducts}
    expect(block).toMatch(/options=\{availableProducts\}/);
    // V21 anti-regression: NO raw `{products.map(` in the picker block
    expect(block).not.toMatch(/\{products\.map/);
  });

  it('S23.B.4 — empty state when availableProducts is [] AND not loading', () => {
    expect(adjustPanelSrc).toMatch(/data-testid="adjust-no-products"/);
    expect(adjustPanelSrc).toMatch(/ยังไม่มีสินค้าในคลังนี้/);
  });

  it('S23.B.5 — loading state when availableProductIds === null', () => {
    expect(adjustPanelSrc).toMatch(/availableProductIds\s*===\s*null[\s\S]{0,200}กำลังโหลดสินค้าในคลังนี้/);
  });

  it('S23.B.6 — dropdown disabled while loading availableProductIds', () => {
    expect(adjustPanelSrc).toMatch(/disabled=\{availableProductIds\s*===\s*null\}/);
  });
});

// ============================================================================
describe('Phase 15.4 S23.C — Functional simulate of tier-scoped filter', () => {
  // Pure simulate of the filter logic.
  function deriveAvailableProducts(allProducts, allBatches) {
    const ids = new Set();
    for (const b of allBatches) {
      if (b?.productId) ids.add(String(b.productId));
    }
    return allProducts.filter((p) => ids.has(String(p.id)));
  }

  const PRODUCTS = [
    { id: 'P-Botox', name: 'Botox 100u' },
    { id: 'P-Filler', name: 'Filler 1ml' },
    { id: 'P-Saline', name: 'Saline' },
    { id: 'P-Branch-Only', name: 'Branch-Only Item' },
  ];

  it('S23.C.1 — central tier with batches for Botox + Filler: dropdown shows ONLY those', () => {
    const centralBatches = [
      { productId: 'P-Botox', branchId: 'WH-Main' },
      { productId: 'P-Filler', branchId: 'WH-Main' },
    ];
    const result = deriveAvailableProducts(PRODUCTS, centralBatches);
    expect(result.map((p) => p.id).sort()).toEqual(['P-Botox', 'P-Filler']);
    // Branch-only products NOT present
    expect(result.find((p) => p.id === 'P-Branch-Only')).toBeUndefined();
    expect(result.find((p) => p.id === 'P-Saline')).toBeUndefined();
  });

  it('S23.C.2 — branch tier with batches for Branch-Only + Saline: dropdown shows ONLY those', () => {
    const branchBatches = [
      { productId: 'P-Branch-Only', branchId: 'main' },
      { productId: 'P-Saline', branchId: 'main' },
    ];
    const result = deriveAvailableProducts(PRODUCTS, branchBatches);
    expect(result.map((p) => p.id).sort()).toEqual(['P-Branch-Only', 'P-Saline']);
  });

  it('S23.C.3 — empty central warehouse → empty dropdown → user sees CTA', () => {
    const result = deriveAvailableProducts(PRODUCTS, []);
    expect(result).toEqual([]);
  });

  it('S23.C.4 — duplicate batches for same product → product appears once', () => {
    const batches = [
      { productId: 'P-Botox' },
      { productId: 'P-Botox' },
      { productId: 'P-Botox' },
    ];
    const result = deriveAvailableProducts(PRODUCTS, batches);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('P-Botox');
  });

  it('S23.C.5 — batches with missing productId are filtered out', () => {
    const batches = [
      { productId: 'P-Botox' },
      { productId: '' },
      { productId: null },
      {},
    ];
    const result = deriveAvailableProducts(PRODUCTS, batches);
    expect(result.map((p) => p.id)).toEqual(['P-Botox']);
  });

  it('S23.C.6 — V14 lock: empty input never returns undefined', () => {
    expect(deriveAvailableProducts([], [])).toEqual([]);
    expect(Array.isArray(deriveAvailableProducts(PRODUCTS, []))).toBe(true);
  });
});

// ============================================================================
describe('Phase 15.4 S23.D — V14 + V21 anti-regression', () => {
  it('S23.D.1 — V14: availableProductIds setter never receives undefined', () => {
    // Function paths must call setAvailableProductIds with either a Set or null.
    const calls = adjustPanelSrc.match(/setAvailableProductIds\([^)]+\)/g) || [];
    for (const c of calls) {
      expect(c, `setAvailableProductIds call should not pass undefined: ${c}`).not.toMatch(/undefined/);
    }
  });

  it('S23.D.2 — Phase 15.4 markers present (institutional memory)', () => {
    expect(adjustPanelSrc).toMatch(/Phase 15\.4 post-deploy s23/);
    expect(adjustPanelSrc).toMatch(/TIER-SCOPED PRODUCT FILTER/);
  });

  it('S23.D.3 — V21 anti-regression: createStockAdjustment still receives BRANCH_ID', () => {
    // Bug 4 fix from s20 must not regress — adjustment writes branchId=BRANCH_ID
    expect(adjustPanelSrc).toMatch(/createStockAdjustment\([\s\S]{0,200}branchId:\s*BRANCH_ID/);
  });

  it('S23.D.4 — bug 2/v3 legacy-main fallback in per-product batches load preserved', () => {
    // The per-product batch load must still pass includeLegacyMain so legacy
    // 'main' batches show at default branch.
    expect(adjustPanelSrc).toMatch(/Phase 15\.4 \(s19 item 2\)/);
    expect(adjustPanelSrc).toMatch(/listStockBatches\(\s*\{[^}]*includeLegacyMain:\s*isBranchTier[^}]*\}\s*\)/);
  });
});
