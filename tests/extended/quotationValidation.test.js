// ─── Phase 13.1.1 · quotation validator adversarial tests ─────────────────
import { describe, it, expect } from 'vitest';
import {
  validateQuotationStrict, normalizeQuotation, emptyQuotationForm, generateQuotationId,
  STATUS_OPTIONS, DISCOUNT_TYPE_OPTIONS, ADMINISTRATION_METHODS, DOSAGE_UNITS,
  ADMINISTRATION_TIMES,
} from '../src/lib/quotationValidation.js';

const base = (over = {}) => ({
  ...emptyQuotationForm(),
  customerId: 'CUST-1',
  quotationDate: '2026-04-24',
  courses: [{ courseId: 'C1', qty: 1, price: 1000 }],
  ...over,
});

describe('validateQuotationStrict — required fields (QU-1, QU-2)', () => {
  it('QV1: null rejected', () => {
    expect(validateQuotationStrict(null)?.[0]).toBe('form');
  });
  it('QV2: array rejected', () => {
    expect(validateQuotationStrict([])?.[0]).toBe('form');
  });
  it('QV3: missing customerId rejected', () => {
    expect(validateQuotationStrict({ ...base(), customerId: '' })?.[0]).toBe('customerId');
  });
  it('QV4: missing quotationDate rejected', () => {
    expect(validateQuotationStrict({ ...base(), quotationDate: '' })?.[0]).toBe('quotationDate');
  });
  it('QV5: dd/mm/yyyy quotationDate rejected (must be YYYY-MM-DD)', () => {
    expect(validateQuotationStrict({ ...base(), quotationDate: '24/04/2026' })?.[0]).toBe('quotationDate');
  });
});

describe('validateQuotationStrict — sub-items (QU-3, QU-4)', () => {
  it('QV6: all 4 sub-item arrays empty rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [], products: [], promotions: [], takeawayMeds: [],
    })?.[0]).toBe('items');
  });
  it('QV7: course without courseId rejected', () => {
    expect(validateQuotationStrict({ ...base(), courses: [{ qty: 1, price: 100 }] })?.[0]).toBe('courses');
  });
  it('QV8: course qty = 0 rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [{ courseId: 'C1', qty: 0, price: 100 }],
    })?.[0]).toBe('courses');
  });
  it('QV9: course qty negative rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [{ courseId: 'C1', qty: -1, price: 100 }],
    })?.[0]).toBe('courses');
  });
  it('QV10: course negative price rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [{ courseId: 'C1', qty: 1, price: -1 }],
    })?.[0]).toBe('courses');
  });
  it('QV11: product-only quotation accepted', () => {
    const r = validateQuotationStrict({
      ...base(), courses: [], products: [{ productId: 'P1', qty: 1, price: 100 }],
    });
    expect(r).toBeNull();
  });
  it('QV12: promotion-only quotation accepted', () => {
    const r = validateQuotationStrict({
      ...base(), courses: [], promotions: [{ promotionId: 'PR1', qty: 1, price: 100 }],
    });
    expect(r).toBeNull();
  });
  it('QV13: takeaway-only quotation accepted', () => {
    const r = validateQuotationStrict({
      ...base(), courses: [], takeawayMeds: [{ productId: 'M1', qty: 1, price: 50 }],
    });
    expect(r).toBeNull();
  });
  it('QV14: mix of all 4 sub-item categories accepted', () => {
    const r = validateQuotationStrict({
      ...base(),
      courses: [{ courseId: 'C1', qty: 1, price: 100 }],
      products: [{ productId: 'P1', qty: 2, price: 200 }],
      promotions: [{ promotionId: 'PR1', qty: 1, price: 300 }],
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50 }],
    });
    expect(r).toBeNull();
  });
});

describe('validateQuotationStrict — discount (QU-5, QU-6)', () => {
  it('QV15: header discount percent > 100 rejected', () => {
    expect(validateQuotationStrict({
      ...base(), discount: 150, discountType: 'percent',
    })?.[0]).toBe('discount');
  });
  it('QV16: header discount percent exactly 100 accepted', () => {
    const r = validateQuotationStrict({ ...base(), discount: 100, discountType: 'percent' });
    expect(r).toBeNull();
  });
  it('QV17: header negative discount rejected', () => {
    expect(validateQuotationStrict({ ...base(), discount: -1 })?.[0]).toBe('discount');
  });
  it('QV18: invalid discountType rejected', () => {
    expect(validateQuotationStrict({ ...base(), discountType: 'weird' })?.[0]).toBe('discountType');
  });
  it('QV19: per-item itemDiscount percent > 100 rejected', () => {
    expect(validateQuotationStrict({
      ...base(),
      courses: [{ courseId: 'C1', qty: 1, price: 100, itemDiscount: 120, itemDiscountType: 'percent' }],
    })?.[0]).toBe('courses');
  });
  it('QV20: per-item itemDiscountType baht with large amount accepted', () => {
    const r = validateQuotationStrict({
      ...base(),
      courses: [{ courseId: 'C1', qty: 1, price: 100, itemDiscount: 9999, itemDiscountType: 'baht' }],
    });
    expect(r).toBeNull();
  });
});

