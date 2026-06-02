// Product delete-cascade — guard + cascade + orphan-backstop (debug fix 2026-06-02, AV176)
// Root cause: bare deleteProduct left orphan be_stock_batches (→ lingered in
// stock balance) + course refs. User decision = Guard + cascade. This bank locks
// the pure guard/plan contract + the source wiring (ProductsTab + StockBalancePanel
// + productDeleteClient) + a Rule I full-flow simulate.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  evaluateProductDeleteGuards,
  planProductCascade,
  batchDeleteAction,
  sumPositiveRemaining,
  courseProductList,
  opReferencesProduct,
  isPendingOp,
  TERMINAL_OP_STATUSES,
} from '../src/lib/productDeleteCascade.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const batch = (pid, remaining, id) => ({ id: id || `B-${pid}-${remaining}`, batchId: id || `B-${pid}-${remaining}`, productId: pid, qty: { remaining } });

describe('A — evaluateProductDeleteGuards', () => {
  it('A1 blocks when a batch has positive remaining (live stock)', () => {
    const g = evaluateProductDeleteGuards({ productId: 'P1', batches: [batch('P1', 5)], courses: [] });
    expect(g.blocked).toBe(true);
    expect(g.reasons.some(r => r.code === 'HAS_STOCK')).toBe(true);
    expect(g.reasons.find(r => r.code === 'HAS_STOCK').detail.remaining).toBe(5);
  });
  it('A2 blocks when product is a course mainProductId', () => {
    const g = evaluateProductDeleteGuards({ productId: 'P1', batches: [], courses: [{ id: 'C1', courseName: 'X', mainProductId: 'P1' }] });
    expect(g.blocked).toBe(true);
    expect(g.reasons.some(r => r.code === 'IS_COURSE_MAIN')).toBe(true);
    expect(g.reasons.find(r => r.code === 'IS_COURSE_MAIN').detail.courseIds).toContain('C1');
  });
  it('A3 NOT blocked when batches are all ≤0 and not a course main', () => {
    const g = evaluateProductDeleteGuards({ productId: 'P1', batches: [batch('P1', 0), batch('P1', -2)], courses: [{ id: 'C1', mainProductId: 'OTHER', courseProducts: [{ productId: 'P1' }] }] });
    expect(g.blocked).toBe(false);
    expect(g.reasons).toEqual([]);
  });
  it('A4 stacks BOTH reasons when live stock AND course main', () => {
    const g = evaluateProductDeleteGuards({ productId: 'P1', batches: [batch('P1', 3)], courses: [{ id: 'C1', mainProductId: 'P1' }] });
    expect(g.reasons.length).toBe(2);
  });
  it('A5 adversarial — empty/null inputs never throw, not blocked', () => {
    expect(evaluateProductDeleteGuards({ productId: 'P1', batches: null, courses: null }).blocked).toBe(false);
    expect(evaluateProductDeleteGuards({ productId: '', batches: [], courses: [] }).blocked).toBe(false);
    expect(() => evaluateProductDeleteGuards({})).not.toThrow();
  });
  it('A6 a +5 and a -5 batch (net 0) still blocks — physical stock exists', () => {
    const g = evaluateProductDeleteGuards({ productId: 'P1', batches: [batch('P1', 5), batch('P1', -5)], courses: [] });
    expect(g.blocked).toBe(true); // sumPositiveRemaining counts only the +5
  });
  it('A7 BLOCKS when referenced by a PENDING inbound stock op (receive would throw forever)', () => {
    const g = evaluateProductDeleteGuards({
      productId: 'P1', batches: [], courses: [],
      stockOps: [{ id: 'O1', status: 'active', items: [{ productId: 'P1' }] }],
    });
    expect(g.blocked).toBe(true);
    expect(g.reasons.some(r => r.code === 'HAS_PENDING_OP')).toBe(true);
    expect(g.reasons.find(r => r.code === 'HAS_PENDING_OP').detail.opIds).toContain('O1');
  });
  it('A8 does NOT block on a TERMINAL op (received/cancelled) referencing the product', () => {
    const g = evaluateProductDeleteGuards({
      productId: 'P1', batches: [], courses: [],
      stockOps: [
        { id: 'O1', status: 'received', items: [{ productId: 'P1' }] },
        { id: 'O2', status: 'cancelled', items: [{ productId: 'P1' }] },
      ],
    });
    expect(g.blocked).toBe(false);
  });
  it('A9 pending op NOT referencing the product does not block', () => {
    const g = evaluateProductDeleteGuards({
      productId: 'P1', batches: [], courses: [],
      stockOps: [{ id: 'O1', status: 'active', items: [{ productId: 'OTHER' }] }],
    });
    expect(g.blocked).toBe(false);
  });
});

