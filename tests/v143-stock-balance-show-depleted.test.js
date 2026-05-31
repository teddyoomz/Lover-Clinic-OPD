// V143 (2026-05-31) — StockBalancePanel must SHOW products drained/cleared to
// exactly 0 (status='depleted'), not hide them.
//
// BUG (real prod, scripts/diag-nakhon-stock-state.mjs): `resolveBatchStatusForRemaining`
// flips a batch to 'depleted' at remaining===0 (e.g. clearing a negative AUTO-NEG
// balance to exactly 0). StockBalancePanel loaded `listStockBatches({status:'active'})`
// → depleted batches excluded → the product VANISHED from ยอดคงเหลือ. NK had 7 such
// products hidden (Acetin, Betadine, Ibuprofen, Paracetamol, Augmentin, Neuramis Deep,
// Soft Cream). User: "สินค้าไหนที่เคยคีย์เข้าระบบสต็อค ต้องแสดงจำนวนเสมอแม้เป็น 0".
//
// FIX: load WITHOUT the status filter, keep status ∈ {active, depleted}; exclude
// cancelled/expired (voided import / past-expiry — not current stock). AV166.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PANEL = readFileSync(path.resolve(process.cwd(), 'src/components/backend/StockBalancePanel.jsx'), 'utf8');

describe('V143.SG — StockBalancePanel shows depleted-at-0 products', () => {
  it('SG1 — balance loads via the LIVE listener (V143-ter), drops the {status:active} filter', () => {
    // V143-ter (Task B real-time) moved the load from one-shot listStockBatches to the
    // live listenToStockBatchesByBranch; the active-only-filter anti-regression stands.
    expect(PANEL).toMatch(/listenToStockBatchesByBranch\(\{ branchId: locationId \}/);
    expect(PANEL).not.toMatch(/await listStockBatches\(/);
    expect(PANEL).not.toMatch(/listStockBatches\(\{ branchId: locationId, status: 'active' \}\)/);
  });
  it('SG2 — keeps status ∈ {active, depleted} (depleted = drained/cleared to 0)', () => {
    expect(PANEL).toMatch(/b\.status === 'active' \|\| b\.status === 'depleted'/);
  });
  it('SG3 — V143 + AV166 marker present', () => {
    expect(PANEL).toMatch(/V143[\s\S]{0,600}depleted/);
    expect(PANEL).toMatch(/AV166/);
  });
});

describe('V143.L — the visible-batch predicate (active+depleted in, cancelled/expired out)', () => {
  // mirror of the load() filter — the contract the panel relies on
  const isVisible = (b) => b.status === 'active' || b.status === 'depleted';
  const mk = (status, remaining, total = 0) => ({ status, qty: { remaining, total } });
  it('L1 active positive → visible', () => expect(isVisible(mk('active', 5, 10))).toBe(true));
  it('L2 active zero (out of stock) → visible', () => expect(isVisible(mk('active', 0, 20))).toBe(true));
  it('L3 active negative (debt) → visible', () => expect(isVisible(mk('active', -8, 0))).toBe(true));
  it('L4 ★ depleted zero (cleared/drained to exactly 0) → visible (was HIDDEN)', () => expect(isVisible(mk('depleted', 0, 0))).toBe(true));
  it('L5 cancelled → hidden (voided import)', () => expect(isVisible(mk('cancelled', 0, 50))).toBe(false));
  it('L6 expired → hidden (past expiry, not current stock)', () => expect(isVisible(mk('expired', 3, 10))).toBe(false));
  it('L7 a product whose ONLY batch is depleted-at-0 still groups to a row at 0', () => {
    const batches = [mk('depleted', 0, 0), mk('cancelled', 0, 50)].filter(isVisible);
    expect(batches.length).toBe(1); // the depleted one survives → product shows at 0
    expect(batches.reduce((s, b) => s + b.qty.remaining, 0)).toBe(0);
  });
});
