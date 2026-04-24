// ─── Phase 13.3.1 · DF group + staff-rate validator + resolver tests ─────
import { describe, it, expect } from 'vitest';
import {
  validateDfGroupStrict, normalizeDfGroup, emptyDfGroupForm, generateDfGroupId,
  validateDfStaffRatesStrict, normalizeDfStaffRates, emptyDfStaffRatesForm,
  getRateForStaffCourse, computeDfAmount, computeCourseUsageWeight,
  STATUS_OPTIONS, RATE_TYPES, RATE_TYPE_LABEL,
} from '../src/lib/dfGroupValidation.js';

const baseG = (over = {}) => ({ ...emptyDfGroupForm(), name: 'Group A', ...over });

describe('validateDfGroupStrict — group shape', () => {
  it('DFGV1: null/array rejected', () => {
    expect(validateDfGroupStrict(null)?.[0]).toBe('form');
    expect(validateDfGroupStrict([])?.[0]).toBe('form');
  });
  it('DFGV2: missing name rejected', () => {
    expect(validateDfGroupStrict({ ...baseG(), name: '' })?.[0]).toBe('name');
  });
  it('DFGV3: whitespace-only name rejected', () => {
    expect(validateDfGroupStrict({ ...baseG(), name: '   ' })?.[0]).toBe('name');
  });
  it('DFGV4: invalid status rejected', () => {
    expect(validateDfGroupStrict({ ...baseG(), status: 'weird' })?.[0]).toBe('status');
  });
  it('DFGV5: all STATUS_OPTIONS accepted', () => {
    for (const s of STATUS_OPTIONS) expect(validateDfGroupStrict({ ...baseG(), status: s })).toBeNull();
  });
  it('DFGV6: empty rates accepted', () => {
    expect(validateDfGroupStrict({ ...baseG(), rates: [] })).toBeNull();
  });
  it('DFGV7: missing rates field accepted', () => {
    expect(validateDfGroupStrict({ ...baseG() })).toBeNull();
  });
  it('DFGV8: rates not an array rejected', () => {
    expect(validateDfGroupStrict({ ...baseG(), rates: 'bogus' })?.[0]).toBe('rates');
  });
});

describe('validateDfGroupStrict — per-rate rules (DFG-3..DFG-5)', () => {
  it('DFGV9: rate missing courseId rejected', () => {
    expect(validateDfGroupStrict({ ...baseG(), rates: [{ value: 100, type: 'baht' }] })?.[0]).toBe('rates');
  });
  it('DFGV10: negative value rejected', () => {
    expect(validateDfGroupStrict({
      ...baseG(), rates: [{ courseId: 'C1', value: -1, type: 'baht' }],
    })?.[0]).toBe('rates');
  });
  it('DFGV11: invalid type rejected', () => {
    expect(validateDfGroupStrict({
      ...baseG(), rates: [{ courseId: 'C1', value: 10, type: 'weird' }],
    })?.[0]).toBe('rates');
  });
  it('DFGV12: percent > 100 rejected', () => {
    expect(validateDfGroupStrict({
      ...baseG(), rates: [{ courseId: 'C1', value: 101, type: 'percent' }],
    })?.[0]).toBe('rates');
  });
  it('DFGV13: percent exactly 100 accepted', () => {
    expect(validateDfGroupStrict({
      ...baseG(), rates: [{ courseId: 'C1', value: 100, type: 'percent' }],
    })).toBeNull();
  });
  it('DFGV14: duplicate courseId rejected (DFG-4)', () => {
    expect(validateDfGroupStrict({
      ...baseG(), rates: [
        { courseId: 'C1', value: 10, type: 'baht' },
        { courseId: 'C1', value: 20, type: 'baht' },
      ],
    })?.[0]).toBe('rates');
  });
  it('DFGV15: mixed types accepted', () => {
    expect(validateDfGroupStrict({
      ...baseG(), rates: [
        { courseId: 'C1', value: 30, type: 'percent' },
        { courseId: 'C2', value: 500, type: 'baht' },
      ],
    })).toBeNull();
  });
});

describe('validateDfGroupStrict — id format (DFG-6)', () => {
  it('DFGV16: malformed id rejected', () => {
    expect(validateDfGroupStrict({ ...baseG(), id: 'bad' })?.[0]).toBe('id');
  });
  it('DFGV17: valid DFG id accepted', () => {
    expect(validateDfGroupStrict({ ...baseG(), id: 'DFG-0426-deadbeef' })).toBeNull();
  });
});

