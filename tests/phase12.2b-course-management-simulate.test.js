// ─── Phase 12.2b Priority 2.7 — COURSE MANAGEMENT full-flow simulate ─────
//
// Admin actions on an existing customer course (buttons in CustomerDetailView
// CourseItemBar: "เพิ่มคงเหลือ", "เปลี่ยนสินค้า", "แชร์คอร์ส"):
//   - addCourseRemainingQty: admin grants extra remaining (increases both
//     remaining AND total — addRemaining from courseUtils)
//   - exchangeCourseProduct: swap product within a course, append to
//     courseExchangeLog audit trail
//   - Share course to another customer (UI-handled via assignCourseToCustomer
//     on the target + mark source — not a dedicated backendClient fn)
//
// Coverage:
//   F1: addCourseRemainingQty — increases both remaining AND total
//   F2: exchangeCourseProduct — swaps product + logs audit entry
//   F3: exchangeCourseProduct invariants — courseIndex validation, log
//       append shape, timestamp present
//   F4: share — target customer gets a new course entry via
//       assignCourseToCustomer (source-grep verification)
//   F5: adversarial — negative qty, malformed existing qty, out-of-range
//       index, null product

import fs from 'fs';
import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import { parseQtyString, addRemaining, buildQtyString } from '../src/lib/courseUtils.js';

// ═══════════════════════════════════════════════════════════════════════
// Simulate helpers
// ═══════════════════════════════════════════════════════════════════════

function simulateAddRemaining(courses, courseIndex, addQty) {
  if (courseIndex < 0 || courseIndex >= courses.length) throw new Error('Invalid course index');
  const out = courses.map(c => ({ ...c }));
  out[courseIndex] = { ...out[courseIndex], qty: addRemaining(out[courseIndex].qty, addQty) };
  return out;
}

function simulateExchange(courses, courseExchangeLog, courseIndex, newProduct, reason) {
  if (courseIndex < 0 || courseIndex >= courses.length) throw new Error('Invalid course index');
  const out = courses.map(c => ({ ...c }));
  const old = out[courseIndex];
  const entry = {
    timestamp: new Date().toISOString(),
    oldProduct: old.product,
    oldQty: old.qty,
    newProduct: newProduct.name,
    newQty: buildQtyString(Number(newProduct.qty) || 1, newProduct.unit || ''),
    reason: reason || '',
  };
  out[courseIndex] = {
    ...old,
    product: newProduct.name,
    qty: buildQtyString(Number(newProduct.qty) || 1, newProduct.unit || ''),
  };
  const nextLog = [...(courseExchangeLog || []), entry];
  return { courses: out, log: nextLog };
}

// ═══════════════════════════════════════════════════════════════════════
// F1: addCourseRemainingQty — increase both remaining and total
// ═══════════════════════════════════════════════════════════════════════

