// 2026-06-09 — Regression bank for the TFP buy/sale critical-path bug:
//   Facet A: buy-qty NOT multiplied into the displayed customer-course qty
//            (buildPurchasedCourseEntry) while the bill + the persisted course
//            (resolvePurchasedCourseForAssign) WERE multiplied → "ซื้อ 3 ขึ้น 1
//            แต่คิดตัง 3".
//   Facet B: per-purchase identity (courseId/rowId) built from the MASTER item.id
//            with no per-purchase token → the SAME course bought twice produced
//            COLLIDING rowIds → ticking one checkbox ticked the other; deleting one
//            purchase deleted both.
//
// User report (verbatim): "ไม่สามารถซื้อคอร์สมากกว่า 1 คอร์ส ... ราคาดันขึ้นแบบรวม
// ... กดติ๊กของคอร์สแรก แล้วไปบังคับคอร์สที่ 2 ให้ติ๊กด้วย ... จุดซื้อขายของ".
//
// The fix threads a per-purchase `uid` through courseId + every rowId, multiplies
// the display qty by buy-qty so DISPLAY === SALE === PERSISTED, and makes
// removePurchasedItem target the specific purchase via purchaseUid.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildPurchasedCourseEntry,
  resolvePurchasedCourseForAssign,
  buildCustomerCourseGroups,
  buildCustomerPromotionGroups,
  mapPromotionProductsToConsumables,
  filterOutConsumablesForPromotion,
} from '../src/lib/treatmentBuyHelpers.js';