describe('normalizeDfGroup', () => {
  it('DFGV18: trims strings + default status', () => {
    const n = normalizeDfGroup({ name: '  X  ', note: '  n  ' });
    expect(n.name).toBe('X');
    expect(n.note).toBe('n');
    expect(n.status).toBe('active');
  });
  it('DFGV19: invalid status falls back', () => {
    expect(normalizeDfGroup({ status: 'bogus' }).status).toBe('active');
  });
  it('DFGV20: rate snake_case coerced + invalid type defaults to baht', () => {
    const n = normalizeDfGroup({
      rates: [{ course_id: 'C1', value: 10, type: 'percent' },
              { course_id: 'C2', value: 20, type: 'weird' }],
    });
    expect(n.rates[0].courseId).toBe('C1');
    expect(n.rates[0].type).toBe('percent');
    expect(n.rates[1].type).toBe('baht');
  });
  it('DFGV21: rates without courseId filtered out', () => {
    const n = normalizeDfGroup({ rates: [{ value: 1 }, { courseId: 'C1', value: 1, type: 'baht' }] });
    expect(n.rates.length).toBe(1);
  });
});

describe('generateDfGroupId', () => {
  it('DFGV22: format DFG-MMYY-8hex', () => {
    const id = generateDfGroupId(Date.UTC(2026, 3, 24, 12));
    expect(id).toMatch(/^DFG-0426-[0-9a-f]{8}$/);
  });
  it('DFGV23: 100 ids unique', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateDfGroupId());
    expect(ids.size).toBe(100);
  });
});

describe('validateDfStaffRatesStrict', () => {
  it('DSR1: missing staffId rejected', () => {
    expect(validateDfStaffRatesStrict({ ...emptyDfStaffRatesForm() })?.[0]).toBe('staffId');
  });
  it('DSR2: valid with empty rates accepted', () => {
    expect(validateDfStaffRatesStrict({ staffId: 'S1', rates: [] })).toBeNull();
  });
  it('DSR3: duplicate courseId rejected', () => {
    expect(validateDfStaffRatesStrict({
      staffId: 'S1', rates: [
        { courseId: 'C1', value: 10, type: 'baht' },
        { courseId: 'C1', value: 20, type: 'baht' },
      ],
    })?.[0]).toBe('rates');
  });
  it('DSR4: percent > 100 rejected', () => {
    expect(validateDfStaffRatesStrict({
      staffId: 'S1', rates: [{ courseId: 'C1', value: 150, type: 'percent' }],
    })?.[0]).toBe('rates');
  });
  it('DSR5: negative value rejected', () => {
    expect(validateDfStaffRatesStrict({
      staffId: 'S1', rates: [{ courseId: 'C1', value: -1, type: 'baht' }],
    })?.[0]).toBe('rates');
  });
  it('DSR6: valid multi-rate accepted', () => {
    expect(validateDfStaffRatesStrict({
      staffId: 'S1', rates: [
        { courseId: 'C1', value: 20, type: 'percent' },
        { courseId: 'C2', value: 500, type: 'baht' },
      ],
    })).toBeNull();
  });
});

describe('getRateForStaffCourse — resolver', () => {
  const groups = [
    { id: 'DFG-1', rates: [{ courseId: 'C1', value: 20, type: 'percent' }] },
    { id: 'DFG-2', rates: [{ courseId: 'C1', value: 300, type: 'baht' }] },
  ];
  const staffRates = [
    { staffId: 'S1', rates: [{ courseId: 'C1', value: 500, type: 'baht' }] },
  ];

  it('R1: staff override wins', () => {
    const r = getRateForStaffCourse('S1', 'C1', 'DFG-1', groups, staffRates);
    expect(r).toEqual({ value: 500, type: 'baht', source: 'staff' });
  });
  it('R2: fallback to group when no staff override', () => {
    const r = getRateForStaffCourse('S2', 'C1', 'DFG-1', groups, staffRates);
    expect(r).toEqual({ value: 20, type: 'percent', source: 'group' });
  });
  it('R3: null when staff has override but for a different course', () => {
    const r = getRateForStaffCourse('S1', 'C-other', 'DFG-1', groups, staffRates);
    expect(r).toBeNull();
  });
  it('R4: null when no dfGroupId and no staff override', () => {
    expect(getRateForStaffCourse('S2', 'C1', '', groups, staffRates)).toBeNull();
  });
  it('R5: null when group unknown', () => {
    expect(getRateForStaffCourse('S2', 'C1', 'DFG-XXX', groups, staffRates)).toBeNull();
  });
  it('R6: null with empty args', () => {
    expect(getRateForStaffCourse('', 'C1', 'DFG-1', groups, staffRates)).toBeNull();
    expect(getRateForStaffCourse('S1', '', 'DFG-1', groups, staffRates)).toBeNull();
  });
});

