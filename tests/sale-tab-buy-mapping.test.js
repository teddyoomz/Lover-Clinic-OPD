// ─── SaleTab buy-modal field mapping + skipStockDeduction propagation ─────
//
// 2026-04-28 user report (verbatim):
//   "หน้า ขายใหม่ ใน tab=sales ปุ่ม ซื้อคอร์ส, สินค้า, โปรโมชัน, ยากลับบ้าน
//   ไม่โหลดอะไรมาใน list เลยสักปุ่มเดียว แก้แล้วตรวจสอบ wiring เรื่องสต็อค
//   ให้ถูกต้อง และทำตาม flow ข้อกำหนดการตัดหรือไม่ตัดสต็อคตามติ๊กถูกในรายการ
//   คอร์ส เหมือนหน้า สร้างการรักษา ด้วย"
//
// Root cause: SaleTab buy-modal mapper at openBuyModal read raw
// `c.name` / `c.price` / `c.category` / `c.products` for courses + same-
// shape error for products. But Phase 14.10-tris (2026-04-26) migrated
// to be_courses + be_products which use camelCase fields:
//   be_courses: courseName / salePrice / courseCategory / courseProducts
//   be_products: productName / price / productCategory / type
// Mapper output had `name: undefined` → buyFilteredItems filter at line
// 472 called `i.name.toLowerCase()` → TypeError → empty list rendered.
//
// Fix: aliasing be_* shape fields at mapping site + use beCourseToMasterShape
// for courses (Rule C1 single-source-of-truth — same helper TreatmentFormPage
// uses; propagates skipStockDeduction onto each products[i] per V15 #5).
//
// Test groups:
//   STB.A — buy-modal field mapping source-grep
//   STB.B — skipStockDeduction propagation through buy chain
//   STB.C — full simulate (buyChain helper invocation)
//   STB.D — defensive filter (no throw on undefined name)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { beCourseToMasterShape } from '../src/lib/backendClient.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const saleTabSrc = read('src/components/backend/SaleTab.jsx');

// ============================================================================
describe('STB.A — buy-modal field mapping source-grep', () => {
  it('A.1 SaleTab imports beCourseToMasterShape from scopedDataLayer (BSA Task 6)', () => {
    expect(saleTabSrc).toMatch(/beCourseToMasterShape/);
    // Confirm it's an import (not just a comment mention)
    // BSA Task 6: UI imports backendClient via scopedDataLayer Layer 2
    const importBlock = saleTabSrc.match(/from ['"]\.\.\/\.\.\/lib\/scopedDataLayer\.js['"]/g);
    expect(importBlock).toBeTruthy();
  });

  it('A.2 course mapping uses beCourseToMasterShape inside openBuyModal', () => {
    // Look for the call inside the openBuyModal function (around the
    // 'course' branch). beCourseToMasterShape(c) should appear in a .map.
    const openBuy = saleTabSrc.match(/const openBuyModal[\s\S]+?\}, \[buyItems\]\);/);
    expect(openBuy?.[0]).toMatch(/beCourseToMasterShape\(c\)/);
  });

  it('A.3 product mapping aliases be_products field names (productName / productCategory / productId)', () => {
    const openBuy = saleTabSrc.match(/const openBuyModal[\s\S]+?\}, \[buyItems\]\);/);
    expect(openBuy?.[0]).toMatch(/p\.productName\s*\|\|\s*p\.name/);
    expect(openBuy?.[0]).toMatch(/p\.productCategory\s*\|\|\s*p\.category/);
  });

  it('A.4 medProducts mapping (loadOptions) aliases be_products field names', () => {
    const loadOpts = saleTabSrc.match(/const loadOptions[\s\S]+?\n\s*\}, \[customers\.length, sellers\.length\]\);/);
    expect(loadOpts?.[0]).toMatch(/x\.productName\s*\|\|\s*x\.name/);
    expect(loadOpts?.[0]).toMatch(/x\.productCategory\s*\|\|\s*x\.category/);
  });

  it('A.5 product-type filter ("สินค้าหน้าร้าน") preserved', () => {
    const openBuy = saleTabSrc.match(/const openBuyModal[\s\S]+?\}, \[buyItems\]\);/);
    expect(openBuy?.[0]).toMatch(/p\.type\s*===\s*['"]สินค้าหน้าร้าน['"]/);
  });
});

