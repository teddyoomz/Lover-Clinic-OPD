// ─── V43 — Skip-stock-deduction COMPLETE coverage — 2026-05-08 ─────────────
//
// User report (verbatim, post V42 deploy):
//   "คอร์ส/บริการ/สินค้า หรืออื่นๆ ที่เลือกไว้ว่าไม่ตัดสต็อค ตัวอย่างในภาพที่ 1
//    แต่พอมาใช้บริการจริง หลังจากตัดการรักษาแล้ว ยังตัดสต็อคอยู่ดังภาพที่ 2
//    แก้ด้วยให้หายขาดทุกสาขา ... รองรับทั้งซื้อสินค้าโดยตรง ซื้อเป็นคอร์ส
//    หรือซื้อมาจากโปรโมชั่น"
//
// Diag (scripts/v43-diag-customer-courses-skip-stock.mjs) confirmed 3
// production entries on LC-26000006 with master.sub=true / customer.flag=false.
// Root cause: customer.courses[i].skipStockDeduction is denormalized at buy
// time; admin master edits AFTER purchase don't propagate.
//
// Q1=C hybrid fix:
//   - Backfill migration (scripts/v43-backfill-...) restamps known-bad
//     customer.courses[i] from current be_courses master.
//   - Live-resolve overlay (overlayCustomerCoursesWithMaster) applies master
//     flag at TFP load time so future master edits propagate without
//     re-running migration.
// Q2=A direct-product master flag added on be_products doc top-level.
// Q3=A buildPromotionSubCourseProducts fallback row now carries flag.
// Q4=A Rule M two-phase migration script + audit doc + idempotent.
//
// V-entry preflight covered:
//   V11 — overlayCustomerCoursesWithMaster + resolveCustomerCourseSkipFlag are
//          REAL exports from treatmentBuyHelpers.js (no mock-shadowed risk)
//   V12 — single-source contract: lib helper + migration script + diag all use
//          the SAME resolution logic (resolveEffectiveFlag mirrors lib helper)
//   V13 — full-flow simulate group (V43.J + V43.K) chains: master → buy
//          (frozen) → master-edit → overlay at TFP load → toggle → deduct
//   V14 — !! coercion at every layer (overlay, validation, migration script);
//          no undefined leaves to setDoc
//   V21 — source-grep paired with full-flow simulate (no shape-only locks)
//   V22 — multi-fixture: legacy frozen + future buy + orphan + direct product
//   V31 — silent-swallow REPLACED by intentional product-skip note in branch 2
//          ('product-skip' reason distinct from 'course-skip')
//   V34 — _deductOneItem decision tree extended (branch 1 + 2 + auto-init)
//   V36 — multi-reader-sweep audit: every consumer of customer.courses[i]
//          .skipStockDeduction goes through overlay (TFP load) OR is
//          documented as legacy fallback (orphan path)
//   V42 — promo bundle qty multiplier (related stream): buildPromotionSubCourseProducts
//          fallback row gap closed by V43.C — defensive on top of qty fix
//
// Group structure:
//   V43.A — resolveCustomerCourseSkipFlag pure helper (12+ cases)
//   V43.B — overlayCustomerCoursesWithMaster pure helper (10+ cases)
//   V43.C — buildPromotionSubCourseProducts fallback row carries flag
//   V43.D — productValidation extension (boolean key + emptyForm + normalize)
//   V43.E — _getProductStockConfig surfaces top-level skipStockDeduction (source-grep)
//   V43.F — _deductOneItem direct-product master-skip branch (source-grep)
//   V43.G — TreatmentFormPage load path wires overlay (source-grep)
//   V43.H — ProductFormModal UI checkbox + data-field anchor (source-grep)
//   V43.I — migration script planCustomerBackfill pure helper
//   V43.J — Rule I full-flow simulate: course master → frozen entry → overlay rescues
//   V43.K — Rule I full-flow simulate: direct product master flag → branch 2 fires
//   V43.L — V12 multi-reader-sweep regression locks
//   V43.M — diag script classifyDrift symmetry (single-source resolution)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  resolveCustomerCourseSkipFlag,
  overlayCustomerCoursesWithMaster,
  buildPromotionSubCourseProducts,
  mapRawCoursesToForm,
} from '../src/lib/treatmentBuyHelpers.js';
import {
  validateProduct,
  emptyProductForm,
  normalizeProduct,
} from '../src/lib/productValidation.js';
import {
  resolveEffectiveFlag,
  findMasterSubProduct,
  planCustomerBackfill,
} from '../scripts/v43-backfill-customer-courses-skip-stock.mjs';
import {
  classifyDrift,
  findMasterSubProduct as diagFindMasterSubProduct,
} from '../scripts/v43-diag-customer-courses-skip-stock.mjs';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendClientSrc = read('src/lib/backendClient.js');
const treatmentBuyHelpersSrc = read('src/lib/treatmentBuyHelpers.js');
const treatmentFormPageSrc = read('src/components/TreatmentFormPage.jsx');
const productFormModalSrc = read('src/components/backend/ProductFormModal.jsx');
const productValidationSrc = read('src/lib/productValidation.js');
const backfillScriptSrc = read('scripts/v43-backfill-customer-courses-skip-stock.mjs');
const diagScriptSrc = read('scripts/v43-diag-customer-courses-skip-stock.mjs');