describe('validateQuotationStrict — takeaway meds (QU-8)', () => {
  it('QV21: interval method without hour rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [],
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, administrationMethod: 'interval' }],
    })?.[0]).toBe('takeawayMeds');
  });
  it('QV22: interval method with hour = 0 rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [],
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, administrationMethod: 'interval', administrationMethodHour: 0 }],
    })?.[0]).toBe('takeawayMeds');
  });
  it('QV23: interval method with hour = 6 accepted', () => {
    const r = validateQuotationStrict({
      ...base(), courses: [],
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, administrationMethod: 'interval', administrationMethodHour: 6 }],
    });
    expect(r).toBeNull();
  });
  it('QV24: invalid dosageUnit rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [],
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, dosageUnit: 'fake' }],
    })?.[0]).toBe('takeawayMeds');
  });
  it('QV25: invalid administrationMethod rejected', () => {
    expect(validateQuotationStrict({
      ...base(), courses: [],
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, administrationMethod: 'fake' }],
    })?.[0]).toBe('takeawayMeds');
  });
  it('QV26: after_meal method without hour accepted', () => {
    const r = validateQuotationStrict({
      ...base(), courses: [],
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, administrationMethod: 'after_meal' }],
    });
    expect(r).toBeNull();
  });
});

describe('validateQuotationStrict — status + conversion (QU-7, QU-9)', () => {
  it('QV27: invalid status rejected', () => {
    expect(validateQuotationStrict({ ...base(), status: 'invalid' })?.[0]).toBe('status');
  });
  it('QV28: status=converted without convertedToSaleId rejected', () => {
    expect(validateQuotationStrict({ ...base(), status: 'converted' })?.[0]).toBe('convertedToSaleId');
  });
  it('QV29: status=converted without convertedAt rejected', () => {
    expect(validateQuotationStrict({
      ...base(), status: 'converted', convertedToSaleId: 'SALE-1',
    })?.[0]).toBe('convertedAt');
  });
  it('QV30: status=converted with both fields accepted', () => {
    const r = validateQuotationStrict({
      ...base(), status: 'converted', convertedToSaleId: 'SALE-1', convertedAt: '2026-04-24',
    });
    expect(r).toBeNull();
  });
  it('QV31: all STATUS_OPTIONS recognized except invalid', () => {
    for (const s of STATUS_OPTIONS) {
      if (s === 'converted') continue;
      expect(validateQuotationStrict({ ...base(), status: s })).toBeNull();
    }
  });
});

describe('validateQuotationStrict — id format (QU-10)', () => {
  it('QV32: malformed id rejected', () => {
    expect(validateQuotationStrict({ ...base(), id: 'bad-id' })?.[0]).toBe('id');
  });
  it('QV33: valid QUO-MMYY-8hex id accepted', () => {
    const r = validateQuotationStrict({ ...base(), id: 'QUO-0426-deadbeef' });
    expect(r).toBeNull();
  });
  it('QV34: empty id (new doc) accepted', () => {
    const r = validateQuotationStrict({ ...base(), id: '' });
    expect(r).toBeNull();
  });
});

