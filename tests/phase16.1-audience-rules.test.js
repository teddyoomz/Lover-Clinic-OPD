// Phase 16.1 (2026-04-30) — predicate evaluator unit tests for audienceRules.js
//
// Adversarial coverage of all 8 predicates × happy + boundary + adversarial +
// composition. Each predicate gets its own R-section.
//
//   R1. computeAgeYears + daysBetween + mostRecentSaleDate + sumNetTotal helpers
//   R2. evaluatePredicate — age-range
//   R3. evaluatePredicate — gender
//   R4. evaluatePredicate — branch
//   R5. evaluatePredicate — source
//   R6. evaluatePredicate — bought-x-in-last-n
//   R7. evaluatePredicate — spend-bracket
//   R8. evaluatePredicate — last-visit-days
//   R9. evaluatePredicate — has-unfinished-course
//   R10. evaluateGroup — AND / OR / nested / empty / mixed
//   R11. indexSalesByCustomer + evaluateRule orchestration
//   R12. PREDICATE_TYPES export

import { describe, test, expect } from 'vitest';
import {
  PREDICATE_TYPES,
  computeAgeYears,
  daysBetween,
  mostRecentSaleDate,
  sumNetTotal,
  evaluatePredicate,
  evaluateGroup,
  indexSalesByCustomer,
  evaluateRule,
} from '../src/lib/audienceRules.js';

const TODAY = new Date(Date.UTC(2026, 3, 30)); // 2026-04-30
const TODAY_MINUS_30 = new Date(Date.UTC(2026, 2, 31)); // 2026-03-31

// ─── R1 helpers ─────────────────────────────────────────────────────────────
describe('R1 helpers', () => {
  test('R1.1 computeAgeYears — birthday already passed this year', () => {
    expect(computeAgeYears('1990-01-15', TODAY)).toBe(36);
  });
  test('R1.2 computeAgeYears — birthday in the future this year', () => {
    expect(computeAgeYears('1990-12-15', TODAY)).toBe(35);
  });
  test('R1.3 computeAgeYears — birthday today', () => {
    expect(computeAgeYears('1990-04-30', TODAY)).toBe(36);
  });
  test('R1.4 computeAgeYears — invalid input returns NaN', () => {
    expect(Number.isNaN(computeAgeYears('', TODAY))).toBe(true);
    expect(Number.isNaN(computeAgeYears(null, TODAY))).toBe(true);
    expect(Number.isNaN(computeAgeYears('not-a-date', TODAY))).toBe(true);
    expect(Number.isNaN(computeAgeYears('1990-01-15', null))).toBe(true);
  });
  test('R1.5 daysBetween — exact 30 days back', () => {
    expect(daysBetween(TODAY, '2026-03-31')).toBe(30);
  });
  test('R1.6 daysBetween — same day', () => {
    expect(daysBetween(TODAY, '2026-04-30')).toBe(0);
  });
  test('R1.7 daysBetween — invalid date string', () => {
    expect(Number.isNaN(daysBetween(TODAY, ''))).toBe(true);
    expect(Number.isNaN(daysBetween(TODAY, 'no'))).toBe(true);
  });
  test('R1.8 mostRecentSaleDate — picks max non-cancelled', () => {
    const sales = [
      { saleDate: '2026-01-05', status: 'completed' },
      { saleDate: '2026-04-25', status: 'cancelled' },
      { saleDate: '2026-04-20', status: 'completed' },
      { saleDate: '2026-03-10', status: 'refunded' },
    ];
    expect(mostRecentSaleDate(sales)).toBe('2026-04-20');
  });
  test('R1.9 mostRecentSaleDate — empty list returns ""', () => {
    expect(mostRecentSaleDate([])).toBe('');
    expect(mostRecentSaleDate(null)).toBe('');
  });
  test('R1.10 sumNetTotal — billing.netTotal preferred', () => {
    const sales = [
      { status: 'completed', billing: { netTotal: 1000 } },
      { status: 'completed', billing: { netTotal: 2000 } },
      { status: 'cancelled', billing: { netTotal: 5000 } },  // excluded
    ];
    expect(sumNetTotal(sales)).toBe(3000);
  });
  test('R1.11 sumNetTotal — falls back to s.netTotal then s.total', () => {
    const sales = [
      { status: 'completed', netTotal: 500 },
      { status: 'completed', total: 750 },
    ];
    expect(sumNetTotal(sales)).toBe(1250);
  });
  test('R1.12 sumNetTotal — null/undefined safe', () => {
    expect(sumNetTotal(null)).toBe(0);
    expect(sumNetTotal([])).toBe(0);
    expect(sumNetTotal([null, undefined])).toBe(0);
  });
});