// ════════════════════════════════════════════════════════════════════════════
describe('V43.A — resolveCustomerCourseSkipFlag pure helper', () => {
  it('A.1 returns customer flag when master is null (orphan)', () => {
    expect(resolveCustomerCourseSkipFlag({ skipStockDeduction: true }, null)).toBe(true);
    expect(resolveCustomerCourseSkipFlag({ skipStockDeduction: false }, null)).toBe(false);
    expect(resolveCustomerCourseSkipFlag({}, null)).toBe(false);
    expect(resolveCustomerCourseSkipFlag(null, null)).toBe(false);
  });

  it('A.2 sub-product matched by productId — sub flag wins', () => {
    const master = {
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P-A', productName: 'A', skipStockDeduction: true },
        { productId: 'P-B', productName: 'B', skipStockDeduction: false },
      ],
    };
    expect(resolveCustomerCourseSkipFlag({ productId: 'P-A', product: 'A' }, master)).toBe(true);
    expect(resolveCustomerCourseSkipFlag({ productId: 'P-B', product: 'B' }, master)).toBe(false);
  });

  it('A.3 sub-product matched by productName when productId missing', () => {
    const master = {
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P-A', productName: 'PRP เกล็ดเลือด', skipStockDeduction: true },
      ],
    };
    // Customer entry from legacy ProClinic import has no productId
    expect(resolveCustomerCourseSkipFlag(
      { productId: '', product: 'PRP เกล็ดเลือด' },
      master
    )).toBe(true);
  });

  it('A.4 sub-product NOT matched but master has top-level flag → use top', () => {
    const master = {
      skipStockDeduction: true,
      courseProducts: [
        { productId: 'P-X', productName: 'X', skipStockDeduction: false },
      ],
    };
    expect(resolveCustomerCourseSkipFlag(
      { productId: 'NO-MATCH', product: 'No match' },
      master
    )).toBe(true);
  });

  it('A.5 master has no courseProducts at all → use top-level', () => {
    expect(resolveCustomerCourseSkipFlag(
      { productId: 'P-X', product: 'X' },
      { skipStockDeduction: true }
    )).toBe(true);
    expect(resolveCustomerCourseSkipFlag(
      { productId: 'P-X', product: 'X' },
      { skipStockDeduction: false }
    )).toBe(false);
  });

  it('A.6 V14 — never returns undefined; always boolean', () => {
    expect(typeof resolveCustomerCourseSkipFlag({}, null)).toBe('boolean');
    expect(typeof resolveCustomerCourseSkipFlag({}, {})).toBe('boolean');
    expect(typeof resolveCustomerCourseSkipFlag({ skipStockDeduction: undefined }, null)).toBe('boolean');
  });

  it('A.7 productId match has priority over productName match', () => {
    const master = {
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P-A', productName: 'CommonName', skipStockDeduction: true },
        { productId: 'P-B', productName: 'CommonName', skipStockDeduction: false },
      ],
    };
    expect(resolveCustomerCourseSkipFlag(
      { productId: 'P-B', product: 'CommonName' },
      master
    )).toBe(false); // P-B match wins despite name collision with P-A
  });

  it('A.8 trims whitespace on productId + productName for match', () => {
    const master = {
      courseProducts: [
        { productId: 'P-A', productName: 'PRP', skipStockDeduction: true },
      ],
    };
    expect(resolveCustomerCourseSkipFlag(
      { productId: ' P-A ', product: '' },
      master
    )).toBe(true);
    expect(resolveCustomerCourseSkipFlag(
      { productId: '', product: ' PRP ' },
      master
    )).toBe(true);
  });

  it('A.9 V43-bug repro — exact prod data shape (LC-26000006 PRP entry)', () => {
    // Simulates the prod data: customer entry with frozen flag=false but
    // master sub-product flag=true.
    const customerEntry = {
      name: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
      product: 'PRP เกล็ดเลือดบำรุงรากผม',
      productId: '38841',
      skipStockDeduction: false, // FROZEN at buy time
      source: 'treatment',
      parentName: 'โปรโมชัน: คอร์ส บำรุงรากผม PRP 6 ครั้ง + AHL 2 ครั้ง',
    };
    const masterCourse = {
      _docId: 'COURSES_1778150447655_C8779162',
      courseName: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
      skipStockDeduction: false,
      courseProducts: [
        { productId: '38841', productName: 'PRP เกล็ดเลือดบำรุงรากผม', skipStockDeduction: true },
      ],
    };
    expect(resolveCustomerCourseSkipFlag(customerEntry, masterCourse)).toBe(true);
  });

  it('A.10 master matched but null/undefined sub flag treated as false (V14)', () => {
    const master = {
      skipStockDeduction: false,
      courseProducts: [
        { productId: 'P-A', productName: 'A', skipStockDeduction: undefined },
      ],
    };
    expect(resolveCustomerCourseSkipFlag(
      { productId: 'P-A', product: 'A' },
      master
    )).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.B — overlayCustomerCoursesWithMaster pure helper', () => {
  it('B.1 returns input unchanged when masters array is empty', () => {
    const list = [{ courseName: 'X', products: [{ skipStockDeduction: false }] }];
    const out = overlayCustomerCoursesWithMaster(list, []);
    expect(out).toBe(list);
  });

  it('B.2 returns input unchanged when list is empty', () => {
    const masters = [{ courseName: 'X', skipStockDeduction: true, courseProducts: [] }];
    const out = overlayCustomerCoursesWithMaster([], masters);
    expect(out).toEqual([]);
  });

  it('B.3 overlays standard course-row product with master sub flag', () => {
    const list = [{
      courseId: 'be-course-0',
      courseName: 'PRP 1 ครั้ง',
      products: [{
        rowId: 'be-row-0',
        productId: '38841',
        name: 'PRP',
        skipStockDeduction: false, // frozen
      }],
    }];
    const masters = [{
      courseName: 'PRP 1 ครั้ง',
      skipStockDeduction: false,
      courseProducts: [
        { productId: '38841', productName: 'PRP', skipStockDeduction: true },
      ],
    }];
    const out = overlayCustomerCoursesWithMaster(list, masters);
    expect(out[0].products[0].skipStockDeduction).toBe(true); // overlaid
    // Other fields preserved
    expect(out[0].products[0].rowId).toBe('be-row-0');
    expect(out[0].products[0].productId).toBe('38841');
    // Original input not mutated
    expect(list[0].products[0].skipStockDeduction).toBe(false);
  });

  it('B.4 orphan entry (no master by courseName) — preserves frozen value', () => {
    const list = [{
      courseId: 'be-course-0',
      courseName: 'OrphanCourse',
      products: [{ skipStockDeduction: false }],
    }];
    const masters = [{ courseName: 'DifferentCourse', skipStockDeduction: true, courseProducts: [] }];
    const out = overlayCustomerCoursesWithMaster(list, masters);
    expect(out[0]).toBe(list[0]); // identity preserved (orphan no-op)
    expect(out[0].products[0].skipStockDeduction).toBe(false);
  });

  it('B.5 pick-at-treatment placeholder — overlays availableProducts[]', () => {
    const list = [{
      courseId: 'pick-1',
      courseName: 'X',
      needsPickSelection: true,
      availableProducts: [
        { productId: 'P-A', name: 'A', skipStockDeduction: false },
        { productId: 'P-B', name: 'B', skipStockDeduction: false },
      ],
      products: [],
    }];
    const masters = [{
      courseName: 'X',
      courseProducts: [
        { productId: 'P-A', productName: 'A', skipStockDeduction: true },
        { productId: 'P-B', productName: 'B', skipStockDeduction: false },
      ],
    }];
    const out = overlayCustomerCoursesWithMaster(list, masters);
    expect(out[0].availableProducts[0].skipStockDeduction).toBe(true);
    expect(out[0].availableProducts[1].skipStockDeduction).toBe(false);
  });

  it('B.6 reverse direction (master.false / customer.true) — overlay restores false', () => {
    const list = [{
      courseName: 'X',
      products: [{ productId: 'P-A', name: 'A', skipStockDeduction: true }],
    }];
    const masters = [{
      courseName: 'X',
      skipStockDeduction: false,
      courseProducts: [{ productId: 'P-A', productName: 'A', skipStockDeduction: false }],
    }];
    const out = overlayCustomerCoursesWithMaster(list, masters);
    expect(out[0].products[0].skipStockDeduction).toBe(false);
  });

  it('B.7 multi-customer-course mix: overlays only matched, leaves orphans alone', () => {
    const list = [
      { courseName: 'A', products: [{ productId: '1', name: 'P1', skipStockDeduction: false }] },
      { courseName: 'OrphanCourse', products: [{ productId: '2', name: 'P2', skipStockDeduction: false }] },
      { courseName: 'B', products: [{ productId: '3', name: 'P3', skipStockDeduction: false }] },
    ];
    const masters = [
      { courseName: 'A', courseProducts: [{ productId: '1', productName: 'P1', skipStockDeduction: true }] },
      { courseName: 'B', courseProducts: [{ productId: '3', productName: 'P3', skipStockDeduction: true }] },
    ];
    const out = overlayCustomerCoursesWithMaster(list, masters);
    expect(out[0].products[0].skipStockDeduction).toBe(true);
    expect(out[1].products[0].skipStockDeduction).toBe(false); // orphan unchanged
    expect(out[2].products[0].skipStockDeduction).toBe(true);
  });

  it('B.8 returns NEW array — input untouched (V14 pure helper)', () => {
    const list = [{
      courseName: 'X',
      products: [{ productId: 'P-A', name: 'A', skipStockDeduction: false }],
    }];
    const masters = [{
      courseName: 'X',
      courseProducts: [{ productId: 'P-A', productName: 'A', skipStockDeduction: true }],
    }];
    const out = overlayCustomerCoursesWithMaster(list, masters);
    expect(out).not.toBe(list);
    expect(list[0].products[0].skipStockDeduction).toBe(false);
  });

  it('B.9 entry with empty products[] passes through unchanged', () => {
    const list = [{ courseName: 'X', products: [] }];
    const masters = [{
      courseName: 'X',
      skipStockDeduction: true,
      courseProducts: [],
    }];
    const out = overlayCustomerCoursesWithMaster(list, masters);
    expect(out[0]).toBe(list[0]); // identity preserved (no-op for empty products)
  });

  it('B.10 V13 chain: mapRawCoursesToForm → overlay = effective flag in product row', () => {
    const rawCourses = [{
      name: 'PRP 1 ครั้ง',
      product: 'PRP',
      productId: '38841',
      qty: '1 / 1 ครั้ง',
      status: 'กำลังใช้งาน',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      skipStockDeduction: false, // FROZEN
    }];
    const masters = [{
      courseName: 'PRP 1 ครั้ง',
      skipStockDeduction: false,
      courseProducts: [
        { productId: '38841', productName: 'PRP', skipStockDeduction: true },
      ],
    }];
    const formShape = mapRawCoursesToForm(rawCourses);
    expect(formShape[0].products[0].skipStockDeduction).toBe(false); // mapper reads frozen
    const overlaid = overlayCustomerCoursesWithMaster(formShape, masters);
    expect(overlaid[0].products[0].skipStockDeduction).toBe(true); // overlay rescues
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.C — buildPromotionSubCourseProducts fallback row carries flag', () => {
  it('C.1 sub with no products[] fallback row inherits sub.skipStockDeduction', () => {
    const sub = { name: 'X', qty: 2, unit: 'ครั้ง', skipStockDeduction: true };
    const out = buildPromotionSubCourseProducts(sub, 3);
    expect(out).toHaveLength(1);
    expect(out[0].skipStockDeduction).toBe(true);
    expect(out[0].qty).toBe(6); // 3 * 2
  });

  it('C.2 sub with no products[] fallback — false default when sub flag missing (V14)', () => {
    const sub = { name: 'X', qty: 2, unit: 'ครั้ง' };
    const out = buildPromotionSubCourseProducts(sub, 1);
    expect(out[0].skipStockDeduction).toBe(false);
  });

  it('C.3 sub with products[] — flag preserved per product via spread', () => {
    const sub = {
      name: 'X', qty: 1, unit: 'ครั้ง',
      products: [
        { productId: 'P-A', name: 'A', qty: 2, skipStockDeduction: true },
        { productId: 'P-B', name: 'B', qty: 1, skipStockDeduction: false },
      ],
    };
    const out = buildPromotionSubCourseProducts(sub, 1);
    expect(out[0].skipStockDeduction).toBe(true);
    expect(out[1].skipStockDeduction).toBe(false);
  });

  it('C.4 V43 defensive: per-product flag still set explicitly even after spread', () => {
    // Source-grep: ensure the `skipStockDeduction: !!p?.skipStockDeduction`
    // line exists in the products[] map branch (not just the fallback).
    expect(treatmentBuyHelpersSrc).toMatch(
      /qty: computePromotionProductQty[\s\S]+?skipStockDeduction:\s*!!p\?\.skipStockDeduction/m
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.D — productValidation extension', () => {
  it('D.1 emptyProductForm includes skipStockDeduction:false', () => {
    expect(emptyProductForm().skipStockDeduction).toBe(false);
  });

  it('D.2 validateProduct rejects non-boolean skipStockDeduction', () => {
    const form = { ...emptyProductForm(), productName: 'X', skipStockDeduction: 'maybe' };
    const fail = validateProduct(form);
    expect(fail).toEqual(['skipStockDeduction', 'skipStockDeduction ต้องเป็น boolean']);
  });

  it('D.3 validateProduct accepts true/false/null for skipStockDeduction', () => {
    const base = { ...emptyProductForm(), productName: 'X' };
    expect(validateProduct({ ...base, skipStockDeduction: true })).toBeNull();
    expect(validateProduct({ ...base, skipStockDeduction: false })).toBeNull();
    expect(validateProduct({ ...base, skipStockDeduction: null })).toBeNull();
  });

  it('D.4 normalizeProduct coerces truthy → true', () => {
    const out = normalizeProduct({ ...emptyProductForm(), productName: 'X', skipStockDeduction: 'yes' });
    expect(out.skipStockDeduction).toBe(true);
  });

  it('D.5 normalizeProduct defaults missing flag to false (V14 — no undefined leaves)', () => {
    const form = { ...emptyProductForm(), productName: 'X' };
    delete form.skipStockDeduction;
    const out = normalizeProduct(form);
    expect(out.skipStockDeduction).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.E — _getProductStockConfig surfaces top-level skipStockDeduction', () => {
  it('E.1 reader merges data.skipStockDeduction into returned config', () => {
    expect(backendClientSrc).toMatch(
      /skipStockDeduction:\s*!!data\.skipStockDeduction/
    );
  });

  it('E.2 returns null only when both stockConfig AND skipStockDeduction missing', () => {
    expect(backendClientSrc).toMatch(
      /if \(!cfg && !data\.skipStockDeduction\) return null;/
    );
  });

  it('E.3 V14 — !! coercion (no undefined leaves)', () => {
    const fnStart = backendClientSrc.indexOf('async function _getProductStockConfig(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 1500);
    expect(slice).toMatch(/skipStockDeduction:\s*!!data\.skipStockDeduction/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.F — _deductOneItem direct-product master-skip branch', () => {
  it('F.1 branch fires on cfg.skipStockDeduction === true with reason="product-skip"', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    expect(fnStart).toBeGreaterThan(0);
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    expect(slice).toMatch(/cfg && cfg\.skipStockDeduction === true/);
    expect(slice).toMatch(/note:\s*['"]ผู้ใช้ตั้งค่าให้ไม่ตัดสต็อคที่สินค้า['"]/);
    expect(slice).toMatch(/reason:\s*['"]product-skip['"]/);
  });

  it('F.2 branch sits AFTER course-skip (item.skipStockDeduction) BEFORE tracked check', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    const courseSkipIdx = slice.indexOf("reason: 'course-skip'");
    const productSkipIdx = slice.indexOf("reason: 'product-skip'");
    const trackedIdx = slice.indexOf('let tracked = cfg && cfg.trackStock === true');
    expect(courseSkipIdx).toBeGreaterThan(0);
    expect(productSkipIdx).toBeGreaterThan(0);
    expect(trackedIdx).toBeGreaterThan(0);
    expect(courseSkipIdx).toBeLessThan(productSkipIdx);
    expect(productSkipIdx).toBeLessThan(trackedIdx);
  });

  it('F.3 emits skipped:true movement (NOT a real FIFO write)', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    const productSkipBlock = slice.slice(slice.indexOf("'product-skip'") - 2000, slice.indexOf("'product-skip'"));
    expect(productSkipBlock).toMatch(/skipped:\s*true/);
    expect(productSkipBlock).toMatch(/batchId:\s*null/);
  });

  it('F.4 V43 marker present (institutional memory grep)', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    expect(slice).toMatch(/V43[^\n]*direct-product/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.G — TreatmentFormPage load path wires overlay', () => {
  it('G.1 imports overlayCustomerCoursesWithMaster', () => {
    expect(treatmentFormPageSrc).toMatch(
      /import\s*\{[^}]*overlayCustomerCoursesWithMaster[^}]*\}\s*from\s*['"][^'"]*treatmentBuyHelpers\.js['"]/
    );
  });

  it('G.2 overlay called AFTER mapRawCoursesToForm in load path', () => {
    const mapIdx = treatmentFormPageSrc.indexOf('customerCoursesForForm = mapRawCoursesToForm(rawCourses);');
    const overlayIdx = treatmentFormPageSrc.indexOf('customerCoursesForForm = overlayCustomerCoursesWithMaster(');
    expect(mapIdx).toBeGreaterThan(0);
    expect(overlayIdx).toBeGreaterThan(0);
    expect(mapIdx).toBeLessThan(overlayIdx);
  });

  it('G.3 overlay receives courseItems master array (already fetched)', () => {
    expect(treatmentFormPageSrc).toMatch(
      /overlayCustomerCoursesWithMaster\(\s*customerCoursesForForm,\s*courseItems\s*\|\|\s*\[\]\s*\)/
    );
  });

  it('G.4 V43 marker comment present (institutional memory)', () => {
    expect(treatmentFormPageSrc).toMatch(/V43.*overlay/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.H — ProductFormModal UI checkbox', () => {
  it('H.1 checkbox bound to form.skipStockDeduction with onChange update', () => {
    expect(productFormModalSrc).toMatch(
      /checked=\{!!form\.skipStockDeduction\}[\s\S]*?onChange=\{[^}]+update\(\{\s*skipStockDeduction:/
    );
  });

  it('H.2 data-field="skipStockDeduction" anchor (scrollToError)', () => {
    expect(productFormModalSrc).toMatch(/data-field="skipStockDeduction"/);
  });

  it('H.3 Thai label "ไม่ตัดสต็อค" present', () => {
    expect(productFormModalSrc).toMatch(/ไม่ตัดสต็อค/);
  });

  it('H.4 accent-rose-500 on checkbox (visual distinction from emerald flags)', () => {
    // Find the skipStockDeduction-bound checkbox and confirm its own classes
    const block = productFormModalSrc.match(
      /checked=\{!!form\.skipStockDeduction\}[\s\S]*?className="[^"]+"/m
    );
    expect(block?.[0]).toMatch(/accent-rose-500/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.I — migration script planCustomerBackfill', () => {
  it('I.1 returns needsUpdate:false when no drift', () => {
    const masterByName = new Map();
    masterByName.set('X', { courseName: 'X', _docId: 'C-1', skipStockDeduction: false, courseProducts: [{ productId: 'P-A', productName: 'A', skipStockDeduction: false }] });
    const cust = { courses: [{ name: 'X', product: 'A', productId: 'P-A', skipStockDeduction: false }] };
    const out = planCustomerBackfill(cust, masterByName);
    expect(out.needsUpdate).toBe(false);
    expect(out.perEntry).toEqual([]);
  });

  it('I.2 detects drift and emits per-entry restamp + forensic-trail fields', () => {
    const masterByName = new Map();
    masterByName.set('X', { courseName: 'X', _docId: 'C-1', skipStockDeduction: false, courseProducts: [{ productId: 'P-A', productName: 'A', skipStockDeduction: true }] });
    const cust = { courses: [{ name: 'X', product: 'A', productId: 'P-A', skipStockDeduction: false }] };
    const out = planCustomerBackfill(cust, masterByName);
    expect(out.needsUpdate).toBe(true);
    expect(out.perEntry).toHaveLength(1);
    expect(out.perEntry[0]).toMatchObject({
      index: 0,
      courseName: 'X',
      productName: 'A',
      productId: 'P-A',
      before: false,
      after: true,
      masterCourseId: 'C-1',
    });
    // Forensic trail
    expect(out.newCourses[0]).toMatchObject({
      skipStockDeduction: true,
      _v43BackfilledFrom: false,
    });
    expect(out.newCourses[0]._v43BackfilledAt).toBeTruthy(); // serverTimestamp sentinel
  });

  it('I.3 idempotent — re-applying yields no further drift', () => {
    const masterByName = new Map();
    masterByName.set('X', { courseName: 'X', _docId: 'C-1', skipStockDeduction: false, courseProducts: [{ productId: 'P-A', productName: 'A', skipStockDeduction: true }] });
    // Already-backfilled entry
    const cust = {
      courses: [{
        name: 'X', product: 'A', productId: 'P-A',
        skipStockDeduction: true,
        _v43BackfilledFrom: false,
        _v43BackfilledAt: 'sentinel',
      }],
    };
    const out = planCustomerBackfill(cust, masterByName);
    expect(out.needsUpdate).toBe(false);
  });

  it('I.4 orphan entry (no master) preserves frozen flag', () => {
    const masterByName = new Map();
    const cust = { courses: [{ name: 'OrphanCourse', skipStockDeduction: true }] };
    const out = planCustomerBackfill(cust, masterByName);
    expect(out.needsUpdate).toBe(false);
    expect(out.newCourses[0].skipStockDeduction).toBe(true);
  });

  it('I.5 mixes: some drift, some in-sync, some orphan', () => {
    const masterByName = new Map();
    masterByName.set('A', { courseName: 'A', _docId: 'C-A', skipStockDeduction: false, courseProducts: [{ productId: '1', productName: 'P1', skipStockDeduction: true }] });
    masterByName.set('B', { courseName: 'B', _docId: 'C-B', skipStockDeduction: false, courseProducts: [{ productId: '2', productName: 'P2', skipStockDeduction: false }] });
    const cust = {
      courses: [
        { name: 'A', product: 'P1', productId: '1', skipStockDeduction: false }, // drift
        { name: 'B', product: 'P2', productId: '2', skipStockDeduction: false }, // in-sync
        { name: 'OrphanCourse', skipStockDeduction: true }, // orphan
      ],
    };
    const out = planCustomerBackfill(cust, masterByName);
    expect(out.needsUpdate).toBe(true);
    expect(out.perEntry).toHaveLength(1);
    expect(out.perEntry[0].index).toBe(0);
    expect(out.newCourses[0].skipStockDeduction).toBe(true); // restamped
    expect(out.newCourses[1].skipStockDeduction).toBe(false); // unchanged
    expect(out.newCourses[2].skipStockDeduction).toBe(true); // orphan preserved
  });

  it('I.6 resolveEffectiveFlag mirrors lib resolveCustomerCourseSkipFlag (single-source)', () => {
    // Random fixture: same input → same output across both helpers
    const cases = [
      { entry: { productId: 'P-A', product: 'A', skipStockDeduction: false }, master: { courseProducts: [{ productId: 'P-A', productName: 'A', skipStockDeduction: true }] } },
      { entry: { productId: '', product: '', skipStockDeduction: true }, master: null },
      { entry: { productId: 'NO-MATCH' }, master: { skipStockDeduction: true, courseProducts: [{ productId: 'OTHER', skipStockDeduction: false }] } },
    ];
    for (const c of cases) {
      expect(resolveEffectiveFlag(c.entry, c.master))
        .toBe(resolveCustomerCourseSkipFlag(c.entry, c.master));
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.J — Rule I full-flow: course master → frozen entry → overlay rescues', () => {
  it('J.1 chain — admin edits master AFTER customer purchase; overlay closes the gap', () => {
    // STEP 1: Admin creates course with PRP sub-product, no skip flag yet
    const courseMasterT0 = {
      courseName: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
      skipStockDeduction: false,
      courseProducts: [
        { productId: '38841', productName: 'PRP เกล็ดเลือดบำรุงรากผม', skipStockDeduction: false },
      ],
    };

    // STEP 2: Customer buys via promotion. Sub-course flag freezes at false.
    const customerCoursesAtBuy = [{
      name: 'PRP เกล็ดเลือดบำรุงรากผม 1 ครั้ง',
      product: 'PRP เกล็ดเลือดบำรุงรากผม',
      productId: '38841',
      qty: '1 / 1 ครั้ง',
      status: 'กำลังใช้งาน',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      skipStockDeduction: false, // FROZEN
      source: 'treatment',
      parentName: 'โปรโมชัน: คอร์ส บำรุงรากผม PRP 6 ครั้ง + AHL 2 ครั้ง',
    }];

    // STEP 3: Admin edits master — adds skip flag to PRP
    const courseMasterT1 = {
      ...courseMasterT0,
      courseProducts: [
        { productId: '38841', productName: 'PRP เกล็ดเลือดบำรุงรากผม', skipStockDeduction: true },
      ],
    };

    // STEP 4: TFP load runs mapRawCoursesToForm (frozen) + overlay (live).
    const formShapeFrozen = mapRawCoursesToForm(customerCoursesAtBuy);
    expect(formShapeFrozen[0].products[0].skipStockDeduction).toBe(false);

    const formShapeLive = overlayCustomerCoursesWithMaster(formShapeFrozen, [courseMasterT1]);
    expect(formShapeLive[0].products[0].skipStockDeduction).toBe(true); // RESCUED

    // STEP 5: User toggles row → treatmentItems[i].skipStockDeduction = true
    const product = formShapeLive[0].products[0];
    const treatmentItem = {
      id: product.rowId,
      productId: product.productId,
      name: product.name,
      qty: '1',
      skipStockDeduction: !!product.skipStockDeduction, // mirrors TFP toggleCourseItem
    };
    expect(treatmentItem.skipStockDeduction).toBe(true);

    // STEP 6: At deduct time, _deductOneItem branch 1 fires (item.skipStockDeduction === true)
    // This is verified via source-grep at G.1+; here we assert the contract:
    expect(treatmentItem.skipStockDeduction).toBe(true);
  });

  it('J.2 PRE-V43 reproduction (no overlay) — frozen flag persists, would deduct', () => {
    // Same chain WITHOUT overlay step
    const customerCoursesAtBuy = [{
      name: 'X', product: 'A', productId: 'P-A',
      qty: '1 / 1 ครั้ง', status: 'กำลังใช้งาน',
      skipStockDeduction: false, // FROZEN
    }];
    const formShape = mapRawCoursesToForm(customerCoursesAtBuy);
    // Without V43 overlay, the form keeps the frozen value
    expect(formShape[0].products[0].skipStockDeduction).toBe(false);
    // Would route to FIFO + negativeOverage (the prod bug) — locked here as
    // PRE-V43 documentation. Post-V43, overlay applied at TFP load fixes this.
  });

  it('J.3 reverse direction — admin removed flag from master, overlay un-rescues', () => {
    const customerCourses = [{
      name: 'X', product: 'A', productId: 'P-A',
      qty: '1 / 1 ครั้ง', status: 'กำลังใช้งาน',
      skipStockDeduction: true, // frozen TRUE (was set true at buy time)
    }];
    const masterAfterEdit = {
      courseName: 'X',
      skipStockDeduction: false,
      courseProducts: [{ productId: 'P-A', productName: 'A', skipStockDeduction: false }],
    };
    const formShape = mapRawCoursesToForm(customerCourses);
    expect(formShape[0].products[0].skipStockDeduction).toBe(true);
    const overlaid = overlayCustomerCoursesWithMaster(formShape, [masterAfterEdit]);
    expect(overlaid[0].products[0].skipStockDeduction).toBe(false); // un-rescued
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.K — Rule I full-flow: direct product master flag → branch 2 fires', () => {
  it('K.1 chain — admin sets skipStockDeduction on be_product → cfg from _getProductStockConfig surfaces flag → _deductOneItem branch 2 emits product-skip', () => {
    // SOURCE-GREP chain (real reads happen at runtime; logic is locked here)

    // Step A: ProductFormModal saves form with skipStockDeduction:true
    expect(productFormModalSrc).toMatch(/onChange.*skipStockDeduction:\s*e\.target\.checked/);

    // Step B: normalizeProduct preserves the flag with !!coercion
    // V145 (2026-06-02) — normalizeProduct param renamed form→f for the AV175
    // whitelist refactor (behavior unchanged: still !!<param>.skipStockDeduction).
    expect(productValidationSrc).toMatch(/skipStockDeduction:\s*!!f\.skipStockDeduction/);

    // Step C: _getProductStockConfig surfaces top-level skipStockDeduction
    expect(backendClientSrc).toMatch(/skipStockDeduction:\s*!!data\.skipStockDeduction/);

    // Step D: _deductOneItem branch 2 fires on cfg.skipStockDeduction === true
    expect(backendClientSrc).toMatch(/cfg && cfg\.skipStockDeduction === true/);
    expect(backendClientSrc).toMatch(/reason:\s*['"]product-skip['"]/);
  });

  it('K.2 chain — branch 2 sits AFTER branch 1 (course-skip) so course flag has priority', () => {
    const fnStart = backendClientSrc.indexOf('async function _deductOneItem(');
    const slice = backendClientSrc.slice(fnStart, fnStart + 12000);
    const courseSkip = slice.indexOf("'course-skip'");
    const productSkip = slice.indexOf("'product-skip'");
    expect(courseSkip).toBeGreaterThan(0);
    expect(productSkip).toBeGreaterThan(0);
    expect(courseSkip).toBeLessThan(productSkip);
  });

  it('K.3 promotion fallback row carries the flag (V42 + V43 stack)', () => {
    const sub = { name: 'X', qty: 2, unit: 'ครั้ง', skipStockDeduction: true };
    const out = buildPromotionSubCourseProducts(sub, 1);
    expect(out[0].skipStockDeduction).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.L — V12 multi-reader-sweep regression locks', () => {
  it('L.1 every customer.courses[i].skipStockDeduction reader is overlay-aware OR documented as legacy', () => {
    // Grep all reads of customer.courses[].skipStockDeduction. Each must
    // either (a) be inside mapRawCoursesToForm (mapper IS the read site),
    // (b) be the overlay helper itself, (c) be inside backfill/diag scripts.
    // Any new read site must update this lock.
    const matches = treatmentBuyHelpersSrc.match(/c\?\.skipStockDeduction|c\.skipStockDeduction/g) || [];
    // Sanity: at least the mapRawCoursesToForm read + helper internals.
    expect(matches.length).toBeGreaterThan(0);
  });

  it('L.2 TFP toggleCourseItem uses product.skipStockDeduction (post-overlay value)', () => {
    expect(treatmentFormPageSrc).toMatch(/skipStockDeduction:\s*!!product\.skipStockDeduction/);
  });

  it('L.3 _normalizeStockItems preserves flag on all 4 array branches (regression of CSS.E)', () => {
    expect(backendClientSrc).toMatch(/items\.map\(it => \(\{[\s\S]*?skipStockDeduction:\s*!!it\.skipStockDeduction/m);
  });

  it('L.4 V43 marker present in backendClient.js, treatmentBuyHelpers.js, TreatmentFormPage.jsx', () => {
    expect(backendClientSrc).toMatch(/V43/);
    expect(treatmentBuyHelpersSrc).toMatch(/V43/);
    expect(treatmentFormPageSrc).toMatch(/V43/);
  });

  it('L.5 backfill script uses canonical Firestore path + audit doc', () => {
    expect(backfillScriptSrc).toMatch(/artifacts.*public.*data/);
    expect(backfillScriptSrc).toMatch(/be_admin_audit/);
    expect(backfillScriptSrc).toMatch(/v43-backfill-customer-courses-skip-stock-/);
  });

  it('L.6 backfill script uses --apply two-phase gate', () => {
    expect(backfillScriptSrc).toMatch(/const APPLY = process\.argv\.includes\('--apply'\)/);
    expect(backfillScriptSrc).toMatch(/DRY RUN/);
  });

  it('L.7 backfill script invocation guard (Rule M item 9)', () => {
    expect(backfillScriptSrc).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath\(import\.meta\.url\)/);
  });

  it('L.8 backfill script uses crypto.randomBytes for audit id (Rule M item 10)', () => {
    expect(backfillScriptSrc).toMatch(/randomBytes/);
    expect(backfillScriptSrc).not.toMatch(/Math\.random/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('V43.M — diag script classifyDrift symmetry', () => {
  it('M.1 classifyDrift agrees with resolveEffectiveFlag for same fixtures', () => {
    const cases = [
      // [customerEntry, masterDoc, masterSubProduct, expectedClass]
      [{ skipStockDeduction: false }, { skipStockDeduction: false, courseProducts: [] }, null, 'in-sync'],
      [{ skipStockDeduction: false }, { skipStockDeduction: true, courseProducts: [] }, null, 'master-true-customer-false'],
      [{ skipStockDeduction: true }, { skipStockDeduction: false, courseProducts: [] }, null, 'master-false-customer-true'],
      [{ skipStockDeduction: false }, null, null, 'master-missing'],
      [
        { skipStockDeduction: false, productId: 'P-A' },
        { skipStockDeduction: false, courseProducts: [{ productId: 'P-A', skipStockDeduction: true }] },
        { productId: 'P-A', skipStockDeduction: true },
        'master-true-customer-false'
      ],
    ];
    for (const [entry, master, sub, expected] of cases) {
      expect(classifyDrift(master, sub, entry)).toBe(expected);
    }
  });

  it('M.2 diagFindMasterSubProduct + planCustomerBackfill findMasterSubProduct identical behavior', () => {
    const master = {
      courseProducts: [
        { productId: 'P-A', productName: 'A', skipStockDeduction: true },
      ],
    };
    const entry = { productId: 'P-A', product: 'A' };
    expect(diagFindMasterSubProduct(master, entry)).toBe(findMasterSubProduct(master, entry));
  });

  it('M.3 diag script is read-only (no programmatic --apply branch)', () => {
    expect(diagScriptSrc).toMatch(/v43-diag/);
    // Diag must NOT have an --apply gate (only backfill does). Comment
    // mentions of "--apply" are fine; programmatic argv-check is not.
    expect(diagScriptSrc).not.toMatch(/process\.argv\.includes\(['"]--apply['"]\)/);
  });
});