describe('B — planProductCascade + batchDeleteAction', () => {
  it('B1 returns this product\'s batch records (id + remaining), ignores other products', () => {
    const plan = planProductCascade({ productId: 'P1', batches: [batch('P1', 0, 'b1'), batch('P1', -1, 'b2'), batch('P2', 0, 'b3')], courses: [] });
    expect(plan.batches.map(b => b.batchId).sort()).toEqual(['b1', 'b2']);
  });
  it('B2 courseUpdates pull the target out of courseProducts[] (legacy products[] too)', () => {
    const plan = planProductCascade({
      productId: 'P1', batches: [],
      courses: [
        { id: 'C1', courseProducts: [{ productId: 'P1' }, { productId: 'P2' }] },
        { id: 'C2', products: [{ productId: 'P1' }] },
        { id: 'C3', courseProducts: [{ productId: 'P9' }] }, // untouched
      ],
    });
    expect(plan.courseUpdates.length).toBe(2);
    const c1 = plan.courseUpdates.find(u => u.courseId === 'C1');
    expect(c1.courseProducts.map(p => p.productId)).toEqual(['P2']);
    expect(c1.removedCount).toBe(1);
  });
  it('B3 batchDeleteAction: ==0 → delete, <0 → cancel, >0 → block', () => {
    expect(batchDeleteAction(0)).toBe('delete');
    expect(batchDeleteAction(-1)).toBe('cancel');
    expect(batchDeleteAction(5)).toBe('block');
    expect(batchDeleteAction('x')).toBe('cancel'); // non-finite → defensive cancel
  });
  it('B4 sumPositiveRemaining + courseProductList helpers', () => {
    expect(sumPositiveRemaining([batch('P', 3), batch('P', -2), batch('P', 4)])).toBe(7);
    expect(courseProductList({ courseProducts: [1] })).toEqual([1]);
    expect(courseProductList({ products: [2] })).toEqual([2]);
    expect(courseProductList({})).toEqual([]);
  });
  it('B5 groupUpdates pull target from BOTH productIds[] and products[] (completeness)', () => {
    const plan = planProductCascade({
      productId: 'P1', batches: [], courses: [],
      groups: [
        { id: 'G1', productIds: ['P1', 'P2'], products: [{ productId: 'P1' }, { productId: 'P3' }] },
        { id: 'G2', productIds: ['P9'] }, // untouched
      ],
    });
    expect(plan.groupUpdates.length).toBe(1);
    const g1 = plan.groupUpdates[0];
    expect(g1.groupId).toBe('G1');
    expect(g1.productIds).toEqual(['P2']);
    expect(g1.products.map(p => p.productId)).toEqual(['P3']);
    expect(g1.removedCount).toBe(2); // 1 from ids + 1 from products
  });
  it('B6 groupUpdates omits productIds/products keys the group doesn\'t carry (no undefined write)', () => {
    const plan = planProductCascade({ productId: 'P1', batches: [], courses: [], groups: [{ id: 'G1', productIds: ['P1'] }] });
    expect(plan.groupUpdates[0]).toHaveProperty('productIds');
    expect(plan.groupUpdates[0]).not.toHaveProperty('products');
  });
  it('B7 opReferencesProduct + isPendingOp + TERMINAL_OP_STATUSES', () => {
    expect(opReferencesProduct({ items: [{ productId: 'P1' }] }, 'P1')).toBe(true);
    expect(opReferencesProduct({ productId: 'P1' }, 'P1')).toBe(true);
    expect(opReferencesProduct({ items: [{ productId: 'P2' }] }, 'P1')).toBe(false);
    expect(isPendingOp({ status: 'active' })).toBe(true);
    expect(isPendingOp({ status: 'pending' })).toBe(true);
    expect(isPendingOp({ status: 'received' })).toBe(false);
    expect(isPendingOp({ status: 'CANCELLED' })).toBe(false); // case-insensitive
    expect(isPendingOp({ status: 'cancelled_post_receive' })).toBe(false);
    // NUMERIC status (be_stock_transfers / _withdrawals): 0/1 pending, 2 received, 3 cancelled
    expect(isPendingOp({ status: 0 })).toBe(true);  // pending-dispatch
    expect(isPendingOp({ status: 1 })).toBe(true);  // in-transit (1→2 receive still calls _assertProductExists)
    expect(isPendingOp({ status: 2 })).toBe(false); // received (terminal)
    expect(isPendingOp({ status: 3 })).toBe(false); // cancelled (terminal)
    expect(TERMINAL_OP_STATUSES).toContain('received');
    expect(TERMINAL_OP_STATUSES).toContain('cancelled');
  });
});