// ─── R2 age-range ───────────────────────────────────────────────────────────
describe('R2 age-range', () => {
  const c = { id: 'a', birthdate: '1980-01-01' }; // 46 on TODAY
  test('R2.1 happy — within 30-50', () => {
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'age-range', params: { min: 30, max: 50 } }, TODAY)).toBe(true);
  });
  test('R2.2 boundary min=46', () => {
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'age-range', params: { min: 46, max: 50 } }, TODAY)).toBe(true);
  });
  test('R2.3 boundary max=46', () => {
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'age-range', params: { min: 30, max: 46 } }, TODAY)).toBe(true);
  });
  test('R2.4 below min', () => {
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'age-range', params: { min: 50, max: 60 } }, TODAY)).toBe(false);
  });
  test('R2.5 above max', () => {
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'age-range', params: { min: 20, max: 30 } }, TODAY)).toBe(false);
  });
  test('R2.6 only min — open-ended max', () => {
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'age-range', params: { min: 30, max: null } }, TODAY)).toBe(true);
  });
  test('R2.7 only max — open-ended min', () => {
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'age-range', params: { min: null, max: 50 } }, TODAY)).toBe(true);
  });
  test('R2.8 missing birthdate returns false', () => {
    expect(evaluatePredicate({ id: 'a' }, [], { kind: 'predicate', type: 'age-range', params: { min: 0, max: 200 } }, TODAY)).toBe(false);
  });
});

// ─── R3 gender ──────────────────────────────────────────────────────────────
describe('R3 gender', () => {
  test('R3.1 F matches F', () => {
    expect(evaluatePredicate({ gender: 'F' }, [], { kind: 'predicate', type: 'gender', params: { value: 'F' } }, TODAY)).toBe(true);
  });
  test('R3.2 M matches M', () => {
    expect(evaluatePredicate({ gender: 'M' }, [], { kind: 'predicate', type: 'gender', params: { value: 'M' } }, TODAY)).toBe(true);
  });
  test('R3.3 lowercase customer.gender normalised', () => {
    expect(evaluatePredicate({ gender: 'f' }, [], { kind: 'predicate', type: 'gender', params: { value: 'F' } }, TODAY)).toBe(true);
  });
  test('R3.4 wrong gender no match', () => {
    expect(evaluatePredicate({ gender: 'M' }, [], { kind: 'predicate', type: 'gender', params: { value: 'F' } }, TODAY)).toBe(false);
  });
  test('R3.5 invalid params.value returns false', () => {
    expect(evaluatePredicate({ gender: 'F' }, [], { kind: 'predicate', type: 'gender', params: { value: 'X' } }, TODAY)).toBe(false);
  });
  test('R3.6 missing customer.gender returns false', () => {
    expect(evaluatePredicate({}, [], { kind: 'predicate', type: 'gender', params: { value: 'F' } }, TODAY)).toBe(false);
  });
});

// ─── R4 branch ──────────────────────────────────────────────────────────────
describe('R4 branch', () => {
  test('R4.1 single match', () => {
    expect(evaluatePredicate({ branchId: 'BR-A' }, [], { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } }, TODAY)).toBe(true);
  });
  test('R4.2 multi match', () => {
    expect(evaluatePredicate({ branchId: 'BR-B' }, [], { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A', 'BR-B'] } }, TODAY)).toBe(true);
  });
  test('R4.3 no match', () => {
    expect(evaluatePredicate({ branchId: 'BR-C' }, [], { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } }, TODAY)).toBe(false);
  });
  test('R4.4 empty list returns false', () => {
    expect(evaluatePredicate({ branchId: 'BR-A' }, [], { kind: 'predicate', type: 'branch', params: { branchIds: [] } }, TODAY)).toBe(false);
  });
  test('R4.5 legacy patientData.branch fallback', () => {
    expect(evaluatePredicate({ patientData: { branch: 'BR-A' } }, [], { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } }, TODAY)).toBe(true);
  });
  test('R4.6 missing customer branch returns false', () => {
    expect(evaluatePredicate({}, [], { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } }, TODAY)).toBe(false);
  });
});

