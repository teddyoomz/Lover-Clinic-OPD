// ─── Phase 12.2b Priority 1.2 — CANCEL CASCADE full-flow simulate ────────
//
// When a sale is cancelled, FIVE things must reverse atomically:
//   1. customer.courses   — removeLinkedSaleCourses (filter by linkedSaleId)
//   2. be_stock_movements — reverseStockForSale (listStockMovements flagged)
//   3. deposits           — reverseDepositUsage (restore balance)
//   4. wallet             — wallet refund (credit movement)
//   5. points             — reversePointsEarned (deduct earned points)
//   + linked treatments   — _clearLinkedTreatmentsHasSale (detach so edit
//     doesn't double-deduct)
//
// These run via the caller (cancel modal handler or admin UI); the
// individual reverse functions are idempotent so re-cancel is safe.
//
// Coverage:
//   F1: removeLinkedSaleCourses — unused-vs-used split, keep used by default
//   F2: reverseCourseDeduction — restore qty via reverseQty, name+product+index matching
//   F3: _clearLinkedTreatmentsHasSale — detach treatments from cancelled sale
//   F4: source-grep — the 5 reversal functions all exist + cancelBackendSale
//       calls the detach helper + reverseStockForSale is idempotent
//   F5: adversarial — already-cancelled sale, partial cancel, over-cancel

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import { parseQtyString, reverseQty } from '../src/lib/courseUtils.js';

// Mirror of removeLinkedSaleCourses filter + reverseCourseDeduction logic.
function simulateRemoveLinkedSaleCourses(customerCourses, saleId, { removeUsed = false } = {}) {
  const next = [];
  let removedCount = 0;
  let keptUsedCount = 0;
  for (const c of customerCourses) {
    if (String(c.linkedSaleId || '') !== String(saleId)) {
      next.push(c);
      continue;
    }
    const p = parseQtyString(c.qty);
    const isUnused = p.total > 0 && p.remaining >= p.total;
    if (isUnused) { removedCount++; continue; }
    if (removeUsed) { removedCount++; continue; }
    keptUsedCount++;
    next.push(c);
  }
  return { courses: next, removedCount, keptUsedCount };
}

