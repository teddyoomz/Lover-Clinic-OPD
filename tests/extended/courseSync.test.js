// ─── Phase 12.2b Step 3 · ProClinic course JSON → master_data normalizer ───
// Tests normalizeCourseJsonItem against real ProClinic /admin/api/course
// response shape captured 2026-04-24 via `opd.js api GET /admin/api/course`.
// Covers the 10 new Phase 12.2b fields + main-product extraction + usage_type
// translation (clinic|branch → Thai enum) + pivot→courseProducts mapping.

import { describe, it, expect } from 'vitest';
import { normalizeCourseJsonItem } from '../api/proclinic/master.js';

// Fixture: verbatim course row from ProClinic (id 1067, "11/12 เหมาตามจริง").
const REAL_PROCLINIC_COURSE = {
  id: 1067,
  branch_id: 28,
  course_name: '11/12 เหมาตามจริง',
  full_price: '0.00',
  sale_price: '5000.00',
  is_including_vat: 0,
  days_before_expire: null,
  is_df: 1,
  status: 1,
  main_product_qty: '0.00',
  course_category_name: 'Botox',
  period: null,
  course_type: 'เหมาตามจริง',
  receipt_course_name: 'ิbotox',
  course_code: null,
  max_chosen_count: 1,
  max_product_chosen_count: null,
  max_product_chosen_qty: null,
  is_vat_included: 1,
  sale_price_incl_vat: '5350.00',
  procedure_type_name: null,
  clinic_id: 23,
  usage_type: 'branch',
  is_hidden_for_sale: 0,
  df_editable_global: 0,
  deduct_cost: '0.00',
  products: [
    {
      id: 281,
      product_name: 'BA - Allergan 50 U',
      unit_name: 'U',
      price: '2000.00',
      is_df: 1,
      pivot: {
        course_id: 1067, product_id: 281,
        is_premium: 0, qty: '0.00', premium_qty: '0.00',
        is_main_product: 1, qty_per_time: null, is_df: 1,
        min_qty: null, max_qty: null, is_required: 0, is_hidden: 0,
      },
    },
    {
      id: 941,
      product_name: 'Allergan 100 U',
      unit_name: 'U',
      price: '0.00',
      is_df: 0,
      pivot: {
        course_id: 1067, product_id: 941,
        is_premium: 1, qty: '0.00', premium_qty: '0.00',
        is_main_product: 0, qty_per_time: '1.00', is_df: 0,
        min_qty: null, max_qty: null, is_required: 0, is_hidden: 0,
      },
    },
  ],
};

describe('normalizeCourseJsonItem — happy path (real ProClinic row)', () => {
  it('CS1 returns an object for a valid item', () => {
    const out = normalizeCourseJsonItem(REAL_PROCLINIC_COURSE);
    expect(out).toBeTruthy();
    expect(typeof out).toBe('object');
  });

  it('CS2 preserves identity fields', () => {
    const out = normalizeCourseJsonItem(REAL_PROCLINIC_COURSE);
    expect(out.id).toBe(1067);
    expect(out.course_name).toBe('11/12 เหมาตามจริง');
    expect(out.receipt_course_name).toBe('ิbotox');
    expect(out.course_code).toBe('');
  });

  it('CS3 course_category comes from course_category_name', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).course_category).toBe('Botox');
  });

  it('CS4 course_type preserved verbatim', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).course_type).toBe('เหมาตามจริง');
  });

  it('CS5 usage_type translated "branch" → "ระดับสาขา"', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).usage_type).toBe('ระดับสาขา');
  });

  it('CS6 usage_type translated "clinic" → "ระดับคลินิก"', () => {
    const item = { ...REAL_PROCLINIC_COURSE, usage_type: 'clinic' };
    expect(normalizeCourseJsonItem(item).usage_type).toBe('ระดับคลินิก');
  });

  it('CS7 unknown usage_type round-trips as trimmed string', () => {
    const item = { ...REAL_PROCLINIC_COURSE, usage_type: '  custom  ' };
    expect(normalizeCourseJsonItem(item).usage_type).toBe('custom');
  });

  it('CS8 usage_type null|undefined → empty string', () => {
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, usage_type: null }).usage_type).toBe('');
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, usage_type: undefined }).usage_type).toBe('');
  });
});