// ─────────────────────────────────────────────────────────────────────────────
// A — Facet A: buy-qty multiplier in the DISPLAY (buildPurchasedCourseEntry)
// ─────────────────────────────────────────────────────────────────────────────
describe('A — buy-qty multiplier in the displayed customer-course', () => {
  const course = (qty) => ({
    id: 'IVDRIP1', name: 'IV Drip Chelation 1 ครั้ง', qty: String(qty), unit: 'ครั้ง',
    products: [
      { id: 'P-IVDRIP', name: 'IV Drip Chelation', qty: 1 },
      { id: 'P-EDTA', name: 'EDTA (CMAT)', qty: 2.5 },
      { id: 'P-VITC', name: 'Vit C', qty: 10 },
    ],
  });

  it('A1 buy qty 3 multiplies EACH sub-product remaining/total (the user repro)', () => {
    const e = buildPurchasedCourseEntry(course(3), { uid: 'u1' });
    const byName = Object.fromEntries(e.products.map(p => [p.name, p]));
    expect(byName['IV Drip Chelation'].total).toBe('3');     // 1 × 3
    expect(byName['IV Drip Chelation'].remaining).toBe('3');
    expect(byName['EDTA (CMAT)'].total).toBe('7.5');         // 2.5 × 3
    expect(byName['Vit C'].total).toBe('30');                // 10 × 3
  });

  it('A2 buy qty 1 leaves master qty unchanged', () => {
    const e = buildPurchasedCourseEntry(course(1), { uid: 'u1' });
    const edta = e.products.find(p => p.name === 'EDTA (CMAT)');
    expect(edta.total).toBe('2.5');
    expect(edta.remaining).toBe('2.5');
  });

  it('A3 self-fallback (no sub-products) → qty = buy-qty', () => {
    const e = buildPurchasedCourseEntry({ id: 'C-SELF', name: 'Solo', qty: '4' }, { uid: 'u1' });
    expect(e.products).toHaveLength(1);
    expect(e.products[0].total).toBe('4');
    expect(e.products[0].remaining).toBe('4');
  });

  it('A4 buy-qty 0 / missing → defaults to 1 (Math.max guard)', () => {
    expect(buildPurchasedCourseEntry({ ...course(0) }, { uid: 'u1' }).products.find(p => p.name === 'EDTA (CMAT)').total).toBe('2.5');
    const noQty = { id: 'X', name: 'X', products: [{ id: 'P', name: 'P', qty: 5 }] };
    expect(buildPurchasedCourseEntry(noQty, { uid: 'u1' }).products[0].total).toBe('5');
  });

  it('A5 เหมาตามจริง (fillLater) → blank regardless of buy-qty', () => {
    const e = buildPurchasedCourseEntry({ ...course(3), courseType: 'เหมาตามจริง' }, { uid: 'u1' });
    expect(e.products[0].remaining).toBe('');
    expect(e.products[0].total).toBe('');
  });

  // THE divergence-closure invariant: what the user SEES must equal what the
  // system PERSISTS for the same buy-qty. Pre-fix display=1× but persist=N×.
  it('A6 DISPLAY qty === PERSIST qty for buy-qty N (no divergence)', () => {
    for (const N of [1, 2, 3, 5]) {
      const item = course(N);
      const display = buildPurchasedCourseEntry(item, { uid: 'u1' });
      // resolvePurchasedCourseForAssign reads the MASTER recipe (purchasedItems
      // products, un-multiplied) and multiplies by pQty — same source, same factor.
      const persist = resolvePurchasedCourseForAssign(
        { name: item.name, products: item.products, qty: String(N) }, [], String(N)
      );
      const dispByName = Object.fromEntries(display.products.map(p => [p.name, Number(p.total)]));
      const persByName = Object.fromEntries(persist.products.map(p => [p.name, Number(p.qty)]));
      for (const name of Object.keys(dispByName)) {
        expect(dispByName[name]).toBe(persByName[name]); // display === persist
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — Facet B: per-purchase rowId / courseId uniqueness
// ─────────────────────────────────────────────────────────────────────────────
describe('B — duplicate-buy identity uniqueness (no checkbox collision)', () => {
  const item = { id: 'IVDRIP1', name: 'IV Drip Chelation 1 ครั้ง', qty: '1', products: [{ id: 'P-IVDRIP', name: 'IV Drip Chelation', qty: 1 }] };

  it('B1 same course bought twice → DISTINCT courseIds', () => {
    const a = buildPurchasedCourseEntry(item, { uid: 'u-A' });
    const b = buildPurchasedCourseEntry(item, { uid: 'u-B' });
    expect(a.courseId).not.toBe(b.courseId);
    expect(a.purchaseUid).toBe('u-A');
    expect(b.purchaseUid).toBe('u-B');
  });

  it('B2 same course + same product bought twice → DISTINCT product rowIds (the collision)', () => {
    const a = buildPurchasedCourseEntry(item, { uid: 'u-A' });
    const b = buildPurchasedCourseEntry(item, { uid: 'u-B' });
    expect(a.products[0].rowId).not.toBe(b.products[0].rowId);
    // both still classify as purchased-session rows (deduct path contract)
    expect(a.products[0].rowId.startsWith('purchased-')).toBe(true);
    expect(b.products[0].rowId.startsWith('purchased-')).toBe(true);
  });

  it('B3 self-fallback rowId is unique per purchase', () => {
    const solo = { id: 'C-SELF', name: 'Solo', qty: '1' };
    const a = buildPurchasedCourseEntry(solo, { uid: 'u-A' });
    const b = buildPurchasedCourseEntry(solo, { uid: 'u-B' });
    expect(a.products[0].rowId).not.toBe(b.products[0].rowId);
  });

  it('B4 no-pid sub-products get stable per-purchase index rowIds (no Math.random)', () => {
    const noPid = { id: 'C-X', name: 'X', qty: '1', products: [{ name: 'A', qty: 1 }, { name: 'B', qty: 1 }] };
    const e1 = buildPurchasedCourseEntry(noPid, { uid: 'u1' });
    const e2 = buildPurchasedCourseEntry(noPid, { uid: 'u1' }); // SAME uid → deterministic
    expect(e1.products.map(p => p.rowId)).toEqual(e2.products.map(p => p.rowId));
    expect(e1.products[0].rowId).not.toBe(e1.products[1].rowId); // distinct within course
  });

  it('B5 checkbox independence: ticking buy-1 leaves buy-2 unticked (Set of rowIds)', () => {
    const a = buildPurchasedCourseEntry(item, { uid: 'u-A' });
    const b = buildPurchasedCourseEntry(item, { uid: 'u-B' });
    // mirror selectedCourseItems.has(rowId) — the exact checkbox `checked` source
    const selected = new Set();
    selected.add(a.products[0].rowId);                 // user ticks course-1
    expect(selected.has(a.products[0].rowId)).toBe(true);
    expect(selected.has(b.products[0].rowId)).toBe(false); // course-2 stays unticked
  });

  it('B6 buildCustomerCourseGroups → 2 separate groups, each surfacing its purchaseUid', () => {
    const a = buildPurchasedCourseEntry(item, { uid: 'u-A' });
    const b = buildPurchasedCourseEntry(item, { uid: 'u-B' });
    const groups = buildCustomerCourseGroups([a, b]);
    expect(groups).toHaveLength(2);
    expect(groups[0].purchaseUid).toBe('u-A');
    expect(groups[1].purchaseUid).toBe('u-B');
    expect(groups[0].courseId).not.toBe(groups[1].courseId);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// R — targeted remove (pure mirror of removePurchasedItem's filter logic)
// ─────────────────────────────────────────────────────────────────────────────
describe('R — removing one purchase keeps the other (targeted by purchaseUid)', () => {
  // Mirror of TreatmentFormPage.removePurchasedItem customerCourses + rowId filters.
  const removeCustomerCourses = (customerCourses, target) =>
    customerCourses.filter(c => {
      if (target.purchaseUid != null && c.purchaseUid != null) return String(c.purchaseUid) !== String(target.purchaseUid);
      if (target.itemType === 'course') return !c.courseId?.startsWith(`purchased-course-${target.id}-`);
      if (target.itemType === 'promotion') return !c.courseId?.startsWith(`promo-${target.id}-`);
      return true;
    });
  const removeSelected = (rowIds, target) => {
    const prefix = target.purchaseUid != null
      ? (target.itemType === 'course' ? `purchased-${target.id}-${target.purchaseUid}-row-` : `promo-${target.id}-${target.purchaseUid}-row-`)
      : (target.itemType === 'course' ? `purchased-${target.id}-row-` : `promo-${target.id}-row-`);
    return new Set([...rowIds].filter(r => !r.startsWith(prefix)));
  };

  const item = { id: 'IVDRIP1', name: 'IV Drip Chelation 1 ครั้ง', qty: '1', products: [{ id: 'P-IVDRIP', name: 'IV Drip Chelation', qty: 1 }] };

  it('R1 deleting buy-1 leaves buy-2 in customerCourses', () => {
    const a = buildPurchasedCourseEntry(item, { uid: 'u-A' });
    const b = buildPurchasedCourseEntry(item, { uid: 'u-B' });
    const after = removeCustomerCourses([a, b], { id: 'IVDRIP1', itemType: 'course', courseId: a.courseId, purchaseUid: 'u-A' });
    expect(after).toHaveLength(1);
    expect(after[0].purchaseUid).toBe('u-B');
  });

  it('R2 deleting buy-1 removes ONLY buy-1 rowIds from selectedCourseItems', () => {
    const a = buildPurchasedCourseEntry(item, { uid: 'u-A' });
    const b = buildPurchasedCourseEntry(item, { uid: 'u-B' });
    const selected = new Set([a.products[0].rowId, b.products[0].rowId]);
    const after = removeSelected(selected, { id: 'IVDRIP1', itemType: 'course', purchaseUid: 'u-A' });
    expect(after.has(a.products[0].rowId)).toBe(false);
    expect(after.has(b.products[0].rowId)).toBe(true);
  });

  it('R3 legacy fallback (no purchaseUid) still removes by master prefix', () => {
    // pre-fix data shape — defensive path
    const legacy = [{ courseId: 'purchased-course-IVDRIP1-1700000000000', courseName: 'X', products: [] }];
    const after = removeCustomerCourses(legacy, { id: 'IVDRIP1', itemType: 'course' });
    expect(after).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P — promotion path parity (Rule P class-of-bug extension)
// ─────────────────────────────────────────────────────────────────────────────
describe('P — promotion buy-this-visit identity + grouping', () => {
  it('P1 same promo bought twice → 2 groups (keyed by purchaseUid)', () => {
    const mk = (uid) => ({
      courseId: `promo-PROMO1-${uid}-course-c1`, courseName: 'Sub', promotionId: 'PROMO1',
      isAddon: true, purchasedItemId: 'PROMO1', purchasedItemType: 'promotion', purchaseUid: uid,
      products: [{ rowId: `promo-PROMO1-${uid}-row-c1-p1`, name: 'PRP', remaining: '6', total: '6' }],
    });
    const promos = [
      { id: 'PROMO1', promotionName: 'PRP Bundle', isAddon: true, purchaseUid: 'u-A' },
      { id: 'PROMO1', promotionName: 'PRP Bundle', isAddon: true, purchaseUid: 'u-B' },
    ];
    const groups = buildCustomerPromotionGroups([mk('u-A'), mk('u-B')], promos);
    expect(groups).toHaveLength(2);
    expect(groups[0].purchaseUid).toBe('u-A');
    expect(groups[1].purchaseUid).toBe('u-B');
    expect(groups[0].groupKey).not.toBe(groups[1].groupKey);
  });

  it('P2 existing (non-addon) promos still group by promotionId', () => {
    const existing = [
      { courseId: 'p1', courseName: 'A', promotionId: 'PROMO2', products: [{ rowId: 'r1', remaining: '1' }] },
      { courseId: 'p2', courseName: 'B', promotionId: 'PROMO2', products: [{ rowId: 'r2', remaining: '1' }] },
    ];
    const groups = buildCustomerPromotionGroups(existing, [{ id: 'PROMO2', promotionName: 'Legacy' }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].courses).toHaveLength(2);
  });

  it('P3 promo consumables carry purchaseUid; filter removes only that purchase', () => {
    const cons = [
      ...mapPromotionProductsToConsumables({ id: 'PROMO1', name: 'X', purchaseUid: 'u-A', products: [{ id: 'F1', name: 'Free A', qty: 1 }] }),
      ...mapPromotionProductsToConsumables({ id: 'PROMO1', name: 'X', purchaseUid: 'u-B', products: [{ id: 'F1', name: 'Free A', qty: 1 }] }),
    ];
    expect(cons).toHaveLength(2);
    const after = filterOutConsumablesForPromotion(cons, 'PROMO1', 'u-A');
    expect(after).toHaveLength(1);
    expect(after[0].purchaseUid).toBe('u-B');
  });

  it('P3b legacy 2-arg filter (no purchaseUid) removes all of a promotion', () => {
    const cons = [{ promotionId: 'PROMO1', name: 'A' }, { promotionId: 'PROMO1', name: 'B' }, { promotionId: 'PROMO2', name: 'C' }];
    const after = filterOutConsumablesForPromotion(cons, 'PROMO1');
    expect(after).toHaveLength(1);
    expect(after[0].promotionId).toBe('PROMO2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SG — source-grep regression locks (prevent re-introduction of the collision)
// ─────────────────────────────────────────────────────────────────────────────
describe('SG — source-grep locks the fix shape', () => {
  const HELPERS = readFileSync('src/lib/treatmentBuyHelpers.js', 'utf8');
  const TFP = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

  it('SG1 buildPurchasedCourseEntry rowId includes the per-purchase uid (not bare master id)', () => {
    expect(HELPERS).toMatch(/rowId: `purchased-\$\{item\.id\}-\$\{uid\}-row-/);
    expect(HELPERS).toMatch(/rowId: `purchased-\$\{item\.id\}-\$\{uid\}-row-self`/);
    // anti-regression: the old collision-prone format must be gone
    expect(HELPERS).not.toMatch(/rowId: `purchased-\$\{item\.id\}-row-\$\{pid/);
    expect(HELPERS).not.toMatch(/rowId: `purchased-\$\{item\.id\}-row-self`/);
  });

  it('SG2 buildPurchasedCourseEntry multiplies sub-product qty by buyQty + stamps purchaseUid', () => {
    expect(HELPERS).toMatch(/const buyQty = Math\.max\(1, Number\(item\.qty\) \|\| 1\)/);
    expect(HELPERS).toMatch(/\(Number\(p\.qty\) \|\| 1\) \* buyQty/);
    expect(HELPERS).toMatch(/purchaseUid: uid/);
    // anti-regression: the old un-multiplied display qty must be gone
    expect(HELPERS).not.toMatch(/remaining: fillLater \? '' : String\(p\.qty \|\| item\.qty \|\| 1\)/);
  });

  it('SG3 confirmBuyModal mints a unique purchaseUid + passes uid to the helper', () => {
    expect(TFP).toMatch(/const purchaseUid = `\$\{Date\.now\(\)\.toString\(36\)\}-\$\{\+\+purchaseSeqRef\.current\}`/);
    expect(TFP).toMatch(/buildPurchasedCourseEntry\(item, \{ uid: item\.purchaseUid \}\)/);
    expect(TFP).toMatch(/courseId: `promo-\$\{item\.id\}-\$\{item\.purchaseUid\}-course-/);
    expect(TFP).toMatch(/rowId: `promo-\$\{item\.id\}-\$\{item\.purchaseUid\}-row-/);
  });

  it('SG4 removePurchasedItem targets by purchaseUid + trash buttons pass it', () => {
    expect(TFP).toMatch(/const targetUid = item\.purchaseUid != null/);
    expect(TFP).toMatch(/String\(c\.purchaseUid\) !== targetUid/);
    // course trash + promo trash both forward purchaseUid
    expect(TFP).toMatch(/removePurchasedItem\(\{ id: course\.purchasedItemId,[^}]*purchaseUid: course\.purchaseUid \}\)/);
    expect(TFP).toMatch(/removePurchasedItem\(\{ id: group\.purchasedItemId,[^}]*purchaseUid: group\.purchaseUid \}\)/);
  });
});