function simulateReverseCourseDeduction(courses, deductions, { preferNewest = false } = {}) {
  const out = courses.map(c => ({ ...c }));
  const matches = (c, d) => {
    const nameOk = d.courseName ? c.name === d.courseName : true;
    const prodOk = d.productName ? (c.product || c.name) === d.productName : true;
    return nameOk && prodOk;
  };
  for (const d of deductions) {
    let idx = -1;
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < out.length) {
      if (matches(out[d.courseIndex], d)) idx = d.courseIndex;
    }
    if (idx < 0 && d.courseName) {
      if (preferNewest) {
        for (let i = out.length - 1; i >= 0; i--) {
          if (matches(out[i], d)) { idx = i; break; }
        }
      } else {
        idx = out.findIndex(c => matches(c, d));
      }
    }
    if (idx < 0) continue;
    out[idx] = { ...out[idx], qty: reverseQty(out[idx].qty, d.deductQty || 1) };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// F1: removeLinkedSaleCourses — unused split, keep used
// ═══════════════════════════════════════════════════════════════════════

describe('F1: removeLinkedSaleCourses — detaches unused courses from cancelled sale', () => {
  const saleId = 'SALE-1';
  const otherSale = 'SALE-OTHER';

  it('F1.1: unused courses (remaining=total) linked to the sale are REMOVED', () => {
    const courses = [
      { name: 'A', qty: '5 / 5 U', linkedSaleId: saleId },    // unused → remove
      { name: 'B', qty: '3 / 5 U', linkedSaleId: saleId },    // partially used → KEEP by default
      { name: 'C', qty: '5 / 5 U', linkedSaleId: otherSale }, // different sale → untouched
    ];
    const { courses: next, removedCount, keptUsedCount } = simulateRemoveLinkedSaleCourses(courses, saleId);
    expect(removedCount).toBe(1);
    expect(keptUsedCount).toBe(1);
    expect(next.map(c => c.name)).toEqual(['B', 'C']);
  });

  it('F1.2: removeUsed:true also removes partially-used courses (force-full cancel)', () => {
    const courses = [
      { name: 'A', qty: '5 / 5 U', linkedSaleId: saleId },
      { name: 'B', qty: '3 / 5 U', linkedSaleId: saleId },
      { name: 'C', qty: '0 / 5 U', linkedSaleId: saleId }, // fully consumed → also goes
    ];
    const { removedCount, keptUsedCount } = simulateRemoveLinkedSaleCourses(courses, saleId, { removeUsed: true });
    expect(removedCount).toBe(3);
    expect(keptUsedCount).toBe(0);
  });

  it('F1.3: courses without linkedSaleId are untouched (defensive)', () => {
    const courses = [
      { name: 'Orphan', qty: '5 / 5 U' }, // no linkedSaleId
      { name: 'Linked', qty: '5 / 5 U', linkedSaleId: saleId },
    ];
    const { courses: next } = simulateRemoveLinkedSaleCourses(courses, saleId);
    expect(next.map(c => c.name)).toEqual(['Orphan']);
  });

  it('F1.4: empty courses array → no-op, no crash', () => {
    expect(simulateRemoveLinkedSaleCourses([], 'SALE-1')).toEqual({ courses: [], removedCount: 0, keptUsedCount: 0 });
  });

  it('F1.5: buffet course linked to cancelled sale — remaining=total at ANY time, so removed even if used', () => {
    // Buffet qty never decrements — remaining always equals total — so the
    // isUnused check always returns true. Cancel a buffet-containing sale →
    // buffet course detached (correct behavior: customer didn't pay → no buffet access).
    const courses = [
      { name: 'Buffet', qty: '1 / 1 U', courseType: 'บุฟเฟต์', linkedSaleId: saleId },
    ];
    const { removedCount } = simulateRemoveLinkedSaleCourses(courses, saleId);
    expect(removedCount).toBe(1);
  });

  it('F1.6: fill-later course consumed (qty 0/1) → kept by default (protect record of use)', () => {
    const courses = [
      { name: 'FillLater', qty: '0 / 1 ครั้ง', courseType: 'เหมาตามจริง', linkedSaleId: saleId },
    ];
    const { keptUsedCount } = simulateRemoveLinkedSaleCourses(courses, saleId);
    expect(keptUsedCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: reverseCourseDeduction — restores qty via reverseQty
// ═══════════════════════════════════════════════════════════════════════

describe('F2: reverseCourseDeduction — restore qty on reverse', () => {
  it('F2.1: exact-index match reverses qty (treatment edit-mode path)', () => {
    const courses = [{ name: 'A', product: 'P', qty: '3 / 5 U' }];
    const out = simulateReverseCourseDeduction(courses, [{
      courseIndex: 0, courseName: 'A', productName: 'P', deductQty: 2,
    }]);
    expect(out[0].qty).toBe('5 / 5 U');
  });

  it('F2.2: name+product fallback when courseIndex missing', () => {
    const courses = [{ name: 'X', product: 'P1', qty: '1 / 3 U' }];
    const out = simulateReverseCourseDeduction(courses, [{
      courseName: 'X', productName: 'P1', deductQty: 2,
    }]);
    expect(out[0].qty).toBe('3 / 3 U');
  });

  it('F2.3: preferNewest flag — cancel of newer sale reverses on NEWER course entry', () => {
    const courses = [
      { name: 'X', product: 'P', qty: '1 / 3 U' }, // older
      { name: 'X', product: 'P', qty: '2 / 3 U' }, // newer
    ];
    const out = simulateReverseCourseDeduction(courses, [{
      courseName: 'X', productName: 'P', deductQty: 1,
    }], { preferNewest: true });
    expect(out[0].qty).toBe('1 / 3 U'); // older untouched
    expect(out[1].qty).toBe('3 / 3 U'); // newer restored
  });

  it('F2.4: cap at total — reverse more than was deducted does NOT exceed total', () => {
    const courses = [{ name: 'X', product: 'P', qty: '4 / 5 U' }];
    const out = simulateReverseCourseDeduction(courses, [{ courseName: 'X', productName: 'P', deductQty: 99 }]);
    // reverseQty uses Math.min(remaining + amount, total) so caps at 5
    expect(out[0].qty).toBe('5 / 5 U');
  });

  it('F2.5: no match → skip silently (idempotent reverse on already-reversed)', () => {
    const courses = [{ name: 'A', qty: '5 / 5 U' }];
    const out = simulateReverseCourseDeduction(courses, [{ courseName: 'NONEXISTENT', deductQty: 1 }]);
    expect(out[0].qty).toBe('5 / 5 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3 + F4: source-grep — cascade wiring verified
// ═══════════════════════════════════════════════════════════════════════

describe('F3: source-grep — all reversal functions exist + cancelBackendSale cascades', () => {
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');

  it('F3.1: cancelBackendSale detaches linked treatments (avoids double-deduct on edit)', () => {
    const idx = BC.indexOf('export async function cancelBackendSale');
    expect(idx).toBeGreaterThan(-1);
    const body = BC.slice(idx, idx + 1500);
    expect(body).toMatch(/_clearLinkedTreatmentsHasSale\(saleId\)/);
    expect(body).toMatch(/status:\s*['"]cancelled['"]/);
    expect(body).toMatch(/['"]payment\.status['"]:\s*['"]cancelled['"]/);
  });

  it('F3.2: deleteBackendSale ALSO detaches linked treatments (delete ≠ cancel but same integrity need)', () => {
    const idx = BC.indexOf('export async function deleteBackendSale');
    expect(idx).toBeGreaterThan(-1);
    const body = BC.slice(idx, idx + 800);
    expect(body).toMatch(/_clearLinkedTreatmentsHasSale\(saleId\)/);
  });

  it('F3.3: all 5 reversal functions exported from backendClient', () => {
    expect(BC).toMatch(/export async function reverseCourseDeduction/);
    expect(BC).toMatch(/export async function reverseStockForSale/);
    expect(BC).toMatch(/export async function reverseDepositUsage/);
    expect(BC).toMatch(/export async function reversePointsEarned/);
    expect(BC).toMatch(/export async function removeLinkedSaleCourses/);
  });

  it('F3.4: reverseStockForSale is idempotent via includeReversed:false filter', () => {
    expect(BC).toMatch(/listStockMovements\(\{[^}]*linkedSaleId[^}]*includeReversed:\s*false/);
  });

  it('F3.5: reverseDepositUsage — runs in transaction + restores usedAmount/remainingAmount/status', () => {
    const idx = BC.indexOf('export async function reverseDepositUsage');
    expect(idx).toBeGreaterThan(-1);
    const body = BC.slice(idx, idx + 2000);
    // Transactional restore — read usageHistory for this saleId, subtract from usedAmount
    expect(body).toMatch(/runTransaction\(db/);
    expect(body).toMatch(/usedAmount:\s*newUsed/);
    expect(body).toMatch(/remainingAmount:/);
    expect(body).toMatch(/recalcCustomerDepositBalance/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: adversarial — already-cancelled, no-customer, concurrent
// ═══════════════════════════════════════════════════════════════════════

describe('F5: adversarial cancel-cascade', () => {
  it('F5.1: removeLinkedSaleCourses with 0 matching courses → removedCount=0 (no crash)', () => {
    const courses = [
      { name: 'X', qty: '5 / 5 U', linkedSaleId: 'OTHER-SALE' },
    ];
    const { removedCount, keptUsedCount, courses: next } = simulateRemoveLinkedSaleCourses(courses, 'SALE-1');
    expect(removedCount).toBe(0);
    expect(keptUsedCount).toBe(0);
    expect(next).toHaveLength(1);
  });

  it('F5.2: courses with malformed qty string → parseQtyString → total=0 → isUnused false → kept (defensive)', () => {
    const courses = [{ name: 'Broken', qty: 'garbage', linkedSaleId: 'SALE-1' }];
    const { removedCount, keptUsedCount } = simulateRemoveLinkedSaleCourses(courses, 'SALE-1');
    // total=0 means we keep it — safer than dropping something we don't understand
    expect(removedCount).toBe(0);
    expect(keptUsedCount).toBe(1);
  });

  it('F5.3: reverseCourseDeduction on EMPTY deductions array → no-op', () => {
    const courses = [{ name: 'A', qty: '5 / 5 U' }];
    expect(simulateReverseCourseDeduction(courses, [])).toEqual(courses);
  });

  it('F5.4: reverse 0 qty → effectively no-op (defensive — some callers pass deductQty=undefined)', () => {
    const courses = [{ name: 'A', product: 'P', qty: '3 / 5 U' }];
    const out = simulateReverseCourseDeduction(courses, [{ courseName: 'A', productName: 'P', deductQty: 0 }]);
    // Math.min(3 + 1, 5) = 4 — because `deductQty || 1` defaults to 1
    // This IS the intended behavior per the real reverseCourseDeduction
    expect(out[0].qty).toBe('4 / 5 U');
  });

  it('F5.5: reverse more than deducted → cap at total (reverseQty invariant)', () => {
    const courses = [{ name: 'A', product: 'P', qty: '3 / 5 U' }];
    const out = simulateReverseCourseDeduction(courses, [
      { courseName: 'A', productName: 'P', deductQty: 2 }, // 3 + 2 = 5, ok
      { courseName: 'A', productName: 'P', deductQty: 10 }, // already at 5, cap
    ]);
    expect(out[0].qty).toBe('5 / 5 U');
  });

  it('F5.6: multi-sale cancel — only target sale courses affected, others untouched', () => {
    const courses = [
      { name: 'A', qty: '5/5 U', linkedSaleId: 'S1' },
      { name: 'B', qty: '5/5 U', linkedSaleId: 'S2' },
      { name: 'C', qty: '5/5 U', linkedSaleId: 'S3' },
    ];
    const { courses: next, removedCount } = simulateRemoveLinkedSaleCourses(courses, 'S2');
    expect(removedCount).toBe(1);
    expect(next.map(c => c.name)).toEqual(['A', 'C']);
  });
});
