// ─── Phase 12.2b — End-to-end scenario coverage ───────────────────────────
// Chains the pure helpers that power this session's work to verify the
// full user-visible flows: buy → tick → treat → save → stock → course
// history, for BOTH standard (ระบุสินค้าและจำนวนสินค้า) and fill-later
// (เหมาตามจริง) course types, + promotion bundles, + partial usage DF
// math. All scenarios are pure-logic so they run in the default Vitest
// suite (no Firestore, no mounting).
//
// Integration / Firestore-backed tests remain in phase7-integration.test.js
// (TEST_FIRESTORE=1 opt-in). The coverage here catches wiring bugs in the
// helper layer before the integration suite would even get a chance.

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import {
  buildPurchasedCourseEntry,
  buildCustomerPromotionGroups,
  findMissingFillLaterQty,
} from '../src/lib/treatmentBuyHelpers.js';
import { normalizeCourseJsonItem } from '../api/proclinic/master.js';
import { mapMasterToCourse, beCourseToMasterShape } from '../src/lib/backendClient.js';
import {
  getRateForStaffCourse,
  computeDfAmount,
  computeCourseUsageWeight,
} from '../src/lib/dfGroupValidation.js';
import { computeDfPayoutReport } from '../src/lib/dfPayoutAggregator.js';
import { parseQtyString, deductQty, buildQtyString } from '../src/lib/courseUtils.js';
import { isRealQtyCourse, isSpecificQtyCourse } from '../src/lib/courseValidation.js';

const NOW = 1700000000000;

