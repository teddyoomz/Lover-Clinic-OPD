// ─── Phase 12.2b Step 3 · mapMasterToCourse migrate adversarial tests ─────
// Tests master_data/courses → be_courses mapping for the 13 new Phase 12.2b
// fields + main-product fallback + dual-shape (camelCase + snake_case) input
// acceptance. Real migrate-run happens inside runMasterToBeMigration, but
// since the mapper is pure we can exercise every edge case with plain
// objects — no Firestore / no session.

import { describe, it, expect } from 'vitest';
import { mapMasterToCourse } from '../src/lib/backendClient.js';

const NOW = '2026-04-24T10:00:00.000Z';

// Matches the shape normalizeCourseJsonItem emits (snake_case top-level,
// mixed-case courseProducts[] — intentional, preserved for round-trip).
const buildNewShapeSrc = (overrides = {}) => ({
  id: 1067,
  course_code: 'C-001',
  course_name: '11/12 เหมาตามจริง',
  receipt_course_name: 'ิbotox',
  course_category: 'Botox',
  procedure_type: '',
  course_type: 'เหมาตามจริง',
  usage_type: 'ระดับสาขา',
  time: null,
  period: 30,
  sale_price: 5000,
  sale_price_incl_vat: 5350,
  is_vat_included: true,
  deduct_cost: 100,
  days_before_expire: 365,
  main_product_id: '281',
  main_product_name: 'BA - Allergan 50 U',
  main_product_qty: 12,
  qty_per_time: 1,
  min_qty: null,
  max_qty: null,
  is_df: true,
  df_editable_global: false,
  is_hidden_for_sale: false,
  status: 'ใช้งาน',
  courseProducts: [
    {
      productId: '281', productName: 'BA - Allergan 50 U', qty: 12,
      qty_per_time: 1, min_qty: null, max_qty: null,
      is_required: true, is_df: true, is_hidden: false, is_main_product: true,
    },
  ],
  ...overrides,
});

describe('mapMasterToCourse — guard clauses', () => {
  it('CM1 missing id → null', () => {
    expect(mapMasterToCourse(buildNewShapeSrc(), null, NOW)).toBeNull();
    expect(mapMasterToCourse(buildNewShapeSrc(), '', NOW)).toBeNull();
    expect(mapMasterToCourse(buildNewShapeSrc(), undefined, NOW)).toBeNull();
  });

  it('CM2 null src → null', () => {
    expect(mapMasterToCourse(null, 'abc', NOW)).toBeNull();
    expect(mapMasterToCourse(undefined, 'abc', NOW)).toBeNull();
  });

  it('CM3 empty src → stubbed be_courses doc with "(imported)" fallback', () => {
    const out = mapMasterToCourse({}, 'doc-1', NOW);
    expect(out).toBeTruthy();
    expect(out.courseId).toBe('doc-1');
    expect(out.courseName).toBe('(imported)');
  });
});