describe('normalizeQuotation — sanitization', () => {
  it('QV35: string trim + status default', () => {
    const n = normalizeQuotation({ customerId: '  X  ', quotationDate: '  2026-04-24  ' });
    expect(n.customerId).toBe('X');
    expect(n.quotationDate).toBe('2026-04-24');
    expect(n.status).toBe('draft');
  });
  it('QV36: invalid status falls back to draft', () => {
    expect(normalizeQuotation({ status: 'invalid' }).status).toBe('draft');
  });
  it('QV37: snake_case input coerced to camelCase output', () => {
    const n = normalizeQuotation({
      customer_id: 'CUST-1',
      quotation_date: '2026-04-24',
      seller_id: 'SELL-1',
      discount_type: 'percent',
      courses: [{ course_id: 'C1', course_name: 'X', qty: 1, price: 100, item_discount: 10, item_discount_type: 'baht', is_vat_included: true }],
    });
    expect(n.customerId).toBe('CUST-1');
    expect(n.sellerId).toBe('SELL-1');
    expect(n.discountType).toBe('percent');
    expect(n.courses[0].courseId).toBe('C1');
    expect(n.courses[0].itemDiscount).toBe(10);
    expect(n.courses[0].itemDiscountType).toBe('baht');
    expect(n.courses[0].isVatIncluded).toBe(true);
  });
  it('QV38: sub-items without required id filtered out', () => {
    const n = normalizeQuotation({
      courses: [{ qty: 1, price: 100 }, { courseId: 'C1', qty: 1, price: 100 }],
      products: [{ productId: 'P1', qty: 1, price: 50 }, {}],
    });
    expect(n.courses.length).toBe(1);
    expect(n.products.length).toBe(1);
  });
  it('QV39: takeaway meds — non-interval method zeroes hour', () => {
    const n = normalizeQuotation({
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, administrationMethod: 'after_meal', administrationMethodHour: 8 }],
    });
    expect(n.takeawayMeds[0].administrationMethodHour).toBe(0);
  });
  it('QV40: administrationTimes filters invalid entries', () => {
    const n = normalizeQuotation({
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, administrationTimes: ['morning', 'bogus', 'evening'] }],
    });
    expect(n.takeawayMeds[0].administrationTimes).toEqual(['morning', 'evening']);
  });
  it('QV41: invalid dosageUnit coerced to empty', () => {
    const n = normalizeQuotation({
      takeawayMeds: [{ productId: 'M1', qty: 1, price: 50, dosageUnit: 'fake' }],
    });
    expect(n.takeawayMeds[0].dosageUnit).toBe('');
  });
});

describe('generateQuotationId — crypto ID generator', () => {
  it('QV42: format QUO-MMYY-8hex for April 2026 Bangkok local', () => {
    // 12:00 UTC April 24 2026 = 19:00 Bangkok April 24. Thai MMYY = 0426.
    const april24Noon = Date.UTC(2026, 3, 24, 12, 0);
    expect(generateQuotationId(april24Noon)).toMatch(/^QUO-0426-[0-9a-f]{8}$/);
  });
  it('QV43: Dec 31 UTC 23:00 rolls to Jan (next year) in Thai', () => {
    // 23:00 UTC Dec 31 2026 = 06:00 Bangkok Jan 1 2027. Thai MMYY = 0127.
    const dec31Late = Date.UTC(2026, 11, 31, 23, 0);
    expect(generateQuotationId(dec31Late)).toMatch(/^QUO-0127-[0-9a-f]{8}$/);
  });
  it('QV44: 100 IDs all unique (no Math.random collisions)', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(generateQuotationId());
    expect(ids.size).toBe(100);
  });
  it('QV45: id matches validator regex', () => {
    const id = generateQuotationId();
    const r = validateQuotationStrict({ ...base(), id });
    expect(r).toBeNull();
  });
});

describe('frozen constants', () => {
  it('QV46: STATUS_OPTIONS frozen', () => {
    expect(Object.isFrozen(STATUS_OPTIONS)).toBe(true);
  });
  it('QV47: DISCOUNT_TYPE_OPTIONS frozen', () => {
    expect(Object.isFrozen(DISCOUNT_TYPE_OPTIONS)).toBe(true);
  });
  it('QV48: DOSAGE_UNITS frozen with Thai labels', () => {
    expect(Object.isFrozen(DOSAGE_UNITS)).toBe(true);
    expect(DOSAGE_UNITS).toContain('เม็ด');
    expect(DOSAGE_UNITS).toContain('ซีซี');
  });
  it('QV49: ADMINISTRATION_METHODS frozen with 3 options', () => {
    expect(Object.isFrozen(ADMINISTRATION_METHODS)).toBe(true);
    expect(ADMINISTRATION_METHODS.length).toBe(3);
  });
  it('QV50: ADMINISTRATION_TIMES frozen with 4 options', () => {
    expect(Object.isFrozen(ADMINISTRATION_TIMES)).toBe(true);
    expect(ADMINISTRATION_TIMES.length).toBe(4);
  });
});

describe('emptyQuotationForm', () => {
  it('QV51: default shape routes through validator correctly', () => {
    const empty = emptyQuotationForm();
    expect(validateQuotationStrict(empty)?.[0]).toBe('customerId');
    empty.customerId = 'C1';
    expect(validateQuotationStrict(empty)?.[0]).toBe('quotationDate');
    empty.quotationDate = '2026-04-24';
    expect(validateQuotationStrict(empty)?.[0]).toBe('items');
    empty.courses = [{ courseId: 'C1', qty: 1, price: 100 }];
    expect(validateQuotationStrict(empty)).toBeNull();
  });
});