// ─── R5 source ──────────────────────────────────────────────────────────────
describe('R5 source', () => {
  test('R5.1 single value match', () => {
    expect(evaluatePredicate({ source: 'Facebook' }, [], { kind: 'predicate', type: 'source', params: { values: ['Facebook'] } }, TODAY)).toBe(true);
  });
  test('R5.2 multi value match', () => {
    expect(evaluatePredicate({ source: 'LINE' }, [], { kind: 'predicate', type: 'source', params: { values: ['Facebook', 'LINE'] } }, TODAY)).toBe(true);
  });
  test('R5.3 case-sensitive miss', () => {
    expect(evaluatePredicate({ source: 'facebook' }, [], { kind: 'predicate', type: 'source', params: { values: ['Facebook'] } }, TODAY)).toBe(false);
  });
  test('R5.4 empty list returns false', () => {
    expect(evaluatePredicate({ source: 'Facebook' }, [], { kind: 'predicate', type: 'source', params: { values: [] } }, TODAY)).toBe(false);
  });
  test('R5.5 missing customer.source returns false', () => {
    expect(evaluatePredicate({}, [], { kind: 'predicate', type: 'source', params: { values: ['Facebook'] } }, TODAY)).toBe(false);
  });
});

// ─── R6 bought-x-in-last-n ──────────────────────────────────────────────────
describe('R6 bought-x-in-last-n', () => {
  const sales = [
    { saleDate: '2026-01-15', status: 'completed', items: [{ productId: 'P-1', qty: 2 }] },
    { saleDate: '2026-04-25', status: 'completed', items: [{ productId: 'P-2', qty: 1 }, { courseId: 'C-1', qty: 1 }] },
    { saleDate: '2025-12-10', status: 'completed', items: [{ productId: 'P-1', qty: 5 }] },
    { saleDate: '2026-04-29', status: 'cancelled', items: [{ productId: 'P-1', qty: 1 }] },
  ];
  test('R6.1 product in last 6 months', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-1', months: 6 } }, TODAY)).toBe(true);
  });
  test('R6.2 course in last 6 months', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'course', refId: 'C-1', months: 6 } }, TODAY)).toBe(true);
  });
  test('R6.3 product NOT bought', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-NOT-EXIST', months: 6 } }, TODAY)).toBe(false);
  });
  test('R6.4 product outside window (too old)', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-1', months: 1 } }, TODAY)).toBe(false);
  });
  test('R6.5 cancelled sale excluded', () => {
    const onlyCancelled = [{ saleDate: '2026-04-29', status: 'cancelled', items: [{ productId: 'P-X', qty: 1 }] }];
    expect(evaluatePredicate({ id: 'a' }, onlyCancelled, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-X', months: 6 } }, TODAY)).toBe(false);
  });
  test('R6.6 missing refId returns false', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: '', months: 6 } }, TODAY)).toBe(false);
  });
  test('R6.7 invalid months returns false', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-1', months: -1 } }, TODAY)).toBe(false);
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-1', months: 0 } }, TODAY)).toBe(false);
  });
  test('R6.8 default kind=product when invalid', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'unknown', refId: 'P-1', months: 6 } }, TODAY)).toBe(true);
  });
  test('R6.9 snake_case product_id supported', () => {
    const snakeSales = [{ saleDate: '2026-04-25', status: 'completed', items: [{ product_id: 'P-9', qty: 1 }] }];
    expect(evaluatePredicate({ id: 'a' }, snakeSales, { kind: 'predicate', type: 'bought-x-in-last-n', params: { kind: 'product', refId: 'P-9', months: 6 } }, TODAY)).toBe(true);
  });
});

// ─── R7 spend-bracket ───────────────────────────────────────────────────────
describe('R7 spend-bracket', () => {
  const sales = [
    { status: 'completed', billing: { netTotal: 5000 } },
    { status: 'completed', billing: { netTotal: 3000 } },
    { status: 'cancelled', billing: { netTotal: 10000 } },  // excluded
  ];
  test('R7.1 within range', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'spend-bracket', params: { min: 5000, max: 10000 } }, TODAY)).toBe(true);
  });
  test('R7.2 below min', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'spend-bracket', params: { min: 9000, max: 100000 } }, TODAY)).toBe(false);
  });
  test('R7.3 above max', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'spend-bracket', params: { min: 0, max: 5000 } }, TODAY)).toBe(false);
  });
  test('R7.4 only min', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'spend-bracket', params: { min: 1000, max: null } }, TODAY)).toBe(true);
  });
  test('R7.5 only max', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'spend-bracket', params: { min: null, max: 10000 } }, TODAY)).toBe(true);
  });
  test('R7.6 zero spend, range starts at 0', () => {
    expect(evaluatePredicate({ id: 'a' }, [], { kind: 'predicate', type: 'spend-bracket', params: { min: 0, max: 100 } }, TODAY)).toBe(true);
  });
});

