// Phase 20.0 SaleTab field-name audit (2026-05-06).
//
// Mirrors Phase 17.2-septies TFP fix pattern. Source-of-truth schema for
// be_products (productValidation.js):
//
//   productName       (legacy: name)
//   productType       (legacy: type)
//   categoryName      (legacy: category — author's prior 'productCategory'
//                       guess was WRONG; that field does not exist on be_products)
//   mainUnitName      (legacy: unit)
//   price
//   salePrice         (some shapes; for courses)
//
// SaleTab had two mappers (medProducts setup + buy-modal product builder)
// that read `productCategory` / `productCategory` (incorrect canonical) +
// `unit` (legacy-first instead of canonical-first). Phase 20.0 audit fixes:
//
//   - category: prefer `categoryName` (canonical) → `productCategory`
//     (legacy guard) → `category` (legacy)
//   - unit:     prefer `mainUnitName` (canonical) → `unit` (legacy)
//
// Same canonical-first pattern Phase 17.2-septies (TreatmentFormPage)
// applied to its 4 modal builders (openMedModal / openConsModal /
// openBuyModal product / openBuyModal course).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SALE_TAB = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/SaleTab.jsx'),
  'utf8',
);

describe('Phase 20.0 SaleTab audit — S1 medProducts mapper uses canonical-first', () => {
  it('S1.1 — categoryName is FIRST in fallback chain', () => {
    expect(SALE_TAB).toMatch(/category:\s*x\.categoryName\s*\|\|/);
  });

  it('S1.2 — mainUnitName is FIRST in unit fallback chain (canonical-first)', () => {
    expect(SALE_TAB).toMatch(/unit:\s*x\.mainUnitName\s*\|\|\s*x\.unit/);
  });

  it('S1.3 — productName is FIRST in name fallback chain', () => {
    expect(SALE_TAB).toMatch(/name:\s*x\.productName\s*\|\|\s*x\.name/);
  });

  it('S1.4 — productType is FIRST in type fallback chain', () => {
    expect(SALE_TAB).toMatch(/type:\s*x\.productType\s*\|\|\s*x\.type/);
  });
});

describe('Phase 20.0 SaleTab audit — S2 buy-modal product builder uses canonical-first', () => {
  it('S2.1 — categoryName FIRST in buy-modal product mapper', () => {
    expect(SALE_TAB).toMatch(/category:\s*p\.categoryName\s*\|\|/);
  });

  it('S2.2 — mainUnitName FIRST in unit (canonical-first)', () => {
    expect(SALE_TAB).toMatch(/unit:\s*p\.mainUnitName\s*\|\|\s*p\.unit/);
  });
});

describe('Phase 20.0 SaleTab audit — S3 buy-modal course builder uses canonical-first (Phase 12.2b legacy)', () => {
  it('S3.1 — courseType fallback chain present (Phase 12.2b)', () => {
    expect(SALE_TAB).toMatch(/courseType:\s*c\.courseType\s*\|\|\s*c\.course_type/);
  });

  it('S3.2 — courseName fallback present in course-name resolution (via beCourseToMasterShape OR direct)', () => {
    // After beCourseToMasterShape returns shape.name, fallback to c.courseName.
    expect(SALE_TAB).toMatch(/c\.courseName/);
  });

  it('S3.3 — salePrice fallback in course price resolution (Phase 12.2b shadow-skip)', () => {
    expect(SALE_TAB).toMatch(/c\.salePrice/);
  });

  it('S3.4 — courseCategory fallback in category resolution', () => {
    expect(SALE_TAB).toMatch(/c\.courseCategory/);
  });
});

describe('Phase 20.0 SaleTab audit — S4 mapper output shape preserves backward-compat readers', () => {
  // Pure simulate — assert the post-mapper output uses the SHORT field names
  // (name/price/unit/category/type) so all downstream JSX keeps working.

  function buildMedProductRow(x) {
    return {
      id: x.id || x.productId,
      name: x.productName || x.name || '',
      price: x.price != null ? x.price : (x.salePrice != null ? x.salePrice : 0),
      unit: x.mainUnitName || x.unit || '',
      category: x.categoryName || x.productCategory || x.category || '',
      type: x.productType || x.type || '',
    };
  }

  it('S4.1 — canonical be_product → mapped row reads correctly', () => {
    const canonical = {
      id: 'P-1',
      productName: 'Paracetamol 500mg',
      price: 5,
      mainUnitName: 'เม็ด',
      categoryName: 'ยาแก้ปวด',
      productType: 'ยา',
    };
    const row = buildMedProductRow(canonical);
    expect(row).toEqual({
      id: 'P-1',
      name: 'Paracetamol 500mg',
      price: 5,
      unit: 'เม็ด',
      category: 'ยาแก้ปวด',
      type: 'ยา',
    });
  });

  it('S4.2 — legacy master_data shape (name/category/unit/type) still maps via fallback', () => {
    const legacy = {
      id: 'P-2',
      name: 'Brufen',
      price: 10,
      unit: 'ml',
      category: 'ยา',
      type: 'ยา',
    };
    const row = buildMedProductRow(legacy);
    expect(row.name).toBe('Brufen');
    expect(row.unit).toBe('ml');
    expect(row.category).toBe('ยา');
    expect(row.type).toBe('ยา');
  });

  it('S4.3 — productCategory legacy (author-guess field) still maps via middle fallback', () => {
    // Some old be_products docs may have been written with the
    // author-guess field name — our fallback chain handles it.
    const partialLegacy = {
      id: 'P-3',
      productName: 'Aspirin',
      price: 2,
      mainUnitName: 'เม็ด',
      productCategory: 'ยาแก้ปวด',  // not canonical, but tolerated
      productType: 'ยา',
    };
    const row = buildMedProductRow(partialLegacy);
    expect(row.category).toBe('ยาแก้ปวด');
  });

  it('S4.4 — empty fields default to empty string not undefined (V14 lock)', () => {
    const minimal = { id: 'P-4', productType: 'ยา' };
    const row = buildMedProductRow(minimal);
    expect(row.name).toBe('');
    expect(row.unit).toBe('');
    expect(row.category).toBe('');
    expect(row.price).toBe(0);
  });

  it('S4.5 — categoryName takes precedence over productCategory legacy guess', () => {
    const both = {
      id: 'P-5',
      productName: 'X',
      categoryName: 'CORRECT',
      productCategory: 'WRONG',
      productType: 'ยา',
    };
    const row = buildMedProductRow(both);
    expect(row.category).toBe('CORRECT');
  });
});

describe('Phase 20.0 SaleTab audit — S5 audit-skill markers (Phase 17.2-septies parity)', () => {
  it('S5.1 — Phase 20.0 SaleTab audit comment markers present', () => {
    expect(SALE_TAB).toMatch(/Phase 20\.0 SaleTab audit/);
  });

  it('S5.2 — categoryName canonical lock comment references productValidation.js', () => {
    expect(SALE_TAB).toMatch(/canonical per productValidation\.js/);
  });
});
