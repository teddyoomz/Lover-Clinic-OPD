// OrderPanel: BRANCH_ID scope fix + smart unit dropdown
//
// User report 2026-04-27 (two bugs in one report):
//   1. "หน้า สร้าง Order นำเข้า กดบันทึก order แล้วขึ้นว่า BRANCH_ID is not defined"
//      — pre-existing scope bug: OrderCreateForm referenced BRANCH_ID
//        outside its scope (declared in sibling OrderPanel function).
//        Same V31 pattern as the StockAdjustPanel.AdjustCreateForm fix
//        shipped earlier today (commit e65d335).
//
//   2. "หน้าสร้าง Order นำเข้า ให้ทำ Dropdown เลือกหน่วยของสินค้าได้ แต่ต้องมีระบบ
//      โหลดหน่วยของสินค้าที่เลือกและมาเปลี่ยนตรง Dropdown นั้นโดยอัตโนมัติ"
//      — currently `<input type="text">`; needs smart dropdown driven by
//        the picked product's defaultProductUnitGroupId (lookup against
//        be_product_units → units[].name).
//
// Fix:
//   1. Pass branchId from OrderPanel → OrderCreateForm via prop; AdjustForm
//      declares `const BRANCH_ID = branchId;` at the top of its body
//   2. NEW exported `getUnitOptionsForProduct(productId, products, unitGroups)`
//      — pure helper returning unit-name array for the picked product
//   3. NEW `UnitField` sub-component renders <select> when options.length>0,
//      <input> fallback otherwise (no JSX IIFE per rule 03-stack V5)
//   4. onPickProduct auto-selects base unit (group's row 0) on product pick
//
// This test pins the contract.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { getUnitOptionsForProduct } from '../src/components/backend/OrderPanel.jsx';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const orderPanelSrc = read('src/components/backend/OrderPanel.jsx');

// ────────────────────────────────────────────────────────────────────────
// O1 — getUnitOptionsForProduct pure helper
// ────────────────────────────────────────────────────────────────────────
describe('OrderPanel O1 — getUnitOptionsForProduct helper', () => {
  const products = [
    { id: 'P1', productName: 'Botox', defaultProductUnitGroupId: 'UG-1' },
    { id: 'P2', productName: 'Filler', defaultProductUnitGroupId: 'UG-2' },
    { id: 'P3', productName: 'NoGroup' },                    // missing group
    { id: 'P4', productName: 'EmptyGroupId', defaultProductUnitGroupId: '' },
  ];
  const unitGroups = [
    { id: 'UG-1', units: [{ name: 'amp', amount: 1, isBase: true }, { name: 'box', amount: 100 }] },
    { id: 'UG-2', units: [{ name: 'U', amount: 1, isBase: true }] },
    // also test alternate id field path (some loaders return unitGroupId)
    { unitGroupId: 'UG-3', units: [{ name: 'syringe', amount: 1, isBase: true }] },
  ];

  it('O1.1 returns base + larger packs for a configured group', () => {
    expect(getUnitOptionsForProduct('P1', products, unitGroups)).toEqual(['amp', 'box']);
  });

  it('O1.2 single-unit group returns 1-item array', () => {
    expect(getUnitOptionsForProduct('P2', products, unitGroups)).toEqual(['U']);
  });

  it('O1.3 product without defaultProductUnitGroupId returns []', () => {
    expect(getUnitOptionsForProduct('P3', products, unitGroups)).toEqual([]);
  });

  it('O1.4 product with empty-string defaultProductUnitGroupId returns []', () => {
    expect(getUnitOptionsForProduct('P4', products, unitGroups)).toEqual([]);
  });

  it('O1.5 unit group looked up via .id OR .unitGroupId field (alternate shape)', () => {
    const productsWithUG3 = [...products, { id: 'P5', defaultProductUnitGroupId: 'UG-3' }];
    expect(getUnitOptionsForProduct('P5', productsWithUG3, unitGroups)).toEqual(['syringe']);
  });

  it('O1.6 unknown productId returns []', () => {
    expect(getUnitOptionsForProduct('UNKNOWN', products, unitGroups)).toEqual([]);
  });

  it('O1.7 falsy productId returns []', () => {
    expect(getUnitOptionsForProduct('', products, unitGroups)).toEqual([]);
    expect(getUnitOptionsForProduct(null, products, unitGroups)).toEqual([]);
    expect(getUnitOptionsForProduct(undefined, products, unitGroups)).toEqual([]);
  });

  it('O1.8 non-array products / unitGroups returns []', () => {
    expect(getUnitOptionsForProduct('P1', null, unitGroups)).toEqual([]);
    expect(getUnitOptionsForProduct('P1', products, null)).toEqual([]);
    expect(getUnitOptionsForProduct('P1', undefined, unitGroups)).toEqual([]);
  });

  it('O1.9 group without units array returns []', () => {
    const broken = [{ id: 'UG-1' }];
    expect(getUnitOptionsForProduct('P1', products, broken)).toEqual([]);
  });

  it('O1.10 trims whitespace + filters empty unit names (defensive)', () => {
    const messy = [{
      id: 'UG-1',
      units: [{ name: '  amp  ' }, { name: '' }, { name: '   ' }, { name: 'box' }],
    }];
    expect(getUnitOptionsForProduct('P1', products, messy)).toEqual(['amp', 'box']);
  });

  it('O1.11 productId compared as string (numeric vs string id mismatch)', () => {
    const numericProducts = [{ id: 1, defaultProductUnitGroupId: 'UG-1' }];
    expect(getUnitOptionsForProduct('1', numericProducts, unitGroups)).toEqual(['amp', 'box']);
    expect(getUnitOptionsForProduct(1, numericProducts, unitGroups)).toEqual(['amp', 'box']);
  });
});