describe('C — source wiring (regression locks)', () => {
  it('C1 ProductsTab uses deleteProductWithCascade + previewProductDelete (NOT bare deleteProduct)', () => {
    const src = read('src/components/backend/ProductsTab.jsx');
    expect(src).toMatch(/deleteProductWithCascade/);
    expect(src).toMatch(/previewProductDelete/);
    expect(src).toMatch(/from '\.\.\/\.\.\/lib\/productDeleteClient\.js'/);
    // bare deleteProduct must NOT be imported/called from the Products tab anymore
    expect(src).not.toMatch(/import\s*\{[^}]*\bdeleteProduct\b[^}]*\}\s*from\s*'\.\.\/\.\.\/lib\/scopedDataLayer\.js'/);
  });
  it('C2 productDeleteClient deletes ==0 batches + cancels <0 batches (V144) + clears courses + product groups', () => {
    const src = read('src/lib/productDeleteClient.js');
    expect(src).toMatch(/batchDeleteAction/);
    expect(src).toMatch(/status:\s*'cancelled'/);
    expect(src).toMatch(/evaluateProductDeleteGuards/);
    expect(src).toMatch(/planProductCascade/);
    // completeness: central batches (location-agnostic query) + product-group membership
    expect(src).toMatch(/be_product_groups/);
    expect(src).toMatch(/groupUpdates/);
    // pending-op guard: loads inbound stock-op collections + passes stockOps to the guard
    expect(src).toMatch(/be_stock_orders/);
    expect(src).toMatch(/stockOps/);
  });
  it('C3 StockBalancePanel has the orphan backstop gated on productsLoaded', () => {
    const src = read('src/components/backend/StockBalancePanel.jsx');
    expect(src).toMatch(/productsLoaded/);
    expect(src).toMatch(/isOrphan/);
    // keep+flag live orphans (remaining>0), drop empty/negative orphans
    expect(src).toMatch(/p\.totalRemaining > 0/);
  });
  it('C4 pure helper stays pure — no Firestore import (so it can touch NO collection; treatments/sales/movements safe by construction)', () => {
    const src = read('src/lib/productDeleteCascade.js');
    expect(src).not.toMatch(/from ['"]firebase\/firestore['"]|firebase-admin/);
    // and no collection-access call (the helper takes already-fetched arrays)
    expect(src).not.toMatch(/\.collection\(|getDocs\(|deleteDoc\(/);
  });
  it('C5 AV176 invariant registered in audit-anti-vibe-code SKILL.md', () => {
    const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(src).toMatch(/AV176/);
  });
});

describe('F — Rule I full-flow simulate (master → guard → cascade → orphan gone)', () => {
  // Mirror the StockBalancePanel row-derivation: rows come from batches grouped
  // by productId; an orphan = batch productId not in the products map.
  function deriveBalanceRows(batches, productMap, productsLoaded) {
    const byProduct = new Map();
    for (const b of batches) {
      if (!b.productId) continue;
      if (!byProduct.has(b.productId)) byProduct.set(b.productId, { productId: b.productId, totalRemaining: 0 });
      byProduct.get(b.productId).totalRemaining += Number(b.qty?.remaining || 0);
    }
    const grouped = [...byProduct.values()];
    return productsLoaded
      ? grouped.filter(p => productMap[p.productId] ? true : (p.isOrphan = true, p.totalRemaining > 0))
      : grouped;
  }

  it('F1 deleting a clean product: cascade clears batches + pulls course ref + row disappears', () => {
    // master: product P1 with 1 empty batch + appears in course C1 sub-list (not main)
    const productMap = { P1: {}, P2: {} };
    let batches = [batch('P1', 0, 'b1'), batch('P2', 0, 'b2')];
    const courses = [{ id: 'C1', mainProductId: 'P2', courseProducts: [{ productId: 'P1' }, { productId: 'P2' }] }];

    // guard
    const g = evaluateProductDeleteGuards({ productId: 'P1', batches: batches.filter(b => b.productId === 'P1'), courses });
    expect(g.blocked).toBe(false);
    // plan + simulate the cascade commit
    const plan = planProductCascade({ productId: 'P1', batches, courses });
    for (const b of plan.batches) {
      if (batchDeleteAction(b.remaining) === 'delete') batches = batches.filter(x => x.batchId !== b.batchId);
    }
    const c1 = courses.find(c => c.id === 'C1');
    const upd = plan.courseUpdates.find(u => u.courseId === 'C1');
    c1.courseProducts = upd.courseProducts;
    delete productMap.P1; // product doc deleted

    // P1 no longer in stock balance, P2 still there, course C1 no longer lists P1
    const rows = deriveBalanceRows(batches, productMap, true);
    expect(rows.map(r => r.productId)).toEqual(['P2']);
    expect(c1.courseProducts.map(p => p.productId)).toEqual(['P2']);
  });

  it('F2 PRE-fix repro: deleting only the product doc (no cascade) leaves an orphan empty batch lingering pre-backstop', () => {
    const productMap = { P1: {} };
    const batches = [batch('P1', 0, 'b1')];
    delete productMap.P1; // bare deleteProduct — batch NOT cleared
    // pre-backstop (productsLoaded=false path / old code): orphan row STILL shows
    expect(deriveBalanceRows(batches, productMap, false).map(r => r.productId)).toEqual(['P1']);
    // V146 backstop: once loaded, empty orphan is dropped
    expect(deriveBalanceRows(batches, productMap, true).map(r => r.productId)).toEqual([]);
  });

  it('F3 orphan WITH positive stock is KEPT + flagged (never silently hide real inventory)', () => {
    const productMap = {}; // product gone
    const batches = [batch('P1', 7, 'b1')];
    const rows = deriveBalanceRows(batches, productMap, true);
    expect(rows.length).toBe(1);
    expect(rows[0].isOrphan).toBe(true);
    expect(rows[0].totalRemaining).toBe(7);
  });

  it('F4 negative orphan batch (remaining<0) is dropped by the backstop (cancelled/cleared)', () => {
    const productMap = {};
    const batches = [batch('P1', -1, 'b1')];
    expect(deriveBalanceRows(batches, productMap, true).map(r => r.productId)).toEqual([]);
  });
});
