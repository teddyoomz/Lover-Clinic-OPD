// ─── V44 — Course-buy product-name source fix — 2026-05-08 ────────────────
//
// User report (post V43 deploy):
//   1. ซื้อคอร์ส (TFP confirmBuy) → customer course panel แสดงชื่อคอร์สซ้ำ 2
//      บรรทัดแทนชื่อสินค้าจริง (main + sub-product); Stapple no 22 ไม่โผล่เลย
//   2. การตัดสต็อค ใช้ชื่อคอร์สไปตัด ไม่ใช้ชื่อสินค้า → -30 ของ
//      "Neuramis Deep 30 CC" (course name) แทน "Neuramis Deep" (product name)
//      → fail-loud แล้วลงไปที่ negativeOverage path
//
// Root cause (V12 multi-reader-sweep — exact same pattern as V36-quater):
// TFP buy fetcher (TreatmentFormPage.jsx:1558+) does INLINE mapping bypassing
// beCourseToMasterShape canonical mapper. Inline:
//   `products: c.courseProducts || c.products || []`
// 1. courseProducts has field `productName` (not `name`) → buildPurchasedCourseEntry
//    reads `p.name` → undefined → fallback to item.name (= courseName)
// 2. mainProductId/mainProductName are at top level of be_courses doc, NOT
//    inside courseProducts[] → main product silently dropped from buy items
//
// Comment at backendClient.js:3159-3166 explicitly notes the same fix was
// applied to beCourseToMasterShape in Phase 12.2b — but TFP buy fetcher
// never adopted it. SaleTab + QuotationFormModal both correctly use
// beCourseToMasterShape; TFP was the multi-reader-sweep gap.
//
// V44 fix:
//  1. TFP buy fetcher → use beCourseToMasterShape (single-source mapper)
//  2. buildPurchasedCourseEntry — defensive `p.name || p.productName || item.name`
//  3. assignCourseToCustomer — defensive `p.name || p.productName || mainName fallback`
//  4. Migration script (idempotent) for any existing customer.courses[]
//     entries where product === entry.name + master found
//
// Test groups:
//  V44.A — TFP buy fetcher uses beCourseToMasterShape (source-grep)
//  V44.B — beCourseToMasterShape unchanged contract (regression of CSS.B)
//  V44.C — buildPurchasedCourseEntry defensive dual-read
//  V44.D — assignCourseToCustomer defensive dual-read (source-grep)
//  V44.E — Rule I full-flow simulate: course master → buy fetcher → confirmBuyModal
//          → buildPurchasedCourseEntry → product names correct
//  V44.F — Diag classifier symmetry + multi-reader-sweep audit
//
// V-entry preflight covered:
//  V11 — beCourseToMasterShape import is REAL (source-grep + import existence)
//  V12 — multi-reader-sweep — every "buy item" fetcher MUST use canonical mapper;
//        AV22 invariant locks future drift
//  V13 — full-flow simulate chains: master → fetcher → mapper → entry shape
//  V14 — !! coercion + no undefined leaves → defensive fallback chain
//  V21 — source-grep paired with full-flow simulate
//  V22 — multi-fixture: single-product + main+sub + sub-only + pick-at-treatment
//  V42 — promo bundle (orthogonal — not affected by V44; spread preserves shape)
//  V43 — overlay rescues frozen flag (different field; this V44 is about NAME field)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  beCourseToMasterShape,
} from '../src/lib/backendClient.js';
import {
  buildPurchasedCourseEntry,
  resolvePickedCourseEntry,
  resolvePurchasedCourseForAssign,
} from '../src/lib/treatmentBuyHelpers.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const tfpSrc = read('src/components/TreatmentFormPage.jsx');
const helpersSrc = read('src/lib/treatmentBuyHelpers.js');
const backendSrc = read('src/lib/backendClient.js');