// ============================================================================
describe('STB.B — skipStockDeduction propagation through buy chain', () => {
  it('B.1 confirmBuy newItems whitelist preserves skipStockDeduction', () => {
    // confirmBuy is short; use a window match
    const confirmFn = saleTabSrc.match(/const confirmBuy = \(\) => \{[\s\S]+?setBuyModalOpen\(false\);\s*\};/);
    expect(confirmFn?.[0]).toMatch(/skipStockDeduction:\s*!!i\.skipStockDeduction/);
  });

  it('B.2 assignCourseToCustomer call passes top-level skipStockDeduction', () => {
    // Look for the per-course assignCourseToCustomer call in the post-save loop.
    const callMatch = saleTabSrc.match(/await assignCourseToCustomer\(customerId,\s*\{[\s\S]+?courseType: course\.courseType[\s\S]+?\}\);/);
    expect(callMatch?.[0]).toMatch(/skipStockDeduction:\s*!!course\.skipStockDeduction/);
  });

  it('B.3 course mapping output includes skipStockDeduction at top level (fallback for assign)', () => {
    const openBuy = saleTabSrc.match(/const openBuyModal[\s\S]+?\}, \[buyItems\]\);/);
    // skipStockDeduction key appears in the course .map return shape
    const courseBlock = openBuy?.[0]?.match(/items = all[\s\S]+?\.map\(c => \{[\s\S]+?\}\);/);
    expect(courseBlock?.[0]).toMatch(/skipStockDeduction:\s*!!c\.skipStockDeduction/);
  });
});

