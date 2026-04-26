// ─── beCourseToMasterShape · Phase 12.2b follow-up ────────────────────────
// Guards the main-product-in-products[] fix for be_courses → master_data
// shape conversion. Before the fix, `mainProductId` was stored at top
// level and never flowed into `products[]`, so the buy modal + treatment
// page's auto-generated customer-course entries were missing the main
// product entirely ("ไส้ในของคอร์สเหมามาไม่หมด").

import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

import { beCourseToMasterShape } from '../src/lib/backendClient.js';

describe('beCourseToMasterShape — main product inclusion', () => {
  it('BC1 course with only mainProductId (no courseProducts) → 1-product output', () => {
    const out = beCourseToMasterShape({
      courseId: 'C1', courseName: 'Solo Main',
      mainProductId: 'P-42', mainProductName: 'BA Allergan', mainQty: 10,
    });
    expect(out.products).toHaveLength(1);
    expect(out.products[0].id).toBe('P-42');
    expect(out.products[0].name).toBe('BA Allergan');
    expect(out.products[0].qty).toBe(10);
    expect(out.products[0].isMainProduct).toBe(true);
  });

  it('BC2 course with mainProductId + courseProducts → main first, then secondaries', () => {
    const out = beCourseToMasterShape({
      courseId: 'C1', courseName: 'With Secondaries',
      mainProductId: 'P-M', mainProductName: 'Main', mainQty: 5,
      courseProducts: [
        { productId: 'P-S1', productName: 'Sec 1', qty: 2 },
        { productId: 'P-S2', productName: 'Sec 2', qty: 3 },
      ],
    });
    expect(out.products).toHaveLength(3);
    expect(out.products[0].id).toBe('P-M');
    expect(out.products[0].isMainProduct).toBe(true);
    expect(out.products[1].id).toBe('P-S1');
    expect(out.products[2].id).toBe('P-S2');
  });

  it('BC3 dedup: if main product id also appears in courseProducts, keep ONLY the main entry', () => {
    const out = beCourseToMasterShape({
      courseId: 'C1', courseName: 'Dup',
      mainProductId: 'P-X', mainProductName: 'X', mainQty: 1,
      courseProducts: [
        { productId: 'P-X', productName: 'X dup', qty: 99 }, // should be skipped
        { productId: 'P-Y', productName: 'Y', qty: 1 },
      ],
    });
    expect(out.products).toHaveLength(2);
    expect(out.products[0].id).toBe('P-X');
    expect(out.products[0].qty).toBe(1); // main's qty, not courseProducts'
    expect(out.products[1].id).toBe('P-Y');
  });

  it('BC4 no mainProductId → behaves like pre-12.2b (only courseProducts)', () => {
    const out = beCourseToMasterShape({
      courseId: 'C1', courseName: 'Legacy',
      courseProducts: [{ productId: 'P1', productName: 'A', qty: 1 }],
    });
    expect(out.products).toHaveLength(1);
    expect(out.products[0].id).toBe('P1');
    expect(out.products[0].isMainProduct).toBeUndefined();
  });

  it('BC5 empty course (no mainProductId, no courseProducts) → empty products[]', () => {
    const out = beCourseToMasterShape({ courseId: 'C-empty', courseName: 'E' });
    expect(out.products).toEqual([]);
  });

  it('BC6 mainQty 0 / null preserved (fill-later courses) as qty=0', () => {
    const out = beCourseToMasterShape({
      courseId: 'C-REAL', courseName: 'Real',
      courseType: 'เหมาตามจริง',
      mainProductId: 'P-M', mainProductName: 'Main', mainQty: 0,
    });
    expect(out.products[0].qty).toBe(0);
  });

  it('BC7 productLookup enriches unit for main product', () => {
    const lookup = new Map([['P-M', { name: 'Lookup Name', unit: 'mL' }]]);
    const out = beCourseToMasterShape({
      courseId: 'C1',
      mainProductId: 'P-M', mainProductName: '', mainQty: 5,
    }, { productLookup: lookup });
    expect(out.products[0].unit).toBe('mL');
    // Name falls back to lookup when course doesn't carry it
    expect(out.products[0].name).toBe('Lookup Name');
  });

  it('BC8 productLookup enriches secondary unit too (legacy behavior preserved)', () => {
    const lookup = new Map([['P-S', { unit: 'cc' }]]);
    const out = beCourseToMasterShape({
      courseId: 'C1',
      courseProducts: [{ productId: 'P-S', productName: 'Sec', qty: 1 }],
    }, { productLookup: lookup });
    expect(out.products[0].unit).toBe('cc');
  });

  it('BC9 mainProductId whitespace-only → treated as absent', () => {
    const out = beCourseToMasterShape({
      courseId: 'C1',
      mainProductId: '   ',
      courseProducts: [{ productId: 'P1', productName: 'A', qty: 1 }],
    });
    expect(out.products).toHaveLength(1);
    expect(out.products[0].isMainProduct).toBeUndefined();
  });

  it('BC10 top-level be_courses fields still map (regression — not a new bug)', () => {
    const out = beCourseToMasterShape({
      courseId: 'C-ID', courseName: 'Foo',
      courseCode: 'FOO-1', courseCategory: 'Laser',
      salePrice: 1234, salePriceInclVat: 1320.38,
    });
    expect(out.id).toBe('C-ID');
    expect(out.name).toBe('Foo');
    expect(out.code).toBe('FOO-1');
    expect(out.category).toBe('Laser');
    expect(out.sale_price).toBe(1234);
    expect(out.sale_price_incl_vat).toBe(1320.38);
  });
});
