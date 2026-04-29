// tests/phase16.7-quinquies-ter-course-filter.test.js — Phase 16.7-quinquies-ter (2026-04-29)
//
// isCourseUsableInTreatment: TreatmentForm courses panel hides depleted +
// zero-total + null/empty courses; keeps special types (เหมาตามจริง /
// บุฟเฟต์ / pick-at-treatment) regardless of qty.

import { describe, it, expect } from 'vitest';
import { isCourseUsableInTreatment } from '../src/lib/treatmentBuyHelpers.js';

describe('CF.A — special course types (kept regardless of qty)', () => {
  it('CF.A.1 — courseType="เหมาตามจริง" with no qty → kept', () => {
    expect(isCourseUsableInTreatment({ courseType: 'เหมาตามจริง', qty: '' })).toBe(true);
  });
  it('CF.A.2 — isRealQty=true with empty qty → kept', () => {
    expect(isCourseUsableInTreatment({ isRealQty: true, qty: '' })).toBe(true);
  });
  it('CF.A.3 — courseType="บุฟเฟต์" with 0/0 → kept', () => {
    expect(isCourseUsableInTreatment({ courseType: 'บุฟเฟต์', qty: '0 / 0 ครั้ง' })).toBe(true);
  });
  it('CF.A.4 — isBuffet=true with 0/0 → kept', () => {
    expect(isCourseUsableInTreatment({ isBuffet: true, qty: '0 / 0 ครั้ง' })).toBe(true);
  });
  it('CF.A.5 — isPickAtTreatment=true with 0/0 → kept', () => {
    expect(isCourseUsableInTreatment({ isPickAtTreatment: true, qty: '0 / 0 ครั้ง' })).toBe(true);
  });
  it('CF.A.6 — needsPickSelection=true with 0/0 → kept', () => {
    expect(isCourseUsableInTreatment({ needsPickSelection: true, qty: '0 / 0 ครั้ง' })).toBe(true);
  });
});

describe('CF.B — standard qty-tracked courses', () => {
  it('CF.B.1 — 3/10 ครั้ง (3 remaining of 10) → kept', () => {
    expect(isCourseUsableInTreatment({ qty: '3 / 10 ครั้ง' })).toBe(true);
  });
  it('CF.B.2 — 20/20 ครั้ง (untouched 20 of 20) → kept', () => {
    expect(isCourseUsableInTreatment({ qty: '20 / 20 ครั้ง' })).toBe(true);
  });
  it('CF.B.3 — 0/10 ครั้ง (depleted) → hidden', () => {
    expect(isCourseUsableInTreatment({ qty: '0 / 10 ครั้ง' })).toBe(false);
  });
  it('CF.B.4 — 0/0 ครั้ง (zero-allocation) → hidden', () => {
    expect(isCourseUsableInTreatment({ qty: '0 / 0 ครั้ง' })).toBe(false);
  });
  it('CF.B.5 — 0/0 U (units, depleted) → hidden', () => {
    expect(isCourseUsableInTreatment({ qty: '0 / 0 U' })).toBe(false);
  });
  it('CF.B.6 — 100/100 U (untouched units) → kept', () => {
    expect(isCourseUsableInTreatment({ qty: '100 / 100 U' })).toBe(true);
  });
});

describe('CF.C — adversarial inputs', () => {
  it('CF.C.1 — null → hidden (return false)', () => {
    expect(isCourseUsableInTreatment(null)).toBe(false);
  });
  it('CF.C.2 — undefined → hidden', () => {
    expect(isCourseUsableInTreatment(undefined)).toBe(false);
  });
  it('CF.C.3 — empty object → hidden', () => {
    expect(isCourseUsableInTreatment({})).toBe(false);
  });
  it('CF.C.4 — qty="เหมาตามจริง" string (no courseType) → kept (legacy/clone variant)', () => {
    // Some legacy/clone data stores the type marker directly in the qty
    // field with no courseType. The filter recognizes this variant per
    // user-real-data testing on customer 2853.
    expect(isCourseUsableInTreatment({ qty: 'เหมาตามจริง' })).toBe(true);
  });
  it('CF.C.5 — fractional qty 0.5/1 → kept (remaining > 0)', () => {
    expect(isCourseUsableInTreatment({ qty: '0.5 / 1 ครั้ง' })).toBe(true);
  });
  it('CF.C.6 — non-string qty (number) → hidden (no parse)', () => {
    expect(isCourseUsableInTreatment({ qty: 5 })).toBe(false);
  });
  it('CF.C.7 — comma-formatted qty "7,998 / 10,000 Shot" → kept (remaining > 0)', () => {
    expect(isCourseUsableInTreatment({ qty: '7,998 / 10,000 Shot' })).toBe(true);
  });
  it('CF.C.8 — qty="0 / 10,000 Shot" (depleted with comma total) → hidden', () => {
    expect(isCourseUsableInTreatment({ qty: '0 / 10,000 Shot' })).toBe(false);
  });
  it('CF.C.9 — qty="บุฟเฟต์" string (no courseType) → kept', () => {
    expect(isCourseUsableInTreatment({ qty: 'บุฟเฟต์' })).toBe(true);
  });
});

describe('CF.D — combination cases', () => {
  it('CF.D.1 — special type wins over depleted qty', () => {
    expect(isCourseUsableInTreatment({ courseType: 'บุฟเฟต์', qty: '0 / 100 U' })).toBe(true);
  });
  it('CF.D.2 — non-special depleted course → hidden', () => {
    expect(isCourseUsableInTreatment({ courseType: '', qty: '0 / 50 ครั้ง' })).toBe(false);
  });
});

describe('CF.E — source-grep regression guards', () => {
  it('CF.E.1 — TreatmentFormPage imports isCourseUsableInTreatment', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    expect(src).toMatch(/isCourseUsableInTreatment/);
  });

  it('CF.E.2 — customerCourseGroups useMemo applies the filter', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // Filter MUST be applied before buildCustomerCourseGroups
    expect(src).toMatch(/\.filter\(isCourseUsableInTreatment\)/);
  });

  it('CF.E.3 — Phase 16.7-quinquies-ter marker present', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/treatmentBuyHelpers.js', 'utf-8');
    expect(src).toMatch(/Phase 16\.7-quinquies-ter/);
  });
});
