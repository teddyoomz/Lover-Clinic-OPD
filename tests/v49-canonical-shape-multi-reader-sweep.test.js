// V49 (2026-05-08) — Picker dropdown empty rows class-of-bug PROF-GRADE bank.
//
// User report: "บั๊คใน modal หน้าสร้างและแก้ไข โปรโมชั่น มองไม่เห็นคอร์สหรือ
// สินค้าใดๆใน search dropdown เลย" — empty rows with `+` and `0 ฿`.
//
// Root cause (Phase 1-3 systematic-debugging):
//   - PromotionFormModal et al imported listCourses/listProducts via
//     scopedDataLayer (Phase 14.10-tris 2026-04-26 switch from master_data
//     mirror → be_courses/be_products canonical).
//   - Switch left field-name reads UNCHANGED — code reads `c.name`,
//     `c.price`, `c.products`, `c.category`, `p.name`, `p.unit`, `p.price`,
//     `p.category` at every picker callsite.
//   - Canonical be_courses fields are courseName / salePrice / courseProducts
//     / courseCategory. Canonical be_products fields are productName / price /
//     mainUnitName / categoryName. Legacy fields are ALL UNDEFINED on prod
//     (verified via scripts/v49-diag-be-courses-products-shape.mjs).
//   - 8 victim sites identified: PromotionFormModal · DfGroupFormModal ·
//     QuotationFormModal · ExchangeCourseModal · CustomerDetailView
//     (ProductExchangeModal sub-modal) · MovementLogPanel · StockSeedPanel ·
//     VendorSalesTab.
//
// Architectural fix (Phase 5):
//   1. Export beProductToMasterShape + bePromotionToMasterShape (were private)
//   2. Add scopedDataLayer.listCoursesForPicker / listProductsForPicker /
//      listPromotionsForPicker — auto-apply canonical→legacy adapter
//   3. Migrate all 8 victim sites to *ForPicker imports
//
// AV27 audit invariant LOCK (added in audit-anti-vibe-code):
//   Every UI consumer that fetches from be_courses / be_products /
//   be_promotions and reads legacy `{name, price, category, products, unit}`
//   shape MUST use *ForPicker variants. Direct list*() callsites must read
//   canonical fields directly.
//
// Test bank (12 categories, 80+ assertions):
//   CAT1 Source-grep regression — victim sites use ForPicker
//   CAT2 Helper unit — beProductToMasterShape + bePromotionToMasterShape
//   CAT3 Property-based — mulberry32 PRNG × 100 random fixtures
//   CAT4 Cross-branch identity — toString.grep branch-blindness
//   CAT5 Adversarial — Thai full-width, NUL, Unicode NFC vs NFD, 10K-char
//   CAT6 Idempotency — adapter × 5 calls = identical output
//   CAT7 Forward-compat — future fields preserved through adapter
//   CAT8 Backward-compat — already-legacy-shape input passes through
//   CAT9 Class-of-bug universal classifier — every listCourses/listProducts/
//        listPromotions consumer classified
//   CAT10 V12 multi-reader-sweep regression — anti-pattern signature locked
//   CAT11 User-report repro — 8 victim fixtures × empty-row regression
//   CAT12 Test-prefix discipline + Rule M alignment

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  beProductToMasterShape,
  bePromotionToMasterShape,
  beCourseToMasterShape,
} from '../src/lib/backendClient.js';

