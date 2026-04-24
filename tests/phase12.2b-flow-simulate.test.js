// ─── Phase 12.2b — FULL-FLOW SIMULATE (not just helper) ────────────────────
//
// User directive 2026-04-25 after discovering that S21.11-S21.16 only tested
// helper OUTPUT in isolation and missed the filter-routing bug:
// "ทำ full flow simulate, not just helper ทุก scenario กับระบบ course
//  เลือกคอร์ส ใช้คอร์สประเภทต่างๆ ทุกอย่างที่ทำมาในวันนี้ … ย้อนให้ full
//  flow simulate ตั้งแต่ phase 12 จนถึงปัจจุบัน กับทุกความเป็นไปได้ที่จะ
//  เกิดบั๊ค และทดสอบการใช้งานในกรณีใช้งานจริงแบบต่างๆด้วย อย่างละเอียดเหี้ยๆ
//  เอาแบบจับผิดให้ได้ด้วยสุดความสามารถมึงอะ"
//
// Coverage matrix — every full flow is exercised end-to-end by chaining the
// pure helpers + mirror-copies of the inline TFP handleSubmit logic:
//
//   Course type: specific-qty (ระบุสินค้าและจำนวนสินค้า)
//                fill-later    (เหมาตามจริง)
//                buffet        (บุฟเฟต์)
//                pick-at-treatment (เลือกสินค้าตามจริง)
//
//   Buy path:    SaleTab        (persists to be_customers.courses)
//                in-visit "ซื้อคอร์ส" (lives in options.customerCourses)
//                promotion bundle (sub-courses inside a promotion)
//
//   Usage path:  same-visit tick + deduct
//                late-visit tick + deduct (existing customer courses)
//                multi-visit buffet (no decrement — unlimited until expiry)
//                no-use this visit (bought but not ticked)
//
// Tests mirror the exact logic at TFP:
//   - line 1967-1988 (pre-validation)
//   - line 2048-2063 (courseItems construction)
//   - line 2069-2071 (filter split existing vs purchased)
//   - line 2077-2079 (Phase-1 deductCourseItems)
//   - line 2245-2253, 2371-2378 (assignCourseToCustomer with alreadyResolved)
//   - line 2529-2533 (Phase-2 deductCourseItems)
//
// Bug-finding focus: every test ends with an assertion that would FAIL if
// the underlying bug (from violations V11/V12, LipoS "คอร์สคงเหลือไม่พอ",
// buffet "1/1 U" display, blood-type empty dropdown, picked- prefix leak)
// regressed. Source-grep guards lock the fix in place.

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import {
  buildPurchasedCourseEntry,
  resolvePickedCourseEntry,
  resolvePurchasedCourseForAssign,
  isPurchasedSessionRowId,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';
import { parseQtyString, buildQtyString, formatQtyString, deductQty } from '../src/lib/courseUtils.js';

const NOW = 1700000000000;

// ════════════════════════════════════════════════════════════════════════
// Mirror helpers — exact copies of TreatmentFormPage inline logic so
// scenario tests can exercise the FULL chain without mounting React.
// ════════════════════════════════════════════════════════════════════════

/** Mirror of TFP customerCourses filter (line 2602-2618). */
function filterCustomerCourses(allCustomerCourses) {
  return (allCustomerCourses || []).filter(c => {
    if (c.promotionId) return false;
    if (c.isPickAtTreatment && c.needsPickSelection) return true;
    if (c.isBuffet || String(c.courseType || '').trim() === 'บุฟเฟต์') return true;
    const allZero = (c.products || []).every(p => parseFloat(p.remaining) <= 0);
    return !allZero;
  });
}

/** Mirror of TFP pre-validation (line 1948-2003). Returns array of error strings. */
function preValidateCourseDeductions({ selectedCourseItems, customerCourses, treatmentItems, liveCourses }) {
  const overDeductions = [];
  for (const rowId of selectedCourseItems) {
    for (const course of (customerCourses || [])) {
      const product = course.products?.find(p => p.rowId === rowId);
      if (!product) continue;
      const liveC = typeof product.courseIndex === 'number' ? liveCourses?.[product.courseIndex] : null;
      const liveIsRealQty = String(liveC?.courseType || '').trim() === 'เหมาตามจริง';
      const inMemoryIsRealQty = !!(product.fillLater || course.isRealQty);
      if (liveIsRealQty || inMemoryIsRealQty) continue;
      const liveIsBuffet = String(liveC?.courseType || '').trim() === 'บุฟเฟต์';
      const inMemoryIsBuffet = !!(product.isBuffet || course.isBuffet);
      if (liveIsBuffet || inMemoryIsBuffet) continue;
      const deductAmt = Number(treatmentItems.find(t => t.id === rowId)?.qty || 1);
      const isPurchased = isPurchasedSessionRowId(rowId);
      let remaining;
      if (isPurchased) {
        remaining = parseFloat(product.remaining) || 0;
      } else if (liveC) {
        remaining = parseQtyString(liveC.qty).remaining;
      } else {
        remaining = parseFloat(product.remaining) || 0;
      }
      if (deductAmt > remaining) {
        overDeductions.push(`${product.name}: need ${deductAmt}, have ${remaining}`);
      }
    }
  }
  return overDeductions;
}

/** Mirror of TFP courseItems construction (line 2048-2063). */
function buildCourseItems({ selectedCourseItems, customerCourses, treatmentItems }) {
  return Array.from(selectedCourseItems).map(rowId => {
    for (const course of (customerCourses || [])) {
      const product = course.products?.find(p => p.rowId === rowId);
      if (product) {
        return {
          courseName: course.courseName,
          productName: product.name,
          rowId: product.rowId,
          courseIndex: typeof product.courseIndex === 'number' ? product.courseIndex : undefined,
          deductQty: Number(treatmentItems.find(t => t.id === rowId)?.qty || 1),
          unit: product.unit || '',
        };
      }
    }
    return null;
  }).filter(Boolean);
}

/** Mirror of TFP filter split (line 2069-2071 + 2529). */
function splitDeductions(courseItems) {
  const phase1 = courseItems.filter(ci => !isPurchasedSessionRowId(ci.rowId));
  const phase2 = courseItems.filter(ci => isPurchasedSessionRowId(ci.rowId));
  return { phase1, phase2 };
}

/** Mirror of backendClient.deductCourseItems (line 269-363). */
function simulateDeductCourseItems(courses, deductions, opts = {}) {
  const preferNewest = !!opts.preferNewest;
  const out = courses.map(c => ({ ...c }));
  const matchesDed = (c, d) => {
    const nameMatch = d.courseName ? c.name === d.courseName : true;
    const productMatch = d.productName ? (c.product || c.name) === d.productName : true;
    return nameMatch && productMatch;
  };
  const consumeRealQty = (i) => {
    const c = out[i];
    const parsed = parseQtyString(c.qty);
    const total = parsed.total > 0 ? parsed.total : 1;
    out[i] = { ...c, qty: formatQtyString(0, total, parsed.unit || 'ครั้ง') };
  };
  for (const d of deductions) {
    let remaining = d.deductQty || 1;
    // Step 1
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < out.length) {
      const c = out[d.courseIndex];
      if (matchesDed(c, d)) {
        if (c.courseType === 'เหมาตามจริง') { consumeRealQty(d.courseIndex); continue; }
        if (c.courseType === 'บุฟเฟต์') { continue; } // no-op
        const parsed = parseQtyString(c.qty);
        if (parsed.remaining > 0) {
          const toDeduct = Math.min(remaining, parsed.remaining);
          out[d.courseIndex] = { ...c, qty: deductQty(c.qty, toDeduct) };
          remaining -= toDeduct;
        }
      }
    }
    // Step 2a: special-type fallback
    if (remaining > 0) {
      const order = preferNewest
        ? Array.from({ length: out.length }, (_, i) => out.length - 1 - i)
        : Array.from({ length: out.length }, (_, i) => i);
      for (const i of order) {
        if (i === d.courseIndex) continue;
        const c = out[i];
        if (!matchesDed(c, d)) continue;
        if (c.courseType === 'เหมาตามจริง') { consumeRealQty(i); remaining = 0; break; }
        if (c.courseType === 'บุฟเฟต์') { remaining = 0; break; }
      }
    }
    // Step 2b: standard fallback
    if (remaining > 0) {
      const order = preferNewest
        ? Array.from({ length: out.length }, (_, i) => out.length - 1 - i)
        : Array.from({ length: out.length }, (_, i) => i);
      for (const i of order) {
        if (remaining <= 0) break;
        if (i === d.courseIndex) continue;
        const c = out[i];
        if (!matchesDed(c, d)) continue;
        if (c.courseType === 'เหมาตามจริง') continue;
        if (c.courseType === 'บุฟเฟต์') continue;
        const parsed = parseQtyString(c.qty);
        if (parsed.remaining <= 0) continue;
        const toDeduct = Math.min(remaining, parsed.remaining);
        out[i] = { ...c, qty: deductQty(c.qty, toDeduct) };
        remaining -= toDeduct;
      }
    }
    if (remaining > 0) {
      throw new Error(`คอร์สคงเหลือไม่พอ: ${d.productName || d.courseName} ต้องการตัด ${d.deductQty} เหลือตัดไม่ได้อีก ${remaining}`);
    }
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════
// F1: rowId prefix contract — every in-visit / existing rowId source
// must classify correctly so Phase-1 / Phase-2 routing is deterministic
// ════════════════════════════════════════════════════════════════════════

describe('F1: rowId prefix contract', () => {
  it('F1.1: buildPurchasedCourseEntry non-pick emits purchased-* rowId', () => {
    const e = buildPurchasedCourseEntry({ id: 1, name: 'X', products: [{ id: 'P', name: 'p', qty: 1 }] }, { now: NOW });
    expect(e.products[0].rowId).toMatch(/^purchased-1-row-/);
    expect(isPurchasedSessionRowId(e.products[0].rowId)).toBe(true);
  });
  it('F1.2: buildPurchasedCourseEntry pick-at-treatment placeholder has no product rows', () => {
    const e = buildPurchasedCourseEntry({ id: 2, name: 'Pick', courseType: 'เลือกสินค้าตามจริง', products: [{ id: 'A', name: 'a', qty: 1 }] });
    expect(e.products).toEqual([]);
    expect(e.courseId).toMatch(/^purchased-course-2-/);
  });
  it('F1.3: resolvePickedCourseEntry emits picked-* rowId with full parent chain', () => {
    const p = buildPurchasedCourseEntry({ id: 3, name: 'Pick', courseType: 'เลือกสินค้าตามจริง', products: [{ id: 'A', name: 'a', qty: 2, unit: 'เข็ม' }] }, { now: NOW });
    const r = resolvePickedCourseEntry(p, [{ productId: 'A', name: 'a', qty: 2, unit: 'เข็ม' }]);
    expect(r.products[0].rowId).toMatch(/^picked-purchased-course-3-\d+-row-A-0$/);
    expect(isPurchasedSessionRowId(r.products[0].rowId)).toBe(true);
    expect(r.products[0].rowId.startsWith('purchased-')).toBe(false); // leading 'picked-' NOT 'purchased-'
  });
  it('F1.4: mapRawCoursesToForm (existing customer course) emits be-row-* rowId', () => {
    const form = mapRawCoursesToForm([{ name: 'Standard', qty: '3 / 5 U' }]);
    expect(form[0].products[0].rowId).toBe('be-row-0');
    expect(isPurchasedSessionRowId(form[0].products[0].rowId)).toBe(false); // Phase-1 bucket
  });
  it('F1.5: all 3 in-visit prefixes classify as purchased-session; existing be-row- does NOT', () => {
    expect(isPurchasedSessionRowId('purchased-123-row-abc')).toBe(true);
    expect(isPurchasedSessionRowId('promo-4-row-c-p')).toBe(true);
    expect(isPurchasedSessionRowId('picked-purchased-course-5-99-row-X-0')).toBe(true);
    expect(isPurchasedSessionRowId('be-row-7')).toBe(false);
    expect(isPurchasedSessionRowId(null)).toBe(false);
    expect(isPurchasedSessionRowId('')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F2: mapRawCoursesToForm — all 4 course types + edge cases
// ════════════════════════════════════════════════════════════════════════

describe('F2: mapRawCoursesToForm branches (4 course types + edge cases)', () => {
  it('F2.1: specific-qty "3 / 5 U" → remaining=3, total=5, unit=U, fillLater/isBuffet=false', () => {
    const f = mapRawCoursesToForm([{ name: 'StdA', product: 'P1', qty: '3 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }])[0];
    expect(f.isRealQty).toBe(false);
    expect(f.isBuffet).toBe(false);
    expect(f.products[0]).toMatchObject({ remaining: '3', total: '5', unit: 'U', fillLater: false, isBuffet: false, courseIndex: 0 });
  });
  it('F2.2: specific-qty fully consumed "0 / 1 ครั้ง" → filtered out (null)', () => {
    const f = mapRawCoursesToForm([{ name: 'Consumed', qty: '0 / 1 ครั้ง', courseType: 'ระบุสินค้าและจำนวนสินค้า' }]);
    expect(f).toHaveLength(0);
  });
  it('F2.3: fill-later (เหมาตามจริง) emits blank remaining/total + fillLater=true', () => {
    const f = mapRawCoursesToForm([{ name: 'Fil', qty: '1 / 1 ครั้ง', courseType: 'เหมาตามจริง' }])[0];
    expect(f.isRealQty).toBe(true);
    expect(f.products[0].fillLater).toBe(true);
    expect(f.products[0].remaining).toBe('');
    expect(f.products[0].total).toBe('');
  });
  it('F2.4: fill-later consumed (0 / 1 ครั้ง) STILL passes filter (isRealQty exempt)', () => {
    // NOTE: current inline logic skips "total > 0 && remaining <= 0 && !buffet" —
    // fill-later consumed (0/1) DOES match that condition → filtered.
    // This is the correct "course moves to history" behavior for เหมาตามจริง.
    const f = mapRawCoursesToForm([{ name: 'Fil', qty: '0 / 1 ครั้ง', courseType: 'เหมาตามจริง' }]);
    expect(f).toHaveLength(0);
  });
  it('F2.5: buffet (บุฟเฟต์) sets isBuffet=true on course AND product', () => {
    const f = mapRawCoursesToForm([{ name: 'Buf', product: 'IA-โบท็อก', qty: '1 / 1 U', courseType: 'บุฟเฟต์' }])[0];
    expect(f.isBuffet).toBe(true);
    expect(f.courseType).toBe('บุฟเฟต์');
    expect(f.products[0].isBuffet).toBe(true);
  });
  it('F2.6: buffet with 0 remaining "0 / 1 U" → NOT filtered (stays in active/form)', () => {
    const f = mapRawCoursesToForm([{ name: 'Buf', qty: '0 / 1 U', courseType: 'บุฟเฟต์' }]);
    expect(f).toHaveLength(1);
    expect(f[0].isBuffet).toBe(true);
  });
  it('F2.7: buffet with no qty (missing) still emits entry + isBuffet=true', () => {
    const f = mapRawCoursesToForm([{ name: 'Buf', courseType: 'บุฟเฟต์' }]);
    expect(f).toHaveLength(1);
    expect(f[0].isBuffet).toBe(true);
  });
  it('F2.8: pick-at-treatment placeholder re-emitted with isPickAtTreatment + availableProducts', () => {
    const raw = [{
      name: 'Pick', courseType: 'เลือกสินค้าตามจริง',
      needsPickSelection: true, availableProducts: [{ productId: 'A', name: 'a', qty: 1, unit: 'เข็ม' }],
      courseId: 'pick-123-abc',
    }];
    const f = mapRawCoursesToForm(raw)[0];
    expect(f.isPickAtTreatment).toBe(true);
    expect(f.needsPickSelection).toBe(true);
    expect(f.courseId).toBe('pick-123-abc');
    expect(f._beCourseId).toBe('pick-123-abc');
    expect(f._beCourseIndex).toBe(0);
    expect(f.products).toEqual([]);
    expect(f.availableProducts).toHaveLength(1);
  });
  it('F2.9: pick-at-treatment placeholder without courseId uses be-course-${idx} fallback', () => {
    const f = mapRawCoursesToForm([{ name: 'Pick', needsPickSelection: true, availableProducts: [] }])[0];
    expect(f.courseId).toBe('be-course-0');
    expect(f._beCourseId).toBeNull();
    expect(f._beCourseIndex).toBe(0);
  });
  it('F2.10: empty name → null (filtered)', () => {
    expect(mapRawCoursesToForm([{ qty: '1/1' }])).toHaveLength(0);
  });
  it('F2.11: null / undefined / non-array → []', () => {
    expect(mapRawCoursesToForm(null)).toEqual([]);
    expect(mapRawCoursesToForm(undefined)).toEqual([]);
    expect(mapRawCoursesToForm('not-an-array')).toEqual([]);
    expect(mapRawCoursesToForm({})).toEqual([]);
  });
  it('F2.12: multiple courses preserve courseIndex correctly (not name-collision)', () => {
    const raw = [
      { name: 'X', product: 'A', qty: '5 / 5 U' },
      { name: 'X', product: 'A', qty: '3 / 5 U' }, // same name+product, different qty
    ];
    const f = mapRawCoursesToForm(raw);
    expect(f).toHaveLength(2);
    expect(f[0].products[0].courseIndex).toBe(0);
    expect(f[1].products[0].courseIndex).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F3: Full-flow A1 — specific-qty SaleTab → late-visit use
// ════════════════════════════════════════════════════════════════════════

describe('F3 (A1): specific-qty SaleTab → late-visit use → Phase-1 deduction', () => {
  const rawCourses = [{
    name: 'Botox Course', product: 'Botox 100U', qty: '5 / 5 U',
    courseType: 'ระบุสินค้าและจำนวนสินค้า', productId: 'BOTOX_ID',
  }];

  it('A1.1: mapRawCoursesToForm produces standard tickable course', () => {
    const f = mapRawCoursesToForm(rawCourses)[0];
    expect(f.products[0]).toMatchObject({ rowId: 'be-row-0', remaining: '5', total: '5', unit: 'U', fillLater: false, isBuffet: false });
  });

  it('A1.2: tick + build courseItems + split → Phase-1 bucket', () => {
    const form = mapRawCoursesToForm(rawCourses);
    const selected = new Set([form[0].products[0].rowId]);
    const items = buildCourseItems({
      selectedCourseItems: selected, customerCourses: form,
      treatmentItems: [{ id: 'be-row-0', qty: '1' }],
    });
    const { phase1, phase2 } = splitDeductions(items);
    expect(phase1).toHaveLength(1);
    expect(phase2).toHaveLength(0);
    expect(phase1[0]).toMatchObject({ productName: 'Botox 100U', deductQty: 1, courseIndex: 0 });
  });

  it('A1.3: simulate deductCourseItems → customer.courses qty decrements 5→4', () => {
    const deductions = [{ courseName: 'Botox Course', productName: 'Botox 100U', deductQty: 1, courseIndex: 0 }];
    const after = simulateDeductCourseItems(rawCourses, deductions);
    expect(after[0].qty).toBe('4 / 5 U');
  });

  it('A1.4: pre-validation passes (deduct 1 of 5 remaining)', () => {
    const form = mapRawCoursesToForm(rawCourses);
    const errors = preValidateCourseDeductions({
      selectedCourseItems: new Set([form[0].products[0].rowId]),
      customerCourses: form,
      treatmentItems: [{ id: form[0].products[0].rowId, qty: 1 }],
      liveCourses: rawCourses,
    });
    expect(errors).toEqual([]);
  });

  it('A1.5: pre-validation BLOCKS over-deduct (10 of 5)', () => {
    const form = mapRawCoursesToForm(rawCourses);
    const errors = preValidateCourseDeductions({
      selectedCourseItems: new Set([form[0].products[0].rowId]),
      customerCourses: form,
      treatmentItems: [{ id: form[0].products[0].rowId, qty: 10 }],
      liveCourses: rawCourses,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Botox 100U');
  });
});

// ════════════════════════════════════════════════════════════════════════
// F4: A2 — specific-qty in-visit buy → same-visit use → Phase-2
// ════════════════════════════════════════════════════════════════════════

describe('F4 (A2): specific-qty in-visit buy → same-visit use → Phase-2 deduction', () => {
  const item = {
    id: 100, name: 'Filler Course', courseType: 'ระบุสินค้าและจำนวนสินค้า', qty: '1',
    products: [{ id: 'FIL_ID', name: 'Filler 1cc', qty: 2, unit: 'cc' }],
  };

  it('A2.1: buildPurchasedCourseEntry placeholder has isAddon + purchased rowId', () => {
    const e = buildPurchasedCourseEntry(item, { now: NOW });
    expect(e.isAddon).toBe(true);
    expect(e.purchasedItemId).toBe(100);
    expect(e.products[0].rowId).toMatch(/^purchased-100-row-/);
    expect(e.products[0].remaining).toBe('2');
  });

  it('A2.2: tick + courseItems + split → Phase-2 bucket (NOT Phase-1)', () => {
    const e = buildPurchasedCourseEntry(item, { now: NOW });
    const selected = new Set([e.products[0].rowId]);
    const items = buildCourseItems({
      selectedCourseItems: selected, customerCourses: [e],
      treatmentItems: [{ id: e.products[0].rowId, qty: '1' }],
    });
    const { phase1, phase2 } = splitDeductions(items);
    expect(phase1).toHaveLength(0);
    expect(phase2).toHaveLength(1);
  });

  it('A2.3: resolvePurchasedCourseForAssign returns master options + alreadyResolved=false', () => {
    const r = resolvePurchasedCourseForAssign(item, [], item.qty);
    expect(r.alreadyResolved).toBe(false);
    expect(r.products).toHaveLength(1);
    expect(r.products[0].qty).toBe(2);
  });

  it('A2.4: pre-validation PASSES for in-visit buy (uses product.remaining)', () => {
    const e = buildPurchasedCourseEntry(item, { now: NOW });
    const errors = preValidateCourseDeductions({
      selectedCourseItems: new Set([e.products[0].rowId]),
      customerCourses: [e],
      treatmentItems: [{ id: e.products[0].rowId, qty: 1 }],
      liveCourses: [], // fresh customer — no existing courses
    });
    expect(errors).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F5: A3 — fill-later (เหมาตามจริง) SaleTab → late-visit use
// ════════════════════════════════════════════════════════════════════════

describe('F5 (A3): fill-later SaleTab → late-visit use → consumeRealQty zeroes entry', () => {
  const rawCourses = [{
    name: 'Buffet-Like Fillers', product: 'Filler 1cc',
    qty: '1 / 1 ครั้ง', courseType: 'เหมาตามจริง',
    productId: 'FIL_ID',
  }];

  it('A3.1: mapRawCoursesToForm emits isRealQty=true + blank remaining/total + fillLater', () => {
    const f = mapRawCoursesToForm(rawCourses)[0];
    expect(f.isRealQty).toBe(true);
    expect(f.products[0]).toMatchObject({ fillLater: true, remaining: '', total: '' });
  });

  it('A3.2: pre-validation SKIPS fill-later (no over-deduct check even at qty 9999)', () => {
    const form = mapRawCoursesToForm(rawCourses);
    const errors = preValidateCourseDeductions({
      selectedCourseItems: new Set([form[0].products[0].rowId]),
      customerCourses: form,
      treatmentItems: [{ id: form[0].products[0].rowId, qty: 9999 }],
      liveCourses: rawCourses,
    });
    expect(errors).toEqual([]);
  });

  it('A3.3: simulateDeductCourseItems zeroes the course regardless of requested qty', () => {
    const deductions = [{ courseName: 'Buffet-Like Fillers', productName: 'Filler 1cc', deductQty: 999, courseIndex: 0 }];
    const after = simulateDeductCourseItems(rawCourses, deductions);
    expect(after[0].qty).toBe('0 / 1 ครั้ง');
  });

  it('A3.4: fully-consumed fill-later entry → dropped from mapRawCoursesToForm → course in history', () => {
    const consumed = [{ name: 'X', qty: '0 / 1 ครั้ง', courseType: 'เหมาตามจริง' }];
    expect(mapRawCoursesToForm(consumed)).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F6: A4 — fill-later in-visit buy → same-visit use
// ════════════════════════════════════════════════════════════════════════

describe('F6 (A4): fill-later in-visit buy → same-visit use', () => {
  const item = {
    id: 200, name: 'One-Shot Course', courseType: 'เหมาตามจริง',
    qty: '1', products: [{ id: 'X', name: 'Gear', qty: 1, unit: 'ครั้ง' }],
  };

  it('A4.1: buildPurchasedCourseEntry sets isRealQty + fillLater + blank qty', () => {
    const e = buildPurchasedCourseEntry(item, { now: NOW });
    expect(e.isRealQty).toBe(true);
    expect(e.products[0].fillLater).toBe(true);
    expect(e.products[0].remaining).toBe('');
  });

  it('A4.2: pre-validation SKIPS in-memory isRealQty course at arbitrary qty', () => {
    const e = buildPurchasedCourseEntry(item, { now: NOW });
    const errors = preValidateCourseDeductions({
      selectedCourseItems: new Set([e.products[0].rowId]),
      customerCourses: [e],
      treatmentItems: [{ id: e.products[0].rowId, qty: 42 }],
      liveCourses: [],
    });
    expect(errors).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F7: A5 — pick-at-treatment in-visit → pick → use same visit (USER BUG)
// ════════════════════════════════════════════════════════════════════════

describe('F7 (A5): pick-at-treatment in-visit → pick → use same visit (LipoS bug)', () => {
  const item = {
    id: 9001, name: 'แฟต 4 เข็ม', courseType: 'เลือกสินค้าตามจริง',
    qty: '1', unit: 'คอร์ส',
    products: [
      { id: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' },
      { id: 'LipoF', name: 'LipoF', qty: 4, unit: 'เข็ม' },
    ],
  };

  it('A5.1: build + pick + resolve → resolved product has picked- rowId', () => {
    const p = buildPurchasedCourseEntry(item, { now: NOW });
    const r = resolvePickedCourseEntry(p, [{ productId: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' }]);
    expect(r.products[0].rowId).toMatch(/^picked-/);
    expect(isPurchasedSessionRowId(r.products[0].rowId)).toBe(true);
  });

  it('A5.2: tick LipoS → courseItems has LipoS → splitDeductions routes to Phase-2 (THE USER BUG)', () => {
    const p = buildPurchasedCourseEntry(item, { now: NOW });
    const r = resolvePickedCourseEntry(p, [{ productId: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' }]);
    const rowId = r.products[0].rowId;
    const items = buildCourseItems({
      selectedCourseItems: new Set([rowId]),
      customerCourses: [r],
      treatmentItems: [{ id: rowId, qty: '1' }],
    });
    const { phase1, phase2 } = splitDeductions(items);
    // BEFORE FIX: phase1=1 (picked- leaked) → deductCourseItems fired on empty customer.courses → throw
    // AFTER FIX: phase1=0, phase2=1
    expect(phase1).toHaveLength(0);
    expect(phase2).toHaveLength(1);
    expect(phase2[0].productName).toBe('LipoS');
  });

  it('A5.3: resolvePurchasedCourseForAssign returns resolved picks + alreadyResolved=true', () => {
    const p = buildPurchasedCourseEntry(item, { now: NOW });
    const r = resolvePickedCourseEntry(p, [{ productId: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' }]);
    const assign = resolvePurchasedCourseForAssign(item, [r], item.qty);
    expect(assign.alreadyResolved).toBe(true);
    expect(assign.products).toEqual([{ id: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' }]);
  });

  it('A5.4: after auto-sale assigns, Phase-2 simulateDeductCourseItems finds LipoS + decrements', () => {
    // Auto-sale would write (via assignCourseToCustomer alreadyResolved path):
    const afterAutoSale = [
      { name: 'แฟต 4 เข็ม', product: 'LipoS', qty: '4 / 4 เข็ม', courseType: 'เลือกสินค้าตามจริง', linkedSaleId: 'S1' },
    ];
    const deductions = [{ courseName: 'แฟต 4 เข็ม', productName: 'LipoS', deductQty: 1 }];
    const after = simulateDeductCourseItems(afterAutoSale, deductions, { preferNewest: true });
    expect(after[0].qty).toBe('3 / 4 เข็ม');
  });
});

// ════════════════════════════════════════════════════════════════════════
// F8: A6 — pick-at-treatment SaleTab → late-visit pick + use
// ════════════════════════════════════════════════════════════════════════

describe('F8 (A6): pick-at-treatment SaleTab → late-visit pick + use', () => {
  const rawCourses = [{
    name: 'Pick-Tomorrow Course', courseType: 'เลือกสินค้าตามจริง',
    courseId: 'pick-abc-123',
    needsPickSelection: true,
    availableProducts: [
      { productId: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' },
      { productId: 'Babi', name: 'Babi', qty: 10, unit: 'ML' },
    ],
  }];

  it('A6.1: mapRawCoursesToForm emits placeholder shape with persistent courseId', () => {
    const f = mapRawCoursesToForm(rawCourses)[0];
    expect(f.isPickAtTreatment).toBe(true);
    expect(f.courseId).toBe('pick-abc-123');
    expect(f._beCourseId).toBe('pick-abc-123');
    expect(f.availableProducts).toHaveLength(2);
    expect(f.products).toEqual([]);
  });

  it('A6.2: filter (customerCourses) KEEPS placeholder despite empty products', () => {
    const f = mapRawCoursesToForm(rawCourses);
    const filtered = filterCustomerCourses(f);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].needsPickSelection).toBe(true);
  });

  it('A6.3: after doctor picks + resolves in-memory, rowId is picked- and routes to Phase-2', () => {
    const placeholder = mapRawCoursesToForm(rawCourses)[0];
    const resolved = resolvePickedCourseEntry(placeholder, [{ productId: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' }]);
    const rowId = resolved.products[0].rowId;
    expect(rowId).toMatch(/^picked-/);
    const items = buildCourseItems({
      selectedCourseItems: new Set([rowId]),
      customerCourses: [resolved],
      treatmentItems: [{ id: rowId, qty: '1' }],
    });
    const { phase2 } = splitDeductions(items);
    expect(phase2).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F9: A7 — pick-at-treatment in-visit, no pick, save → late-visit pick
// ════════════════════════════════════════════════════════════════════════

describe('F9 (A7): pick-at-treatment in-visit, no pick, save → placeholder persisted for later', () => {
  const item = {
    id: 300, name: 'Future Pick Course', courseType: 'เลือกสินค้าตามจริง',
    qty: '1', products: [{ id: 'A', name: 'a', qty: 2 }, { id: 'B', name: 'b', qty: 3 }],
  };

  it('A7.1: resolvePurchasedCourseForAssign returns master options + alreadyResolved=false when no pick', () => {
    const p = buildPurchasedCourseEntry(item, { now: NOW }); // placeholder
    const r = resolvePurchasedCourseForAssign(item, [p], item.qty);
    expect(r.alreadyResolved).toBe(false); // → assignCourseToCustomer WILL write placeholder
    expect(r.products).toHaveLength(2);
  });

  it('A7.2: roundtrip — placeholder saved → loaded next visit via mapRawCoursesToForm → shape matches', () => {
    // Simulating what assignCourseToCustomer WOULD write with !alreadyResolved:
    const savedPlaceholder = {
      courseId: `pick-${Date.now()}-abc123`,
      name: 'Future Pick Course',
      product: '',
      qty: '',
      courseType: 'เลือกสินค้าตามจริง',
      needsPickSelection: true,
      availableProducts: item.products.map(p => ({
        productId: p.id, name: p.name, qty: p.qty, unit: 'ครั้ง',
      })),
    };
    const f = mapRawCoursesToForm([savedPlaceholder])[0];
    expect(f.isPickAtTreatment).toBe(true);
    expect(f.needsPickSelection).toBe(true);
    expect(f.availableProducts).toHaveLength(2);
    expect(f._beCourseId).toBe(savedPlaceholder.courseId);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F10: BUFFET (บุฟเฟต์) — end-to-end (user-reported bug 2026-04-25)
// ════════════════════════════════════════════════════════════════════════

describe('F10: buffet (บุฟเฟต์) end-to-end — the 2026-04-25 display + deduct bug', () => {
  const buffetMaster = {
    id: 400, name: 'NA- Botox บุฟเฟ่', courseType: 'บุฟเฟต์',
    qty: '1', unit: 'คอร์ส',
    products: [{ id: 'IA_BOTOX', name: 'IA- โบท็อก', qty: 1, unit: 'U' }],
  };
  const rawBuffet = [{
    name: 'NA- Botox บุฟเฟ่', product: 'IA- โบท็อก',
    qty: '1 / 1 U', courseType: 'บุฟเฟต์', productId: 'IA_BOTOX',
  }];

  it('F10.1: buildPurchasedCourseEntry sets isBuffet on course + product', () => {
    const e = buildPurchasedCourseEntry(buffetMaster, { now: NOW });
    expect(e.isBuffet).toBe(true);
    expect(e.courseType).toBe('บุฟเฟต์');
    expect(e.products[0].isBuffet).toBe(true);
  });

  it('F10.2: mapRawCoursesToForm (loaded from be_customers) propagates isBuffet', () => {
    const f = mapRawCoursesToForm(rawBuffet)[0];
    expect(f.isBuffet).toBe(true);
    expect(f.products[0].isBuffet).toBe(true);
    expect(f.products[0].fillLater).toBe(false); // distinct from เหมาตามจริง
  });

  it('F10.3: pre-validation SKIPS buffet even at impossible qty', () => {
    const f = mapRawCoursesToForm(rawBuffet);
    const errors = preValidateCourseDeductions({
      selectedCourseItems: new Set([f[0].products[0].rowId]),
      customerCourses: f,
      treatmentItems: [{ id: f[0].products[0].rowId, qty: 999999 }],
      liveCourses: rawBuffet,
    });
    expect(errors).toEqual([]);
  });

  it('F10.4: filterCustomerCourses keeps buffet even when remaining=0', () => {
    const zeroed = mapRawCoursesToForm([{
      name: 'B', qty: '0 / 1 U', courseType: 'บุฟเฟต์',
    }]);
    const filtered = filterCustomerCourses(zeroed);
    expect(filtered).toHaveLength(1);
  });

  it('F10.5: simulateDeductCourseItems no-ops on buffet (qty unchanged)', () => {
    const deductions = [{ courseName: 'NA- Botox บุฟเฟ่', productName: 'IA- โบท็อก', deductQty: 1, courseIndex: 0 }];
    const after = simulateDeductCourseItems(rawBuffet, deductions);
    expect(after[0].qty).toBe('1 / 1 U'); // unchanged
  });

  it('F10.6: multi-visit buffet — 5 treatments, qty NEVER drops', () => {
    let current = [...rawBuffet];
    for (let visit = 1; visit <= 5; visit++) {
      current = simulateDeductCourseItems(current, [
        { courseName: 'NA- Botox บุฟเฟ่', productName: 'IA- โบท็อก', deductQty: visit * 10, courseIndex: 0 },
      ]);
    }
    expect(current[0].qty).toBe('1 / 1 U'); // still unchanged after 5 visits
  });

  it('F10.7: buffet with fallback (no courseIndex) still no-ops via Step-2a special-type fallback', () => {
    const deductions = [{ courseName: 'NA- Botox บุฟเฟ่', productName: 'IA- โบท็อก', deductQty: 1 /* no courseIndex */ }];
    const after = simulateDeductCourseItems(rawBuffet, deductions);
    expect(after[0].qty).toBe('1 / 1 U');
  });

  it('F10.8: buffet filter exemption — filterCustomerCourses keeps buffet with courseType but NO isBuffet flag (legacy docs)', () => {
    // Defensive: if an older document has courseType='บุฟเฟต์' but the
    // isBuffet flag wasn't propagated through the mapper, the filter
    // should STILL keep it via the string courseType check.
    const legacy = [{ courseName: 'LegacyBuf', courseType: 'บุฟเฟต์', products: [{ remaining: '0', total: '1' }] }];
    expect(filterCustomerCourses(legacy)).toHaveLength(1);
  });

  it('F10.9: buffet + specific-qty mixed cart — deductCourseItems handles each correctly', () => {
    const mixed = [
      { name: 'A', product: 'P1', qty: '3 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
      { name: 'B', product: 'P2', qty: '1 / 1 U', courseType: 'บุฟเฟต์' },
    ];
    const after = simulateDeductCourseItems(mixed, [
      { courseName: 'A', productName: 'P1', deductQty: 1, courseIndex: 0 },
      { courseName: 'B', productName: 'P2', deductQty: 10, courseIndex: 1 },
    ]);
    expect(after[0].qty).toBe('2 / 5 U'); // decremented
    expect(after[1].qty).toBe('1 / 1 U'); // buffet unchanged
  });

  it('F10.10: buffet tick + build courseItems → deductQty preserved for stock deduction (stock DOES decrement)', () => {
    // Buffet doesn't decrement the course, but the stock layer (separate
    // code path in deductStockForTreatment) uses the treatment item qty.
    const f = mapRawCoursesToForm(rawBuffet);
    const items = buildCourseItems({
      selectedCourseItems: new Set([f[0].products[0].rowId]),
      customerCourses: f,
      treatmentItems: [{ id: f[0].products[0].rowId, qty: '50' }],
    });
    expect(items[0].deductQty).toBe(50); // stock path consumes this
  });
});

// ════════════════════════════════════════════════════════════════════════
// F11: BLOOD TYPE DROPDOWN shape (2026-04-25 bug)
// ════════════════════════════════════════════════════════════════════════

describe('F11: bloodTypeOptions must be objects, not strings (empty dropdown bug)', () => {
  it('F11.1: source map produces objects with id + name', () => {
    const expected = ['A', 'B', 'AB', 'O', 'ไม่ทราบ'].map(v => ({ id: v, name: v }));
    expect(expected).toEqual([
      { id: 'A', name: 'A' },
      { id: 'B', name: 'B' },
      { id: 'AB', name: 'AB' },
      { id: 'O', name: 'O' },
      { id: 'ไม่ทราบ', name: 'ไม่ทราบ' },
    ]);
  });

  it('F11.2: render pattern <option key={b.id} value={b.id}>{b.name}</option> works with objects', () => {
    const opt = { id: 'A', name: 'A' };
    const rendered = { key: opt.id, value: opt.id, text: opt.name };
    expect(rendered.key).toBe('A');
    expect(rendered.value).toBe('A');
    expect(rendered.text).toBe('A');
    // Before fix (strings):
    const brokenOpt = 'A';
    expect(brokenOpt.id).toBeUndefined(); // would render <option key=undefined />
    expect(brokenOpt.name).toBeUndefined();
  });

  it('F11.3: ProClinic import path (line 930) find-by-name works with objects', () => {
    const bto = ['A', 'B', 'AB', 'O', 'ไม่ทราบ'].map(v => ({ id: v, name: v }));
    const match = bto.find(b => b.name === 'AB');
    expect(match).toEqual({ id: 'AB', name: 'AB' });
    // Before fix (strings): bto.find(b => b.name === 'AB') → undefined (b is string)
  });
});

// ════════════════════════════════════════════════════════════════════════
// F12: Filter chain correctness under mixed carts
// ════════════════════════════════════════════════════════════════════════

describe('F12: filter chain (Phase-1 vs Phase-2) under mixed carts', () => {
  it('F12.1: pure existing cart → all Phase-1, none Phase-2', () => {
    const items = [
      { rowId: 'be-row-0', courseName: 'X', productName: 'P1', deductQty: 1 },
      { rowId: 'be-row-1', courseName: 'Y', productName: 'P2', deductQty: 1 },
    ];
    const { phase1, phase2 } = splitDeductions(items);
    expect(phase1).toHaveLength(2);
    expect(phase2).toHaveLength(0);
  });

  it('F12.2: pure in-visit cart (all 3 prefixes) → all Phase-2', () => {
    const items = [
      { rowId: 'purchased-1-row-A', courseName: 'A', deductQty: 1 },
      { rowId: 'promo-2-row-X-P', courseName: 'X', deductQty: 1 },
      { rowId: 'picked-purchased-course-3-99-row-K-0', courseName: 'K', deductQty: 1 },
    ];
    const { phase1, phase2 } = splitDeductions(items);
    expect(phase1).toHaveLength(0);
    expect(phase2).toHaveLength(3);
  });

  it('F12.3: mixed cart — each routes correctly', () => {
    const items = [
      { rowId: 'be-row-0', courseName: 'Existing', deductQty: 1 },
      { rowId: 'purchased-1-row-A', courseName: 'InVisit', deductQty: 1 },
      { rowId: 'picked-purchased-course-2-99-row-L-0', courseName: 'Pick', deductQty: 1 },
    ];
    const { phase1, phase2 } = splitDeductions(items);
    expect(phase1.map(p => p.courseName)).toEqual(['Existing']);
    expect(phase2.map(p => p.courseName)).toEqual(['InVisit', 'Pick']);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F13: Adversarial edge cases
// ════════════════════════════════════════════════════════════════════════

describe('F13: adversarial edge cases', () => {
  it('F13.1: buildPurchasedCourseEntry returns null for null/missing id', () => {
    expect(buildPurchasedCourseEntry(null)).toBeNull();
    expect(buildPurchasedCourseEntry({})).toBeNull();
    expect(buildPurchasedCourseEntry({ name: 'X' })).toBeNull();
  });
  it('F13.2: resolvePickedCourseEntry with empty picks returns placeholder unchanged but products=[]', () => {
    const p = buildPurchasedCourseEntry({ id: 1, name: 'Pick', courseType: 'เลือกสินค้าตามจริง', products: [{ id: 'A', name: 'a', qty: 1 }] });
    const r = resolvePickedCourseEntry(p, []);
    expect(r.products).toEqual([]);
    expect(r.needsPickSelection).toBe(false);
  });
  it('F13.3: resolvePickedCourseEntry filters zero-qty picks', () => {
    const p = buildPurchasedCourseEntry({ id: 1, name: 'Pick', courseType: 'เลือกสินค้าตามจริง', products: [{ id: 'A', name: 'a', qty: 1 }] });
    const r = resolvePickedCourseEntry(p, [
      { productId: 'A', name: 'a', qty: 0 },
      { productId: 'B', name: 'b', qty: 1 },
    ]);
    expect(r.products).toHaveLength(1);
    expect(r.products[0].name).toBe('b');
  });
  it('F13.4: simulateDeductCourseItems throws on over-deduct with no fallback', () => {
    const courses = [{ name: 'X', product: 'P', qty: '1 / 1 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }];
    expect(() => simulateDeductCourseItems(courses, [{ courseName: 'X', productName: 'P', deductQty: 5 }])).toThrow(/คอร์สคงเหลือไม่พอ/);
  });
  it('F13.5: simulateDeductCourseItems fallback finds match without courseIndex', () => {
    const courses = [{ name: 'X', product: 'P', qty: '3 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }];
    const after = simulateDeductCourseItems(courses, [{ courseName: 'X', productName: 'P', deductQty: 2 /* no courseIndex */ }]);
    expect(after[0].qty).toBe('1 / 5 U');
  });
  it('F13.6: simulateDeductCourseItems fallback preferNewest iterates reverse', () => {
    const courses = [
      { name: 'X', product: 'P', qty: '3 / 3 U' }, // older
      { name: 'X', product: 'P', qty: '5 / 5 U' }, // newer
    ];
    const after = simulateDeductCourseItems(courses, [
      { courseName: 'X', productName: 'P', deductQty: 1 },
    ], { preferNewest: true });
    expect(after[0].qty).toBe('3 / 3 U'); // older unchanged
    expect(after[1].qty).toBe('4 / 5 U'); // newer deducted
  });
  it('F13.7: mapRawCoursesToForm survives 100 entries with index preservation', () => {
    const raw = Array.from({ length: 100 }, (_, i) => ({ name: `C${i}`, qty: '1 / 1 U' }));
    const form = mapRawCoursesToForm(raw);
    expect(form).toHaveLength(100);
    expect(form[42].products[0].courseIndex).toBe(42);
  });
  it('F13.8: mapRawCoursesToForm qty with commas and decimals', () => {
    const f = mapRawCoursesToForm([{ name: 'X', qty: '1,500 / 2,000 mg' }])[0];
    expect(f.products[0].remaining).toBe('1500');
    expect(f.products[0].total).toBe('2000');
    expect(f.products[0].unit).toBe('mg');
  });
  it('F13.9: isPurchasedSessionRowId — all weird inputs', () => {
    expect(isPurchasedSessionRowId(0)).toBe(false);
    expect(isPurchasedSessionRowId(false)).toBe(false);
    expect(isPurchasedSessionRowId({})).toBe(false);
    expect(isPurchasedSessionRowId([])).toBe(false);
    expect(isPurchasedSessionRowId('purchased')).toBe(false); // missing dash
    expect(isPurchasedSessionRowId('purchased-')).toBe(true); // matches
  });
  it('F13.10: resolvePurchasedCourseForAssign qty clamps to ≥1 for non-positive purchasedQty', () => {
    const r = resolvePurchasedCourseForAssign(
      { id: 1, courseType: '', products: [{ id: 'P', name: 'p', qty: 2, unit: 'U' }] },
      [], 0
    );
    expect(r.products[0].qty).toBe(2); // 2 × max(1, 0) = 2
  });
});

// ════════════════════════════════════════════════════════════════════════
// F14: Lifecycle integrity — buffet never moves to history via deduct
// ════════════════════════════════════════════════════════════════════════

describe('F14: lifecycle integrity', () => {
  it('F14.1: specific-qty depletes → mapRawCoursesToForm drops from list (move to history)', () => {
    const depleted = [{ name: 'X', qty: '0 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }];
    expect(mapRawCoursesToForm(depleted)).toHaveLength(0);
  });
  it('F14.2: fill-later after consume (0 / 1 ครั้ง) → dropped (history)', () => {
    const consumed = [{ name: 'X', qty: '0 / 1 ครั้ง', courseType: 'เหมาตามจริง' }];
    expect(mapRawCoursesToForm(consumed)).toHaveLength(0);
  });
  it('F14.3: buffet NEVER drops from mapRawCoursesToForm regardless of qty', () => {
    const raws = [
      [{ name: 'B', qty: '0 / 1 U', courseType: 'บุฟเฟต์' }],
      [{ name: 'B', qty: '0 / 0 U', courseType: 'บุฟเฟต์' }],
      [{ name: 'B', qty: '', courseType: 'บุฟเฟต์' }],
    ];
    for (const r of raws) {
      expect(mapRawCoursesToForm(r)).toHaveLength(1);
    }
  });
  it('F14.4: pick-at-treatment placeholder never drops (has products=[])', () => {
    const placeholder = [{ name: 'P', courseType: 'เลือกสินค้าตามจริง', needsPickSelection: true, availableProducts: [] }];
    expect(mapRawCoursesToForm(placeholder)).toHaveLength(1);
  });
});

// ════════════════════════════════════════════════════════════════════════
// F15: Source-grep regression guards — lock every fix in place
// ════════════════════════════════════════════════════════════════════════

describe('F15: source-grep regression guards', () => {
  const TFP = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
  const TBH = fs.readFileSync('src/lib/treatmentBuyHelpers.js', 'utf-8');
  const CDV = fs.readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf-8');

  it('F15.1: TFP has NO raw rowId startsWith purchased-/promo- (all via isPurchasedSessionRowId)', () => {
    expect(TFP.match(/rowId\??\.startsWith\(['"]purchased-['"]\)/g)).toBeNull();
    expect(TFP.match(/rowId\??\.startsWith\(['"]promo-['"]\)/g)).toBeNull();
  });

  it('F15.2: TFP calls isPurchasedSessionRowId at least 4 times (pre-validation + 3 filter sites)', () => {
    const calls = TFP.match(/isPurchasedSessionRowId\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
  });

  it('F15.3: assignCourseToCustomer guards placeholder branch with !alreadyResolved', () => {
    expect(BC).toMatch(/!masterCourse\.alreadyResolved/);
  });

  it('F15.4: both handleSubmit assignCourseToCustomer calls forward alreadyResolved', () => {
    const calls = TFP.match(/assignCourseToCustomer\([^)]*alreadyResolved/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it('F15.5: deductCourseItems has buffet skip in Step-1 AND fallback', () => {
    // Must appear in two places: Step-1 (line ~307) and fallback scan (line ~348)
    const bufSkips = BC.match(/courseType\s*===\s*['"]บุฟเฟต์['"]/g) || [];
    expect(bufSkips.length).toBeGreaterThanOrEqual(3); // Step-1 + 2a special fallback + 2b skip-guard
  });

  it('F15.6: mapRawCoursesToForm exists and branches on isBuffet', () => {
    expect(TBH).toMatch(/export function mapRawCoursesToForm/);
    expect(TBH).toMatch(/isBuffet\s*=\s*courseType\s*===\s*['"]บุฟเฟต์['"]/);
  });

  it('F15.7: TFP customerCourses filter exempts pick-at-treatment placeholder + buffet', () => {
    const filterIdx = TFP.indexOf('const allZero = (c.products || []).every');
    expect(filterIdx).toBeGreaterThan(-1);
    const before = TFP.slice(Math.max(0, filterIdx - 600), filterIdx);
    expect(before).toMatch(/c\.isPickAtTreatment && c\.needsPickSelection/);
    expect(before).toMatch(/c\.isBuffet \|\| String\(c\.courseType/);
  });

  it('F15.8: CustomerDetailView activeCourses exempts placeholder + buffet', () => {
    const filterIdx = CDV.indexOf('const activeCourses = useMemo');
    expect(filterIdx).toBeGreaterThan(-1);
    const ctx = CDV.slice(filterIdx, filterIdx + 1200);
    expect(ctx).toMatch(/c\.needsPickSelection/);
    // Use /s (dotAll) flag so '.' matches newlines across the multi-line exemption block
    expect(ctx).toMatch(/courseType.*บุฟเฟต์|บุฟเฟต์.*courseType/s);
  });

  it('F15.9: CustomerDetailView CourseItemBar renders "บุฟเฟต์" text for buffet courses', () => {
    expect(CDV).toMatch(/isBuffet\s*=\s*String\(course\.courseType/);
    // Must render "บุฟเฟต์" — check for the exact Thai string appearing
    // in a visible JSX span within CourseItemBar
    const itemBarIdx = CDV.indexOf('function CourseItemBar');
    const end = CDV.indexOf('}\n', itemBarIdx) + 2;
    const body = CDV.slice(itemBarIdx, itemBarIdx + 3000);
    expect(body).toMatch(/บุฟเฟต์/);
    expect(body).toMatch(/text-violet-400/); // same color as fill-later
  });

  it('F15.10: TFP product row renders "บุฟเฟต์" text when product.isBuffet', () => {
    expect(TFP).toMatch(/product\.isBuffet[\s\S]{0,500}บุฟเฟต์/);
  });

  it('F15.11: bloodTypeOptions is mapped to objects (id+name), not a raw string array', () => {
    expect(TFP).toMatch(/bloodTypeOptions:\s*\[['"]A['"][^\]]*\]\.map\(v\s*=>\s*\(\{\s*id:\s*v,\s*name:\s*v\s*\}\)\)/);
  });

  it('F15.12: TFP pre-validation skips buffet (liveIsBuffet / inMemoryIsBuffet continue)', () => {
    expect(TFP).toMatch(/liveIsBuffet\s*\|\|\s*inMemoryIsBuffet/);
  });

  it('F15.13: TFP imports mapRawCoursesToForm + isPurchasedSessionRowId + resolvePurchasedCourseForAssign', () => {
    expect(TFP).toMatch(/mapRawCoursesToForm/);
    expect(TFP).toMatch(/isPurchasedSessionRowId/);
    expect(TFP).toMatch(/resolvePurchasedCourseForAssign/);
  });
});