describe('computeDfAmount', () => {
  it('C1: null rate → 0', () => {
    expect(computeDfAmount(null, 1000, 1)).toBe(0);
  });
  it('C2: percent rate 20% on 1000 subtotal → 200', () => {
    expect(computeDfAmount({ value: 20, type: 'percent' }, 1000, 1)).toBe(200);
  });
  it('C3: baht 500 × qty 2 → 1000', () => {
    expect(computeDfAmount({ value: 500, type: 'baht' }, 9999, 2)).toBe(1000);
  });
  it('C4: unknown type → 0', () => {
    expect(computeDfAmount({ value: 100, type: 'bogus' }, 1000, 1)).toBe(0);
  });
  it('C5: negative subtotal clamped to 0', () => {
    expect(computeDfAmount({ value: 10, type: 'percent' }, -1000, 1)).toBe(0);
  });

  // Phase 12.2b follow-up (2026-04-24): courseUsageWeight — percent DF
  // scales proportionally to course usage this treatment.
  it('C6: percent × courseUsageWeight=1 → full DF (backward compat default)', () => {
    expect(computeDfAmount({ value: 10, type: 'percent' }, 50000, 1, { courseUsageWeight: 1 })).toBe(5000);
    // Default opts → same
    expect(computeDfAmount({ value: 10, type: 'percent' }, 50000, 1)).toBe(5000);
  });
  it('C7: percent × courseUsageWeight=0.25 → quarter DF', () => {
    expect(computeDfAmount({ value: 10, type: 'percent' }, 50000, 1, { courseUsageWeight: 0.25 })).toBe(1250);
  });
  it('C8: percent × courseUsageWeight=0 → 0 (visit used nothing from course)', () => {
    expect(computeDfAmount({ value: 10, type: 'percent' }, 50000, 1, { courseUsageWeight: 0 })).toBe(0);
  });
  it('C9: baht rate IGNORES courseUsageWeight (qty-scaled already)', () => {
    // baht 500 × qty 2 = 1000 regardless of weight
    expect(computeDfAmount({ value: 500, type: 'baht' }, 9999, 2, { courseUsageWeight: 0.25 })).toBe(1000);
  });
  it('C10: courseUsageWeight clamped to [0,1] defensively', () => {
    // Floating-point rounding might give 1.0000001
    expect(computeDfAmount({ value: 10, type: 'percent' }, 100, 1, { courseUsageWeight: 1.5 })).toBe(10);
    // Negative weight clamps to 0
    expect(computeDfAmount({ value: 10, type: 'percent' }, 100, 1, { courseUsageWeight: -0.5 })).toBe(0);
  });
  it('C11: non-finite courseUsageWeight (NaN) falls back to 1', () => {
    expect(computeDfAmount({ value: 10, type: 'percent' }, 100, 1, { courseUsageWeight: NaN })).toBe(10);
  });
});

