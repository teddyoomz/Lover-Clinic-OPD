// Phase 16.5-quater (2026-04-29) โ€” qty bug regression for "เน€เธเธดเนเธกเธเธเน€เธซเธฅเธทเธญ" button.
//
// User report: "เธเธธเนเธกเน€เธเธดเนเธกเธเธเน€เธซเธฅเธทเธญเธกเธฑเธเนเธกเนเน€เธเธดเนเธกเธเธณเธเธงเธเธ—เธตเนเธกเธตเธญเธขเธนเน เธกเธฑเธเนเธเน€เธเธดเนเธกเธเธณเธเธงเธ
// เธเธฃเธฑเนเธเธชเธนเธเธชเธธเธ”เนเธ—เธ เน€เธเนเธ 98/100 + 1 โ’ 98/101 (เธเธฅเธฒเธขเน€เธเนเธ) เธกเธฒเนเธ—เธ เธ•เธฅเธเธกเธฒเธ"
//
// Root cause: addCourseRemainingQty (backendClient.js:996) used `addRemaining`
// helper which adds to BOTH remaining + total. Fix: switched to `reverseQty`
// which adds to remaining only, capped at total.
//
// This test exercises the courseUtils helpers directly to lock the math.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { reverseQty, addRemaining, parseQtyString } from '../src/lib/courseUtils.js';

const CLIENT_SRC = readFileSync('src/lib/backendClient.js', 'utf8');

describe('Q1 reverseQty โ€” correct math for "เน€เธเธดเนเธกเธเธเน€เธซเธฅเธทเธญ"', () => {
  test('Q1.1 user-reported case: 98/100 + 1 โ’ 99/100 (NOT 98/101)', () => {
    expect(reverseQty('98 / 100 U', 1)).toBe('99 / 100 U');
    const parsed = parseQtyString(reverseQty('98 / 100 U', 1));
    expect(parsed.remaining).toBe(99);
    expect(parsed.total).toBe(100);
  });

  test('Q1.2 cap at total โ€” adding past total stays at total', () => {
    expect(reverseQty('99 / 100 U', 5)).toBe('100 / 100 U');
    expect(reverseQty('100 / 100 U', 1)).toBe('100 / 100 U'); // already at cap
  });

  test('Q1.3 various Thai units preserved', () => {
    expect(reverseQty('5 / 10 เธเธฃเธฑเนเธ', 2)).toBe('7 / 10 เธเธฃเธฑเนเธ');
    expect(reverseQty('0 / 3 amp.', 1)).toBe('1 / 3 amp.');
  });
});

describe('Q2 addRemaining โ€” anti-regression: this is the BUGGY function (do NOT use for "เน€เธเธดเนเธกเธเธเน€เธซเธฅเธทเธญ")', () => {
  test('Q2.1 buggy semantic confirmed (adds to BOTH) โ€” used elsewhere intentionally', () => {
    // addRemaining is the OLD behavior (add to both). Kept in courseUtils.js
    // for legacy callers but NOT used for the เน€เธเธดเนเธกเธเธเน€เธซเธฅเธทเธญ button anymore.
    // 98/100 + 1 โ’ 99/101 (both incremented).
    expect(addRemaining('98 / 100 U', 1)).toBe('99 / 101 U');
  });
});

describe('Q3 backendClient.addCourseRemainingQty source-grep โ€” locks the fix', () => {
  test('Q3.1 uses reverseQty, NOT addRemainingQty/addRemaining', () => {
    // 2026-06-09 โ€” the add-side math + audit moved to adjustCourseRemainingQty
    // (unified add/reduce); addCourseRemainingQty is now a thin wrapper.
    const idx = CLIENT_SRC.indexOf('export async function adjustCourseRemainingQty');
    expect(idx).toBeGreaterThan(-1);
    const slice = CLIENT_SRC.slice(idx, idx + 4500);
    expect(slice).toMatch(/reverseQty\(/);
    // Anti-regression: addRemainingQty alias should NOT appear inside the
    // function body โ€” that was the source of the bug.
    expect(slice).not.toMatch(/addRemainingQty\(/);
  });

  test('Q3.2 emits be_course_changes audit (kind=add) for เธเธฃเธฐเธงเธฑเธ•เธดเธเธฒเธฃเนเธเนเธเธญเธฃเนเธช tab', () => {
    const idx = CLIENT_SRC.indexOf('export async function adjustCourseRemainingQty');
    const slice = CLIENT_SRC.slice(idx, idx + 4500);
    expect(slice).toMatch(/buildChangeAuditEntry/);
    // 2026-06-09 โ€” kind is now add|reduce ("เนเธเนเธเธเน€เธซเธฅเธทเธญ").
    expect(slice).toMatch(/kind:\s*isReduce\s*\?\s*'reduce'\s*:\s*'add'/);
    expect(slice).toMatch(/setDoc\(courseChangeDoc/);
    expect(slice).toMatch(/qtyDelta/);
    expect(slice).toMatch(/qtyBefore/);
    expect(slice).toMatch(/qtyAfter/);
  });

  test('Q3.3 takes opts arg for staff identification', () => {
    const sig = CLIENT_SRC.match(/export async function addCourseRemainingQty\([^)]*\)/);
    expect(sig?.[0]).toMatch(/opts/);
  });
});

describe('Q4 audit-unification: deductCourseItems emits kind=use when treatmentId provided', () => {
  test('Q4.1 source-grep โ€” deductCourseItems writes audit on treatment context', () => {
    const idx = CLIENT_SRC.indexOf('export async function deductCourseItems');
    // Function body is large โ€” slice to next `export` boundary instead of fixed offset.
    const nextExport = CLIENT_SRC.indexOf('\nexport ', idx + 50);
    const slice = CLIENT_SRC.slice(idx, nextExport > idx ? nextExport : idx + 8000);
    expect(slice).toMatch(/opts\.treatmentId/);
    expect(slice).toMatch(/kind:\s*'use'/);
    expect(slice).toMatch(/linkedTreatmentId:\s*String\(opts\.treatmentId/);
    expect(slice).toMatch(/setDoc\(courseChangeDoc/);
  });
});

describe('Q5 audit-unification: applySaleCancelToCourses persists staff on flipped course', () => {
  test('Q5.1 staff fields written ON the customer.courses[] entry (cascade source)', () => {
    const idx = CLIENT_SRC.indexOf('export async function applySaleCancelToCourses');
    const slice = CLIENT_SRC.slice(idx, idx + 4500);
    expect(slice).toMatch(/staffId:\s*String\(opts\.staffId/);
    expect(slice).toMatch(/staffName:\s*String\(opts\.staffName/);
  });
});