// ────────────────────────────────────────────────────────────────────────
// O2 — BRANCH_ID scope fix (V31 pattern)
// ────────────────────────────────────────────────────────────────────────
describe('OrderPanel O2 — BRANCH_ID scope fix', () => {
  it('O2.1 OrderCreateForm signature accepts branchId prop', () => {
    expect(orderPanelSrc).toMatch(
      /function OrderCreateForm\(\{[^}]*branchId[^}]*\}\)/
    );
  });

  it('O2.2 OrderCreateForm body declares BRANCH_ID from prop', () => {
    const fnStart = orderPanelSrc.indexOf('function OrderCreateForm');
    expect(fnStart).toBeGreaterThan(0);
    const after = orderPanelSrc.slice(fnStart, fnStart + 1500);
    expect(after).toMatch(/const\s+BRANCH_ID\s*=\s*branchId/);
  });

  it('O2.3 OrderPanel passes branchId={BRANCH_ID} to OrderCreateForm', () => {
    expect(orderPanelSrc).toMatch(
      /<OrderCreateForm[\s\S]{0,400}branchId=\{BRANCH_ID\}/
    );
  });

  it('O2.4 V31 LOCK — both scopes have a BRANCH_ID declaration', () => {
    // Parent: destructure from useSelectedBranch
    expect(orderPanelSrc).toMatch(/const\s*\{\s*branchId:\s*BRANCH_ID\s*\}\s*=\s*useSelectedBranch/);
    // Child OrderCreateForm: direct assignment from prop
    expect(orderPanelSrc).toMatch(/const\s+BRANCH_ID\s*=\s*branchId\s*;/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// O3 — Smart unit dropdown wiring
// ────────────────────────────────────────────────────────────────────────
describe('OrderPanel O3 — smart unit dropdown', () => {
  it('O3.1 imports listProductUnitGroups', () => {
    expect(orderPanelSrc).toMatch(/listProductUnitGroups/);
  });

  it('O3.2 OrderCreateForm loads unit groups on mount via useEffect', () => {
    const fnStart = orderPanelSrc.indexOf('function OrderCreateForm');
    const after = orderPanelSrc.slice(fnStart, fnStart + 3500);
    expect(after).toMatch(/listProductUnitGroups\(\)/);
    expect(after).toMatch(/setUnitGroups\(/);
    // empty deps: runs once on mount
    expect(after).toMatch(/return\s*\(\)\s*=>\s*\{\s*cancelled\s*=\s*true;\s*\};\s*\},\s*\[\]\)/);
  });

  it('O3.3 onPickProduct auto-selects base unit (group row 0)', () => {
    const fnStart = orderPanelSrc.indexOf('const onPickProduct');
    const after = orderPanelSrc.slice(fnStart, fnStart + 800);
    expect(after).toContain('getUnitOptionsForProduct');
    expect(after).toMatch(/baseUnit\s*=\s*opts\[0\]/);
    expect(after).toMatch(/unit:\s*baseUnit/);
  });

  it('O3.4 fallback chain when no group: mainUnitName → legacy unit → ""', () => {
    const fnStart = orderPanelSrc.indexOf('const onPickProduct');
    const after = orderPanelSrc.slice(fnStart, fnStart + 800);
    expect(after).toMatch(/p\.mainUnitName\s*\|\|\s*p\.unit/);
  });

  it('O3.5 UnitField sub-component exists at module scope', () => {
    expect(orderPanelSrc).toMatch(/^function UnitField\(\{[^}]+\}\)/m);
  });

  it('O3.6 UnitField renders <select> when options.length > 0', () => {
    const fnStart = orderPanelSrc.indexOf('function UnitField');
    const after = orderPanelSrc.slice(fnStart, fnStart + 800);
    expect(after).toContain('options.length > 0');
    expect(after).toContain('<select');
    expect(after).toContain('data-testid="order-unit-select"');
  });

  it('O3.7 UnitField renders <input> fallback for products without group', () => {
    const fnStart = orderPanelSrc.indexOf('function UnitField');
    const after = orderPanelSrc.slice(fnStart, fnStart + 800);
    expect(after).toContain('<input');
    expect(after).toContain('data-testid="order-unit-input"');
  });

  it('O3.8 BOTH unit field call sites use UnitField (mobile card + desktop table)', () => {
    // grep all <UnitField uses
    const matches = (orderPanelSrc.match(/<UnitField[\s\S]{0,300}\/>/g) || []);
    expect(matches.length).toBeGreaterThanOrEqual(2);
    for (const m of matches) {
      expect(m).toContain('options={getUnitOptionsForProduct(it.productId, products, unitGroups)}');
    }
  });

  it('O3.9 V21 / Rule 03-stack V5 LOCK — no JSX IIFE pattern in OrderPanel (Vite OXC crash guard)', () => {
    // strip block comments first — IIFE patterns in comments are fine
    const stripped = orderPanelSrc.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(stripped).not.toMatch(/\{\(\(\)\s*=>\s*\{[\s\S]{0,500}\}\)\(\)\}/);
  });

  it('O3.10 V31 — listProductUnitGroups failure does NOT silent-swallow blocking; falls back gracefully', () => {
    const fnStart = orderPanelSrc.indexOf('listProductUnitGroups()');
    const after = orderPanelSrc.slice(Math.max(0, fnStart - 100), fnStart + 600);
    // catch logs warn (non-fatal — fallback path renders <input>)
    // BUT must NOT contain anti-V31 "continuing" pattern
    expect(after).toContain('console.warn');
    expect(after).not.toMatch(/console\.warn\([^)]*continuing/i);
  });
});