describe('computeCourseUsageWeight — Phase 12.2b partial-usage formula', () => {
  // User spec: weight = average(qty_used / qty_total) across course products.
  // Sum over all treatments fully using the course = 1 (= full DF preserved).

  const course = {
    name: 'Premium Combo',
    qty: 1,
    price: 50000,
    products: [
      { id: 'P-BOTOX', name: 'Botox 100u', qty: 100, unit: 'U' },
      { id: 'P-FILLER', name: 'Filler 1cc', qty: 1, unit: 'cc' },
    ],
  };

  it('CUW1: no treatment items → 0 (visit didn\'t touch this course)', () => {
    expect(computeCourseUsageWeight(course, [])).toBe(0);
  });

  it('CUW2: using 50% of one product only → weight = 0.25 (avg over 2 products)', () => {
    const items = [
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
    ];
    expect(computeCourseUsageWeight(course, items)).toBe(0.25);
  });

  it('CUW3: using 100% of BOTH products → weight = 1.0 (fully consumed)', () => {
    const items = [
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 100 },
      { courseName: 'Premium Combo', productName: 'Filler 1cc', deductQty: 1 },
    ];
    expect(computeCourseUsageWeight(course, items)).toBe(1);
  });

  it('CUW4: using 50% Botox + 100% Filler → weight = (0.5 + 1) / 2 = 0.75', () => {
    const items = [
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
      { courseName: 'Premium Combo', productName: 'Filler 1cc', deductQty: 1 },
    ];
    expect(computeCourseUsageWeight(course, items)).toBe(0.75);
  });

  it('CUW5: sum of two complementary partial visits = 1 (DF invariant: full DF preserved)', () => {
    // Visit 1: 50u Botox + 0 Filler → 0.25 weight
    const visit1 = [{ courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 }];
    // Visit 2: 50u Botox + 1cc Filler → 0.75 weight
    const visit2 = [
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
      { courseName: 'Premium Combo', productName: 'Filler 1cc', deductQty: 1 },
    ];
    const w1 = computeCourseUsageWeight(course, visit1);
    const w2 = computeCourseUsageWeight(course, visit2);
    expect(w1 + w2).toBe(1);
    // And the DF math: w1 + w2 = 1 → 5000 × 1 = 5000 full DF across both visits
    expect((50000 * 0.10 * w1) + (50000 * 0.10 * w2)).toBe(5000);
  });

  it('CUW6: over-usage clamped (50/1 cap at 1, not 50)', () => {
    const items = [
      { courseName: 'Premium Combo', productName: 'Filler 1cc', deductQty: 50 }, // 50× total
    ];
    // Filler ratio clamped to 1, Botox 0 → avg (1 + 0) / 2 = 0.5
    expect(computeCourseUsageWeight(course, items)).toBe(0.5);
  });

  it('CUW7: treatment items for OTHER courses are ignored when courseName set', () => {
    const items = [
      { courseName: 'OTHER', productName: 'Botox 100u', deductQty: 100 }, // different course
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 50 },
    ];
    expect(computeCourseUsageWeight(course, items)).toBe(0.25);
  });

  it('CUW8: empty products[] → 1 (backward compat: unknown structure = full DF)', () => {
    const courseNoProducts = { name: 'Old', price: 1000 };
    const items = [{ courseName: 'Old', productName: 'X', deductQty: 5 }];
    expect(computeCourseUsageWeight(courseNoProducts, items)).toBe(1);
  });

  it('CUW9: all products have total qty 0 → 1 (degenerate fallback)', () => {
    const courseZero = {
      name: 'Zero', products: [{ id: 'P1', name: 'X', qty: 0, unit: 'U' }],
    };
    const items = [{ courseName: 'Zero', productName: 'X', deductQty: 5 }];
    expect(computeCourseUsageWeight(courseZero, items)).toBe(1);
  });

  it('CUW10: null / undefined saleCourseItem → 1 (safe fallback)', () => {
    expect(computeCourseUsageWeight(null, [])).toBe(1);
    expect(computeCourseUsageWeight(undefined, [])).toBe(1);
  });

  it('CUW11: product not in treatment items contributes 0 to average', () => {
    // Visit used ONLY Botox, not Filler — ratio 1.0 + 0 = 0.5 avg
    const items = [
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 100 },
    ];
    expect(computeCourseUsageWeight(course, items)).toBe(0.5);
  });

  it('CUW12: multiple usages same product (e.g. two deductions of Botox) sum before ratio', () => {
    const items = [
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 30 },
      { courseName: 'Premium Combo', productName: 'Botox 100u', deductQty: 20 },
    ];
    // 30+20 = 50 → 50/100 = 0.5, Filler 0 → avg 0.25
    expect(computeCourseUsageWeight(course, items)).toBe(0.25);
  });
});

describe('frozen constants', () => {
  it('DFGV24: STATUS_OPTIONS frozen', () => {
    expect(Object.isFrozen(STATUS_OPTIONS)).toBe(true);
  });
  it('DFGV25: RATE_TYPES frozen with 2 entries', () => {
    expect(Object.isFrozen(RATE_TYPES)).toBe(true);
    expect(RATE_TYPES).toEqual(['percent', 'baht']);
  });
  it('DFGV26: RATE_TYPE_LABEL has both types', () => {
    expect(RATE_TYPE_LABEL.percent).toBe('%');
    expect(RATE_TYPE_LABEL.baht).toBe('บาท');
  });
});