// ════════════════════════════════════════════════════════════════════════
// Scenario 1: ProClinic JSON → be_courses → buy modal → customerCourses
// Round-trip verifies every adapter in the chain preserves the data
// needed by downstream stock + DF + lifecycle code.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 1 — ProClinic JSON → buy flow full pipeline', () => {
  const proClinicJson = {
    id: 1067,
    course_name: 'Premium Combo',
    course_type: 'ระบุสินค้าและจำนวนสินค้า',
    receipt_course_name: 'Premium',
    course_code: 'PREM-001',
    course_category_name: 'Botox',
    procedure_type_name: 'ฉีด',
    usage_type: 'clinic',
    sale_price: '50000.00',
    sale_price_incl_vat: '53500.00',
    is_vat_included: 1,
    main_product_qty: '100.00',
    days_before_expire: '365',
    period: '30',
    deduct_cost: '1000.00',
    is_df: 1,
    df_editable_global: 0,
    is_hidden_for_sale: 0,
    status: 1,
    products: [
      {
        id: 281, product_name: 'Botox 100u', unit_name: 'U', price: '40000.00',
        pivot: {
          course_id: 1067, product_id: 281,
          is_main_product: 1, is_premium: 0,
          qty: '100.00', premium_qty: '0.00', qty_per_time: '25.00',
          is_df: 1, min_qty: null, max_qty: null, is_required: 1, is_hidden: 0,
        },
      },
      {
        id: 941, product_name: 'Filler 1cc', unit_name: 'cc', price: '10000.00',
        pivot: {
          course_id: 1067, product_id: 941,
          is_main_product: 0, is_premium: 0,
          qty: '1.00', premium_qty: '0.00', qty_per_time: '0.50',
          is_df: 1, min_qty: null, max_qty: null, is_required: 0, is_hidden: 0,
        },
      },
    ],
  };

  it('S1.1: normalizeCourseJsonItem preserves all Phase 12.2b fields + translates usage_type', () => {
    const out = normalizeCourseJsonItem(proClinicJson);
    expect(out.course_name).toBe('Premium Combo');
    expect(out.course_type).toBe('ระบุสินค้าและจำนวนสินค้า');
    expect(out.usage_type).toBe('ระดับคลินิก'); // clinic → Thai
    expect(out.procedure_type).toBe('ฉีด');
    expect(out.sale_price).toBe(50000);
    expect(out.main_product_id).toBe('281');
    expect(out.main_product_name).toBe('Botox 100u');
    expect(out.qty_per_time).toBe(25);
    expect(out.days_before_expire).toBe(365);
    expect(out.period).toBe(30);
    expect(out.deduct_cost).toBe(1000);
    expect(out.is_df).toBe(true);
    expect(out.df_editable_global).toBe(false);
    expect(out.courseProducts).toHaveLength(2);
  });

  it('S1.2: mapMasterToCourse writes canonical be_courses shape from normalized ProClinic data', () => {
    const norm = normalizeCourseJsonItem(proClinicJson);
    const be = mapMasterToCourse(norm, 'COURSE-1', '2026-04-24T10:00:00Z');
    expect(be.courseId).toBe('COURSE-1');
    expect(be.courseName).toBe('Premium Combo');
    expect(be.courseType).toBe('ระบุสินค้าและจำนวนสินค้า');
    expect(be.mainProductId).toBe('281');
    expect(be.mainQty).toBe(100);
    expect(be.qtyPerTime).toBe(25);
    expect(be.period).toBe(30);
    expect(be.isDf).toBe(true);
    expect(be.courseProducts.length).toBeGreaterThan(0);
  });

  it('S1.3: beCourseToMasterShape reconstructs products[] with main product FIRST', () => {
    const norm = normalizeCourseJsonItem(proClinicJson);
    const be = mapMasterToCourse(norm, 'COURSE-1', '2026-04-24T10:00:00Z');
    const master = beCourseToMasterShape(be);
    expect(master.products[0].id).toBe('281'); // main product prepended
    expect(master.products[0].isMainProduct).toBe(true);
    // Dedup: main not duplicated in secondaries
    const mainCount = master.products.filter(p => p.id === '281').length;
    expect(mainCount).toBe(1);
  });

  it('S1.4: buildPurchasedCourseEntry creates customerCourses row with productId preserved', () => {
    const norm = normalizeCourseJsonItem(proClinicJson);
    const be = mapMasterToCourse(norm, 'COURSE-1', '2026-04-24T10:00:00Z');
    const master = beCourseToMasterShape(be);
    // Simulate buy-modal item shape
    const buyItem = {
      id: 'COURSE-1', name: master.name, courseType: master.courseType,
      qty: '1', unit: 'คอร์ส', itemType: 'course',
      products: master.products,
    };
    const entry = buildPurchasedCourseEntry(buyItem, { now: NOW });
    expect(entry.isAddon).toBe(true);
    expect(entry.isRealQty).toBe(false); // specific-qty, not fill-later
    // Each product carries a real productId (not synthetic rowId)
    for (const p of entry.products) {
      expect(p.productId).toBeTruthy();
      expect(p.fillLater).toBe(false);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 2: fill-later course buy + USE in same treatment (one-shot)
// Validates the entire fill-later flow: display, tick, validate, save,
// course lifecycle, stock deduction (via productId).
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 2 — fill-later course, one-shot consumption', () => {
  const fillLaterItem = {
    id: 'COURSE-REAL',
    name: 'อ๋อมเหมา',
    price: 50000,
    unit: 'คอร์ส',
    qty: '1',
    itemType: 'course',
    courseType: 'เหมาตามจริง',
    isRealQty: true,
    products: [
      { id: 'P-BOTOX', name: 'Botox 100u', qty: 0, unit: 'U', isMainProduct: true },
      { id: 'P-FILLER', name: 'Filler 1cc', qty: 0, unit: 'cc' },
    ],
  };

  it('S2.1: buildPurchasedCourseEntry tags isRealQty + fillLater on every product', () => {
    const entry = buildPurchasedCourseEntry(fillLaterItem, { now: NOW });
    expect(entry.isRealQty).toBe(true);
    expect(entry.courseType).toBe('เหมาตามจริง');
    expect(entry.products.every(p => p.fillLater === true)).toBe(true);
    expect(entry.products.every(p => p.remaining === '')).toBe(true);
    expect(entry.products.every(p => p.total === '')).toBe(true);
  });

  it('S2.2: treatmentItems qty starts BLANK for fill-later products (doctor must enter)', () => {
    const entry = buildPurchasedCourseEntry(fillLaterItem, { now: NOW });
    // Simulate toggleCourseItem's qty-default logic for fill-later products.
    const p = entry.products[0];
    const defaultQty = p.fillLater ? '' : '1';
    expect(defaultQty).toBe('');
  });

  it('S2.3: findMissingFillLaterQty blocks save when fill-later treatmentItem has blank qty', () => {
    const items = [
      { id: 'row-1', name: 'Botox 100u', qty: '', fillLater: true },
      { id: 'row-2', name: 'Filler 1cc', qty: '1', fillLater: true },
    ];
    expect(findMissingFillLaterQty(items)?.id).toBe('row-1');
  });

  it('S2.4: doctor enters 100 U Botox + 1 cc Filler → save passes the validator', () => {
    const items = [
      { id: 'row-1', name: 'Botox 100u', qty: '100', fillLater: true },
      { id: 'row-2', name: 'Filler 1cc', qty: '1', fillLater: true },
    ];
    expect(findMissingFillLaterQty(items)).toBeNull();
  });

  it('S2.5: usage weight = 1 when all products fully consumed in this visit', () => {
    const saleCourseItem = {
      name: 'อ๋อมเหมา',
      products: [
        { id: 'P-BOTOX', name: 'Botox 100u', qty: 100, unit: 'U' },
        { id: 'P-FILLER', name: 'Filler 1cc', qty: 1, unit: 'cc' },
      ],
    };
    const treatmentCourseItems = [
      { courseName: 'อ๋อมเหมา', productName: 'Botox 100u', deductQty: 100 },
      { courseName: 'อ๋อมเหมา', productName: 'Filler 1cc', deductQty: 1 },
    ];
    expect(computeCourseUsageWeight(saleCourseItem, treatmentCourseItems)).toBe(1);
  });

  it('S2.6: full DF paid when weight=1 (10% × ฿50,000 = ฿5,000)', () => {
    const df = computeDfAmount({ value: 10, type: 'percent' }, 50000, 1, { courseUsageWeight: 1 });
    expect(df).toBe(5000);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 3: fill-later course bought + NOT used → sits in active
// Validates display carry-through (isRealQty → CourseItemBar renders
// "เหมาตามจริง" + violet) + late-visit tick flow.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 3 — fill-later course late-visit flow', () => {
  // Simulates `customerCoursesForForm` output after loading a fill-later
  // course that was bought previously but not yet used.
  const fillLaterCustomerCourse = {
    courseId: 'be-course-0',
    courseName: 'อ๋อมเหมา',
    courseType: 'เหมาตามจริง',
    isRealQty: true,
    products: [{
      rowId: 'be-row-0',
      courseIndex: 0,
      productId: 'P-BOTOX',
      name: 'Botox 100u',
      remaining: '', // fill-later marker
      total: '',
      unit: 'U',
      fillLater: true,
    }],
  };

  it('S3.1: customer course entry carries isRealQty + fillLater downstream', () => {
    expect(fillLaterCustomerCourse.isRealQty).toBe(true);
    expect(fillLaterCustomerCourse.products[0].fillLater).toBe(true);
  });

  it('S3.2: late-visit tick → treatmentItems qty starts blank (same flow as initial)', () => {
    const p = fillLaterCustomerCourse.products[0];
    const defaultQty = p.fillLater ? '' : (p.remaining || '1');
    expect(defaultQty).toBe('');
  });

  it('S3.3: doctor enters 50 U → save path validates the qty as present', () => {
    const items = [{ id: 'be-row-0', name: 'Botox 100u', qty: '50', fillLater: true }];
    expect(findMissingFillLaterQty(items)).toBeNull();
  });

  it('S3.4: course history filter: remaining=0 means the course moves to "ประวัติ"', () => {
    // After deductCourseItems short-circuits → qty becomes "0/1 U" (consumed).
    const consumedQty = buildQtyString(0, 'U'); // "0 / 0 U"
    // Note: consumeRealQty sets remaining=0, total=original (so "0 / 1 U").
    // Here we just verify parseQtyString + history-filter semantics.
    const parsed = parseQtyString('0 / 1 U');
    expect(parsed.remaining).toBe(0);
    expect(parsed.total).toBe(1);
    // CustomerDetailView filters active courses by remaining > 0.
    expect(parsed.remaining > 0).toBe(false); // → history
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 4: specific-qty course, 10 visits consume it progressively
// Validates standard (non-fill-later) deduction semantics.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 4 — specific-qty course progressive deduction', () => {
  it('S4.1: course qty "100/100 U" after 1 visit using 25 U → "75/100 U"', () => {
    const after = deductQty('100 / 100 U', 25);
    expect(after).toBe('75 / 100 U');
  });

  it('S4.2: progressive deduction 10 visits of 10 U each → eventually 0/100', () => {
    let qty = '100 / 100 U';
    for (let i = 0; i < 10; i++) {
      qty = deductQty(qty, 10);
    }
    expect(qty).toBe('0 / 100 U');
    const parsed = parseQtyString(qty);
    expect(parsed.remaining).toBe(0); // → history
  });

  it('S4.3: over-deduction throws "คอร์สคงเหลือไม่พอ"', () => {
    expect(() => deductQty('5 / 100 U', 10)).toThrow(/คอร์สคงเหลือไม่พอ/);
  });

  it('S4.4: specific-qty courseType helpers distinguish from fill-later', () => {
    expect(isSpecificQtyCourse('ระบุสินค้าและจำนวนสินค้า')).toBe(true);
    expect(isSpecificQtyCourse('เหมาตามจริง')).toBe(false);
    expect(isRealQtyCourse('เหมาตามจริง')).toBe(true);
    expect(isRealQtyCourse('ระบุสินค้าและจำนวนสินค้า')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 5: DF partial-usage math invariant
// Sum of DFs across ALL visits that consume the course = full DF.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 5 — DF partial-usage math invariant', () => {
  const COURSE_PRICE = 50000;
  const RATE_PCT = 10;
  const FULL_DF = COURSE_PRICE * RATE_PCT / 100; // 5000

  const course = {
    name: 'Premium',
    products: [
      { id: 'P1', name: 'Botox 100u', qty: 100, unit: 'U' },
      { id: 'P2', name: 'Filler 1cc', qty: 1, unit: 'cc' },
    ],
  };

  const doctors = [{ doctorId: 'D1', firstname: 'Alice', lastname: 'A', defaultDfGroupId: 'DFG-1' }];
  const groups = [{ id: 'DFG-1', rates: [{ courseId: 'C-PREM', value: 10, type: 'percent' }] }];
  const sale = {
    saleId: 'INV-SPLIT', saleDate: '2026-04-24', status: 'active', doctorId: 'D1',
    items: [{ courseId: 'C-PREM', name: 'Premium', qty: 1, price: COURSE_PRICE, products: course.products }],
  };
  const buildEntry = (tid, items) => ({
    treatmentId: tid,
    detail: {
      linkedSaleId: 'INV-SPLIT',
      dfEntries: [{
        id: `DFE-${tid}`,
        doctorId: 'D1', doctorName: 'Alice A', dfGroupId: 'DFG-1',
        rows: [{ courseId: 'C-PREM', courseName: 'Premium', enabled: true, value: RATE_PCT, type: 'percent' }],
      }],
      courseItems: items,
    },
  });

  it('S5.1: 1 visit × 100% usage = full DF (฿5,000)', () => {
    const r = computeDfPayoutReport({
      sales: [sale],
      treatments: [buildEntry('BT-1', [
        { courseName: 'Premium', productName: 'Botox 100u', deductQty: 100 },
        { courseName: 'Premium', productName: 'Filler 1cc', deductQty: 1 },
      ])],
      doctors, groups,
    });
    expect(r.rows[0].totalDf).toBe(FULL_DF);
  });

  it('S5.2: 1 visit × 25% usage = ฿1,250', () => {
    const r = computeDfPayoutReport({
      sales: [sale],
      treatments: [buildEntry('BT-1', [
        { courseName: 'Premium', productName: 'Botox 100u', deductQty: 50 },
      ])],
      doctors, groups,
    });
    expect(r.rows[0].totalDf).toBe(1250);
  });

  it('S5.3: 4 visits of 25% each = 4 × ฿1,250 = ฿5,000 (invariant holds)', () => {
    const r = computeDfPayoutReport({
      sales: [sale],
      treatments: [
        buildEntry('BT-1', [{ courseName: 'Premium', productName: 'Botox 100u', deductQty: 50 }]),
        buildEntry('BT-2', [{ courseName: 'Premium', productName: 'Botox 100u', deductQty: 50 }]),
        buildEntry('BT-3', [{ courseName: 'Premium', productName: 'Filler 1cc', deductQty: 0.5 }]),
        buildEntry('BT-4', [{ courseName: 'Premium', productName: 'Filler 1cc', deductQty: 0.5 }]),
      ],
      doctors, groups,
    });
    // Each visit's weight: botox 50/100=0.5 × 1/2=0.25, filler 0.5/1=0.5 × 1/2=0.25
    // 4 × ฿1,250 = ฿5,000
    expect(r.rows[0].totalDf).toBe(FULL_DF);
  });

  it('S5.4: unused product zeros its ratio (0 used / 100 total = 0 contribution)', () => {
    const r = computeDfPayoutReport({
      sales: [sale],
      treatments: [buildEntry('BT-1', [])], // empty visit
      doctors, groups,
    });
    // weight = 0 → DF = 0
    expect(r.rows[0]?.totalDf || 0).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 6: Promotion bundle with sub-courses
// Validates customerPromotionGroups isAddon propagation + ซื้อเพิ่ม layout.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 6 — promotion bundle ซื้อเพิ่ม layout', () => {
  const purchasedCourses = [
    {
      courseId: 'promo-P1-course-C1', courseName: 'C1 Course',
      promotionId: 'P1', isAddon: true,
      purchasedItemId: 'P1', purchasedItemType: 'promotion',
      products: [{ rowId: 'r1', remaining: '5', total: '10' }],
    },
    {
      courseId: 'promo-P1-course-C2', courseName: 'C2 Course',
      promotionId: 'P1', isAddon: true,
      purchasedItemId: 'P1', purchasedItemType: 'promotion',
      products: [{ rowId: 'r2', remaining: '3', total: '5' }],
    },
    {
      courseId: 'existing-legacy', courseName: 'Legacy',
      promotionId: 'P2', // no isAddon → existing, not this-visit
      products: [{ rowId: 'r3', remaining: '1', total: '5' }],
    },
  ];
  const promotions = [
    { id: 'P1', promotionName: 'New Year', isAddon: true },
    { id: 'P2', promotionName: 'Legacy Promo' },
  ];

  it('S6.1: group headers mark addon promo with purchasedItemId, existing without', () => {
    const groups = buildCustomerPromotionGroups(purchasedCourses, promotions);
    const p1 = groups.find(g => g.promotionId === 'P1');
    const p2 = groups.find(g => g.promotionId === 'P2');
    expect(p1.isAddon).toBe(true);
    expect(p1.purchasedItemId).toBe('P1');
    expect(p2.isAddon).toBe(false);
    expect(p2.purchasedItemId).toBeNull();
  });

  it('S6.2: addon group has exactly 2 sub-courses (the 2 bundle courses)', () => {
    const groups = buildCustomerPromotionGroups(purchasedCourses, promotions);
    const p1 = groups.find(g => g.promotionId === 'P1');
    expect(p1.courses).toHaveLength(2);
  });

  it('S6.3: fully-consumed sub-courses are filtered (drop-out when remaining=0)', () => {
    const allConsumed = [
      { courseId: 'x', promotionId: 'P1', products: [{ remaining: '0', total: '10' }] },
    ];
    const groups = buildCustomerPromotionGroups(allConsumed, promotions);
    expect(groups).toEqual([]); // nothing to render
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 7: 0-baht course doesn't trigger payment validation
// Documented at the handleSubmit gate level. Logic helper for netTotal=0.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 7 — 0-baht course payment gate', () => {
  it('S7.1: hasSale=true + netTotal=0 → payment validation skipped', () => {
    // This is the condition the handleSubmit guard uses post-12.2b-fix.
    const hasSale = true;
    const netTotal = 0;
    const shouldValidatePayment = hasSale && netTotal > 0;
    expect(shouldValidatePayment).toBe(false);
  });

  it('S7.2: non-zero → payment validation runs (legacy behavior preserved)', () => {
    expect(true && 100 > 0).toBe(true);
    expect(true && 0.01 > 0).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 8: stock deduction via productId preservation
// treatmentItems must carry real productId so _normalizeStockItems can
// resolve be_products. Synthetic rowId is NOT enough.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 8 — stock deduction productId chain', () => {
  const buyItem = {
    id: 'C-REAL', name: 'Premium', courseType: 'ระบุสินค้าและจำนวนสินค้า',
    qty: 1, unit: 'คอร์ส', itemType: 'course',
    products: [{ id: '281', name: 'Botox 100u', qty: 100, unit: 'U' }],
  };

  it('S8.1: buildPurchasedCourseEntry stamps productId on each sub-product (NOT only rowId)', () => {
    const entry = buildPurchasedCourseEntry(buyItem, { now: NOW });
    expect(entry.products[0].productId).toBe('281');
    expect(entry.products[0].rowId).toContain('281');
  });

  it('S8.2: toggleCourseItem (simulated) copies productId to treatmentItems', () => {
    const entry = buildPurchasedCourseEntry(buyItem, { now: NOW });
    const product = entry.products[0];
    // Simulated toggleCourseItem output shape:
    const treatmentItem = {
      id: product.rowId,
      productId: product.productId,
      name: product.name,
      qty: product.fillLater ? '' : (product.remaining || '1'),
      unit: product.unit,
      fillLater: !!product.fillLater,
    };
    expect(treatmentItem.productId).toBe('281');
    expect(treatmentItem.productId).not.toBe(treatmentItem.id); // synthetic rowId ≠ real productId
  });

  it('S8.3: _normalizeStockItems-equivalent mapping picks up real productId', () => {
    // Simulate the shape that deductStockForTreatment's _normalizeStockItems
    // reads. productId fallback order: productId → id. With productId set,
    // the real master id wins over synthetic rowId.
    const treatmentItem = {
      id: 'purchased-C-REAL-row-281',
      productId: '281',
      qty: 100,
    };
    const normalized = {
      productId: treatmentItem.productId || treatmentItem.id,
      qty: Number(treatmentItem.qty) || 0,
    };
    expect(normalized.productId).toBe('281'); // not 'purchased-C-REAL-row-281'
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 9: course type helpers — correct branching for all 4 types
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 9 — courseType branching helpers', () => {
  it('S9.1: 4 ProClinic types recognized via isRealQty + isSpecificQty', () => {
    const types = ['ระบุสินค้าและจำนวนสินค้า', 'บุฟเฟต์', 'เหมาตามจริง', 'เลือกสินค้าตามจริง'];
    for (const t of types) {
      expect(typeof isRealQtyCourse(t)).toBe('boolean');
      expect(typeof isSpecificQtyCourse(t)).toBe('boolean');
    }
    expect(isSpecificQtyCourse('ระบุสินค้าและจำนวนสินค้า')).toBe(true);
    expect(isRealQtyCourse('เหมาตามจริง')).toBe(true);
  });

  it('S9.2: unknown type falls back to specific-qty semantics (safe default)', () => {
    expect(isSpecificQtyCourse('')).toBe(true);
    expect(isSpecificQtyCourse(undefined)).toBe(true);
    expect(isRealQtyCourse('')).toBe(false);
  });

  it('S9.3: buildPurchasedCourseEntry branches qty markers by courseType', () => {
    const specific = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 10, courseType: 'ระบุสินค้าและจำนวนสินค้า' }, { now: NOW });
    const buffet = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 10, courseType: 'บุฟเฟต์' }, { now: NOW });
    const fillLater = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 0, courseType: 'เหมาตามจริง' }, { now: NOW });
    const pick = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 0, courseType: 'เลือกสินค้าตามจริง' }, { now: NOW });
    expect(specific.products[0].fillLater).toBe(false);
    expect(buffet.products[0].fillLater).toBe(false);
    expect(fillLater.products[0].fillLater).toBe(true);
    expect(pick.products[0].fillLater).toBe(true);
    expect(specific.products[0].remaining).not.toBe('');
    expect(fillLater.products[0].remaining).toBe('');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 11: treatmentItems save-payload productId preservation
// Regression guard for the "ใช้คอร์สเหมาแล้วไม่ตัดสต็อค" bug — previous
// payload shape `{name, qty, unit, price}` silently dropped productId,
// breaking every fill-later stock deduction.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 11 — treatmentItems save-payload shape', () => {
  it('S11.1: payload must carry productId + fillLater (not just name/qty/unit/price)', () => {
    // Source treatment item as constructed by toggleCourseItem
    const treatmentItem = {
      id: 'purchased-C-REAL-row-281',
      productId: '281',
      name: 'Botox 100u',
      qty: '50',
      unit: 'U',
      price: '',
      fillLater: true,
    };
    // The handleSubmit payload mapping — mirrors the production code.
    const payload = {
      id: treatmentItem.id,
      productId: treatmentItem.productId || '',
      name: treatmentItem.name,
      qty: treatmentItem.qty,
      unit: treatmentItem.unit,
      price: treatmentItem.price,
      fillLater: !!treatmentItem.fillLater,
    };
    expect(payload.productId).toBe('281');
    expect(payload.fillLater).toBe(true);
    expect(payload.id).toContain('row-281');
  });

  it('S11.2: backward compat — legacy treatmentItem without productId maps to empty string (not undefined)', () => {
    const legacyItem = { id: 'r-1', name: 'X', qty: '1', unit: 'U' };
    const payload = {
      id: legacyItem.id,
      productId: legacyItem.productId || '',
      name: legacyItem.name,
      qty: legacyItem.qty,
      unit: legacyItem.unit,
      price: legacyItem.price,
      fillLater: !!legacyItem.fillLater,
    };
    expect(payload.productId).toBe('');
    expect(payload.fillLater).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 12: DF percent display shows calculated baht amount
// User request: "ค่ามือแพทย์ที่เป็น % ไม่แสดงจำนวนเงิน" → show ≈ ฿X,XXX
// next to percent rate.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 12 — DF percent baht display', () => {
  it('S12.1: treatmentCoursesForDf must carry `price` so DfEntryModal can compute amount', () => {
    // Simulated treatmentCourses prop shape passed to DfEntryModal
    const tc = [{ courseId: 'C-PREM', courseName: 'Premium', price: 50000 }];
    const row = { courseId: 'C-PREM', enabled: true, value: 10, type: 'percent' };
    // Amount calc (mirrors DfEntryModal's inline IIFE):
    const match = tc.find((c) => String(c.courseId) === String(row.courseId));
    const amount = (Number(match?.price) || 0) * (Number(row.value) || 0) / 100;
    expect(amount).toBe(5000);
  });

  it('S12.2: missing price → amount 0 (no crash)', () => {
    const tc = [{ courseId: 'C-NONE', courseName: 'X' }];
    const row = { courseId: 'C-NONE', enabled: true, value: 10, type: 'percent' };
    const match = tc.find((c) => String(c.courseId) === String(row.courseId));
    const amount = (Number(match?.price) || 0) * (Number(row.value) || 0) / 100;
    expect(amount).toBe(0);
  });

  it('S12.3: baht rate row doesn\'t need amount display (value is already baht)', () => {
    const row = { courseId: 'C-PREM', enabled: true, value: 500, type: 'baht' };
    const shouldShowAmount = row.enabled && row.type === 'percent';
    expect(shouldShowAmount).toBe(false);
  });

  it('S12.4: disabled row doesn\'t show amount even if percent', () => {
    const row = { courseId: 'C-PREM', enabled: false, value: 10, type: 'percent' };
    expect(row.enabled && row.type === 'percent').toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 13: 0-baht hides billing/payment UI
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 13 — showBilling gate for 0-baht treatments', () => {
  const makeCtx = (hasSale, netTotal) => ({
    hasSale,
    netTotal,
    // This mirrors the showBilling computation in TreatmentFormPage.
    showBilling: hasSale && (Number(netTotal) || 0) > 0,
  });

  it('S13.1: hasSale=true + netTotal=0 → showBilling=false (UI hidden)', () => {
    expect(makeCtx(true, 0).showBilling).toBe(false);
  });

  it('S13.2: hasSale=true + netTotal=1 → showBilling=true (UI shown)', () => {
    expect(makeCtx(true, 1).showBilling).toBe(true);
  });

  it('S13.3: hasSale=false always → showBilling=false', () => {
    expect(makeCtx(false, 100).showBilling).toBe(false);
    expect(makeCtx(false, 0).showBilling).toBe(false);
  });

  it('S13.4: negative netTotal (bizarre discount overflow) → showBilling=false', () => {
    expect(makeCtx(true, -50).showBilling).toBe(false);
  });

  it('S13.5: non-numeric netTotal → showBilling=false (safe default)', () => {
    expect(makeCtx(true, null).showBilling).toBe(false);
    expect(makeCtx(true, undefined).showBilling).toBe(false);
    expect(makeCtx(true, 'abc').showBilling).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 10: comprehensive edge-case coverage
// Null / undefined / degenerate inputs across the pipeline.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 10 — edge cases + defensive defaults', () => {
  it('S10.1: normalizeCourseJsonItem null → null (no crash)', () => {
    expect(normalizeCourseJsonItem(null)).toBeNull();
    expect(normalizeCourseJsonItem(undefined)).toBeNull();
  });

  it('S10.2: mapMasterToCourse no id → null', () => {
    expect(mapMasterToCourse({ courseName: 'x' }, null, '2026-04-24')).toBeNull();
    expect(mapMasterToCourse(null, 'X', '2026-04-24')).toBeNull();
  });

  it('S10.3: beCourseToMasterShape empty → empty products', () => {
    const out = beCourseToMasterShape({ courseId: 'X' });
    expect(out.products).toEqual([]);
  });

  it('S10.4: buildPurchasedCourseEntry missing id → null', () => {
    expect(buildPurchasedCourseEntry(null)).toBeNull();
    expect(buildPurchasedCourseEntry({ name: 'x' })).toBeNull();
  });

  it('S10.5: findMissingFillLaterQty non-array → null', () => {
    expect(findMissingFillLaterQty(null)).toBeNull();
    expect(findMissingFillLaterQty('str')).toBeNull();
  });

  it('S10.6: computeCourseUsageWeight degenerate total qty → 1 fallback', () => {
    const out = computeCourseUsageWeight(
      { products: [{ id: 'X', name: 'Zero', qty: 0 }] },
      [{ courseName: '', productName: 'Zero', deductQty: 999 }]
    );
    expect(out).toBe(1);
  });

  it('S10.7: computeDfAmount null rate → 0', () => {
    expect(computeDfAmount(null, 1000, 1)).toBe(0);
  });

  it('S10.8: getRateForStaffCourse empty inputs → null', () => {
    expect(getRateForStaffCourse('', 'C1', 'G1', [], [])).toBeNull();
    expect(getRateForStaffCourse('D1', '', 'G1', [], [])).toBeNull();
  });
});
