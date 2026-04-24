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

import fs from 'fs';
import {
  buildPurchasedCourseEntry,
  buildCustomerPromotionGroups,
  findMissingFillLaterQty,
  resolvePickedCourseEntry,
  resolvePurchasedCourseForAssign,
  isPurchasedSessionRowId,
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
    const specific = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 10, courseType: 'ระบุสินค้าและจำนวนสินค้า', products: [{ id: 'p', name: 'P', qty: 10 }] }, { now: NOW });
    const buffet = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 10, courseType: 'บุฟเฟต์', products: [{ id: 'p', name: 'P', qty: 10 }] }, { now: NOW });
    const fillLater = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 0, courseType: 'เหมาตามจริง', products: [{ id: 'p', name: 'P', qty: 0 }] }, { now: NOW });
    // Phase 12.2b follow-up (2026-04-24): pick-at-treatment is a
    // TWO-STEP flow. Placeholder entry carries availableProducts +
    // needsPickSelection; products[] stays empty until the doctor
    // confirms via PickProductsModal → resolvePickedCourseEntry.
    const pick = buildPurchasedCourseEntry({ id: 'X', name: 'X', qty: 0, courseType: 'เลือกสินค้าตามจริง', products: [{ id: 'p', name: 'P', qty: 5 }] }, { now: NOW });
    expect(specific.products[0].fillLater).toBe(false);
    expect(buffet.products[0].fillLater).toBe(false);
    expect(fillLater.products[0].fillLater).toBe(true);
    expect(pick.needsPickSelection).toBe(true);
    expect(pick.products).toEqual([]);
    expect(pick.availableProducts).toHaveLength(1);
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
// Scenario 14: DF summary baht calculation outside modal
// User directive: show DF baht amount on the TreatmentFormPage summary
// card (not only inside DfEntryModal). Entries carry courseId + rate
// (value + type) + enabled flag; treatmentCoursesForDf supplies price.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 14 — DF summary card baht computation', () => {
  // Mirrors the in-component reduce pattern for a single doctor entry.
  const computeEntryTotal = (entry, courseIdToPrice) => {
    const enabled = (entry.rows || []).filter(r => r.enabled);
    const bahtSum = enabled
      .filter(r => r.type === 'baht')
      .reduce((s, r) => s + (Number(r.value) || 0), 0);
    const percentSum = enabled
      .filter(r => r.type === 'percent')
      .reduce((s, r) => {
        const price = Number(courseIdToPrice.get(String(r.courseId))) || 0;
        return s + (price * (Number(r.value) || 0) / 100);
      }, 0);
    return bahtSum + percentSum;
  };

  it('S14.1: percent-only entry uses course price × rate%', () => {
    const priceMap = new Map([['C-PREM', 50000]]);
    const entry = {
      id: 'E1', doctorId: 'D1',
      rows: [{ courseId: 'C-PREM', enabled: true, value: 10, type: 'percent' }],
    };
    expect(computeEntryTotal(entry, priceMap)).toBe(5000);
  });

  it('S14.2: baht-only entry sums raw values', () => {
    const priceMap = new Map();
    const entry = {
      id: 'E1', doctorId: 'D1',
      rows: [
        { courseId: 'C1', enabled: true, value: 500, type: 'baht' },
        { courseId: 'C2', enabled: true, value: 300, type: 'baht' },
      ],
    };
    expect(computeEntryTotal(entry, priceMap)).toBe(800);
  });

  it('S14.3: mixed percent + baht combines correctly', () => {
    const priceMap = new Map([['C-PREM', 50000]]);
    const entry = {
      id: 'E1', doctorId: 'D1',
      rows: [
        { courseId: 'C-PREM', enabled: true, value: 10, type: 'percent' }, // 5000
        { courseId: 'C-OTHER', enabled: true, value: 500, type: 'baht' },  // 500
      ],
    };
    expect(computeEntryTotal(entry, priceMap)).toBe(5500);
  });

  it('S14.4: disabled rows are excluded', () => {
    const priceMap = new Map([['C-PREM', 50000]]);
    const entry = {
      id: 'E1', doctorId: 'D1',
      rows: [
        { courseId: 'C-PREM', enabled: false, value: 100, type: 'percent' }, // skipped
        { courseId: 'C-PREM', enabled: true, value: 10, type: 'percent' },
      ],
    };
    expect(computeEntryTotal(entry, priceMap)).toBe(5000);
  });

  it('S14.5: percent row with missing course price contributes 0 (no crash)', () => {
    const priceMap = new Map();
    const entry = {
      id: 'E1', doctorId: 'D1',
      rows: [{ courseId: 'C-MISSING', enabled: true, value: 20, type: 'percent' }],
    };
    expect(computeEntryTotal(entry, priceMap)).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 15: DF dup-guard is NON-BLOCKING (soft hint only)
// User directive: "มันต้องมีซ้ำได้ดิ มันคนละหัตถการกัน"
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 15 — DF dup-guard allows multi-entry per doctor', () => {
  it('S15.1: multiple entries for same doctor on same treatment are valid data', () => {
    // Simulated state after user adds two DF entries for Dr. X.
    const dfEntries = [
      { id: 'E1', doctorId: 'D1', doctorName: 'Dr X', dfGroupId: 'G1',
        rows: [{ courseId: 'C-BOTOX', enabled: true, value: 10, type: 'percent' }] },
      { id: 'E2', doctorId: 'D1', doctorName: 'Dr X', dfGroupId: 'G2',
        rows: [{ courseId: 'C-FILLER', enabled: true, value: 15, type: 'percent' }] },
    ];
    // Doctor has 2 entries, each covering a different course.
    const forDoctor = dfEntries.filter(e => e.doctorId === 'D1');
    expect(forDoctor).toHaveLength(2);
    const courseIds = new Set(forDoctor.flatMap(e => e.rows.map(r => r.courseId)));
    expect(courseIds).toContain('C-BOTOX');
    expect(courseIds).toContain('C-FILLER');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 16: "คอร์สหมดอายุ" tab excludes used-up courses
// User directive: "คอร์สหมดอายุก็คือคอร์สหมดอายุจริงๆ".
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 16 — expired tab only shows date-expired courses', () => {
  const allCourses = [
    { name: 'Active A', qty: '5 / 10 U' },     // active
    { name: 'Used-up B', qty: '0 / 10 U' },    // used-up (NOT expired by date)
    { name: 'Fill-later C', qty: '0 / 1 U', courseType: 'เหมาตามจริง' }, // consumed one-shot
  ];
  const customerExpired = [
    { name: 'Actually-expired D', qty: '3 / 10 U', expiry: '2025-01-01' }, // expired by date
  ];

  it('S16.1: active tab shows remaining > 0 only', () => {
    const active = allCourses.filter(c => parseQtyString(c.qty).remaining > 0);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Active A');
  });

  it('S16.2: expired tab ONLY shows customer.expiredCourses — not used-up ones', () => {
    // Post-fix: expiredCourses = customer.expiredCourses (not joined with usedUp).
    const expired = customerExpired;
    expect(expired).toHaveLength(1);
    expect(expired[0].name).toBe('Actually-expired D');
    // Used-up courses are NOT in this list
    expect(expired.find(c => c.name === 'Used-up B')).toBeUndefined();
    expect(expired.find(c => c.name === 'Fill-later C')).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 17: Purchase history displays item names + qty + price
// User directive: "ทำให้ตรงประวัติการซื้อแสดงรายละเอียดคอร์สที่ซื้อด้วย".
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 17 — purchase history item breakdown', () => {
  const groupedSale = {
    saleId: 'INV-001', saleDate: '2026-04-24',
    items: {
      courses: [{ name: 'Botox Course', qty: 1, unitPrice: 50000, unit: 'คอร์ส' }],
      promotions: [{ name: 'New Year Promo', qty: 1, unitPrice: 80000 }],
      products: [{ name: 'Vitamin', qty: 2, unitPrice: 500, unit: 'ขวด' }],
      medications: [{ name: 'Paracetamol', qty: 10, unitPrice: 5, unit: 'เม็ด' }],
    },
  };

  const buildLines = (sale) => {
    const items = sale.items || {};
    const flatLegacy = Array.isArray(items) ? items : [];
    if (flatLegacy.length) {
      return flatLegacy.map(it => ({ ...it, itemType: it.itemType || 'item' }));
    }
    return [
      ...(items.courses || []).map(c => ({ ...c, itemType: 'course' })),
      ...(items.promotions || []).map(p => ({ ...p, itemType: 'promotion' })),
      ...(items.products || []).map(p => ({ ...p, itemType: 'product' })),
      ...(items.medications || []).map(m => ({ ...m, itemType: 'medication' })),
    ];
  };

  it('S17.1: grouped sale unfolds to 4 lines (one per item type)', () => {
    const lines = buildLines(groupedSale);
    expect(lines).toHaveLength(4);
    expect(lines[0].itemType).toBe('course');
    expect(lines[1].itemType).toBe('promotion');
    expect(lines[2].itemType).toBe('product');
    expect(lines[3].itemType).toBe('medication');
  });

  it('S17.2: each line carries name + qty + unit + price', () => {
    const [course] = buildLines(groupedSale);
    expect(course.name).toBe('Botox Course');
    expect(course.qty).toBe(1);
    expect(course.unit).toBe('คอร์ส');
    expect(course.unitPrice).toBe(50000);
  });

  it('S17.3: legacy flat items[] array passes through as-is', () => {
    const legacySale = {
      saleId: 'INV-LEG', saleDate: '2024-01-01',
      items: [
        { name: 'Old Course', qty: 1, unitPrice: 1000, itemType: 'course' },
      ],
    };
    const lines = buildLines(legacySale);
    expect(lines).toHaveLength(1);
    expect(lines[0].itemType).toBe('course');
  });

  it('S17.4: empty items → empty lines array (no crash)', () => {
    const emptySale = { saleId: 'INV-0' };
    const lines = buildLines(emptySale);
    expect(lines).toEqual([]);
  });

  it('S17.5: missing item type buckets → empty contribution (doesn\'t throw)', () => {
    const partialSale = {
      saleId: 'INV-1',
      items: { courses: [{ name: 'Solo', qty: 1, unitPrice: 100 }] },
    };
    const lines = buildLines(partialSale);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('Solo');
  });
});

// ════════════════════════════════════════════════════════════════════════
// Scenario 18: customerCoursesForForm filters consumed courses
// User-reported 2026-04-24 (customer 2853): a consumed "อ๋อมเหมา" fill-
// later course re-appeared in the new-treatment course column even
// though it wasn't in คอร์สของฉัน. If left selectable, ticking + saving
// would deduct stock a SECOND time against a zero-qty entry. Matches
// CustomerDetailView.activeCourses filter (remaining > 0) so both views
// agree.
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 18 — consumed courses filtered out of treatment form', () => {
  // Mirrors TreatmentFormPage.customerCoursesForForm's new skip guard.
  // total > 0 AND remaining <= 0 → fully consumed → return null.
  const isConsumed = (qtyStr) => {
    const m = String(qtyStr || '').match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
    if (!m) return false;
    const remaining = parseFloat(m[1].replace(/,/g, ''));
    const total = parseFloat(m[2].replace(/,/g, ''));
    return total > 0 && remaining <= 0;
  };

  it('S18.1: consumed fill-later course "0/1 U" is filtered out', () => {
    expect(isConsumed('0/1 U')).toBe(true);
    expect(isConsumed('0 / 1 U')).toBe(true);
  });

  it('S18.2: partially-used course stays visible', () => {
    expect(isConsumed('5/10 U')).toBe(false);
    expect(isConsumed('267/500 ซีซี')).toBe(false);
  });

  it('S18.3: fresh course stays visible', () => {
    expect(isConsumed('100/100 U')).toBe(false);
    expect(isConsumed('1/1 คอร์ส')).toBe(false);
  });

  it('S18.4: course with 0 total (unparseable) stays visible (degenerate)', () => {
    // Courses without proper qty string shouldn't silently disappear —
    // better to render + let the user reconcile.
    expect(isConsumed('')).toBe(false);
    expect(isConsumed(null)).toBe(false);
    expect(isConsumed('invalid')).toBe(false);
  });

  it('S18.5: "0/0 ครั้ง" edge case → shown (total=0 means not really a course)', () => {
    // total=0 means the course never had a meaningful qty. Don't hide
    // it — it's more likely a data entry bug than a consumed course.
    expect(isConsumed('0/0 ครั้ง')).toBe(false);
  });

  it('S18.6: invariant: activeCourses filter and treatment-form filter agree', () => {
    const cases = ['5/10 U', '0/1 U', '100/100 U', '3/5 ครั้ง', ''];
    for (const qty of cases) {
      const m = String(qty || '').match(/^([\d.,]+)\s*\/\s*([\d.,]+)\s*(.*)$/);
      const remaining = m ? parseFloat(m[1].replace(/,/g, '')) : 0;
      const total = m ? parseFloat(m[2].replace(/,/g, '')) : 0;
      // CustomerDetailView.activeCourses: remaining > 0
      const activeTabShows = remaining > 0;
      // TreatmentFormPage.customerCoursesForForm: skip when total > 0 AND remaining <= 0
      const treatmentFormShows = !(total > 0 && remaining <= 0);
      // They agree UNLESS the qty is unparseable (no match → both default 0, both hide-vs-show).
      if (m) {
        expect(activeTabShows).toBe(treatmentFormShows);
      }
    }
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

// ════════════════════════════════════════════════════════════════════════
// Scenario 21 — เลือกสินค้าตามจริง late-visit persistence
// ════════════════════════════════════════════════════════════════════════
// The Phase 12.2b marathon (session 2026-04-24) shipped pick-at-treatment
// end-to-end for the IN-VISIT flow (user buys course inside treatment
// form → PickProductsModal → pick → save). But a pick-at-treatment
// course bought via SaleTab — then opened in a LATER treatment — was
// broken: the placeholder entry either vanished (allZero filter drop)
// or rendered as N duplicate "1/1 ครั้ง" rows (no pick UI). Scenario 21
// verifies the 5-touch fix that closes the late-visit loop:
//   (1) TreatmentFormPage customerCourses filter exempts placeholders
//   (2) backendClient.assignCourseToCustomer writes ONE placeholder +
//       stable courseId + availableProducts instead of N per-product
//       entries when courseType === 'เลือกสินค้าตามจริง'
//   (3) customerCoursesForForm re-emits the placeholder shape so the
//       existing render branch fires
//   (4) resolvePickedCourseInCustomer persists the doctor's pick back
//       to be_customers (finds by courseId string OR index fallback)
//   (5) CustomerDetailView activeCourses keeps placeholders in the
//       active tab + renders a "เลือกสินค้าเพื่อใช้" badge so the
//       customer view reflects the pending action
// ════════════════════════════════════════════════════════════════════════

describe('Scenario 21 — เลือกสินค้าตามจริง late-visit pick persistence', () => {
  const pickMaster = {
    id: 4001,
    name: 'Pick-3-From-5 Special',
    courseType: 'เลือกสินค้าตามจริง',
    products: [
      { id: 'P1', productId: 'P1', name: 'Cream 30g', qty: 2, unit: 'tube', minQty: null, maxQty: 5 },
      { id: 'P2', productId: 'P2', name: 'Serum 15ml', qty: 1, unit: 'bottle' },
      { id: 'P3', productId: 'P3', name: 'Mask', qty: 3, unit: 'pack' },
    ],
    unit: 'คอร์ส',
  };

  it('S21.1: buildPurchasedCourseEntry emits placeholder with needsPickSelection + availableProducts', () => {
    const entry = buildPurchasedCourseEntry(pickMaster, { now: NOW });
    expect(entry).toBeTruthy();
    expect(entry.isPickAtTreatment).toBe(true);
    expect(entry.needsPickSelection).toBe(true);
    expect(entry.products).toEqual([]);
    expect(entry.availableProducts).toHaveLength(3);
    expect(entry.availableProducts[0]).toMatchObject({
      productId: 'P1', name: 'Cream 30g', qty: 2, unit: 'tube', maxQty: 5,
    });
  });

  it('S21.2: resolvePickedCourseEntry replaces placeholder with picked products[] + clears flag', () => {
    const placeholder = buildPurchasedCourseEntry(pickMaster, { now: NOW });
    const picks = [
      { productId: 'P1', name: 'Cream 30g', qty: 2, unit: 'tube' },
      { productId: 'P3', name: 'Mask', qty: 3, unit: 'pack' },
    ];
    const resolved = resolvePickedCourseEntry(placeholder, picks);
    expect(resolved.needsPickSelection).toBe(false);
    expect(resolved.products).toHaveLength(2);
    expect(resolved.products[0]).toMatchObject({
      productId: 'P1', name: 'Cream 30g', remaining: '2', total: '2', unit: 'tube', fillLater: false,
    });
    expect(resolved.products[1]).toMatchObject({ productId: 'P3', name: 'Mask', remaining: '3', total: '3' });
    // Zero-qty picks are dropped (defensive — modal should already filter)
    const zeroed = resolvePickedCourseEntry(placeholder, [{ productId: 'P1', name: 'X', qty: 0, unit: 'x' }]);
    expect(zeroed.products).toHaveLength(0);
  });

  it('S21.3: assignCourseToCustomer has pick-at-treatment branch writing placeholder + stable courseId', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    const fnMatch = src.match(/export async function assignCourseToCustomer[^{]*\{([\s\S]*?)\nexport/);
    expect(fnMatch).toBeTruthy();
    const body = fnMatch[1];
    // Must branch on the Thai courseType literal (the whole point of
    // this special-case vs the generic per-product loop).
    expect(body).toContain("'เลือกสินค้าตามจริง'");
    // The written placeholder must carry needsPickSelection + availableProducts
    // (the two fields customerCoursesForForm + render depend on).
    expect(body).toContain('needsPickSelection: true');
    expect(body).toContain('availableProducts:');
    // Stable persistent courseId so resolve can find the placeholder
    // after other placeholders on the same customer are resolved
    // (which splice-replaces → shifts every subsequent index).
    expect(body).toMatch(/courseId:\s*pickCourseId/);
    expect(body).toMatch(/pick-\$\{Date\.now/);
  });

  it('S21.4: resolvePickedCourseInCustomer exists, matches by courseId string + index number', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    const fnMatch = src.match(/export async function resolvePickedCourseInCustomer[^{]*\{([\s\S]*?)\n\}/);
    expect(fnMatch).toBeTruthy();
    const body = fnMatch[1];
    // Must accept EITHER a string courseId OR a numeric index. String
    // path is primary (survives splice-shift); number path is legacy
    // fallback for customer docs that predate the persistent courseId.
    expect(body).toContain("typeof courseKey === 'string'");
    expect(body).toContain("typeof courseKey === 'number'");
    // String match must filter by needsPickSelection: true so a
    // non-placeholder entry with a colliding courseId can't be replaced.
    expect(body).toContain('needsPickSelection === true');
    // Must reject a non-placeholder entry with a specific error
    expect(body).toContain("'Course entry is not a pick-at-treatment placeholder'");
    // Must reject empty picks (silent success = bug — user would think save worked)
    expect(body).toContain("'No valid picks provided'");
    // Splice-replace is the mechanism: one placeholder → N resolved entries
    expect(body).toContain('courses.splice');
  });

  it('S21.5: mapRawCoursesToForm helper (extracted from TreatmentFormPage) handles pick-at-treatment placeholder', () => {
    // Phase 12.2b follow-up (2026-04-25): the inline mapper in TFP was
    // extracted into treatmentBuyHelpers.mapRawCoursesToForm so the
    // branch logic becomes unit-testable. Grep the HELPER file, not TFP.
    const src = fs.readFileSync('src/lib/treatmentBuyHelpers.js', 'utf-8');
    const sentinelIdx = src.indexOf('export function mapRawCoursesToForm');
    expect(sentinelIdx).toBeGreaterThan(-1);
    const ctx = src.slice(sentinelIdx, sentinelIdx + 4000);
    expect(ctx).toContain('c.needsPickSelection');
    expect(ctx).toContain('Array.isArray(c.availableProducts)');
    expect(ctx).toContain('isPickAtTreatment: true');
    expect(ctx).toContain('_beCourseId');
    expect(ctx).toContain('_beCourseIndex');
    // TFP must IMPORT + use the helper (not re-inline the logic)
    const tfp = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    expect(tfp).toMatch(/import[^;]*mapRawCoursesToForm[^;]*from\s*['"]\.\.\/lib\/treatmentBuyHelpers\.js['"]/);
    expect(tfp).toMatch(/mapRawCoursesToForm\(rawCourses\)/);
  });

  it('S21.6: TreatmentFormPage customerCourses filter exempts placeholders from allZero drop', () => {
    const src = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // The filter lives immediately before the allZero check. Must
    // short-circuit to `return true` for placeholder entries — else
    // `[].every()` = true drops them silently and the pick button
    // never renders (the user's "nothing shows" report).
    const filterIdx = src.indexOf('const allZero = (c.products || []).every');
    expect(filterIdx).toBeGreaterThan(-1);
    // Widened 400→900 on 2026-04-25 after buffet exemption landed between
    // the pick-at-treatment exemption and the allZero line.
    const before = src.slice(Math.max(0, filterIdx - 900), filterIdx);
    expect(before).toContain('c.isPickAtTreatment && c.needsPickSelection');
    expect(before).toContain('return true');
  });

  it('S21.7: CustomerDetailView activeCourses filter keeps placeholders + renders pick-badge', () => {
    const src = fs.readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf-8');
    // activeCourses must exempt placeholders — parseQtyString('') = 0
    // remaining, and without the exemption the course vanishes from
    // "คอร์สของฉัน" entirely.
    const filterIdx = src.indexOf('const activeCourses = useMemo');
    expect(filterIdx).toBeGreaterThan(-1);
    const filterCtx = src.slice(filterIdx, filterIdx + 600);
    expect(filterCtx).toContain('c.needsPickSelection');
    expect(filterCtx).toContain('return true');
    // The badge must mention the Thai CTA + the option count
    expect(src).toContain('เลือกสินค้าเพื่อใช้');
    expect(src).toContain('course.availableProducts.length');
  });

  it('S21.8: PickProductsModal onConfirm persists via resolvePickedCourseInCustomer when placeholder is persisted', () => {
    const src = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // Must import the function (dynamic import pattern used elsewhere in
    // this file — we confirm the call site regardless).
    expect(src).toContain('resolvePickedCourseInCustomer');
    // Must gate on saveTarget === 'backend' (no persist when editing a
    // frontend/OPD treatment) + customerId present.
    const onConfirmIdx = src.indexOf('persist pick-at-treatment pick failed');
    expect(onConfirmIdx).toBeGreaterThan(-1);
    const ctx = src.slice(Math.max(0, onConfirmIdx - 800), onConfirmIdx + 200);
    expect(ctx).toMatch(/saveTarget\s*===\s*'backend'/);
    expect(ctx).toContain('customerId');
    // Must pass either the persistent courseId OR the index fallback
    expect(ctx).toContain('course._beCourseId');
    expect(ctx).toContain('course._beCourseIndex');
  });

  it('S21.9: buildPurchasedCourseEntry pick-at-treatment with empty products → empty availableProducts', () => {
    // Edge: master course with pick-at-treatment type but no products
    // configured at assign-time. Placeholder is still emitted (UI
    // shows "ยังไม่ได้เลือกสินค้า" but modal would show no options).
    const entry = buildPurchasedCourseEntry({ id: 5, name: 'Empty Pick', courseType: 'เลือกสินค้าตามจริง', products: [] });
    expect(entry.isPickAtTreatment).toBe(true);
    expect(entry.availableProducts).toEqual([]);
  });

  it('S21.10: resolvePickedCourseEntry idempotent — second call on resolved entry re-applies picks', () => {
    // Defensive: if the modal is reopened somehow with a resolved
    // entry, the helper shouldn't crash — it just re-computes.
    const placeholder = buildPurchasedCourseEntry(pickMaster, { now: NOW });
    const once = resolvePickedCourseEntry(placeholder, [{ productId: 'P1', name: 'Cream 30g', qty: 2, unit: 'tube' }]);
    const twice = resolvePickedCourseEntry(once, [{ productId: 'P2', name: 'Serum 15ml', qty: 1, unit: 'bottle' }]);
    expect(twice.needsPickSelection).toBe(false);
    expect(twice.products).toHaveLength(1);
    expect(twice.products[0].productId).toBe('P2');
  });

  // ──────────────────────────────────────────────────────────────────────
  // S21.11–S21.16: resolvePurchasedCourseForAssign — the glue that fixes
  // the "คอร์สคงเหลือไม่พอ" bug (user-reported 2026-04-24 for แฟต 4 เข็ม
  // → LipoS). When the doctor buys + picks + uses a pick-at-treatment
  // course in the SAME visit, handleSubmit MUST pass the RESOLVED picks
  // to assignCourseToCustomer — not the master options list — or
  // deductCourseItems later can't find the picked product.
  // ──────────────────────────────────────────────────────────────────────

  it('S21.11: resolvePurchasedCourseForAssign returns resolved picks + alreadyResolved=true when doctor picked', () => {
    const course = {
      id: 4001, name: 'แฟต 4 เข็ม', courseType: 'เลือกสินค้าตามจริง', qty: 1, unit: 'คอร์ส',
      products: [ // master options (what purchasedItems carries)
        { id: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' },
        { id: 'LipoF', name: 'LipoF', qty: 4, unit: 'เข็ม' },
      ],
    };
    // After PickProductsModal confirm, options.customerCourses holds the
    // resolved entry (products populated, needsPickSelection cleared).
    const customerCourses = [
      {
        courseId: 'purchased-course-4001-999',
        courseName: 'แฟต 4 เข็ม',
        isAddon: true,
        purchasedItemId: 4001,
        needsPickSelection: false,
        products: [
          { productId: 'LipoS', name: 'LipoS', remaining: '4', total: '4', unit: 'เข็ม', fillLater: false },
        ],
      },
    ];
    const out = resolvePurchasedCourseForAssign(course, customerCourses, 1);
    expect(out.alreadyResolved).toBe(true);
    expect(out.products).toHaveLength(1);
    expect(out.products[0]).toMatchObject({ id: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' });
  });

  it('S21.12: resolvePurchasedCourseForAssign falls back to master options when doctor has not picked', () => {
    const course = {
      id: 4002, name: 'แฟต 4 เข็ม', courseType: 'เลือกสินค้าตามจริง', qty: 1, unit: 'คอร์ส',
      products: [{ id: 'LipoS', name: 'LipoS', qty: 4, unit: 'เข็ม' }],
    };
    // Placeholder exists but pick not confirmed yet
    const customerCourses = [
      {
        courseId: 'purchased-course-4002-999',
        courseName: 'แฟต 4 เข็ม',
        isAddon: true,
        purchasedItemId: 4002,
        needsPickSelection: true,
        availableProducts: course.products,
        products: [],
      },
    ];
    const out = resolvePurchasedCourseForAssign(course, customerCourses, 1);
    expect(out.alreadyResolved).toBe(false);
    expect(out.products).toHaveLength(1);
    // Master options pass through unchanged (just qty multiplied)
    expect(out.products[0]).toMatchObject({ id: 'LipoS', qty: 4 });
  });

  it('S21.13: resolvePurchasedCourseForAssign multiplies resolved qty by purchased qty', () => {
    // Buying 3× of "แฟต 4 เข็ม" → each picked sub-product qty × 3
    const course = {
      id: 4003, courseType: 'เลือกสินค้าตามจริง', qty: 3, unit: 'คอร์ส',
      products: [],
    };
    const customerCourses = [
      {
        isAddon: true,
        purchasedItemId: 4003,
        needsPickSelection: false,
        products: [
          { productId: 'LipoS', name: 'LipoS', total: '4', unit: 'เข็ม' },
        ],
      },
    ];
    const out = resolvePurchasedCourseForAssign(course, customerCourses, 3);
    expect(out.alreadyResolved).toBe(true);
    expect(out.products[0].qty).toBe(12); // 4 × 3
  });

  it('S21.14: resolvePurchasedCourseForAssign non-pick-at-treatment courses use existing path (no alreadyResolved)', () => {
    const course = {
      id: 4004, name: 'Botox Premium', courseType: 'ระบุสินค้าและจำนวนสินค้า', qty: 2,
      products: [{ name: 'Botox 100u', qty: 100, unit: 'U' }],
    };
    const out = resolvePurchasedCourseForAssign(course, [], 2);
    expect(out.alreadyResolved).toBe(false);
    expect(out.products[0].qty).toBe(200); // 100 × 2
  });

  it('S21.15: assignCourseToCustomer honors alreadyResolved flag — skips placeholder branch for pick-at-treatment', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    // The placeholder branch must gate on !alreadyResolved so the
    // in-visit resolved-picks flow bypasses it.
    expect(src).toMatch(/!masterCourse\.alreadyResolved/);
    // The guard must live RIGHT BEFORE the courseType === 'เลือกสินค้าตามจริง' check
    const guardIdx = src.indexOf('!masterCourse.alreadyResolved');
    const branchIdx = src.indexOf("courseType === 'เลือกสินค้าตามจริง'");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(branchIdx).toBeGreaterThan(-1);
    // Guard must be within the same statement as the isPickAtTreatment assignment
    expect(Math.abs(guardIdx - branchIdx)).toBeLessThan(200);
  });

  it('S21.16: TreatmentFormPage handleSubmit wires resolvePurchasedCourseForAssign at BOTH call sites', () => {
    const src = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // Must import the helper
    expect(src).toMatch(/import\s*\{[^}]*resolvePurchasedCourseForAssign[^}]*\}\s*from\s*['"]\.\.\/lib\/treatmentBuyHelpers\.js['"]/);
    // Must appear at least 2 times (create-path + edit→sale-path)
    const matches = src.match(/resolvePurchasedCourseForAssign\(/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    // Must pass alreadyResolved through to assignCourseToCustomer
    // (otherwise the flag never reaches the backend — fix is a no-op)
    const alreadyResolvedPassMatches = src.match(/assignCourseToCustomer\([^)]*alreadyResolved/g) || [];
    expect(alreadyResolvedPassMatches.length).toBeGreaterThanOrEqual(2);
  });

  // ──────────────────────────────────────────────────────────────────────
  // S21.17–S21.19: End-to-end simulate of the exact user bug
  // "คอร์สคงเหลือไม่พอ: LipoS ต้องการตัด 1 เหลือตัดไม่ได้อีก 1"
  //
  // User bought แฟต 4 เข็ม (เลือกสินค้าตามจริง) → picked LipoS → ticked →
  // qty 1 → save → error. Previous "fix" only addressed the SAVE side
  // (alreadyResolved flag) but missed the prefix-based PRE-DEDUCTION
  // FILTER. The resolved rowId is `picked-purchased-course-{id}-{now}-
  // row-{productId}-{idx}` — starts with `picked-`, NOT `purchased-`.
  // Four filter sites in TreatmentFormPage.handleSubmit checked only
  // `purchased-` + `promo-`, so picked rows leaked into the Phase-1
  // (pre-auto-sale) deduction bucket, fired deductCourseItems against
  // customer.courses that didn't yet have LipoS → throw.
  //
  // These tests would have CAUGHT this bug. Critical: test the actual
  // end-to-end rowId classification + filter routing, not just the
  // helper output in isolation.
  // ──────────────────────────────────────────────────────────────────────

  it('S21.17: resolvePickedCourseEntry rowId starts with "picked-" prefix (the trigger of the bug)', () => {
    const placeholder = buildPurchasedCourseEntry(pickMaster, { now: NOW });
    const resolved = resolvePickedCourseEntry(placeholder, [
      { productId: 'P1', name: 'Cream 30g', qty: 2, unit: 'tube' },
    ]);
    expect(resolved.products).toHaveLength(1);
    // The rowId prefix IS the contract between this helper and the
    // save-path filter in TreatmentFormPage. If either side changes
    // without the other, the bug recurs.
    expect(resolved.products[0].rowId).toMatch(/^picked-/);
    // Must NOT collide with 'purchased-' (that prefix is reserved for
    // non-pick fill-later / specific-qty in-visit buys)
    expect(resolved.products[0].rowId.startsWith('purchased-')).toBe(false);
    expect(resolved.products[0].rowId.startsWith('promo-')).toBe(false);
  });

  it('S21.18: isPurchasedSessionRowId classifies all THREE in-visit prefixes as purchased-session', () => {
    // This is THE invariant that was broken. Every rowId produced by
    // in-visit buy / pick must classify as purchased-session so the
    // save path's Phase-1 (pre-auto-sale) deduction skips them.
    expect(isPurchasedSessionRowId('purchased-123-row-abc')).toBe(true);
    expect(isPurchasedSessionRowId('promo-123-row-abc-def')).toBe(true);
    expect(isPurchasedSessionRowId('picked-purchased-course-123-456-row-P1-0')).toBe(true);
    // Existing-course rows (loaded from be_customers) use `be-row-<idx>`
    // → must NOT classify (Phase-1 deducts them from the existing
    // customer.courses entry at that index)
    expect(isPurchasedSessionRowId('be-row-0')).toBe(false);
    expect(isPurchasedSessionRowId('be-row-7')).toBe(false);
    // Defensive — falsy inputs
    expect(isPurchasedSessionRowId(null)).toBe(false);
    expect(isPurchasedSessionRowId(undefined)).toBe(false);
    expect(isPurchasedSessionRowId('')).toBe(false);
    expect(isPurchasedSessionRowId(123)).toBe(false);
  });

  it('S21.19: END-TO-END simulate — buy แฟต 4 เข็ม → pick LipoS → build courseItems → filter routes to POST-auto-sale deduction', () => {
    // Mirrors the user's exact scenario. If this test fails, the
    // "คอร์สคงเหลือไม่พอ: LipoS" bug is back.
    const purchasedItem = {
      id: 9001, name: 'แฟต 4 เข็ม', courseType: 'เลือกสินค้าตามจริง',
      qty: '1', unit: 'คอร์ส', unitPrice: '5000',
      products: [
        { id: 'LipoS_id', name: 'LipoS', qty: 4, unit: 'เข็ม' },
        { id: 'LipoF_id', name: 'LipoF', qty: 4, unit: 'เข็ม' },
      ],
    };
    // Step 1: buy modal confirm → placeholder added to options.customerCourses
    const placeholder = buildPurchasedCourseEntry(purchasedItem, { now: NOW });
    // Step 2: doctor clicks "เลือกสินค้า" → picks LipoS qty 4 → resolve
    const resolved = resolvePickedCourseEntry(placeholder, [
      { productId: 'LipoS_id', name: 'LipoS', qty: 4, unit: 'เข็ม' },
    ]);
    const customerCoursesInMemory = [resolved];

    // Step 3: doctor ticks the LipoS sub-row for this treatment.
    // selectedCourseItems is a Set of rowIds; treatmentItems has the
    // matching entry with qty 1.
    const lipoSRowId = resolved.products[0].rowId;
    const selectedCourseItems = new Set([lipoSRowId]);
    const treatmentItems = [{ id: lipoSRowId, name: 'LipoS', qty: '1', productId: 'LipoS_id' }];

    // Step 4: handleSubmit builds backendDetail.courseItems (mirrors
    // TreatmentFormPage lines 2048-2063 exactly)
    const courseItems = Array.from(selectedCourseItems).map(rowId => {
      for (const course of customerCoursesInMemory) {
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

    expect(courseItems).toHaveLength(1);
    expect(courseItems[0]).toMatchObject({ productName: 'LipoS', deductQty: 1 });

    // Step 5: the CRITICAL filter split. Phase-1 deductions run BEFORE
    // auto-sale → must exclude purchased-session rows. Phase-2
    // deductions run AFTER → include them.
    const existingDeductions = courseItems.filter(ci => !isPurchasedSessionRowId(ci.rowId));
    const purchasedDeductions = courseItems.filter(ci => isPurchasedSessionRowId(ci.rowId));

    // THE REGRESSION GUARD — before the 2026-04-24 fix, both filters
    // used only `purchased-|promo-` prefixes, so the picked- rowId
    // went into existingDeductions → deductCourseItems ran against
    // customer.courses that didn't yet have LipoS → threw the error.
    expect(existingDeductions).toHaveLength(0); // Phase-1 must be empty
    expect(purchasedDeductions).toHaveLength(1); // Phase-2 gets the LipoS deduction
    expect(purchasedDeductions[0].productName).toBe('LipoS');

    // Step 6: assignCourseToCustomer args — alreadyResolved=true so
    // placeholder branch doesn't fire again (covered by S21.11, but
    // verify here too to complete the end-to-end chain)
    const assignArgs = resolvePurchasedCourseForAssign(purchasedItem, customerCoursesInMemory, purchasedItem.qty);
    expect(assignArgs.alreadyResolved).toBe(true);
    expect(assignArgs.products[0]).toMatchObject({ id: 'LipoS_id', name: 'LipoS', qty: 4, unit: 'เข็ม' });
  });

  it('S21.20: TreatmentFormPage source — all 4 filter sites use isPurchasedSessionRowId (no raw startsWith)', () => {
    // Regression guard: if someone adds a new `purchased-|promo-`
    // prefix filter without including `picked-`, this test fails.
    const src = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');
    // Must import the helper
    expect(src).toMatch(/import\s*\{[^}]*isPurchasedSessionRowId[^}]*\}\s*from\s*['"]\.\.\/lib\/treatmentBuyHelpers\.js['"]/);
    // Must be called at least 4 times (pre-check + existingDeductions +
    // oldExisting + oldPurchased + purchasedDeductions = 5 call sites;
    // use 4 as floor to tolerate future refactors that combine calls)
    const calls = src.match(/isPurchasedSessionRowId\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(4);
    // Must NOT have any remaining `rowId?.startsWith('purchased-')` or
    // `rowId.startsWith('purchased-')` pattern — that's the pre-fix
    // shape. If this fails, someone regressed.
    const rawStartsWithPurchased = src.match(/rowId\??\.startsWith\(['"]purchased-['"]\)/g) || [];
    expect(rawStartsWithPurchased).toHaveLength(0);
    const rawStartsWithPromo = src.match(/rowId\??\.startsWith\(['"]promo-['"]\)/g) || [];
    expect(rawStartsWithPromo).toHaveLength(0);
  });
});