describe('mapMasterToCourse — Phase 12.2b top-level fields', () => {
  it('CM4 procedureType from procedure_type_name / procedure_type / procedureType', () => {
    expect(mapMasterToCourse({ procedure_type_name: 'a' }, 'x', NOW).procedureType).toBe('a');
    expect(mapMasterToCourse({ procedure_type: 'b' }, 'x', NOW).procedureType).toBe('b');
    expect(mapMasterToCourse({ procedureType: 'c' }, 'x', NOW).procedureType).toBe('c');
  });

  it('CM5 deductCost from deduct_cost coerced to Number', () => {
    expect(mapMasterToCourse({ deduct_cost: '250' }, 'x', NOW).deductCost).toBe(250);
    expect(mapMasterToCourse({ deductCost: 500 }, 'x', NOW).deductCost).toBe(500);
  });

  it('CM6 deductCost null/empty-string → null (not 0)', () => {
    expect(mapMasterToCourse({ deduct_cost: null }, 'x', NOW).deductCost).toBeNull();
    expect(mapMasterToCourse({ deduct_cost: '' }, 'x', NOW).deductCost).toBeNull();
  });

  it('CM7 mainProductId + mainProductName from snake_case', () => {
    const out = mapMasterToCourse(buildNewShapeSrc(), 'c', NOW);
    expect(out.mainProductId).toBe('281');
    expect(out.mainProductName).toBe('BA - Allergan 50 U');
  });

  it('CM8 mainProductId fallback from courseProducts when top-level empty', () => {
    const src = buildNewShapeSrc({ main_product_id: '', main_product_name: '' });
    const out = mapMasterToCourse(src, 'c', NOW);
    // courseProducts[0].is_main_product flag → used for fallback
    expect(out.mainProductId).toBe('281');
    expect(out.mainProductName).toBe('BA - Allergan 50 U');
  });

  it('CM9 mainQty + qtyPerTime numeric', () => {
    const out = mapMasterToCourse(buildNewShapeSrc(), 'c', NOW);
    expect(out.mainQty).toBe(12);
    expect(out.qtyPerTime).toBe(1);
  });

  it('CM10 daysBeforeExpire + period numeric', () => {
    const out = mapMasterToCourse(buildNewShapeSrc(), 'c', NOW);
    expect(out.daysBeforeExpire).toBe(365);
    expect(out.period).toBe(30);
  });

  it('CM11 dfEditableGlobal + isHidden boolean', () => {
    const out = mapMasterToCourse(buildNewShapeSrc({ df_editable_global: true, is_hidden_for_sale: true }), 'c', NOW);
    expect(out.dfEditableGlobal).toBe(true);
    expect(out.isHidden).toBe(true);
  });

  it('CM12 isHidden also accepts is_hidden (future alias)', () => {
    const out = mapMasterToCourse({ is_hidden: true }, 'c', NOW);
    expect(out.isHidden).toBe(true);
  });

  it('CM13 isDf defaults to TRUE when both shapes unset (matches emptyCourseForm)', () => {
    const out = mapMasterToCourse({}, 'c', NOW);
    expect(out.isDf).toBe(true);
  });

  it('CM14 isDf explicit false honored over default', () => {
    expect(mapMasterToCourse({ isDf: false }, 'c', NOW).isDf).toBe(false);
    expect(mapMasterToCourse({ is_df: false }, 'c', NOW).isDf).toBe(false);
    expect(mapMasterToCourse({ is_df: 0 }, 'c', NOW).isDf).toBe(false);
  });

  it('CM15 usageType preserved verbatim (already translated by normalizer)', () => {
    expect(mapMasterToCourse({ usage_type: 'ระดับสาขา' }, 'c', NOW).usageType).toBe('ระดับสาขา');
    expect(mapMasterToCourse({ usage_type: 'ระดับคลินิก' }, 'c', NOW).usageType).toBe('ระดับคลินิก');
  });
});

describe('mapMasterToCourse — courseProducts pivot fields', () => {
  it('CM16 sub-item carries all 6 new fields', () => {
    const out = mapMasterToCourse(buildNewShapeSrc(), 'c', NOW);
    const [p] = out.courseProducts;
    expect(p.qtyPerTime).toBe(1);
    expect(p.minQty).toBeNull();
    expect(p.maxQty).toBeNull();
    expect(p.isRequired).toBe(true);
    expect(p.isDf).toBe(true);
    expect(p.isHidden).toBe(false);
  });

  it('CM17 sub-item isDf defaults to true when both camelCase + snake_case unset', () => {
    const src = buildNewShapeSrc({
      courseProducts: [{ productId: 'p1', productName: 'P1', qty: 1 }],
    });
    expect(mapMasterToCourse(src, 'c', NOW).courseProducts[0].isDf).toBe(true);
  });

  it('CM18 sub-item snake_case inputs read correctly', () => {
    const src = buildNewShapeSrc({
      courseProducts: [{
        product_id: 'p2', product_name: 'P2', qty: 3,
        qty_per_time: 2, min_qty: 1, max_qty: 5,
        is_required: true, is_df: false, is_hidden: true,
      }],
    });
    const [p] = mapMasterToCourse(src, 'c', NOW).courseProducts;
    expect(p.productId).toBe('p2');
    expect(p.productName).toBe('P2');
    expect(p.qtyPerTime).toBe(2);
    expect(p.minQty).toBe(1);
    expect(p.maxQty).toBe(5);
    expect(p.isRequired).toBe(true);
    expect(p.isDf).toBe(false);
    expect(p.isHidden).toBe(true);
  });

  it('CM19 sub-item filters out rows with productId missing OR qty <= 0', () => {
    const src = buildNewShapeSrc({
      courseProducts: [
        { productId: 'p1', qty: 0 },
        { productId: '', qty: 5 },
        { productId: 'p2', qty: 1 },
      ],
    });
    const out = mapMasterToCourse(src, 'c', NOW);
    expect(out.courseProducts).toHaveLength(1);
    expect(out.courseProducts[0].productId).toBe('p2');
  });
});

