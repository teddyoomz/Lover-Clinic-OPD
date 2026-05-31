// V143-quater + V143-ter — stock lot auto-cleanup (Task A) + real-time balance (Task B).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planLotCleanup, lotGroupKey } from '../src/lib/stockLotCleanupCore.js';

const B = (id, productId, remaining, status = 'active', branchId = 'BR-A') =>
  ({ id, batchId: id, productId, branchId, status, qty: { total: 0, remaining }, productName: `P-${productId}` });

describe('V143-quater.C — planLotCleanup (Task A: per product×location, keep live + ≤1 zero)', () => {
  it('C1 — product with live(+10) + 3 zeros → delete all 3 zeros (live shows the stock)', () => {
    const out = planLotCleanup([B('a', 'P1', 10), B('b', 'P1', 0), B('c', 'P1', 0), B('d', 'P1', 0)]);
    expect(out.deleteIds.sort()).toEqual(['b', 'c', 'd']);
    expect(out.keptPlaceholders).toBe(0);
  });
  it('C2 — product fully drained (4 zeros) → keep 1 placeholder, delete 3', () => {
    const out = planLotCleanup([B('a', 'P2', 0), B('b', 'P2', 0), B('c', 'P2', 0), B('d', 'P2', 0)]);
    expect(out.deleteIds.length).toBe(3); // keeps exactly one
    expect(out.keptPlaceholders).toBe(1);
    expect(out.deleteIds).not.toContain('a'); // first kept
  });
  it('C3 — negative(-5) lot is LIVE (debt) → its zero siblings are deleted', () => {
    const out = planLotCleanup([B('a', 'P3', -5), B('b', 'P3', 0), B('c', 'P3', 0)]);
    expect(out.deleteIds.sort()).toEqual(['b', 'c']);
  });
  it('C4 — cancelled / expired lots are NOT touched (different lifecycle)', () => {
    const out = planLotCleanup([B('a', 'P4', 0, 'cancelled'), B('b', 'P4', 0, 'expired'), B('c', 'P4', 0, 'depleted'), B('d', 'P4', 0, 'depleted')]);
    // only the 2 depleted zeros are considered → keep 1, delete 1; cancelled/expired ignored
    expect(out.deleteIds.length).toBe(1);
    expect(out.deleteIds).not.toContain('a');
    expect(out.deleteIds).not.toContain('b');
  });
  it('C5 — per-LOCATION: same productId in BR-A (2 zeros) + BR-B (2 zeros) → keep 1 each, delete 1 each', () => {
    const out = planLotCleanup([
      B('a1', 'P5', 0, 'active', 'BR-A'), B('a2', 'P5', 0, 'depleted', 'BR-A'),
      B('b1', 'P5', 0, 'active', 'BR-B'), B('b2', 'P5', 0, 'depleted', 'BR-B'),
    ]);
    expect(out.deleteIds.length).toBe(2); // one per location
    expect(out.keptPlaceholders).toBe(2);
  });
  it('C6 — idempotent: running on a clean state (live-only OR ≤1 zero) → 0 deletes', () => {
    expect(planLotCleanup([B('a', 'P6', 10)]).deleteIds).toEqual([]);          // live only
    expect(planLotCleanup([B('a', 'P6', 0)]).deleteIds).toEqual([]);           // single placeholder
    expect(planLotCleanup([B('a', 'P6', 10), B('b', 'P6', 5)]).deleteIds).toEqual([]); // 2 live, no zero
  });
  it('C7 — DELETE-ONLY: never deletes a lot holding stock or debt', () => {
    const out = planLotCleanup([B('a', 'P7', 7), B('b', 'P7', -3), B('c', 'P7', 0), B('d', 'P7', 0)]);
    expect(out.deleteIds).not.toContain('a'); // +7 live
    expect(out.deleteIds).not.toContain('b'); // -3 debt
    expect(out.deleteIds.sort()).toEqual(['c', 'd']);
  });
  it('C8 — adversarial: empty / null / missing ids handled', () => {
    expect(planLotCleanup([]).deleteIds).toEqual([]);
    expect(planLotCleanup(null).deleteIds).toEqual([]);
    expect(planLotCleanup([{ productId: 'X', qty: { remaining: 0 }, status: 'active' }]).deleteIds).toEqual([]); // no id → skipped
  });
  it('C9 — lotGroupKey keys by productId + branchId (location-independent products)', () => {
    expect(lotGroupKey({ productId: 'P', branchId: 'A' })).toBe('P|A');
    expect(lotGroupKey({ productId: 'P', locationId: 'W' })).toBe('P|W');
  });
});

describe('V143-quater/ter.SG — source-grep: cron + listener wired', () => {
  const cron = readFileSync(path.resolve('api/cron/stock-lot-cleanup.js'), 'utf8');
  const vercel = readFileSync(path.resolve('vercel.json'), 'utf8');
  const backend = readFileSync(path.resolve('src/lib/backendClient.js'), 'utf8');
  const scoped = readFileSync(path.resolve('src/lib/scopedDataLayer.js'), 'utf8');
  const panel = readFileSync(path.resolve('src/components/backend/StockBalancePanel.jsx'), 'utf8');

  it('SG1 — Task A cron exists, imports planLotCleanup, CRON_SECRET-gated, DELETE-only', () => {
    expect(cron).toMatch(/import \{ planLotCleanup \} from '\.\.\/\.\.\/src\/lib\/stockLotCleanupCore\.js'/);
    expect(cron).toMatch(/CRON_SECRET/);
    expect(cron).toMatch(/batch\.delete\(/);
    expect(cron).not.toMatch(/\.set\(db\.collection\(BATCHES_COL\)/); // never writes a batch, only deletes
  });
  it('SG2 — vercel.json registers the cron (function + daily schedule)', () => {
    expect(vercel).toMatch(/api\/cron\/stock-lot-cleanup\.js/);
    expect(vercel).toMatch(/"path": "\/api\/cron\/stock-lot-cleanup", "schedule": "45 20 \* \* \*"/);
  });
  it('SG3 — Task B Layer 1: listenToStockBatchesByBranch onSnapshot + BS-13 safe-by-default', () => {
    expect(backend).toMatch(/export function listenToStockBatchesByBranch\(/);
    expect(backend).toMatch(/if \(!effectiveBranchId && !allBranches\) \{\s*\n?\s*if \(typeof onChange === 'function'\) onChange\(\[\]\);/);
    expect(backend).toMatch(/return onSnapshot\(/);
  });
  it('SG4 — Task B Layer 2 wrapper in scopedDataLayer', () => {
    expect(scoped).toMatch(/export const listenToStockBatchesByBranch = /);
    expect(scoped).toMatch(/raw\.listenToStockBatchesByBranch\(resolved, onChange, onError\)/);
  });
  it('SG5 — StockBalancePanel uses the LIVE listener (not one-shot) + keeps V143 active|depleted filter', () => {
    expect(panel).toMatch(/listenToStockBatchesByBranch\(\{ branchId: locationId \}/);
    expect(panel).not.toMatch(/await listStockBatches\(/); // one-shot gone
    expect(panel).toMatch(/b\.status === 'active' \|\| b\.status === 'depleted'/); // V143/AV166 preserved
    expect(panel).toMatch(/return \(\) => \{ if \(typeof unsub === 'function'\) unsub\(\); \}/); // cleanup
  });
});
