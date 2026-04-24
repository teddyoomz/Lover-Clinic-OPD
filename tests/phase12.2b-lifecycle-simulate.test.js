// ─── Phase 12.2b Priority 1.3 — LIFECYCLE full-flow simulate ─────────────
//
// What does customer.courses[i].qty look like AFTER deductCourseItems runs,
// for each course type? This is the invariant that drives:
//   - "คอร์สของฉัน" active filter (remaining > 0)
//   - Treatment form re-render next visit (consumed → dropped)
//   - History / expired tabs
//   - DF usage weight (used_qty / total_qty)
//
// Coverage:
//   F1: specific-qty decrement sequence (5→4→3→... until 0/5 → drops)
//   F2: fill-later one-shot zero-out (1/1 → 0/1 regardless of deductQty)
//   F3: buffet no-op (qty UNCHANGED forever)
//   F4: pick-at-treatment lifecycle — placeholder → resolved N entries →
//       each entry decrements independently
//   F5: mixed-course invariants (deduct one doesn't touch others)
//   F6: cross-visit scenario — 3 visits, assert cumulative state
//   F7: source-grep — deductCourseItems buffet + fill-later short-circuits
//       live in BOTH Step-1 (courseIndex) and Step-2 (fallback)

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import { parseQtyString, formatQtyString, deductQty } from '../src/lib/courseUtils.js';
import { mapRawCoursesToForm } from '../src/lib/treatmentBuyHelpers.js';