describe('mapMasterToCourse — legacy shape compatibility (pre-12.2b)', () => {
  // Older master_data/courses docs written pre-Phase 12.2b carry a subset
  // of the fields. The mapper must not throw and must default safely.
  it('CM20 legacy doc with only courseName + salePrice migrates cleanly', () => {
    const src = { courseName: 'Legacy', salePrice: 1000 };
    const out = mapMasterToCourse(src, 'legacy-1', NOW);
    expect(out.courseName).toBe('Legacy');
    expect(out.salePrice).toBe(1000);
    expect(out.procedureType).toBe('');
    expect(out.deductCost).toBeNull();
    expect(out.mainProductId).toBe('');
    expect(out.isDf).toBe(true);
    expect(out.dfEditableGlobal).toBe(false);
    expect(out.isHidden).toBe(false);
    expect(out.courseProducts).toEqual([]);
  });

  it('CM21 legacy camelCase isDf=false preserved through migration', () => {
    const src = { courseName: 'L', salePrice: 1, isDf: false };
    expect(mapMasterToCourse(src, 'x', NOW).isDf).toBe(false);
  });

  it('CM22 salePrice resolver picks src.salePrice > src.sale_price > src.price', () => {
    expect(mapMasterToCourse({ salePrice: 1, sale_price: 2, price: 3 }, 'x', NOW).salePrice).toBe(1);
    expect(mapMasterToCourse({ sale_price: 2, price: 3 }, 'x', NOW).salePrice).toBe(2);
    expect(mapMasterToCourse({ price: 3 }, 'x', NOW).salePrice).toBe(3);
  });

  it('CM23 legacy courseProducts without new fields migrate with defaults', () => {
    const src = {
      courseProducts: [{ productId: 'p1', productName: 'P1', qty: 2 }],
    };
    const [p] = mapMasterToCourse(src, 'x', NOW).courseProducts;
    expect(p.productId).toBe('p1');
    expect(p.qty).toBe(2);
    expect(p.qtyPerTime).toBeNull();
    expect(p.minQty).toBeNull();
    expect(p.maxQty).toBeNull();
    expect(p.isRequired).toBe(false);
    expect(p.isDf).toBe(true);
    expect(p.isHidden).toBe(false);
  });
});

describe('mapMasterToCourse — timestamps + status', () => {
  it('CM24 createdAt preserved when existing, else now', () => {
    const existing = '2026-01-01T00:00:00.000Z';
    expect(mapMasterToCourse({ courseName: 'x' }, 'y', NOW, existing).createdAt).toBe(existing);
    expect(mapMasterToCourse({ courseName: 'x' }, 'y', NOW).createdAt).toBe(NOW);
  });

  it('CM25 updatedAt always set to now', () => {
    expect(mapMasterToCourse({ courseName: 'x' }, 'y', NOW, '2000-01-01').updatedAt).toBe(NOW);
  });

  it('CM26 status "พักใช้งาน" preserved', () => {
    expect(mapMasterToCourse({ status: 'พักใช้งาน' }, 'x', NOW).status).toBe('พักใช้งาน');
  });

  it('CM27 status=0 → "พักใช้งาน"', () => {
    expect(mapMasterToCourse({ status: 0 }, 'x', NOW).status).toBe('พักใช้งาน');
  });

  it('CM28 unknown status → "ใช้งาน" default', () => {
    expect(mapMasterToCourse({ status: 'weird' }, 'x', NOW).status).toBe('ใช้งาน');
  });
});
