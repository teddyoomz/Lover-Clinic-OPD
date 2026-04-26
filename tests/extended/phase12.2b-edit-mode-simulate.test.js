// ─── Phase 12.2b Priority 1.4 — EDIT-MODE REVERSE+REAPPLY simulate ────────
//
// When the user edits an existing treatment, handleSubmit runs this flow:
//   1. Load existingCourseItems (what was deducted on the prior save)
//   2. Split into oldExisting (phase-1 was-deducted) vs oldPurchased
//      (phase-2 bought-in-visit — already in customer.courses)
//   3. reverseCourseDeduction(oldExisting) — restore be_customers qty
//   4. reverseCourseDeduction(oldPurchased, preferNewest:true) — restore
//      the purchased ones (hit newest-first because they were ADDED at end)
//   5. Compute NEW deductions from current form state
//   6. deductCourseItems(newExisting) phase-1
//   7. Auto-sale + assignCourseToCustomer the newly-bought
//   8. deductCourseItems(newPurchased, preferNewest:true) phase-2
//
// Net invariant: after edit, the customer.courses state matches what
// a FRESH save would have produced for the edited form state. Tested by:
//   F1: no-op edit (load then save same thing) → courses unchanged
//   F2: remove one item from edit → that item's reverse applied, state reverts
//   F3: add one item to edit → reversed old + deducted new
//   F4: change qty of existing item → net delta
//   F5: change between course types (add buffet, remove fill-later) → both reversals fire
//   F6: source-grep the handleSubmit split + preferNewest plumbing

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import { parseQtyString, formatQtyString, deductQty, reverseQty } from '../src/lib/courseUtils.js';
import { isPurchasedSessionRowId } from '../src/lib/treatmentBuyHelpers.js';

// ═══════════════════════════════════════════════════════════════════════
// Simulate helpers — reverse + deduct mirrors
// ═══════════════════════════════════════════════════════════════════════

function simulateReverse(courses, deductions, { preferNewest = false } = {}) {
  const out = courses.map(c => ({ ...c }));
  const matches = (c, d) => {
    const nOk = d.courseName ? c.name === d.courseName : true;
    const pOk = d.productName ? (c.product || c.name) === d.productName : true;
    return nOk && pOk;
  };
  for (const d of deductions) {
    let idx = -1;
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < out.length) {
      if (matches(out[d.courseIndex], d)) idx = d.courseIndex;
    }
    if (idx < 0 && d.courseName) {
      if (preferNewest) {
        for (let i = out.length - 1; i >= 0; i--) if (matches(out[i], d)) { idx = i; break; }
      } else {
        idx = out.findIndex(c => matches(c, d));
      }
    }
    if (idx < 0) continue;
    out[idx] = { ...out[idx], qty: reverseQty(out[idx].qty, d.deductQty || 1) };
  }
  return out;
}