// ─── R8 last-visit-days ─────────────────────────────────────────────────────
describe('R8 last-visit-days', () => {
  const sales = [{ saleDate: '2026-03-31', status: 'completed' }];  // 30 days ago
  test('R8.1 <= 30 matches 30 ago', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'last-visit-days', params: { op: '<=', days: 30 } }, TODAY)).toBe(true);
  });
  test('R8.2 <= 29 fails 30 ago', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'last-visit-days', params: { op: '<=', days: 29 } }, TODAY)).toBe(false);
  });
  test('R8.3 >= 30 matches 30 ago', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'last-visit-days', params: { op: '>=', days: 30 } }, TODAY)).toBe(true);
  });
  test('R8.4 >= 31 fails 30 ago', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'last-visit-days', params: { op: '>=', days: 31 } }, TODAY)).toBe(false);
  });
  test('R8.5 never visited + op>= matches', () => {
    expect(evaluatePredicate({ id: 'a' }, [], { kind: 'predicate', type: 'last-visit-days', params: { op: '>=', days: 90 } }, TODAY)).toBe(true);
  });
  test('R8.6 never visited + op<= fails', () => {
    expect(evaluatePredicate({ id: 'a' }, [], { kind: 'predicate', type: 'last-visit-days', params: { op: '<=', days: 90 } }, TODAY)).toBe(false);
  });
  test('R8.7 invalid op returns false', () => {
    expect(evaluatePredicate({ id: 'a' }, sales, { kind: 'predicate', type: 'last-visit-days', params: { op: '!=', days: 30 } }, TODAY)).toBe(false);
  });
  test('R8.8 cancelled sales ignored, last good wins', () => {
    const mix = [
      { saleDate: '2026-04-29', status: 'cancelled' },
      { saleDate: '2026-03-31', status: 'completed' },
    ];
    expect(evaluatePredicate({ id: 'a' }, mix, { kind: 'predicate', type: 'last-visit-days', params: { op: '<=', days: 30 } }, TODAY)).toBe(true);
  });
});

// ─── R9 has-unfinished-course ──────────────────────────────────────────────
describe('R9 has-unfinished-course', () => {
  const customerWithOpen = {
    id: 'a',
    courses: [
      { name: 'A', qty: '5/10', status: 'ใช้งาน' },
      { name: 'B', qty: '0/3', status: 'ใช้หมดแล้ว' },
    ],
  };
  const customerWithNoneOpen = {
    id: 'b',
    courses: [
      { name: 'X', qty: '0/5', status: 'ใช้งาน' },
      { name: 'Y', qty: '3/3', status: 'ยกเลิก' },
    ],
  };
  test('R9.1 value=true matches when open course exists', () => {
    expect(evaluatePredicate(customerWithOpen, [], { kind: 'predicate', type: 'has-unfinished-course', params: { value: true } }, TODAY)).toBe(true);
  });
  test('R9.2 value=false fails when open course exists', () => {
    expect(evaluatePredicate(customerWithOpen, [], { kind: 'predicate', type: 'has-unfinished-course', params: { value: false } }, TODAY)).toBe(false);
  });
  test('R9.3 value=true fails when no open courses', () => {
    expect(evaluatePredicate(customerWithNoneOpen, [], { kind: 'predicate', type: 'has-unfinished-course', params: { value: true } }, TODAY)).toBe(false);
  });
  test('R9.4 value=false matches when no open courses', () => {
    expect(evaluatePredicate(customerWithNoneOpen, [], { kind: 'predicate', type: 'has-unfinished-course', params: { value: false } }, TODAY)).toBe(true);
  });
  test('R9.5 cancelled-status courses ignored', () => {
    const c = { id: 'c', courses: [{ name: 'Z', qty: '5/5', status: 'ยกเลิก' }] };
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'has-unfinished-course', params: { value: true } }, TODAY)).toBe(false);
  });
  test('R9.6 refund-status courses ignored', () => {
    const c = { id: 'c', courses: [{ name: 'Z', qty: '5/5', status: 'คืนเงิน' }] };
    expect(evaluatePredicate(c, [], { kind: 'predicate', type: 'has-unfinished-course', params: { value: true } }, TODAY)).toBe(false);
  });
  test('R9.7 missing courses array — value=false matches', () => {
    expect(evaluatePredicate({ id: 'a' }, [], { kind: 'predicate', type: 'has-unfinished-course', params: { value: false } }, TODAY)).toBe(true);
  });
});