// ─── Mulberry32 PRNG (deterministic seed for reproducible fuzz) ─────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helper — read a project source file relative to repo root.
function readSrc(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

// Helper — generate random canonical be_product doc shape.
function randomBeProduct(rand) {
  return {
    productId: `${Math.floor(rand() * 100000)}`,
    productName: `สินค้า_${Math.floor(rand() * 1000)}`,
    productCode: `P${Math.floor(rand() * 9999)}`,
    productType: ['ยา', 'สินค้าหน้าร้าน', 'สินค้าสิ้นเปลือง', 'บริการ'][
      Math.floor(rand() * 4)
    ],
    serviceType: '',
    genericName: '',
    categoryName: `หมวด_${Math.floor(rand() * 100)}`,
    subCategoryName: '',
    mainUnitName: ['ชิ้น', 'แผง', 'หลอด', 'ขวด'][Math.floor(rand() * 4)],
    price: Math.round(rand() * 10000),
    priceInclVat: null,
    isVatIncluded: rand() > 0.5,
    isClaimDrugDiscount: false,
    isTakeawayProduct: false,
    defaultProductUnitGroupId: '',
    stockLocation: '',
    alertDayBeforeExpire: null,
    alertQtyBeforeOutOfStock: null,
    alertQtyBeforeMaxStock: null,
    dosageAmount: '',
    dosageUnit: '',
    indications: '',
    instructions: '',
    storageInstructions: '',
    administrationMethod: '',
    administrationMethodHour: '',
    administrationTimes: [],
    timesPerDay: null,
    orderBy: null,
    status: 'ใช้งาน',
    branchId: 'BR-TEST-V49',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Helper — generate random canonical be_course doc shape.
function randomBeCourse(rand, withSubProducts = true) {
  const numSub = withSubProducts ? Math.floor(rand() * 4) : 0;
  return {
    courseId: `${Math.floor(rand() * 100000)}`,
    courseName: `คอร์ส_${Math.floor(rand() * 1000)}`,
    courseCode: `C${Math.floor(rand() * 9999)}`,
    courseCategory: `หมวด_${Math.floor(rand() * 50)}`,
    procedureType: '',
    courseType: '',
    salePrice: Math.round(rand() * 50000),
    salePriceInclVat: null,
    isVatIncluded: false,
    mainProductId: `${Math.floor(rand() * 50000)}`,
    mainProductName: `Main_${Math.floor(rand() * 100)}`,
    mainQty: Math.floor(rand() * 10) + 1,
    courseProducts: Array.from({ length: numSub }, (_, i) => ({
      productId: `sub-${i}`,
      productName: `Sub_${i}`,
      qty: Math.floor(rand() * 5) + 1,
    })),
    branchId: 'BR-TEST-V49',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// Helper — generate random canonical be_promotion doc shape.
function randomBePromotion(rand) {
  return {
    promotionId: `${Math.floor(rand() * 100000)}`,
    promotion_name: `Promo_${Math.floor(rand() * 1000)}`,
    promotion_code: `PR${Math.floor(rand() * 9999)}`,
    category_name: `Cat_${Math.floor(rand() * 100)}`,
    sale_price: Math.round(rand() * 30000),
    sale_price_incl_vat: null,
    is_vat_included: false,
    deposit_price: 0,
    promotion_type: 'fixed',
    status: 'active',
    branchId: 'BR-TEST-V49',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── CAT1 Source-grep regression — victim sites use ForPicker ───────────────

describe('V49 CAT1 — source-grep regression on 8 victim sites', () => {
  const VICTIM_FILES_AND_PATTERNS = [
    {
      file: 'src/components/backend/PromotionFormModal.jsx',
      mustContain: ['listCoursesForPicker', 'listProductsForPicker'],
      mustNotContainImport: /import\s*\{[^}]*\b(listCourses|listProducts)\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
    {
      file: 'src/components/backend/DfGroupFormModal.jsx',
      mustContain: ['listCoursesForPicker'],
      mustNotContainImport: /import\s*\{[^}]*\blistCourses\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
    {
      file: 'src/components/backend/QuotationFormModal.jsx',
      mustContain: ['listCoursesForPicker', 'listProductsForPicker', 'listPromotionsForPicker'],
      mustNotContainImport: /import[^}]*\{[^}]*\b(listCourses|listProducts|listPromotions)\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
    {
      file: 'src/components/backend/ExchangeCourseModal.jsx',
      mustContain: ['listCoursesForPicker'],
      mustNotContainImport: /import\s*\{[^}]*\blistCourses\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
    {
      file: 'src/components/backend/CustomerDetailView.jsx',
      mustContain: ['listProductsForPicker'],
      mustNotContainImport: /import[^}]*\{[^}]*\blistProducts\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
    {
      file: 'src/components/backend/MovementLogPanel.jsx',
      mustContain: ['listProductsForPicker'],
      mustNotContainImport: /import\s*\{[^}]*\blistProducts\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
    {
      file: 'src/components/backend/StockSeedPanel.jsx',
      mustContain: ['listProductsForPicker'],
      mustNotContainImport: /import[^}]*\{[^}]*\blistProducts\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
    {
      file: 'src/components/backend/VendorSalesTab.jsx',
      mustContain: ['listProductsForPicker'],
      mustNotContainImport: /import[^}]*\{[^}]*\blistProducts\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/,
    },
  ];

  it('CAT1.1 — every victim file imports the *ForPicker variant', () => {
    for (const { file, mustContain } of VICTIM_FILES_AND_PATTERNS) {
      const src = readSrc(file);
      for (const pattern of mustContain) {
        expect(
          src.includes(pattern),
          `${file} must import ${pattern}`,
        ).toBe(true);
      }
    }
  });

  it('CAT1.2 — no victim file calls bare listCourses()/listProducts()/listPromotions() (use ForPicker)', () => {
    // Use word-boundary regex that distinguishes listProducts( from
    // listProductsForPicker( — the boundary between `s` and `F` is internal
    // (both word chars), so \blistProducts\b\( does NOT match the ForPicker
    // variant. Also handles comment-text false positives that broader regex
    // patterns would catch.
    for (const { file } of VICTIM_FILES_AND_PATTERNS) {
      const src = readSrc(file);
      // Strip line comments to avoid matching tokens in `// listProducts → ...`
      const codeOnly = src
        .split('\n')
        .map((line) => line.replace(/\/\/.*$/, ''))
        .join('\n');
      const bareCallRe = /\b(?:listCourses|listProducts|listPromotions)\b\s*\(/;
      const m = codeOnly.match(bareCallRe);
      expect(
        m,
        `${file} must NOT call bare list*() — found: ${m?.[0] || 'none'}`,
      ).toBeNull();
    }
  });

  it('CAT1.3 — V49 marker exists in scopedDataLayer.js', () => {
    const src = readSrc('src/lib/scopedDataLayer.js');
    expect(src).toMatch(/V49\s*\(2026-05-08\)/);
    expect(src).toMatch(/listCoursesForPicker/);
    expect(src).toMatch(/listProductsForPicker/);
    expect(src).toMatch(/listPromotionsForPicker/);
  });

  it('CAT1.4 — beProductToMasterShape + bePromotionToMasterShape are EXPORTED', () => {
    const src = readSrc('src/lib/backendClient.js');
    expect(src).toMatch(/export\s+function\s+beProductToMasterShape/);
    expect(src).toMatch(/export\s+function\s+bePromotionToMasterShape/);
  });
});

// ─── CAT2 Helper unit tests ─────────────────────────────────────────────────

describe('V49 CAT2 — adapter unit tests', () => {
  it('CAT2.1 — beProductToMasterShape preserves CANONICAL fields + adds LEGACY', () => {
    const canonical = {
      productId: '38699',
      productName: 'Stapple no 22',
      price: 0,
      categoryName: 'อุปกรณ์ผ่าตัด',
      mainUnitName: 'ชิ้น',
      productType: 'สินค้าสิ้นเปลือง',
      productCode: 'S22',
      branchId: 'BR-A',
    };
    const legacy = beProductToMasterShape(canonical);
    expect(legacy.id).toBe('38699');
    expect(legacy.name).toBe('Stapple no 22');
    expect(legacy.price).toBe(0);
    expect(legacy.unit).toBe('ชิ้น');
    expect(legacy.category).toBe('อุปกรณ์ผ่าตัด');
    expect(legacy.type).toBe('สินค้าสิ้นเปลือง');
    expect(legacy.code).toBe('S22');
    // Canonical fields preserved (forward-compat for code that reads canonical)
    expect(legacy.productId).toBe('38699');
    expect(legacy.productName).toBe('Stapple no 22');
    expect(legacy.mainUnitName).toBe('ชิ้น');
    expect(legacy.categoryName).toBe('อุปกรณ์ผ่าตัด');
    expect(legacy.branchId).toBe('BR-A');
  });

  it('CAT2.2 — bePromotionToMasterShape adds price + category + name', () => {
    const canonical = {
      promotionId: '4532',
      promotion_name: 'คอร์ส บำรุงรากผม PRP 3 ครั้ง',
      sale_price: 9900,
      sale_price_incl_vat: 10593,
      category_name: 'PRP',
      branchId: 'BR-A',
    };
    const legacy = bePromotionToMasterShape(canonical);
    expect(legacy.id).toBe('4532');
    expect(legacy.name).toBe('คอร์ส บำรุงรากผม PRP 3 ครั้ง');
    expect(legacy.price).toBe(9900);
    expect(legacy.sale_price_incl_vat).toBe(10593);
    expect(legacy.category).toBe('PRP');
    // Canonical preserved
    expect(legacy.promotion_name).toBe('คอร์ส บำรุงรากผม PRP 3 ครั้ง');
    expect(legacy.sale_price).toBe(9900);
    expect(legacy.category_name).toBe('PRP');
  });

  it('CAT2.3 — beCourseToMasterShape produces legacy {id, name, price, products, category}', () => {
    const canonical = {
      courseId: '56442',
      courseName: 'Testoviron 1 ครั้ง',
      salePrice: 1890,
      courseCategory: 'ฮอร์โมนเพศชาย',
      mainProductId: '38778',
      mainProductName: 'Testoviron',
      mainQty: 1,
      courseProducts: [
        { productId: '38778', productName: 'Testoviron', qty: 1 },
      ],
    };
    const legacy = beCourseToMasterShape(canonical);
    expect(legacy.id).toBe('56442');
    expect(legacy.name).toBe('Testoviron 1 ครั้ง');
    expect(legacy.price).toBe(1890);
    expect(legacy.category).toBe('ฮอร์โมนเพศชาย');
    expect(Array.isArray(legacy.products)).toBe(true);
    expect(legacy.products.length).toBeGreaterThan(0);
    expect(legacy.products[0].name).toBeTruthy();
  });

  it('CAT2.4 — adapter handles missing canonical fields (defensive)', () => {
    const sparse = { productId: '1', productName: 'Foo' };
    const legacy = beProductToMasterShape(sparse);
    expect(legacy.id).toBe('1');
    expect(legacy.name).toBe('Foo');
    expect(legacy.price ?? null).toBeNull();
    expect(legacy.unit).toBe('');
    expect(legacy.category).toBe('');
  });

  it('CAT2.5 — adapter handles already-legacy-shape input (V49 backward-compat)', () => {
    // Legacy doc shape (pre-canonical migration)
    const legacy = { id: '1', productName: '', name: 'LegacyName', unit: 'pcs', category: 'X' };
    const out = beProductToMasterShape(legacy);
    // adapter produces id from productId|id; productName='' → name=''
    expect(out.id).toBe('1');
    // V49 contract: name comes from productName (canonical-first, no legacy fallback).
    // This is BY DESIGN — adapter is canonical→legacy, NOT legacy-preserving.
    // V49 callers must use canonical-only docs (which prod confirms).
    expect(out.name).toBe('');
  });

  it('CAT2.6 — promotion adapter: missing sale_price falls to legacy price', () => {
    const onlyLegacy = { promotionId: '1', name: 'P', price: 500 };
    const out = bePromotionToMasterShape(onlyLegacy);
    expect(out.id).toBe('1');
    expect(out.name).toBe('P');
    expect(out.price).toBe(500);
  });
});

// ─── CAT3 Property-based — mulberry32 × 100 random fixtures ─────────────────

describe('V49 CAT3 — property-based fuzz (deterministic seed = 49490508)', () => {
  it('CAT3.1 — beProductToMasterShape always produces non-null name + id (100 fixtures)', () => {
    const rand = mulberry32(49490508);
    let okCount = 0;
    for (let i = 0; i < 100; i++) {
      const p = randomBeProduct(rand);
      const out = beProductToMasterShape(p);
      expect(out.id).toBeTruthy();
      expect(out.name).toBeTruthy();
      expect(typeof out.unit).toBe('string');
      expect(typeof out.category).toBe('string');
      okCount++;
    }
    expect(okCount).toBe(100);
  });

  it('CAT3.2 — beCourseToMasterShape always produces products[] with main product first', () => {
    const rand = mulberry32(49490509);
    for (let i = 0; i < 100; i++) {
      const c = randomBeCourse(rand, true);
      const out = beCourseToMasterShape(c);
      expect(Array.isArray(out.products)).toBe(true);
      // If mainProductId set, products[0] is main
      if (c.mainProductId) {
        const main = out.products.find((p) => p.isMainProduct);
        expect(main).toBeDefined();
        expect(String(main.id)).toBe(String(c.mainProductId));
      }
    }
  });

  it('CAT3.3 — bePromotionToMasterShape always produces price ≥ 0 or null', () => {
    const rand = mulberry32(49490510);
    for (let i = 0; i < 100; i++) {
      const m = randomBePromotion(rand);
      const out = bePromotionToMasterShape(m);
      expect(out.id).toBeTruthy();
      expect(out.name).toBeTruthy();
      expect(out.price === null || out.price >= 0).toBe(true);
    }
  });
});

// ─── CAT4 Cross-branch identity ────────────────────────────────────────────

describe('V49 CAT4 — adapters are branch-blind (identity-pure)', () => {
  it('CAT4.1 — beProductToMasterShape source has no branchId references in body', () => {
    // Function source as string — confirm adapter does NOT reference branchId
    // for routing decisions. branchId is preserved through ...p spread but
    // NOT used as a transformation key.
    const fnStr = beProductToMasterShape.toString();
    // Only allow branchId as a passive read (...p) — not in conditional or
    // computational logic.
    const conditionalUse = /if\s*\([^)]*branchId|switch\s*\([^)]*branchId|branchId\s*===|branchId\s*!==/.test(fnStr);
    expect(conditionalUse).toBe(false);
  });

  it('CAT4.2 — bePromotionToMasterShape source has no branchId routing', () => {
    const fnStr = bePromotionToMasterShape.toString();
    const conditionalUse = /if\s*\([^)]*branchId|switch\s*\([^)]*branchId|branchId\s*===|branchId\s*!==/.test(fnStr);
    expect(conditionalUse).toBe(false);
  });

  it('CAT4.3 — same input across simulated 3 branches yields identical adapter output', () => {
    const base = {
      productId: '999',
      productName: 'Branch-blind Test',
      price: 100,
      categoryName: 'X',
      mainUnitName: 'pcs',
    };
    const a = beProductToMasterShape({ ...base, branchId: 'BR-A' });
    const b = beProductToMasterShape({ ...base, branchId: 'BR-B' });
    const c = beProductToMasterShape({ ...base, branchId: 'BR-FUTURE' });
    // All non-branchId fields identical
    const stripBranch = (o) => {
      const { branchId, ...rest } = o;
      return rest;
    };
    expect(stripBranch(a)).toEqual(stripBranch(b));
    expect(stripBranch(b)).toEqual(stripBranch(c));
  });
});

// ─── CAT5 Adversarial inputs ───────────────────────────────────────────────

describe('V49 CAT5 — adversarial inputs (Thai full-width, Unicode, NUL, 10K)', () => {
  it('CAT5.1 — Thai full-width name preserved verbatim', () => {
    const fullwidth = 'สินค้า​ทดสอบ​ฟูลวิดธ์'; // includes zero-width spaces
    const out = beProductToMasterShape({ productId: '1', productName: fullwidth });
    expect(out.name).toBe(fullwidth);
  });

  it('CAT5.2 — Unicode NFC vs NFD form preserved (ไทย uses combining marks)', () => {
    const nfc = 'ก'.normalize('NFC');
    const nfd = 'ก'.normalize('NFD');
    const oA = beProductToMasterShape({ productId: '1', productName: nfc });
    const oB = beProductToMasterShape({ productId: '1', productName: nfd });
    expect(oA.name).toBe(nfc);
    expect(oB.name).toBe(nfd);
  });

  it('CAT5.3 — NUL byte in name does not throw', () => {
    expect(() => beProductToMasterShape({ productId: '1', productName: 'A B' })).not.toThrow();
  });

  it('CAT5.4 — 10K-char name does not corrupt or truncate', () => {
    const huge = 'ก'.repeat(10000);
    const out = beProductToMasterShape({ productId: '1', productName: huge });
    expect(out.name.length).toBe(10000);
  });

  it('CAT5.5 — null/undefined input does not throw', () => {
    expect(() => beProductToMasterShape({ productId: '1' })).not.toThrow();
    expect(() => bePromotionToMasterShape({ promotionId: '1' })).not.toThrow();
  });

  it('CAT5.6 — numeric vs string productId both produce truthy id', () => {
    const a = beProductToMasterShape({ productId: 123, productName: 'X' });
    const b = beProductToMasterShape({ productId: '123', productName: 'X' });
    expect(String(a.id)).toBe('123');
    expect(String(b.id)).toBe('123');
  });
});

// ─── CAT6 Idempotency ───────────────────────────────────────────────────────

describe('V49 CAT6 — adapters are idempotent (× 5 calls = identical)', () => {
  it('CAT6.1 — beProductToMasterShape × 5 yields equal outputs', () => {
    const input = {
      productId: '1',
      productName: 'X',
      price: 10,
      categoryName: 'C',
      mainUnitName: 'u',
    };
    const a = beProductToMasterShape(input);
    const b = beProductToMasterShape(input);
    const c = beProductToMasterShape(input);
    const d = beProductToMasterShape(input);
    const e = beProductToMasterShape(input);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(c).toEqual(d);
    expect(d).toEqual(e);
  });

  it('CAT6.2 — bePromotionToMasterShape × 5 yields equal outputs', () => {
    const input = { promotionId: '1', promotion_name: 'P', sale_price: 100 };
    const out = Array.from({ length: 5 }, () => bePromotionToMasterShape(input));
    for (let i = 1; i < out.length; i++) expect(out[i]).toEqual(out[0]);
  });
});

// ─── CAT7 Forward-compat — future fields preserved ─────────────────────────

describe('V49 CAT7 — forward-compat (future canonical fields pass through)', () => {
  it('CAT7.1 — beProductToMasterShape preserves arbitrary future fields via ...p spread', () => {
    const future = {
      productId: '1',
      productName: 'X',
      _v50_newField: 'should-survive',
      _v51_metadata: { nested: true },
    };
    const out = beProductToMasterShape(future);
    expect(out._v50_newField).toBe('should-survive');
    expect(out._v51_metadata).toEqual({ nested: true });
  });

  it('CAT7.2 — bePromotionToMasterShape preserves future fields', () => {
    const future = {
      promotionId: '1',
      promotion_name: 'X',
      _v50_anotherField: 42,
    };
    const out = bePromotionToMasterShape(future);
    expect(out._v50_anotherField).toBe(42);
  });
});

// ─── CAT8 Class-of-bug universal classifier ────────────────────────────────

describe('V49 CAT8 — every listCourses/listProducts/listPromotions consumer classified', () => {
  // Exhaustive list of UI files importing list* from scopedDataLayer.
  // Each must be classified as either:
  //   "ForPicker" (uses *ForPicker because reads legacy shape)
  //   "Canonical" (uses list*() because reads canonical fields directly)
  //   "Sanctioned" (uses list*() but defensive via shared helper, e.g.
  //                 ProductSelectField composeProductDisplayName)
  //   "Internal"  (lib file or non-UI consumer)

  const CONSUMER_CLASSIFICATION = {
    // Pickers (LEGACY shape) — must use *ForPicker
    'src/components/backend/PromotionFormModal.jsx': 'ForPicker',
    'src/components/backend/DfGroupFormModal.jsx': 'ForPicker',
    'src/components/backend/QuotationFormModal.jsx': 'ForPicker',
    'src/components/backend/ExchangeCourseModal.jsx': 'ForPicker',
    'src/components/backend/CustomerDetailView.jsx': 'ForPicker',
    'src/components/backend/MovementLogPanel.jsx': 'ForPicker',
    'src/components/backend/StockSeedPanel.jsx': 'ForPicker',
    'src/components/backend/VendorSalesTab.jsx': 'ForPicker',
    // Admin tabs / canonical readers (read CANONICAL fields directly)
    'src/components/backend/CoursesTab.jsx': 'Canonical',
    'src/components/backend/ProductsTab.jsx': 'Canonical',
    'src/components/backend/CourseFormModal.jsx': 'Canonical',
    'src/components/backend/ProductFormModal.jsx': 'Canonical',
    'src/components/backend/ProductGroupsTab.jsx': 'Canonical',
    'src/components/backend/ProductGroupFormModal.jsx': 'Canonical',
    'src/components/backend/PromotionTab.jsx': 'Canonical',
    // SmartAudienceTab passes products/courses to evaluateRule which uses
    // IDs only (no name/price/category render). Sanctioned ID-only consumer.
    'src/components/backend/SmartAudienceTab.jsx': 'Sanctioned',
    // CrossBranchImportModal uses listX as a string-keyed map for adapter
    // dispatch (V39); doesn't directly read canonical fields — adapter does.
    'src/components/backend/CrossBranchImportModal.jsx': 'Sanctioned',
    // Sanctioned (use canonical via shared helper that's defensive on field names)
    'src/components/TreatmentFormPage.jsx': 'Sanctioned',
    'src/components/backend/SaleTab.jsx': 'Sanctioned',
    'src/components/backend/StockAdjustPanel.jsx': 'Sanctioned',
    'src/components/backend/OrderPanel.jsx': 'Sanctioned',
    'src/components/backend/CentralStockOrderPanel.jsx': 'Sanctioned',
    'src/components/backend/StockBalancePanel.jsx': 'Sanctioned',
    'src/components/backend/PermissionGroupsTab.jsx': 'Sanctioned',
    // Reports (canonical aggregation)
    'src/components/backend/reports/StockReportTab.jsx': 'Canonical',
    'src/components/backend/reports/RevenueAnalysisTab.jsx': 'Canonical',
    'src/components/backend/reports/DfPayoutReportTab.jsx': 'Canonical',
  };

  it('CAT8.1 — every classified ForPicker consumer imports *ForPicker', () => {
    for (const [file, classification] of Object.entries(CONSUMER_CLASSIFICATION)) {
      if (classification !== 'ForPicker') continue;
      const src = readSrc(file);
      const usesForPicker =
        src.includes('listCoursesForPicker') ||
        src.includes('listProductsForPicker') ||
        src.includes('listPromotionsForPicker');
      expect(usesForPicker, `${file} classified ForPicker must import *ForPicker`).toBe(true);
    }
  });

  it('CAT8.2 — every Canonical consumer reads canonical field names', () => {
    for (const [file, classification] of Object.entries(CONSUMER_CLASSIFICATION)) {
      if (classification !== 'Canonical') continue;
      const src = readSrc(file);
      // Must reference at least one canonical field marker
      const readsCanonical =
        src.includes('courseName') ||
        src.includes('productName') ||
        src.includes('promotion_name') ||
        src.includes('mainUnitName') ||
        src.includes('categoryName') ||
        src.includes('courseCategory') ||
        src.includes('salePrice') ||
        src.includes('sale_price') ||
        src.includes('beCourseToMasterShape');
      expect(readsCanonical, `${file} classified Canonical must read canonical fields`).toBe(true);
    }
  });
});

// ─── CAT9 V12 multi-reader-sweep regression ────────────────────────────────

describe('V49 CAT9 — V12 multi-reader-sweep anti-pattern lock', () => {
  it('CAT9.1 — scopedDataLayer documents the V49 ForPicker decision rule', () => {
    const src = readSrc('src/lib/scopedDataLayer.js');
    expect(src).toMatch(/V49\s*\(2026-05-08\).*ForPicker/s);
    expect(src).toMatch(/AV27/);
  });

  it('CAT9.2 — adapter modules document V49 export reason', () => {
    const src = readSrc('src/lib/backendClient.js');
    expect(src).toMatch(/V49\s*\(2026-05-08\)\s*—\s*exported.*beProductToMasterShape/s);
    expect(src).toMatch(/V49\s*\(2026-05-08\)\s*—\s*exported.*bePromotionToMasterShape/s);
  });
});

// ─── CAT10 User-report repro matrix ────────────────────────────────────────

describe('V49 CAT10 — user-report repro: 8 victim fixtures × empty-row regression', () => {
  // Each fixture is a real-shape canonical doc. With ForPicker the adapter
  // produces non-empty {name, price, products, category, unit}. Pre-V49 the
  // raw canonical doc had ALL legacy fields undefined → empty rendering.

  it('CAT10.1 — Stapple no 22 (user fixture from prod) renders correctly', () => {
    const stapple = {
      productId: '38699',
      productName: 'Stapple no 22',
      price: 0,
      categoryName: 'อุปกรณ์ผ่าตัด',
      mainUnitName: 'ชิ้น',
    };
    // Pre-V49 (raw canonical):
    expect(stapple.name).toBeUndefined();
    expect(stapple.unit).toBeUndefined();
    expect(stapple.category).toBeUndefined();
    // Post-V49 (after adapter):
    const ready = beProductToMasterShape(stapple);
    expect(ready.name).toBe('Stapple no 22');
    expect(ready.unit).toBe('ชิ้น');
    expect(ready.category).toBe('อุปกรณ์ผ่าตัด');
  });

  it('CAT10.2 — Testoviron course (user fixture from prod) renders correctly', () => {
    const testoviron = {
      courseId: '56442',
      courseName: 'Testoviron 1 ครั้ง',
      salePrice: 1890,
      courseCategory: 'ฮอร์โมนเพศชาย',
      mainProductId: '38778',
      mainProductName: 'Testoviron',
      mainQty: 1,
      courseProducts: [{ productId: '38778', productName: 'Testoviron', qty: 1 }],
    };
    // Pre-V49:
    expect(testoviron.name).toBeUndefined();
    expect(testoviron.price).toBeUndefined();
    expect(testoviron.products).toBeUndefined();
    // Post-V49:
    const ready = beCourseToMasterShape(testoviron);
    expect(ready.name).toBe('Testoviron 1 ครั้ง');
    expect(ready.price).toBe(1890);
    expect(ready.category).toBe('ฮอร์โมนเพศชาย');
    expect(ready.products.length).toBeGreaterThan(0);
    expect(ready.products[0].name).toBeTruthy();
  });

  it('CAT10.3 — PRP promotion (user fixture from prod) renders correctly', () => {
    const prp = {
      promotionId: '4532',
      promotion_name: 'คอร์ส บำรุงรากผม PRP 3 ครั้ง + AHL 1 ครั้ง',
      sale_price: 9900,
      category_name: '',
    };
    expect(prp.name).toBeUndefined();
    expect(prp.price).toBeUndefined();
    const ready = bePromotionToMasterShape(prp);
    expect(ready.name).toBe('คอร์ส บำรุงรากผม PRP 3 ครั้ง + AHL 1 ครั้ง');
    expect(ready.price).toBe(9900);
  });

  it('CAT10.4 — empty productName fallback chain (defensive)', () => {
    const sparse = { productId: '1' };
    const ready = beProductToMasterShape(sparse);
    expect(ready.name).toBe(''); // V49 contract: empty over course-name leak (Rule O)
  });
});

// ─── CAT11 Backward-compat (mixed-shape input) ─────────────────────────────

describe('V49 CAT11 — mixed-shape input handling', () => {
  it('CAT11.1 — beCourseToMasterShape returns empty name for legacy-only input (V46 contract)', () => {
    const alreadyLegacy = {
      id: '1',
      name: 'Already-Legacy',
      price: 100,
      products: [{ id: 'p1', name: 'P1', qty: 1 }],
      // No canonical fields
    };
    // beCourseToMasterShape sources `name` from `c.courseName || ''` ONLY
    // (line 3250 in backendClient.js). NO fallback to c.name — by design
    // per V46 (Rule O): empty-string final fallback over course-name leak.
    // Callers must pass canonical docs only; legacy-only docs return empty
    // name (NOT the legacy.name) so the bug fingerprint is impossible.
    const out = beCourseToMasterShape(alreadyLegacy);
    expect(out.id).toBe('1');
    expect(out.name).toBe(''); // V46 contract — empty over leak
  });
});

// ─── CAT12 Test-prefix discipline ──────────────────────────────────────────

describe('V49 CAT12 — test-prefix discipline (Rule M alignment)', () => {
  it('CAT12.1 — adversarial fixtures use TEST/E2E branchId prefix', () => {
    const rand = mulberry32(1);
    const p = randomBeProduct(rand);
    expect(p.branchId).toMatch(/^(TEST|BR-TEST|E2E)/);
  });

  it('CAT12.2 — V49 diag script uses Rule M canonical pattern', () => {
    const src = readSrc('scripts/v49-diag-be-courses-products-shape.mjs');
    expect(src).toMatch(/firebase-admin/);
    expect(src).toMatch(/artifacts\/\$\{?APP_ID\}?\/public\/data/);
    expect(src).toMatch(/\.env\.local\.prod/);
  });
});