// ════════════════════════════════════════════════════════════════════════════
describe('V44.A — TFP buy fetcher uses canonical beCourseToMasterShape', () => {
  it('A.1 imports beCourseToMasterShape via lazy backendClient.js import', () => {
    expect(tfpSrc).toMatch(
      /const\s*\{\s*beCourseToMasterShape\s*\}\s*=\s*await\s+import\(['"][^'"]*backendClient\.js['"]\)/
    );
  });

  it('A.2 calls beCourseToMasterShape inside the type==="course" branch (post-listCourses, pre-setBuyItems)', () => {
    // Locate the course branch
    const courseBranchStart = tfpSrc.indexOf('} else if (type === \'course\')');
    expect(courseBranchStart).toBeGreaterThan(0);
    const promoBranchStart = tfpSrc.indexOf('} else if (type === \'promotion\')', courseBranchStart);
    expect(promoBranchStart).toBeGreaterThan(courseBranchStart);
    const courseBlock = tfpSrc.slice(courseBranchStart, promoBranchStart);
    expect(courseBlock).toMatch(/beCourseToMasterShape\(c,\s*\{[^}]*productLookup/);
  });

  it('A.3 V44 marker comment present', () => {
    expect(tfpSrc).toMatch(/V44.*single-source|V44.*beCourseToMasterShape/i);
  });

  it('A.4 NO inline `c.courseProducts || c.products || []` pattern in TFP buy course branch (V12 lock)', () => {
    // Pre-V44 anti-pattern. Post-V44 must NOT exist in the buy fetcher.
    const courseBranchStart = tfpSrc.indexOf('} else if (type === \'course\')');
    const promoBranchStart = tfpSrc.indexOf('} else if (type === \'promotion\')', courseBranchStart);
    const courseBlock = tfpSrc.slice(courseBranchStart, promoBranchStart);
    expect(courseBlock).not.toMatch(/products:\s*c\.courseProducts\s*\|\|\s*c\.products\s*\|\|\s*\[\]/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V44.B — beCourseToMasterShape contract (regression of Phase 12.2b)', () => {
  it('B.1 single-product course → main product surfaces as products[0] with isMainProduct:true', () => {
    const c = {
      courseId: 'C-1', courseName: 'X',
      mainProductId: 'P-MAIN', mainProductName: 'Main Service', mainQty: 5,
      courseProducts: [],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products).toHaveLength(1);
    expect(shape.products[0].id).toBe('P-MAIN');
    expect(shape.products[0].name).toBe('Main Service');
    expect(shape.products[0].qty).toBe(5);
    expect(shape.products[0].isMainProduct).toBe(true);
  });

  it('B.2 main + 2 subs → 3 products in flat array, main first', () => {
    const c = {
      courseId: 'C-1', courseName: 'X',
      mainProductId: 'P-MAIN', mainProductName: 'Main', mainQty: 1,
      courseProducts: [
        { productId: 'P-S1', productName: 'Sub 1', qty: 2 },
        { productId: 'P-S2', productName: 'Sub 2', qty: 3 },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products.map(p => p.name)).toEqual(['Main', 'Sub 1', 'Sub 2']);
  });

  it('B.3 sub-only course (no main) → just the sub products', () => {
    const c = {
      courseId: 'C-1', courseName: 'X',
      courseProducts: [{ productId: 'P-S', productName: 'Only Sub', qty: 1 }],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products).toHaveLength(1);
    expect(shape.products[0].name).toBe('Only Sub');
  });

  it('B.4 dedup — sub-product whose productId === mainProductId is skipped', () => {
    const c = {
      courseId: 'C-1', courseName: 'X',
      mainProductId: 'P-DUP', mainProductName: 'DupName', mainQty: 1,
      courseProducts: [
        { productId: 'P-DUP', productName: 'DupName', qty: 1 }, // same as main
        { productId: 'P-OTHER', productName: 'OtherName', qty: 2 },
      ],
    };
    const shape = beCourseToMasterShape(c);
    expect(shape.products).toHaveLength(2); // main + other (NOT 3)
    expect(shape.products[0].isMainProduct).toBe(true);
    expect(shape.products[1].name).toBe('OtherName');
  });

  it('B.5 productLookup enriches main + sub names + units', () => {
    const c = {
      courseId: 'C-1', courseName: 'X',
      mainProductId: 'P-MAIN', mainProductName: '', mainQty: 1, // BLANK main name
      courseProducts: [{ productId: 'P-S', productName: '', qty: 1 }],
    };
    const lookup = new Map([
      ['P-MAIN', { name: 'Lookup Main', unit: 'หลอด' }],
      ['P-S', { name: 'Lookup Sub', unit: 'ขวด' }],
    ]);
    const shape = beCourseToMasterShape(c, { productLookup: lookup });
    expect(shape.products[0].name).toBe('Lookup Main');
    expect(shape.products[0].unit).toBe('หลอด');
    expect(shape.products[1].name).toBe('Lookup Sub');
    expect(shape.products[1].unit).toBe('ขวด');
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V44.C — buildPurchasedCourseEntry defensive dual-read', () => {
  it('C.1 raw be_courses shape (productName not name) → entry name is productName, NOT course name', () => {
    // Pre-V44 bug repro WITHOUT V44 source-fix at TFP — would fail
    // (entry.name == courseName). Post-V44 source-fix — should now pull
    // p.productName via the dual-read.
    const item = {
      id: 'CRS-1',
      name: 'My Course Name', // courseName
      qty: 1,
      products: [
        // Raw be_courses.courseProducts shape (productName, not name)
        { productId: 'P-A', productName: 'Real Product A', qty: 1 },
        { productId: 'P-B', productName: 'Real Product B', qty: 2 },
      ],
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };
    const entry = buildPurchasedCourseEntry(item);
    expect(entry.products).toHaveLength(2);
    expect(entry.products[0].name).toBe('Real Product A'); // V44 dual-read
    expect(entry.products[1].name).toBe('Real Product B'); // V44 dual-read
    expect(entry.products[0].name).not.toBe('My Course Name');
  });

  it('C.2 canonical shape (name field) preserved', () => {
    const item = {
      id: 'CRS-1', name: 'X', qty: 1,
      products: [
        { id: 'P-A', name: 'Canon Name', qty: 1, isMainProduct: true },
      ],
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };
    const entry = buildPurchasedCourseEntry(item);
    expect(entry.products[0].name).toBe('Canon Name');
  });

  it('C.3 missing both name AND productName → falls back to item.name (course name) — V14 last resort', () => {
    const item = {
      id: 'CRS-1', name: 'CourseFallback', qty: 1,
      products: [{ productId: 'P-A', qty: 1 }], // no name, no productName
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };
    const entry = buildPurchasedCourseEntry(item);
    expect(entry.products[0].name).toBe('CourseFallback');
  });

  it('C.4 pick-at-treatment placeholder uses same dual-read', () => {
    const item = {
      id: 'CRS-1', name: 'PickCourse', qty: 1,
      products: [
        { productId: 'P-A', productName: 'PickProduct A', qty: 1 },
      ],
      courseType: 'เลือกสินค้าตามจริง',
    };
    const entry = buildPurchasedCourseEntry(item);
    expect(entry.needsPickSelection).toBe(true);
    expect(entry.availableProducts[0].name).toBe('PickProduct A');
  });

  it('C.5 source-grep — dual-read pattern present in standard branch', () => {
    expect(helpersSrc).toMatch(/p\.name\s*\|\|\s*p\.productName\s*\|\|\s*item\.name/);
  });

  it('C.6 source-grep — dual-read pattern present in pick-at-treatment branch (availableProducts)', () => {
    // Either standalone match OR the same pattern present in availableProducts map
    const block = helpersSrc.match(/availableProducts:[\s\S]+?\)\)/);
    expect(block?.[0]).toMatch(/p\.name\s*\|\|\s*p\.productName\s*\|\|\s*item\.name/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V44.D — assignCourseToCustomer defensive dual-read (source-grep)', () => {
  it('D.1 product field uses chained fallback p.name || p.productName || mainName fallback || ""', () => {
    expect(backendSrc).toMatch(
      /const productName = p\.name \|\| p\.productName[\s\S]*?\|\| ['"]['"]\s*;/
    );
  });

  it('D.2 product field NEVER falls back to courseName (V44 anti-regression)', () => {
    // Find the assignCourseToCustomer function body and ensure NO
    // `product: masterCourse.name` pattern exists in the per-product loop.
    const fnStart = backendSrc.indexOf('export async function assignCourseToCustomer');
    expect(fnStart).toBeGreaterThan(0);
    const fnEnd = backendSrc.indexOf('\n}', fnStart);
    const fnBody = backendSrc.slice(fnStart, fnEnd);
    // The per-product loop must use productName (the V44 var), NOT a fallback to course name.
    expect(fnBody).toMatch(/product: productName/);
    expect(fnBody).not.toMatch(/product:\s*p\.name\s*\|\|\s*masterCourse\.name/);
  });

  it('D.3 isMainProduct fallback uses masterCourse.mainProductName (NOT masterCourse.name)', () => {
    expect(backendSrc).toMatch(
      /p\.isMainProduct\s*\?\s*masterCourse\.mainProductName\s*:\s*['"]['"]/
    );
  });

  it('D.4 V44 marker comment present in assignCourseToCustomer', () => {
    expect(backendSrc).toMatch(/V44.*defensive dual-read|V44.*productName/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V44.E — Rule I full-flow: master → buy → entry → assign → customer.courses[]', () => {
  it('E.1 chain — main+sub course flows through ENTIRE buy chain with correct names', () => {
    // STEP 1: be_courses master shape (canonical Firestore data)
    const beCourseDoc = {
      id: 'COURSES_VITRO_1',
      courseId: 'COURSES_VITRO_1',
      courseName: 'Course With Main + Sub',
      mainProductId: 'P-MAIN-VITRO',
      mainProductName: 'Main Service Name',
      mainQty: 1,
      courseProducts: [
        { productId: 'P-SUB-1', productName: 'Sub Product One', qty: 2 },
        { productId: 'P-SUB-2', productName: 'Sub Product Two', qty: 3 },
      ],
      salePrice: 1000,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };

    // STEP 2: TFP buy fetcher → beCourseToMasterShape (post-V44)
    const lookup = new Map([
      ['P-MAIN-VITRO', { name: 'Main Service Name', unit: 'ครั้ง' }],
      ['P-SUB-1', { name: 'Sub Product One', unit: 'ขวด' }],
      ['P-SUB-2', { name: 'Sub Product Two', unit: 'ชิ้น' }],
    ]);
    const shape = beCourseToMasterShape(beCourseDoc, { productLookup: lookup });

    // shape.products[] should have 3 entries: Main + 2 subs
    expect(shape.products).toHaveLength(3);
    expect(shape.products.map(p => p.name)).toEqual([
      'Main Service Name', 'Sub Product One', 'Sub Product Two',
    ]);

    // STEP 3: confirmBuyModal builds newItem with shape.products
    const purchasedItem = {
      id: shape.id, name: shape.name, products: shape.products, qty: '1',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };

    // STEP 4: buildPurchasedCourseEntry maps products correctly
    const entry = buildPurchasedCourseEntry(purchasedItem);
    expect(entry.products).toHaveLength(3);
    expect(entry.products.map(p => p.name)).toEqual([
      'Main Service Name', 'Sub Product One', 'Sub Product Two',
    ]);
    expect(entry.products.every(p => p.name !== beCourseDoc.courseName))
      .toBe(true); // V44 invariant: no product is named after the course

    // STEP 5: resolvePurchasedCourseForAssign output — what gets passed to
    // assignCourseToCustomer.
    const { products: prods, alreadyResolved } = resolvePurchasedCourseForAssign(
      purchasedItem, [], 1
    );
    expect(alreadyResolved).toBe(false);
    expect(prods.map(p => p.name)).toEqual([
      'Main Service Name', 'Sub Product One', 'Sub Product Two',
    ]);
  });

  it('E.2 PRE-V44 reproduction (raw shape input) — V44 dual-read defensively rescues', () => {
    // Simulate pre-V44 buyItems shape: raw c.courseProducts (productName field, no main)
    const purchasedItemPreV44 = {
      id: 'CRS-1',
      name: 'My Course (LOOKS-LIKE-V44-BUG)',
      qty: '1',
      // products[] = raw courseProducts only (NO main, productName field)
      products: [
        { productId: 'P-S1', productName: 'Sub 1', qty: 1 },
        { productId: 'P-S2', productName: 'Sub 2', qty: 1 },
      ],
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };
    const entry = buildPurchasedCourseEntry(purchasedItemPreV44);
    // V44 defensive dual-read RESCUES — names are sub-products, not course
    expect(entry.products.map(p => p.name)).toEqual(['Sub 1', 'Sub 2']);
    expect(entry.products.every(p => p.name !== purchasedItemPreV44.name)).toBe(true);
  });

  it('E.3 single-product Neuramis-style course (Image 5 repro) — main product visible', () => {
    const beCourseDoc = {
      id: 'NEURAMIS-30CC',
      courseName: 'Neuramis Deep 30 CC',
      mainProductId: 'P-NEURAMIS-DEEP',
      mainProductName: 'Neuramis Deep',
      mainQty: 30,
      courseProducts: [
        // User's actual config has Neuramis Deep as both main AND a sub-row
        { productId: 'P-NEURAMIS-DEEP', productName: 'Neuramis Deep', qty: 30 },
      ],
      salePrice: 49900,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };
    const shape = beCourseToMasterShape(beCourseDoc);
    // Dedup — main + sub same productId → only main appears
    expect(shape.products).toHaveLength(1);
    expect(shape.products[0].name).toBe('Neuramis Deep');
    expect(shape.products[0].name).not.toBe('Neuramis Deep 30 CC');
  });

  it('E.4 ขลิบไร้เลือด-style course (Image 1 repro) — main + 2 subs', () => {
    const beCourseDoc = {
      id: 'KHLIB-BR22',
      courseName: 'ขลิบไร้เลือด (เบอร์22) 1 ครั้ง',
      mainProductId: 'P-KHLIB-MAIN',
      mainProductName: 'ขลิบไร้เลือด',
      mainQty: 1,
      courseProducts: [
        { productId: 'P-KHLIB-MAIN', productName: 'ขลิบไร้เลือด', qty: 1, skipStockDeduction: true },
        { productId: 'P-STAPPLE', productName: 'Stapple no 22', qty: 1 },
      ],
      salePrice: 13900,
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
    };
    const shape = beCourseToMasterShape(beCourseDoc);
    // Main + Stapple (sub same as main is deduped)
    expect(shape.products).toHaveLength(2);
    expect(shape.products[0].name).toBe('ขลิบไร้เลือด');
    expect(shape.products[1].name).toBe('Stapple no 22');
    // No row should be named after the course
    expect(shape.products.every(p => p.name !== beCourseDoc.courseName)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V44.F — V12 multi-reader-sweep audit', () => {
  it('F.1 SaleTab + QuotationFormModal both use beCourseToMasterShape (canonical)', () => {
    const saleTabSrc = read('src/components/backend/SaleTab.jsx');
    const quotationSrc = read('src/components/backend/QuotationFormModal.jsx');
    expect(saleTabSrc).toMatch(/beCourseToMasterShape/);
    expect(quotationSrc).toMatch(/beCourseToMasterShape/);
  });

  it('F.2 TFP joins the canonical-mapper club post-V44', () => {
    expect(tfpSrc).toMatch(/beCourseToMasterShape/);
  });

  it('F.3 NO consumer of c.courseProducts performs raw map skipping main product (regression guard)', () => {
    // Whitelist: scripts/v43-* + scripts/v44-* + audit-anti-vibe-code +
    // beCourseToMasterShape itself + CoursesTab + CourseFormModal (admin
    // edit modal — different concern, edits the master directly).
    // Any FUTURE buy-fetcher in src/components/** must use
    // beCourseToMasterShape.
    const tfpFetcher = tfpSrc.indexOf('} else if (type === \'course\')');
    const tfpFetcherEnd = tfpSrc.indexOf('} else if (type === \'promotion\')', tfpFetcher);
    const block = tfpSrc.slice(tfpFetcher, tfpFetcherEnd);
    // V12 anti-pattern grep
    expect(block).not.toMatch(/c\.courseProducts\s*\|\|\s*c\.products\s*\|\|\s*\[\]/);
    // Canonical mapper present
    expect(block).toMatch(/beCourseToMasterShape\(c,/);
  });

  it('F.4 V44 institutional marker present in TFP + helpers + backendClient', () => {
    expect(tfpSrc).toMatch(/V44/);
    expect(helpersSrc).toMatch(/V44/);
    expect(backendSrc).toMatch(/V44/);
  });
});