function simulateDeduct(courses, deductions) {
  const out = courses.map(c => ({ ...c }));
  const matches = (c, d) => {
    const nOk = d.courseName ? c.name === d.courseName : true;
    const pOk = d.productName ? (c.product || c.name) === d.productName : true;
    return nOk && pOk;
  };
  for (const d of deductions) {
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < out.length) {
      const c = out[d.courseIndex];
      if (matches(c, d)) {
        if (c.courseType === 'เหมาตามจริง') {
          const p = parseQtyString(c.qty);
          out[d.courseIndex] = { ...c, qty: formatQtyString(0, p.total > 0 ? p.total : 1, p.unit || 'ครั้ง') };
          continue;
        }
        if (c.courseType === 'บุฟเฟต์') continue;
        const p = parseQtyString(c.qty);
        if (p.remaining > 0) {
          out[d.courseIndex] = { ...c, qty: deductQty(c.qty, Math.min(d.deductQty || 1, p.remaining)) };
        }
      }
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// F1: no-op edit → courses unchanged (reverse + re-deduct net-zero)
// ═══════════════════════════════════════════════════════════════════════

describe('F1: no-op edit — reverse then re-deduct same thing → unchanged state', () => {
  it('F1.1: specific-qty unchanged-edit net-zero', () => {
    const initial = [{ name: 'A', product: 'P', qty: '3 / 5 U' }];
    // reverse 2 (the prior deduct) then deduct 2 again
    const reversed = simulateReverse(initial, [{ courseName: 'A', productName: 'P', deductQty: 2, courseIndex: 0 }]);
    expect(reversed[0].qty).toBe('5 / 5 U');
    const reapplied = simulateDeduct(reversed, [{ courseName: 'A', productName: 'P', deductQty: 2, courseIndex: 0 }]);
    expect(reapplied[0].qty).toBe('3 / 5 U');
    expect(reapplied[0].qty).toBe(initial[0].qty);
  });

  it('F1.2: buffet no-op edit → still pinned', () => {
    const initial = [{ name: 'B', product: 'P', qty: '1 / 1 U', courseType: 'บุฟเฟต์' }];
    const reversed = simulateReverse(initial, [{ courseName: 'B', productName: 'P', deductQty: 1, courseIndex: 0 }]);
    // Buffet has remaining=total already, reverseQty caps at total → unchanged
    expect(reversed[0].qty).toBe('1 / 1 U');
    const reapplied = simulateDeduct(reversed, [{ courseName: 'B', productName: 'P', deductQty: 1, courseIndex: 0 }]);
    expect(reapplied[0].qty).toBe('1 / 1 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: edit that REMOVES an item → only reverse, no re-deduct
// ═══════════════════════════════════════════════════════════════════════

describe('F2: edit removes an item → reverse applies, final state = pre-treatment', () => {
  it('F2.1: remove the single ticked item → qty restored to full', () => {
    const initial = [{ name: 'A', product: 'P', qty: '4 / 5 U' }];
    const reversed = simulateReverse(initial, [{ courseName: 'A', productName: 'P', deductQty: 1, courseIndex: 0 }]);
    expect(reversed[0].qty).toBe('5 / 5 U');
    // No re-deduct → final = reversed
  });

  it('F2.2: remove one of multiple ticked items → others still deducted', () => {
    // Prior: deducted 2 from course A and 1 from course B. Edit removes
    // the B tick. Final: A still at 3/5, B back to 3/3.
    const initial = [
      { name: 'A', product: 'P', qty: '3 / 5 U' },
      { name: 'B', product: 'Q', qty: '2 / 3 U' },
    ];
    const reversed = simulateReverse(initial, [
      { courseName: 'B', productName: 'Q', deductQty: 1, courseIndex: 1 },
    ]);
    expect(reversed[0].qty).toBe('3 / 5 U'); // A untouched
    expect(reversed[1].qty).toBe('3 / 3 U'); // B restored
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: edit ADDS an item → reverse (none for that item) + fresh deduct
// ═══════════════════════════════════════════════════════════════════════

describe('F3: edit adds an item → deduct-only for the new one', () => {
  it('F3.1: new deduction on a fresh item leaves others untouched', () => {
    const initial = [
      { name: 'A', product: 'P', qty: '3 / 5 U' },
      { name: 'B', product: 'Q', qty: '3 / 3 U' },
    ];
    // Edit adds B tick — only deduct B
    const out = simulateDeduct(initial, [
      { courseName: 'B', productName: 'Q', deductQty: 1, courseIndex: 1 },
    ]);
    expect(out[0].qty).toBe('3 / 5 U');
    expect(out[1].qty).toBe('2 / 3 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: edit changes QTY (old qty=2, new qty=5) → reverse 2 + deduct 5
// ═══════════════════════════════════════════════════════════════════════

describe('F4: edit changes qty → full reverse + full re-deduct (net delta)', () => {
  it('F4.1: change 2 → 5 on a course with 3/5 remaining', () => {
    const initial = [{ name: 'X', product: 'P', qty: '3 / 5 U' }];
    // Reverse old qty=2 → back to 5/5
    const reversed = simulateReverse(initial, [{ courseName: 'X', productName: 'P', deductQty: 2, courseIndex: 0 }]);
    expect(reversed[0].qty).toBe('5 / 5 U');
    // Deduct new qty=5 → 0/5
    const final = simulateDeduct(reversed, [{ courseName: 'X', productName: 'P', deductQty: 5, courseIndex: 0 }]);
    expect(final[0].qty).toBe('0 / 5 U');
    // Net change from initial: 3/5 → 0/5 = delta -3 (correct: user ticked 3 more)
  });

  it('F4.2: change 3 → 1 (reduce) → reverse 3 + deduct 1', () => {
    const initial = [{ name: 'X', product: 'P', qty: '2 / 5 U' }]; // prior deducted 3
    const reversed = simulateReverse(initial, [{ courseName: 'X', productName: 'P', deductQty: 3, courseIndex: 0 }]);
    expect(reversed[0].qty).toBe('5 / 5 U');
    const final = simulateDeduct(reversed, [{ courseName: 'X', productName: 'P', deductQty: 1, courseIndex: 0 }]);
    expect(final[0].qty).toBe('4 / 5 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: mixed course-type edit — fill-later + buffet behave per their rules
// ═══════════════════════════════════════════════════════════════════════

describe('F5: mixed-type edit — each course-type obeys its reverse rule', () => {
  it('F5.1: remove a fill-later tick — qty restores to total via reverseQty cap', () => {
    // Prior: fill-later consumed → qty=0/1 ครั้ง (consumeRealQty wrote this)
    // Edit removes the tick — reverseCourseDeduction restores via reverseQty.
    // reverseQty adds `amount` (capped at total) so 0 + 1 → 1. Edit restores
    // the course to 1/1 ครั้ง — the next save can re-consume.
    const initial = [{ name: 'F', qty: '0 / 1 ครั้ง', courseType: 'เหมาตามจริง' }];
    const reversed = simulateReverse(initial, [{ courseName: 'F', deductQty: 1, courseIndex: 0 }]);
    expect(reversed[0].qty).toBe('1 / 1 ครั้ง');
  });

  it('F5.2: remove a buffet tick — qty unchanged (was pinned at total, still pinned)', () => {
    const initial = [{ name: 'B', qty: '1 / 1 U', courseType: 'บุฟเฟต์' }];
    const reversed = simulateReverse(initial, [{ courseName: 'B', deductQty: 1, courseIndex: 0 }]);
    expect(reversed[0].qty).toBe('1 / 1 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F6: source-grep — TFP handleSubmit splits by prefix, reverses with preferNewest
// ═══════════════════════════════════════════════════════════════════════

describe('F6: source-grep — handleSubmit edit-mode reversal wiring', () => {
  const TFP = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');

  it('F6.1: handleSubmit split uses isPurchasedSessionRowId for oldExisting/oldPurchased', () => {
    expect(TFP).toMatch(/oldExisting\s*=\s*\(existingCourseItems[^)]*\)\.filter\(ci\s*=>\s*!isPurchasedSessionRowId\(ci\.rowId\)\)/);
    expect(TFP).toMatch(/oldPurchased\s*=\s*\(existingCourseItems[^)]*\)\.filter\(ci\s*=>\s*isPurchasedSessionRowId\(ci\.rowId\)\)/);
  });

  it('F6.2: oldPurchased reverses with preferNewest:true (purchased items were APPENDED)', () => {
    expect(TFP).toMatch(/reverseCourseDeduction\(customerId,\s*oldPurchased,\s*\{[^}]*preferNewest:\s*true/);
  });

  it('F6.3: oldExisting reverses WITHOUT preferNewest (targeted by courseIndex)', () => {
    // oldExisting uses default argument — no preferNewest option
    const idx = TFP.indexOf('reverseCourseDeduction(customerId, oldExisting');
    expect(idx).toBeGreaterThan(-1);
    // Extract the call signature
    const snippet = TFP.slice(idx, idx + 80);
    expect(snippet).not.toMatch(/preferNewest:\s*true/);
  });

  it('F6.4: existingCourseItems loaded from backend treatment before reverse', () => {
    // Must load the prior courseItems[] before trying to reverse anything
    expect(TFP).toMatch(/existingCourseItems/);
  });

  it('F6.5: isPurchasedSessionRowId classifies rowId prefixes for THIS split', () => {
    expect(isPurchasedSessionRowId('purchased-1-row-P')).toBe(true);
    expect(isPurchasedSessionRowId('promo-2-row-X-P')).toBe(true);
    expect(isPurchasedSessionRowId('picked-purchased-course-3-99-row-K-0')).toBe(true);
    expect(isPurchasedSessionRowId('be-row-0')).toBe(false);
  });
});
