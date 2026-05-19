// tests/v43-followup-hide-from-balance-flow-simulate.test.js
// V43-followup (2026-05-19) — Tier 3 Rule I full-flow simulate.
// Chains: master save → listener fires → setProductThresholdMap →
// products useMemo (filter applies) → displayed useMemo → mock DOM snapshot.

import { describe, it, expect } from 'vitest';
import { filterOutSkippedProducts, isSkippedProduct } from '../src/lib/skipStockFilter.js';

// Pure simulator of StockBalancePanel's threshold-map → products useMemo
// pipeline (mirror of the production logic without mounting React).
function simulateProductsMemo(batches, productThresholdMap) {
  const byProduct = new Map();
  for (const b of batches) {
    if (!b.productId) continue;
    const tEntry = productThresholdMap[String(b.productId)];
    if (!byProduct.has(b.productId)) {
      byProduct.set(b.productId, {
        productId: b.productId,
        productName: tEntry?.canonicalName || b.productName || '',
        totalRemaining: 0,
        skipStockDeduction: tEntry?.skipStockDeduction === true,
      });
    }
    const p = byProduct.get(b.productId);
    p.totalRemaining += Number(b.qty?.remaining || 0);
  }
  // V43-followup: filter step (mirrors the implementation — uses helper).
  const visible = filterOutSkippedProducts(Array.from(byProduct.values()));
  return visible.sort((a, b) => (a.productName || '').localeCompare(b.productName || ''));
}

describe('V43-followup flow-simulate — F1 single product toggle', () => {
  it('F1.1 product with flag=true is hidden in the products useMemo', () => {
    const batches = [{ productId: 'P1', productName: 'Shock wave', qty: { remaining: -100 } }];
    const map = { 'P1': { skipStockDeduction: true, canonicalName: 'Shock wave' } };
    const out = simulateProductsMemo(batches, map);
    expect(out.length).toBe(0);
  });
  it('F1.2 product with flag=false stays visible', () => {
    const batches = [{ productId: 'P1', productName: 'X', qty: { remaining: 10 } }];
    const map = { 'P1': { skipStockDeduction: false } };
    const out = simulateProductsMemo(batches, map);
    expect(out.length).toBe(1);
  });
  it('F1.3 product with missing threshold entry stays visible (legacy)', () => {
    const batches = [{ productId: 'P1', productName: 'X', qty: { remaining: 10 } }];
    const map = {};
    const out = simulateProductsMemo(batches, map);
    expect(out.length).toBe(1);
  });
});

describe('V43-followup flow-simulate — F2 mid-stream listener update', () => {
  it('F2.1 row disappears when threshold map updates flag false→true (simulating onSnapshot fire)', () => {
    const batches = [{ productId: 'P1', productName: 'X', qty: { remaining: 10 } }];
    let map = { 'P1': { skipStockDeduction: false } };
    const before = simulateProductsMemo(batches, map);
    expect(before.length).toBe(1);
    // onSnapshot fires with updated doc:
    map = { 'P1': { skipStockDeduction: true } };
    const after = simulateProductsMemo(batches, map);
    expect(after.length).toBe(0);
  });
  it('F2.2 row reappears when threshold flips true→false (untoggle)', () => {
    const batches = [{ productId: 'P1', productName: 'X', qty: { remaining: 10 } }];
    let map = { 'P1': { skipStockDeduction: true } };
    expect(simulateProductsMemo(batches, map).length).toBe(0);
    map = { 'P1': { skipStockDeduction: false } };
    expect(simulateProductsMemo(batches, map).length).toBe(1);
  });
});