// Mirror of deductCourseItems (see backendClient.js:269-363 — also mirrored
// in phase12.2b-flow-simulate.test.js; kept here so this file is
// self-contained).
function simulateDeduct(courses, deductions, { preferNewest = false } = {}) {
  const out = courses.map(c => ({ ...c }));
  const matches = (c, d) => {
    const nameOk = d.courseName ? c.name === d.courseName : true;
    const prodOk = d.productName ? (c.product || c.name) === d.productName : true;
    return nameOk && prodOk;
  };
  const consumeRealQty = (i) => {
    const c = out[i];
    const parsed = parseQtyString(c.qty);
    const total = parsed.total > 0 ? parsed.total : 1;
    out[i] = { ...c, qty: formatQtyString(0, total, parsed.unit || 'ครั้ง') };
  };
  for (const d of deductions) {
    let remaining = d.deductQty || 1;
    if (typeof d.courseIndex === 'number' && d.courseIndex >= 0 && d.courseIndex < out.length) {
      const c = out[d.courseIndex];
      if (matches(c, d)) {
        if (c.courseType === 'เหมาตามจริง') { consumeRealQty(d.courseIndex); continue; }
        if (c.courseType === 'บุฟเฟต์') continue;
        const p = parseQtyString(c.qty);
        if (p.remaining > 0) {
          const toDeduct = Math.min(remaining, p.remaining);
          out[d.courseIndex] = { ...c, qty: deductQty(c.qty, toDeduct) };
          remaining -= toDeduct;
        }
      }
    }
    if (remaining > 0) {
      const order = preferNewest ? [...out.keys()].reverse() : [...out.keys()];
      for (const i of order) {
        if (i === d.courseIndex) continue;
        const c = out[i];
        if (!matches(c, d)) continue;
        if (c.courseType === 'เหมาตามจริง') { consumeRealQty(i); remaining = 0; break; }
        if (c.courseType === 'บุฟเฟต์') { remaining = 0; break; }
      }
    }
    if (remaining > 0) {
      const order = preferNewest ? [...out.keys()].reverse() : [...out.keys()];
      for (const i of order) {
        if (remaining <= 0) break;
        if (i === d.courseIndex) continue;
        const c = out[i];
        if (!matches(c, d)) continue;
        if (c.courseType === 'เหมาตามจริง' || c.courseType === 'บุฟเฟต์') continue;
        const p = parseQtyString(c.qty);
        if (p.remaining <= 0) continue;
        const toDeduct = Math.min(remaining, p.remaining);
        out[i] = { ...c, qty: deductQty(c.qty, toDeduct) };
        remaining -= toDeduct;
      }
    }
    if (remaining > 0) throw new Error(`short: ${d.productName || d.courseName}`);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// F1: specific-qty decrement sequence
// ═══════════════════════════════════════════════════════════════════════

describe('F1: specific-qty lifecycle — 5→4→3→...→0 then drops from active', () => {
  it('F1.1: five single-unit deductions bring 5/5 → 0/5', () => {
    let courses = [{ name: 'Botox', product: 'B100', qty: '5 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }];
    for (let i = 0; i < 5; i++) {
      courses = simulateDeduct(courses, [{ courseName: 'Botox', productName: 'B100', deductQty: 1, courseIndex: 0 }]);
    }
    expect(courses[0].qty).toBe('0 / 5 U');
    // Next visit: mapRawCoursesToForm drops fully-consumed courses
    expect(mapRawCoursesToForm(courses)).toHaveLength(0);
  });

  it('F1.2: multi-unit deduct in one call (qty=3) goes 5 → 2', () => {
    const courses = [{ name: 'X', product: 'P', qty: '5 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }];
    const out = simulateDeduct(courses, [{ courseName: 'X', productName: 'P', deductQty: 3, courseIndex: 0 }]);
    expect(out[0].qty).toBe('2 / 5 U');
  });

  it('F1.3: deduct MORE than remaining → throws (pre-validation should prevent, but backend also defends)', () => {
    const courses = [{ name: 'X', product: 'P', qty: '2 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }];
    expect(() => simulateDeduct(courses, [{ courseName: 'X', productName: 'P', deductQty: 5 }])).toThrow(/short/);
  });

  it('F1.4: at exactly 0 remaining, next visit shows as "expired/used-up" (dropped from active)', () => {
    const courses = [{ name: 'X', qty: '0 / 3 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' }];
    expect(mapRawCoursesToForm(courses)).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: fill-later (เหมาตามจริง) one-shot zero-out
// ═══════════════════════════════════════════════════════════════════════

describe('F2: fill-later lifecycle — one-shot zero regardless of qty', () => {
  it('F2.1: 1/1 ครั้ง zeros to 0/1 regardless of deductQty=999', () => {
    const courses = [{ name: 'Heavy', qty: '1 / 1 ครั้ง', courseType: 'เหมาตามจริง' }];
    const out = simulateDeduct(courses, [{ courseName: 'Heavy', deductQty: 999, courseIndex: 0 }]);
    expect(out[0].qty).toBe('0 / 1 ครั้ง');
  });

  it('F2.2: after one use, next visit drops the course from active', () => {
    const courses = [{ name: 'Heavy', qty: '0 / 1 ครั้ง', courseType: 'เหมาตามจริง' }];
    expect(mapRawCoursesToForm(courses)).toHaveLength(0);
  });

  it('F2.3: Step-1 index-targeted deduct fires consumeRealQty', () => {
    const courses = [{ name: 'A', qty: '1 / 1 U', courseType: 'เหมาตามจริง' }];
    const out = simulateDeduct(courses, [{ courseName: 'A', deductQty: 5, courseIndex: 0 }]);
    expect(out[0].qty).toBe('0 / 1 U');
  });

  it('F2.4: Step-2 fallback (no courseIndex) still zeros', () => {
    const courses = [{ name: 'B', qty: '1 / 1 U', courseType: 'เหมาตามจริง' }];
    const out = simulateDeduct(courses, [{ courseName: 'B', deductQty: 5 /* no index */ }]);
    expect(out[0].qty).toBe('0 / 1 U');
  });

  it('F2.5: missing total in qty still zeros (defensive — consumeRealQty defaults total to 1)', () => {
    const courses = [{ name: 'Malformed', qty: '1 /   ครั้ง', courseType: 'เหมาตามจริง' }];
    const out = simulateDeduct(courses, [{ courseName: 'Malformed', deductQty: 3, courseIndex: 0 }]);
    // parseQtyString returns 0/0 on unparseable right side, consumeRealQty writes "0 / 1 ครั้ง"
    expect(out[0].qty).toMatch(/^0 \/ 1 /);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: buffet no-op lifecycle
// ═══════════════════════════════════════════════════════════════════════

describe('F3: buffet lifecycle — qty UNCHANGED forever', () => {
  it('F3.1: single deduct leaves qty identical', () => {
    const courses = [{ name: 'Buf', product: 'P', qty: '1 / 1 U', courseType: 'บุฟเฟต์' }];
    const out = simulateDeduct(courses, [{ courseName: 'Buf', productName: 'P', deductQty: 99, courseIndex: 0 }]);
    expect(out[0].qty).toBe('1 / 1 U');
  });

  it('F3.2: 100 simulated visits — qty never changes', () => {
    let courses = [{ name: 'B', product: 'P', qty: '1 / 1 U', courseType: 'บุฟเฟต์' }];
    for (let i = 0; i < 100; i++) {
      courses = simulateDeduct(courses, [{ courseName: 'B', productName: 'P', deductQty: 50, courseIndex: 0 }]);
    }
    expect(courses[0].qty).toBe('1 / 1 U');
  });

  it('F3.3: buffet STAYS in mapRawCoursesToForm forever (exempt from consumed-drop)', () => {
    const courses = [{ name: 'B', qty: '0 / 1 U', courseType: 'บุฟเฟต์' }]; // even at 0
    expect(mapRawCoursesToForm(courses)).toHaveLength(1);
  });

  it('F3.4: mixed buffet + specific-qty — only specific-qty decrements', () => {
    const courses = [
      { name: 'Buf', product: 'P1', qty: '1 / 1 U', courseType: 'บุฟเฟต์' },
      { name: 'Std', product: 'P2', qty: '5 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    ];
    const out = simulateDeduct(courses, [
      { courseName: 'Buf', productName: 'P1', deductQty: 50, courseIndex: 0 },
      { courseName: 'Std', productName: 'P2', deductQty: 2, courseIndex: 1 },
    ]);
    expect(out[0].qty).toBe('1 / 1 U');
    expect(out[1].qty).toBe('3 / 5 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: pick-at-treatment lifecycle (placeholder → resolved → decrement)
// ═══════════════════════════════════════════════════════════════════════

describe('F4: pick-at-treatment lifecycle — placeholder → resolved → standard decrement', () => {
  it('F4.1: placeholder with needsPickSelection:true stays in active via mapRawCoursesToForm', () => {
    const courses = [{
      name: 'Pick', courseType: 'เลือกสินค้าตามจริง',
      needsPickSelection: true, availableProducts: [{ productId: 'A', name: 'a', qty: 2, unit: 'U' }],
      qty: '', product: '',
    }];
    const form = mapRawCoursesToForm(courses);
    expect(form).toHaveLength(1);
    expect(form[0].isPickAtTreatment).toBe(true);
    expect(form[0].needsPickSelection).toBe(true);
  });

  it('F4.2: after resolve, customer.courses has N standard entries — each decrements independently', () => {
    // After resolvePickedCourseInCustomer persisted: placeholder replaced with
    // N entries (one per picked product), each with proper qty.
    const resolved = [
      { name: 'Pick', product: 'LipoS', qty: '4 / 4 เข็ม', courseType: 'เลือกสินค้าตามจริง', linkedSaleId: 'S1' },
    ];
    const out = simulateDeduct(resolved, [
      { courseName: 'Pick', productName: 'LipoS', deductQty: 1, courseIndex: 0 },
    ], { preferNewest: true });
    expect(out[0].qty).toBe('3 / 4 เข็ม');
  });

  it('F4.3: resolved pick-at-treatment decrements to 0 → drops from active (same as specific-qty)', () => {
    const resolved = [{ name: 'Pick', product: 'LipoS', qty: '0 / 4 เข็ม', courseType: 'เลือกสินค้าตามจริง' }];
    expect(mapRawCoursesToForm(resolved)).toHaveLength(0);
  });

  it('F4.4: one pick-at-treatment course can have MULTIPLE picks → each is its own entry with its own lifecycle', () => {
    const resolved = [
      { name: 'Pick', product: 'LipoS', qty: '4 / 4 เข็ม', courseType: 'เลือกสินค้าตามจริง' },
      { name: 'Pick', product: 'Babi',  qty: '10 / 10 ML', courseType: 'เลือกสินค้าตามจริง' },
    ];
    const out = simulateDeduct(resolved, [
      { courseName: 'Pick', productName: 'LipoS', deductQty: 1, courseIndex: 0 },
    ]);
    expect(out[0].qty).toBe('3 / 4 เข็ม'); // decremented
    expect(out[1].qty).toBe('10 / 10 ML');  // untouched
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: mixed-course invariants
// ═══════════════════════════════════════════════════════════════════════

describe('F5: mixed-course invariants — deducting one type never leaks into another', () => {
  it('F5.1: cart with all 4 types + decrement ONLY specific-qty → others untouched', () => {
    const courses = [
      { name: 'Std', product: 'P1', qty: '5 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
      { name: 'Fil', product: 'P2', qty: '1 / 1 ครั้ง', courseType: 'เหมาตามจริง' },
      { name: 'Buf', product: 'P3', qty: '1 / 1 U', courseType: 'บุฟเฟต์' },
      { name: 'Pick', product: 'P4', qty: '3 / 3 เข็ม', courseType: 'เลือกสินค้าตามจริง' },
    ];
    const out = simulateDeduct(courses, [
      { courseName: 'Std', productName: 'P1', deductQty: 1, courseIndex: 0 },
    ]);
    expect(out[0].qty).toBe('4 / 5 U');
    expect(out[1].qty).toBe('1 / 1 ครั้ง');
    expect(out[2].qty).toBe('1 / 1 U');
    expect(out[3].qty).toBe('3 / 3 เข็ม');
  });

  it('F5.2: same-name different-type courses — courseIndex is the disambiguator', () => {
    const courses = [
      { name: 'Laser', product: 'L', qty: '5 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
      { name: 'Laser', product: 'L', qty: '1 / 1 U', courseType: 'บุฟเฟต์' },
    ];
    // Deduct targeting specific-qty at index 0 → should NOT touch the buffet at 1
    const out = simulateDeduct(courses, [
      { courseName: 'Laser', productName: 'L', deductQty: 1, courseIndex: 0 },
    ]);
    expect(out[0].qty).toBe('4 / 5 U');
    expect(out[1].qty).toBe('1 / 1 U'); // buffet untouched
  });

  it('F5.3: duplicate-name courses — without courseIndex, fallback picks FIRST match by default', () => {
    const courses = [
      { name: 'X', product: 'P', qty: '5 / 5 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
      { name: 'X', product: 'P', qty: '3 / 3 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
    ];
    const out = simulateDeduct(courses, [{ courseName: 'X', productName: 'P', deductQty: 1 }]);
    expect(out[0].qty).toBe('4 / 5 U');
    expect(out[1].qty).toBe('3 / 3 U');
  });

  it('F5.4: duplicate-name + preferNewest → last-match wins', () => {
    const courses = [
      { name: 'X', product: 'P', qty: '5 / 5 U' },
      { name: 'X', product: 'P', qty: '3 / 3 U' },
    ];
    const out = simulateDeduct(courses, [
      { courseName: 'X', productName: 'P', deductQty: 1 },
    ], { preferNewest: true });
    expect(out[0].qty).toBe('5 / 5 U');
    expect(out[1].qty).toBe('2 / 3 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F6: cross-visit cumulative scenario
// ═══════════════════════════════════════════════════════════════════════

describe('F6: 3-visit cumulative scenario — buffet + specific-qty + fill-later all at once', () => {
  it('F6.1: 3 visits of a customer with mixed cart — final state correct', () => {
    let courses = [
      { name: 'BotoxSpec', product: 'B', qty: '100 / 100 U', courseType: 'ระบุสินค้าและจำนวนสินค้า' },
      { name: 'LaserBuf', product: 'L', qty: '1 / 1 U', courseType: 'บุฟเฟต์' },
      { name: 'FatPack', product: 'F', qty: '1 / 1 ครั้ง', courseType: 'เหมาตามจริง' },
    ];

    // Visit 1: 10U botox + laser buffet
    courses = simulateDeduct(courses, [
      { courseName: 'BotoxSpec', productName: 'B', deductQty: 10, courseIndex: 0 },
      { courseName: 'LaserBuf', productName: 'L', deductQty: 1, courseIndex: 1 },
    ]);
    expect(courses[0].qty).toBe('90 / 100 U');
    expect(courses[1].qty).toBe('1 / 1 U'); // buffet unchanged

    // Visit 2: 15U botox + fat pack (consumes entire fill-later)
    courses = simulateDeduct(courses, [
      { courseName: 'BotoxSpec', productName: 'B', deductQty: 15, courseIndex: 0 },
      { courseName: 'FatPack', productName: 'F', deductQty: 3, courseIndex: 2 },
    ]);
    expect(courses[0].qty).toBe('75 / 100 U');
    expect(courses[2].qty).toBe('0 / 1 ครั้ง'); // fill-later consumed

    // Visit 3: only laser buffet (fat pack should NOT appear in active anymore)
    const formBeforeV3 = mapRawCoursesToForm(courses);
    const names = formBeforeV3.map(f => f.courseName);
    expect(names).toContain('BotoxSpec');
    expect(names).toContain('LaserBuf');
    expect(names).not.toContain('FatPack');

    courses = simulateDeduct(courses, [
      { courseName: 'LaserBuf', productName: 'L', deductQty: 1, courseIndex: 1 },
    ]);
    expect(courses[1].qty).toBe('1 / 1 U'); // still buffet-unchanged
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F7: source-grep regression guards
// ═══════════════════════════════════════════════════════════════════════

describe('F7: source-grep — lifecycle short-circuits wired in both Step-1 and Step-2', () => {
  const BC = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
  const fnIdx = BC.indexOf('export async function deductCourseItems');
  const body = BC.slice(fnIdx, fnIdx + 5000);

  it('F7.1: fill-later (เหมาตามจริง) appears at least 3 times (Step-1 + Step-2 fallback + Step-2 skip)', () => {
    const matches = body.match(/เหมาตามจริง/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('F7.2: buffet (บุฟเฟต์) appears at least 3 times (Step-1 + Step-2 fallback + Step-2 skip)', () => {
    const matches = body.match(/บุฟเฟต์/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('F7.3: consumeRealQty called for fill-later in Step-1 AND fallback', () => {
    const matches = body.match(/consumeRealQty\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('F7.4: buffet fallback sets remaining=0 without modifying qty (break out of loop)', () => {
    // The fallback pattern for buffet: `remaining = 0; break;`
    expect(body).toMatch(/courseType === ['"]บุฟเฟต์['"][^}]*remaining\s*=\s*0[\s\S]{0,30}break/);
  });

  it('F7.5: throw at end of loop with คอร์สคงเหลือไม่พอ when nothing matches', () => {
    expect(body).toMatch(/throw new Error\([^)]*คอร์สคงเหลือไม่พอ/);
  });
});