describe('normalizeCourseJsonItem — Phase 12.2b new fields', () => {
  it('CS9 procedure_type read from procedure_type_name (null → "")', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).procedure_type).toBe('');
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, procedure_type_name: 'เสริมจมูก' }).procedure_type).toBe('เสริมจมูก');
  });

  it('CS10 deduct_cost coerced to Number (0.00 → 0)', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).deduct_cost).toBe(0);
  });

  it('CS11 deduct_cost null → null (not 0)', () => {
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, deduct_cost: null }).deduct_cost).toBeNull();
  });

  it('CS12 df_editable_global → false when 0', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).df_editable_global).toBe(false);
  });

  it('CS13 df_editable_global → true when 1', () => {
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, df_editable_global: 1 }).df_editable_global).toBe(true);
  });

  it('CS14 days_before_expire null preserved', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).days_before_expire).toBeNull();
  });

  it('CS15 days_before_expire numeric coerced', () => {
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, days_before_expire: '365' }).days_before_expire).toBe(365);
  });

  it('CS16 period + time aliases both carry ProClinic period', () => {
    const item = { ...REAL_PROCLINIC_COURSE, period: '30' };
    const out = normalizeCourseJsonItem(item);
    expect(out.period).toBe(30);
    expect(out.time).toBe(30);
  });

  it('CS17 is_hidden_for_sale boolean coerced', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).is_hidden_for_sale).toBe(false);
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, is_hidden_for_sale: 1 }).is_hidden_for_sale).toBe(true);
  });
});

describe('normalizeCourseJsonItem — main product extraction', () => {
  it('CS18 main_product_id + main_product_name from pivot.is_main_product=1', () => {
    const out = normalizeCourseJsonItem(REAL_PROCLINIC_COURSE);
    expect(out.main_product_id).toBe('281');
    expect(out.main_product_name).toBe('BA - Allergan 50 U');
  });

  it('CS19 qty_per_time inherited from main product pivot (null → null)', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).qty_per_time).toBeNull();
  });

  it('CS20 qty_per_time numeric from main product pivot', () => {
    const item = {
      ...REAL_PROCLINIC_COURSE,
      products: [
        { ...REAL_PROCLINIC_COURSE.products[0], pivot: { ...REAL_PROCLINIC_COURSE.products[0].pivot, qty_per_time: '2.5' } },
        REAL_PROCLINIC_COURSE.products[1],
      ],
    };
    expect(normalizeCourseJsonItem(item).qty_per_time).toBe(2.5);
  });

  it('CS21 no main-product row → main_product_id "" + qty_per_time null', () => {
    const item = {
      ...REAL_PROCLINIC_COURSE,
      products: REAL_PROCLINIC_COURSE.products.map(p => ({ ...p, pivot: { ...p.pivot, is_main_product: 0 } })),
    };
    const out = normalizeCourseJsonItem(item);
    expect(out.main_product_id).toBe('');
    expect(out.main_product_name).toBe('');
    expect(out.qty_per_time).toBeNull();
  });

  it('CS22 main_product_qty coerced from top-level main_product_qty', () => {
    const item = { ...REAL_PROCLINIC_COURSE, main_product_qty: '12.00' };
    expect(normalizeCourseJsonItem(item).main_product_qty).toBe(12);
  });
});