// ─── R10 evaluateGroup ─────────────────────────────────────────────────────
describe('R10 evaluateGroup', () => {
  const c = { id: 'a', gender: 'F', branchId: 'BR-A', birthdate: '1980-01-01' };
  test('R10.1 AND with all true', () => {
    const group = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'F' } },
        { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } },
      ],
    };
    expect(evaluateGroup(c, [], group, TODAY)).toBe(true);
  });
  test('R10.2 AND with one false', () => {
    const group = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'F' } },
        { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-Z'] } },
      ],
    };
    expect(evaluateGroup(c, [], group, TODAY)).toBe(false);
  });
  test('R10.3 OR with one true', () => {
    const group = {
      kind: 'group',
      op: 'OR',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'M' } },
        { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-A'] } },
      ],
    };
    expect(evaluateGroup(c, [], group, TODAY)).toBe(true);
  });
  test('R10.4 OR with all false', () => {
    const group = {
      kind: 'group',
      op: 'OR',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'M' } },
        { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-Z'] } },
      ],
    };
    expect(evaluateGroup(c, [], group, TODAY)).toBe(false);
  });
  test('R10.5 nested groups (AND of OR)', () => {
    const group = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'F' } },
        {
          kind: 'group',
          op: 'OR',
          children: [
            { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-Z'] } },
            { kind: 'predicate', type: 'age-range', params: { min: 30, max: 60 } },
          ],
        },
      ],
    };
    expect(evaluateGroup(c, [], group, TODAY)).toBe(true);
  });
  test('R10.6 empty group returns true (vacuous)', () => {
    expect(evaluateGroup(c, [], { kind: 'group', op: 'AND', children: [] }, TODAY)).toBe(true);
  });
  test('R10.7 invalid group returns false', () => {
    expect(evaluateGroup(c, [], null, TODAY)).toBe(false);
    expect(evaluateGroup(c, [], { kind: 'predicate' }, TODAY)).toBe(false);
  });
  test('R10.8 default op falls back to AND when invalid', () => {
    const group = {
      kind: 'group',
      op: 'XOR',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'F' } },
        { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-Z'] } },
      ],
    };
    // AND fallback: gender=F true, branch BR-Z false → AND=false
    expect(evaluateGroup(c, [], group, TODAY)).toBe(false);
  });
  test('R10.9 deeply nested 3-level', () => {
    const group = {
      kind: 'group',
      op: 'OR',
      children: [
        {
          kind: 'group',
          op: 'AND',
          children: [
            { kind: 'predicate', type: 'gender', params: { value: 'M' } },
            {
              kind: 'group',
              op: 'OR',
              children: [
                { kind: 'predicate', type: 'branch', params: { branchIds: ['BR-Z'] } },
              ],
            },
          ],
        },
        { kind: 'predicate', type: 'gender', params: { value: 'F' } },
      ],
    };
    expect(evaluateGroup(c, [], group, TODAY)).toBe(true); // outer-OR catches gender=F
  });
});