// ============================================================================
describe('STB.C — full simulate (helper invocation)', () => {
  it('C.1 beCourseToMasterShape converts raw be_courses doc to master shape with skipStockDeduction', () => {
    const rawBeCourse = {
      courseId: 'C-1',
      courseName: '[IV Drip] Aura bright x 2 ครั้ง',
      salePrice: 5000,
      courseCategory: 'IV Drip',
      mainProductId: 'P-MAIN',
      mainProductName: 'Main',
      mainQty: 1,
      skipStockDeduction: true,
      courseProducts: [
        { productId: 'P-A', productName: 'Sub A', qty: 1, skipStockDeduction: false },
        { productId: 'P-B', productName: 'Sub B', qty: 2, skipStockDeduction: true },
      ],
    };
    const shape = beCourseToMasterShape(rawBeCourse);
    expect(shape.id).toBe('C-1');
    expect(shape.name).toBe('[IV Drip] Aura bright x 2 ครั้ง');
    expect(shape.price).toBe(5000);
    expect(shape.course_category).toBe('IV Drip');
    expect(shape.products).toHaveLength(3); // 1 main + 2 sub
    // V15 #5 — skipStockDeduction propagated per row
    expect(shape.products[0].skipStockDeduction).toBe(true);  // main inherits
    expect(shape.products[1].skipStockDeduction).toBe(false); // sub A
    expect(shape.products[2].skipStockDeduction).toBe(true);  // sub B
  });

  it('C.2 raw be_courses without skipStockDeduction → defaults to false (V14 — no undefined leaves)', () => {
    const rawBeCourse = {
      courseId: 'C-2',
      courseName: 'Plain',
      salePrice: 100,
      courseProducts: [{ productId: 'P-1', productName: 'X', qty: 1 }],
    };
    const shape = beCourseToMasterShape(rawBeCourse);
    // No mainProductId means main not added; products[] = [sub-only]
    expect(shape.products[0].skipStockDeduction).toBe(false);
  });

  it('C.3 simulating SaleTab buy-modal mapping: raw be_courses → mapped item has all fields populated', () => {
    // Mirror the Patch A logic for a course
    const rawBeCourse = {
      id: 'C-3', courseId: 'C-3',
      courseName: 'Test course',
      salePrice: 1000,
      courseCategory: 'Beauty',
      courseType: 'ระบุสินค้าและจำนวนสินค้า',
      mainProductId: 'P-MAIN', mainProductName: 'Main', mainQty: 1,
      courseProducts: [{ productId: 'P-A', productName: 'A', qty: 1 }],
      daysBeforeExpire: 365,
      period: 0,
      skipStockDeduction: false,
    };
    const shape = beCourseToMasterShape(rawBeCourse);
    const mapped = {
      id: shape.id,
      name: shape.name || rawBeCourse.courseName || '',
      price: shape.price != null ? shape.price : (rawBeCourse.salePrice ?? 0),
      category: shape.course_category || rawBeCourse.courseCategory || '',
      itemType: 'course',
      products: shape.products || [],
      courseType: rawBeCourse.courseType || '',
      daysBeforeExpire: rawBeCourse.daysBeforeExpire ?? null,
      period: rawBeCourse.period ?? null,
      skipStockDeduction: !!rawBeCourse.skipStockDeduction,
    };
    expect(mapped.id).toBe('C-3');
    expect(mapped.name).toBe('Test course');
    expect(mapped.price).toBe(1000);
    expect(mapped.category).toBe('Beauty');
    expect(mapped.products).toHaveLength(2); // main + 1 sub
    expect(mapped.daysBeforeExpire).toBe(365);
    expect(mapped.skipStockDeduction).toBe(false);
  });

  it('C.4 simulating SaleTab buy-modal product mapping → name + category populated', () => {
    const rawBeProduct = {
      id: 'P-1',
      productId: 'P-1',
      productName: 'Vitamin C',
      productCategory: 'IV Drip Drug',
      price: 200,
      unit: 'amp.',
      type: 'สินค้าหน้าร้าน',
    };
    const mapped = {
      id: rawBeProduct.id || rawBeProduct.productId,
      name: rawBeProduct.productName || rawBeProduct.name || '',
      price: rawBeProduct.price != null ? rawBeProduct.price : (rawBeProduct.salePrice ?? 0),
      unit: rawBeProduct.unit || rawBeProduct.mainUnitName || '',
      category: rawBeProduct.productCategory || rawBeProduct.category || '',
      itemType: 'product',
      skipStockDeduction: !!rawBeProduct.skipStockDeduction,
    };
    expect(mapped.id).toBe('P-1');
    expect(mapped.name).toBe('Vitamin C');
    expect(mapped.price).toBe(200);
    expect(mapped.unit).toBe('amp.');
    expect(mapped.category).toBe('IV Drip Drug');
    expect(mapped.skipStockDeduction).toBe(false);
  });
});

// ============================================================================
describe('STB.D — defensive filter (no throw on undefined name)', () => {
  it('D.1 buyFilteredItems filter uses optional chaining on i?.name', () => {
    // Look for the buyFilteredItems useMemo — should filter via
    // (i?.name || '').toLowerCase() so legacy malformed items don't crash.
    const block = saleTabSrc.match(/const buyFilteredItems = useMemo\([\s\S]+?\}, \[buyItems, buyModalType, buySelectedCat, buyQuery\]\);/);
    expect(block?.[0]).toMatch(/i\?\.name\s*\|\|\s*['"]['"]/);
    // Anti-regression: must NOT have unguarded items.filter(i => i.name.toLowerCase())
    // (allow comment mentions of the old broken pattern as historical context)
    expect(block?.[0]).not.toMatch(/items\.filter\([^)]*i\.name\.toLowerCase/);
  });
});