describe('normalizeCourseJsonItem — courseProducts pivot fields', () => {
  it('CS23 emits one entry per product in products[]', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).courseProducts).toHaveLength(2);
  });

  it('CS24 each entry has productId + productName', () => {
    const [first] = normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).courseProducts;
    expect(first.productId).toBe('281');
    expect(first.productName).toBe('BA - Allergan 50 U');
  });

  it('CS25 pivot.qty carried onto courseProducts[].qty', () => {
    const items = normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).courseProducts;
    expect(items[0].qty).toBe(0);
    expect(items[1].qty).toBe(0);
  });

  it('CS26 is_main_product boolean coerced', () => {
    const items = normalizeCourseJsonItem(REAL_PROCLINIC_COURSE).courseProducts;
    expect(items[0].is_main_product).toBe(true);
    expect(items[1].is_main_product).toBe(false);
  });

  it('CS27 new pivot fields (min_qty, max_qty, is_required, is_hidden) all coerced', () => {
    const item = {
      ...REAL_PROCLINIC_COURSE,
      products: [{
        ...REAL_PROCLINIC_COURSE.products[0],
        pivot: {
          ...REAL_PROCLINIC_COURSE.products[0].pivot,
          min_qty: '1', max_qty: '5', is_required: 1, is_hidden: 1,
        },
      }],
    };
    const [first] = normalizeCourseJsonItem(item).courseProducts;
    expect(first.min_qty).toBe(1);
    expect(first.max_qty).toBe(5);
    expect(first.is_required).toBe(true);
    expect(first.is_hidden).toBe(true);
  });

  it('CS28 pivot.is_df overrides product-level is_df', () => {
    // Product-level is_df=0 but pivot.is_df=1 → final is_df=true.
    const item = {
      ...REAL_PROCLINIC_COURSE,
      products: [{
        ...REAL_PROCLINIC_COURSE.products[1], // base has is_df: 0 / pivot.is_df: 0
        is_df: 0,
        pivot: { ...REAL_PROCLINIC_COURSE.products[1].pivot, is_df: 1 },
      }],
    };
    expect(normalizeCourseJsonItem(item).courseProducts[0].is_df).toBe(true);
  });

  it('CS29 pivot.is_df absent → falls back to product.is_df', () => {
    const item = {
      ...REAL_PROCLINIC_COURSE,
      products: [{
        ...REAL_PROCLINIC_COURSE.products[0],
        is_df: 1,
        pivot: { ...REAL_PROCLINIC_COURSE.products[0].pivot, is_df: undefined },
      }],
    };
    expect(normalizeCourseJsonItem(item).courseProducts[0].is_df).toBe(true);
  });
});

describe('normalizeCourseJsonItem — edge cases + defensive defaults', () => {
  it('CS30 null input → null', () => {
    expect(normalizeCourseJsonItem(null)).toBeNull();
  });

  it('CS31 undefined input → null', () => {
    expect(normalizeCourseJsonItem(undefined)).toBeNull();
  });

  it('CS32 non-object (string / number / array) → null', () => {
    expect(normalizeCourseJsonItem('foo')).toBeNull();
    expect(normalizeCourseJsonItem(42)).toBeNull();
  });

  it('CS33 empty object → full shape with safe defaults', () => {
    const out = normalizeCourseJsonItem({});
    expect(out).toBeTruthy();
    expect(out.course_name).toBe('');
    expect(out.course_code).toBe('');
    expect(out.course_category).toBe('');
    expect(out.course_type).toBe('');
    expect(out.usage_type).toBe('');
    expect(out.is_df).toBe(false);
    expect(out.is_vat_included).toBe(false);
    expect(out.courseProducts).toEqual([]);
    expect(out.status).toBe('ใช้งาน');
    expect(out._source).toBe('proclinic');
  });

  it('CS34 deleted_at truthy → status "พักใช้งาน"', () => {
    const item = { ...REAL_PROCLINIC_COURSE, deleted_at: '2026-04-24T00:00:00Z' };
    expect(normalizeCourseJsonItem(item).status).toBe('พักใช้งาน');
  });

  it('CS35 status=0 → "พักใช้งาน"', () => {
    expect(normalizeCourseJsonItem({ ...REAL_PROCLINIC_COURSE, status: 0 }).status).toBe('พักใช้งาน');
  });

  it('CS36 missing products[] → empty courseProducts without throwing', () => {
    const item = { ...REAL_PROCLINIC_COURSE };
    delete item.products;
    const out = normalizeCourseJsonItem(item);
    expect(out.courseProducts).toEqual([]);
    expect(out.main_product_id).toBe('');
    expect(out.main_product_name).toBe('');
  });

  it('CS37 sale_price + sale_price_incl_vat coerced to Number', () => {
    const out = normalizeCourseJsonItem(REAL_PROCLINIC_COURSE);
    expect(out.sale_price).toBe(5000);
    expect(out.sale_price_incl_vat).toBe(5350);
  });

  it('CS38 price falls back to full_price when sale_price missing', () => {
    const item = { ...REAL_PROCLINIC_COURSE, sale_price: null, full_price: '999.00' };
    const out = normalizeCourseJsonItem(item);
    expect(out.price).toBe(999);
    expect(out.full_price).toBe(999);
  });

  it('CS39 _source tag stamped for downstream filtering', () => {
    expect(normalizeCourseJsonItem(REAL_PROCLINIC_COURSE)._source).toBe('proclinic');
  });

  it('CS40 is_vat_included accepts is_including_vat legacy alias', () => {
    const item = { ...REAL_PROCLINIC_COURSE, is_vat_included: 0, is_including_vat: 1 };
    expect(normalizeCourseJsonItem(item).is_vat_included).toBe(true);
  });
});