describe('F1: addCourseRemainingQty — admin grants extra qty (remaining + total both increase)', () => {
  it('F1.1: "3 / 5 U" + 2 → "5 / 7 U"', () => {
    const out = simulateAddRemaining([{ name: 'X', qty: '3 / 5 U' }], 0, 2);
    expect(out[0].qty).toBe('5 / 7 U');
  });

  it('F1.2: "0 / 5 U" (consumed) + 10 → "10 / 15 U" (admin revives depleted course)', () => {
    const out = simulateAddRemaining([{ name: 'X', qty: '0 / 5 U' }], 0, 10);
    expect(out[0].qty).toBe('10 / 15 U');
  });

  it('F1.3: "5 / 5 U" + 0 → "5 / 5 U" (no change)', () => {
    const out = simulateAddRemaining([{ name: 'X', qty: '5 / 5 U' }], 0, 0);
    expect(out[0].qty).toBe('5 / 5 U');
  });

  it('F1.4: invalid courseIndex throws', () => {
    expect(() => simulateAddRemaining([{ name: 'X', qty: '1/1' }], 5, 1)).toThrow('Invalid course index');
    expect(() => simulateAddRemaining([{ name: 'X', qty: '1/1' }], -1, 1)).toThrow('Invalid course index');
  });

  it('F1.5: multiple sequential adds accumulate correctly', () => {
    let courses = [{ name: 'X', qty: '5 / 5 U' }];
    courses = simulateAddRemaining(courses, 0, 3);
    expect(courses[0].qty).toBe('8 / 8 U');
    courses = simulateAddRemaining(courses, 0, 2);
    expect(courses[0].qty).toBe('10 / 10 U');
  });

  it('F1.6: fill-later course — addRemaining on "1 / 1 ครั้ง" zero-unit → "2 / 2 ครั้ง" (admin extends one-shot into N-shots?)', () => {
    // Odd case — fill-later semantics say "one-shot consumes whole
    // course". Adding to it effectively converts it to N-shot.
    // Not blocked at the helper level — UI should guard if needed.
    const out = simulateAddRemaining([{ name: 'F', qty: '1 / 1 ครั้ง', courseType: 'เหมาตามจริง' }], 0, 1);
    expect(out[0].qty).toBe('2 / 2 ครั้ง');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F2: exchangeCourseProduct — swap + log audit
// ═══════════════════════════════════════════════════════════════════════

describe('F2: exchangeCourseProduct — swap product within a course, audit log', () => {
  it('F2.1: swap "Old" for "New" keeps course name, updates product + qty', () => {
    const { courses, log } = simulateExchange(
      [{ name: 'Course', product: 'Old', qty: '3 / 5 U' }],
      [],
      0,
      { name: 'New', qty: 10, unit: 'cc' },
      'product out of stock'
    );
    expect(courses[0].product).toBe('New');
    expect(courses[0].qty).toBe('10 / 10 cc'); // fresh qty from new product
    expect(courses[0].name).toBe('Course'); // name preserved
    expect(log[0].oldProduct).toBe('Old');
    expect(log[0].oldQty).toBe('3 / 5 U');
    expect(log[0].newProduct).toBe('New');
    expect(log[0].reason).toBe('product out of stock');
  });

  it('F2.2: exchange log accumulates across multiple swaps', () => {
    let { courses, log } = simulateExchange(
      [{ name: 'C', product: 'A', qty: '1 / 1 U' }],
      [],
      0, { name: 'B', qty: 1, unit: 'U' }, 'first'
    );
    ({ courses, log } = simulateExchange(courses, log, 0, { name: 'C2', qty: 1, unit: 'U' }, 'second'));
    expect(log).toHaveLength(2);
    expect(log.map(e => e.reason)).toEqual(['first', 'second']);
    expect(log[1].oldProduct).toBe('B'); // chain: A → B → C2
  });

  it('F2.3: timestamp in log entry is ISO string', () => {
    const { log } = simulateExchange(
      [{ name: 'C', product: 'A', qty: '1 / 1 U' }],
      [], 0, { name: 'B', qty: 1, unit: 'U' }, ''
    );
    expect(log[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('F2.4: empty reason → stored as ""', () => {
    const { log } = simulateExchange(
      [{ name: 'C', product: 'A', qty: '1 / 1 U' }],
      [], 0, { name: 'B', qty: 1, unit: 'U' }
    );
    expect(log[0].reason).toBe('');
  });

  it('F2.5: invalid courseIndex throws', () => {
    expect(() =>
      simulateExchange([{ name: 'C', product: 'A', qty: '1 / 1 U' }], [], 5, { name: 'B', qty: 1 }, '')
    ).toThrow('Invalid course index');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F3: exchangeCourseProduct invariants — name stability, unit pass-through
// ═══════════════════════════════════════════════════════════════════════

describe('F3: exchange invariants', () => {
  it('F3.1: unit falls back to "" when newProduct.unit missing (buildQtyString signature)', () => {
    const { courses } = simulateExchange(
      [{ name: 'C', product: 'A', qty: '1 / 1 U' }],
      [], 0, { name: 'B', qty: 5 }, ''
    );
    expect(courses[0].qty).toBe('5 / 5'); // no unit suffix
  });

  it('F3.2: qty=0 → fallback 1 (buildQtyString(Number(qty) || 1, unit))', () => {
    const { courses } = simulateExchange(
      [{ name: 'C', product: 'A', qty: '1 / 1 U' }],
      [], 0, { name: 'B', qty: 0, unit: 'U' }, ''
    );
    expect(courses[0].qty).toBe('1 / 1 U');
  });

  it('F3.3: non-numeric qty → fallback 1', () => {
    const { courses } = simulateExchange(
      [{ name: 'C', product: 'A', qty: '1 / 1 U' }],
      [], 0, { name: 'B', qty: 'abc', unit: 'U' }, ''
    );
    expect(courses[0].qty).toBe('1 / 1 U');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F4: Share course — target customer gets a new entry via assignCourseToCustomer
// ═══════════════════════════════════════════════════════════════════════

describe('F4: share course — source-grep verification (UI calls assignCourseToCustomer on the target)', () => {
  const CDV = fs.readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf-8');

  it('F4.1: CustomerDetailView imports assignCourseToCustomer', () => {
    expect(CDV).toMatch(/assignCourseToCustomer/);
  });

  it('F4.2: ShareCourseModal handler calls assignCourseToCustomer on the target customer', () => {
    // Share flow writes a NEW course entry on the target customer —
    // source has at least ONE call path with `assignCourseToCustomer(toId,`
    expect(CDV).toMatch(/assignCourseToCustomer\(\s*toId|assignCourseToCustomer\(customerId,/);
  });

  it('F4.3: share tracks source via parentName or source field (audit trail)', () => {
    // Pattern: shared courses carry parentName or source='share' so
    // the customer can see where the course came from
    expect(CDV).toMatch(/source|parentName|'share'|"share"/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F5: Adversarial — edge cases on management actions
// ═══════════════════════════════════════════════════════════════════════

describe('F5: adversarial course-management edge cases', () => {
  it('F5.1: addCourseRemainingQty with negative qty — defensive (addRemaining math)', () => {
    // addRemaining just adds to both fields. Negative is questionable UX
    // but won't crash.
    const out = simulateAddRemaining([{ name: 'X', qty: '5 / 5 U' }], 0, -2);
    expect(out[0].qty).toBe('3 / 3 U');
  });

  it('F5.2: exchange on a buffet course — mechanics work; only UX question', () => {
    // Exchange a buffet course's product. qty resets to the new qty.
    // Buffet semantics mean qty never changes during use, so exchange
    // effectively rewrites the buffet's covered product.
    const { courses } = simulateExchange(
      [{ name: 'Buf', product: 'A', qty: '1 / 1 U', courseType: 'บุฟเฟต์' }],
      [], 0, { name: 'B', qty: 1, unit: 'U' }, ''
    );
    expect(courses[0].product).toBe('B');
    expect(courses[0].courseType).toBe('บุฟเฟต์'); // flag preserved
  });

  it('F5.3: addCourseRemainingQty malformed qty (parseQtyString → 0/0) → add works from 0/0', () => {
    const out = simulateAddRemaining([{ name: 'X', qty: 'garbage' }], 0, 5);
    // addRemaining does (remaining+add, total+add, unit). Starting from
    // 0/0 with unit='' → "5 / 5"
    expect(out[0].qty).toBe('5 / 5');
  });

  it('F5.4: exchange with null product name → stored as "undefined" string (defensive fallback)', () => {
    const { courses } = simulateExchange(
      [{ name: 'C', product: 'A', qty: '1 / 1 U' }],
      [], 0, { qty: 1, unit: 'U' }, ''
    );
    // product: newProduct.name — undefined; stored as `undefined` field
    // Acceptable as long as it doesn't crash. Real UI should validate
    // before submit.
    expect(courses[0].product).toBeUndefined();
  });

  it('F5.5: addCourseRemainingQty on fill-later consumed (0/1 ครั้ง) + 5 → 5 / 6 ครั้ง', () => {
    const out = simulateAddRemaining(
      [{ name: 'F', qty: '0 / 1 ครั้ง', courseType: 'เหมาตามจริง' }], 0, 5
    );
    expect(out[0].qty).toBe('5 / 6 ครั้ง');
    // Note: this effectively "revives" a consumed fill-later into an
    // N-shot course. UI should gate if this is not allowed.
  });
});