// ─── R11 evaluateRule + indexSalesByCustomer ───────────────────────────────
describe('R11 evaluateRule + indexSalesByCustomer', () => {
  const customers = [
    { id: 'a', gender: 'F', birthdate: '1980-01-01', branchId: 'BR-A' },
    { id: 'b', gender: 'M', birthdate: '1990-01-01', branchId: 'BR-A' },
    { id: 'c', gender: 'F', birthdate: '2000-01-01', branchId: 'BR-B' },
  ];
  const sales = [
    { customerId: 'a', saleDate: '2026-04-15', status: 'completed', billing: { netTotal: 8000 } },
    { customerId: 'a', saleDate: '2026-04-20', status: 'completed', billing: { netTotal: 4000 } },
    { customerId: 'b', saleDate: '2026-03-15', status: 'completed', billing: { netTotal: 1000 } },
    { customerId: 'c', saleDate: '2026-04-29', status: 'completed', billing: { netTotal: 6000 } },
  ];
  test('R11.1 indexSalesByCustomer groups correctly', () => {
    const idx = indexSalesByCustomer(sales);
    expect(idx.size).toBe(3);
    expect(idx.get('a').length).toBe(2);
    expect(idx.get('b').length).toBe(1);
    expect(idx.get('c').length).toBe(1);
  });
  test('R11.2 evaluateRule — F gender', () => {
    const rule = { kind: 'group', op: 'AND', children: [{ kind: 'predicate', type: 'gender', params: { value: 'F' } }] };
    const idx = indexSalesByCustomer(sales);
    const result = evaluateRule(customers, idx, rule, TODAY);
    expect(result.matchedIds.sort()).toEqual(['a', 'c']);
    expect(result.total).toBe(2);
  });
  test('R11.3 evaluateRule — F AND spend>5000', () => {
    const rule = {
      kind: 'group',
      op: 'AND',
      children: [
        { kind: 'predicate', type: 'gender', params: { value: 'F' } },
        { kind: 'predicate', type: 'spend-bracket', params: { min: 5000, max: null } },
      ],
    };
    const idx = indexSalesByCustomer(sales);
    const result = evaluateRule(customers, idx, rule, TODAY);
    // a has 12000, c has 6000 → both qualify
    expect(result.matchedIds.sort()).toEqual(['a', 'c']);
    expect(result.total).toBe(2);
  });
  test('R11.4 evaluateRule — empty customers', () => {
    const rule = { kind: 'group', op: 'AND', children: [] };
    const result = evaluateRule([], new Map(), rule, TODAY);
    expect(result.matchedIds).toEqual([]);
    expect(result.total).toBe(0);
  });
  test('R11.5 evaluateRule — null customers safe', () => {
    const result = evaluateRule(null, new Map(), { kind: 'group', op: 'AND', children: [] }, TODAY);
    expect(result.total).toBe(0);
  });
  test('R11.6 evaluateRule — accepts plain object salesByCustomer', () => {
    const rule = { kind: 'group', op: 'AND', children: [{ kind: 'predicate', type: 'gender', params: { value: 'F' } }] };
    const obj = { a: sales.slice(0, 2), b: sales.slice(2, 3), c: sales.slice(3) };
    const result = evaluateRule(customers, obj, rule, TODAY);
    expect(result.matchedIds.sort()).toEqual(['a', 'c']);
  });
  test('R11.7 evaluateRule — defaults to bangkokNow when today omitted', () => {
    const rule = { kind: 'group', op: 'AND', children: [] };
    const result = evaluateRule([{ id: 'x' }], new Map(), rule);
    expect(result.matchedIds).toEqual(['x']);
  });
  test('R11.8 evaluateRule — sorted ASC matchedIds', () => {
    const rule = { kind: 'group', op: 'AND', children: [] };
    const cs = [{ id: 'z' }, { id: 'a' }, { id: 'm' }];
    const result = evaluateRule(cs, new Map(), rule, TODAY);
    expect(result.matchedIds).toEqual(['a', 'm', 'z']);
  });
});

// ─── R12 PREDICATE_TYPES export ────────────────────────────────────────────
describe('R12 PREDICATE_TYPES', () => {
  test('R12.1 exports 8 frozen types', () => {
    expect(Array.isArray(PREDICATE_TYPES)).toBe(true);
    expect(PREDICATE_TYPES.length).toBe(8);
    expect(Object.isFrozen(PREDICATE_TYPES)).toBe(true);
  });
  test('R12.2 includes all 8 expected names', () => {
    expect(PREDICATE_TYPES).toEqual([
      'age-range', 'gender', 'branch', 'source',
      'bought-x-in-last-n', 'spend-bracket', 'last-visit-days', 'has-unfinished-course',
    ]);
  });
  test('R12.3 unknown predicate type returns false', () => {
    expect(evaluatePredicate({ id: 'a' }, [], { kind: 'predicate', type: 'unknown-type', params: {} }, TODAY)).toBe(false);
  });
  test('R12.4 missing predicate.kind returns false', () => {
    expect(evaluatePredicate({ id: 'a' }, [], { type: 'gender', params: { value: 'F' } }, TODAY)).toBe(false);
  });
  test('R12.5 null predicate returns false', () => {
    expect(evaluatePredicate({ id: 'a' }, [], null, TODAY)).toBe(false);
  });
});