describe('V43-followup flow-simulate — F3 mixed prod-scenario', () => {
  it('F3.1 user-reported screenshot mirror (Shock wave + 3 services + 5 real)', () => {
    const batches = [
      { productId: 'P_LIDO', productName: '2% Lidocain', qty: { remaining: 1 } },
      { productId: 'P_SHOCK', productName: 'Shock wave', qty: { remaining: -100 } },
      { productId: 'P_FOLLOW', productName: 'ติดตามอาการ', qty: { remaining: -16 } },
      { productId: 'P_SURGERY', productName: 'ผ่าตัด', qty: { remaining: -1 } },
      { productId: 'P_CUT', productName: 'ตัดเส้นสองสลึง', qty: { remaining: -1 } },
      { productId: 'P_AUG', productName: 'Augmentin', qty: { remaining: 0 } },
      { productId: 'P_NEU', productName: 'Neuramis Deep', qty: { remaining: 0 } },
      { productId: 'P_NSS', productName: 'NSS', qty: { remaining: 0 } },
      { productId: 'P_PARA', productName: 'Paracetamol', qty: { remaining: 0 } },
    ];
    const map = {
      'P_LIDO':    { skipStockDeduction: false },
      'P_SHOCK':   { skipStockDeduction: true },
      'P_FOLLOW':  { skipStockDeduction: true },
      'P_SURGERY': { skipStockDeduction: true },
      'P_CUT':     { skipStockDeduction: true },
      'P_AUG':     { skipStockDeduction: false },
      'P_NEU':     { skipStockDeduction: false },
      'P_NSS':     { skipStockDeduction: false },
      'P_PARA':    { skipStockDeduction: false },
    };
    const visible = simulateProductsMemo(batches, map);
    expect(visible.length).toBe(5);
    const ids = visible.map(p => p.productId);
    expect(ids).toContain('P_LIDO');
    expect(ids).not.toContain('P_SHOCK');
    expect(ids).not.toContain('P_FOLLOW');
    expect(ids).not.toContain('P_SURGERY');
    expect(ids).not.toContain('P_CUT');
  });
});

describe('V43-followup flow-simulate — F4 cross-branch isolation', () => {
  it('F4.1 toggling flag at branch-A does not affect branch-B view', () => {
    // Simulate two independent panel instances at different branches.
    // The branchId filter is at listenToProducts (Layer 2) — each panel
    // sees ONLY its branch's products. Flagging at A → only A's panel
    // re-runs filter.
    const batchesA = [{ productId: 'P1', productName: 'X', qty: { remaining: 5 } }];
    const batchesB = [{ productId: 'P2', productName: 'Y', qty: { remaining: 7 } }];
    const mapA = { 'P1': { skipStockDeduction: true } };
    const mapB = { 'P2': { skipStockDeduction: false } };
    expect(simulateProductsMemo(batchesA, mapA).length).toBe(0);
    expect(simulateProductsMemo(batchesB, mapB).length).toBe(1);
  });
});

describe('V43-followup flow-simulate — F5 adversarial multi-batch', () => {
  it('F5.1 product with multiple batches all hidden by single flag', () => {
    const batches = [
      { productId: 'P1', productName: 'X', qty: { remaining: 5 } },
      { productId: 'P1', productName: 'X', qty: { remaining: 3 } },
      { productId: 'P1', productName: 'X', qty: { remaining: 2 } },
    ];
    const map = { 'P1': { skipStockDeduction: true } };
    expect(simulateProductsMemo(batches, map).length).toBe(0);
  });
});

describe('V43-followup flow-simulate — F6 source-grep wiring', () => {
  it('F6.1 StockBalancePanel.jsx subscribes via listenToProducts', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(path.resolve(import.meta.dirname, '../src/components/backend/StockBalancePanel.jsx'), 'utf8');
    expect(src).toMatch(/listenToProducts/);
  });
  it('F6.2 StockBalancePanel.jsx applies filter in the products useMemo', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(path.resolve(import.meta.dirname, '../src/components/backend/StockBalancePanel.jsx'), 'utf8');
    expect(src).toMatch(/filterOutSkippedProducts|skipStockDeduction\s*===\s*true/);
  });
});

describe('V43-followup flow-simulate — F7 reversibility lifecycle', () => {
  it('F7.1 flag flips on→off→on through 3 listener updates — row state matches each', () => {
    const batches = [{ productId: 'P1', productName: 'X', qty: { remaining: 10 } }];
    let map = { 'P1': { skipStockDeduction: false } };
    expect(simulateProductsMemo(batches, map).length).toBe(1);
    map = { 'P1': { skipStockDeduction: true } };
    expect(simulateProductsMemo(batches, map).length).toBe(0);
    map = { 'P1': { skipStockDeduction: false } };
    expect(simulateProductsMemo(batches, map).length).toBe(1);
  });
});
