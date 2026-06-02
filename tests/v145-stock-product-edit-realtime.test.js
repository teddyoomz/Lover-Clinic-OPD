// tests/v145-stock-product-edit-realtime.test.js
// V145 (2026-06-02, AV175) — Stock-tab product edit: full-doc load + real-time
// table reflection + the data-integrity whitelist backstop.
//   A — normalizeProduct whitelist (preserve real schema, drop stock junk)
//   F — flow-simulate: be_products edit → live map → table fields
//   G — source-grep wiring locks
// Rule P Tier 2 regression. Whitelist field set enumerated from 610 real prod
// docs via scripts/diag-be-products-schema.mjs (Rule R).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { normalizeProduct, emptyProductForm } from '../src/lib/productValidation.js';

const src = (rel) => readFileSync(path.resolve('src', rel), 'utf8');

// the exact stock-aggregation junk keys the balance row carries (the corruption vector)
const JUNK = ['batches', 'expired', 'nextExpiry', 'totalCapacity', 'totalRemaining', 'unit', 'valueCost', 'id'];

describe('V145.A normalizeProduct whitelist', () => {
  it('A1 preserves legit extras: stockConfig / createdBy / updatedBy / name / _forensic', () => {
    const out = normalizeProduct({
      ...emptyProductForm(), productName: 'X', productType: 'ยา',
      stockConfig: { trackStock: true, unit: 'ครั้ง', minAlert: 0, isControlled: false },
      createdBy: 'u1', updatedBy: 'u2', name: 'legacy-name',
      _branchIdBackfilledAt: 't', _stockConfigSetBy: '_deductOneItem(treatment)',
    });
    expect(out.stockConfig).toEqual({ trackStock: true, unit: 'ครั้ง', minAlert: 0, isControlled: false });
    expect(out.createdBy).toBe('u1');
    expect(out.updatedBy).toBe('u2');
    expect(out.name).toBe('legacy-name');
    expect(out._branchIdBackfilledAt).toBe('t');
    expect(out._stockConfigSetBy).toBe('_deductOneItem(treatment)');
  });

  it('A2 drops ALL stock-aggregation junk (the corruption vector)', () => {
    const out = normalizeProduct({
      ...emptyProductForm(), productName: 'X', productType: 'ยา',
      batches: [{ batchId: 'B', x: 1 }], totalRemaining: 3, totalCapacity: 0,
      nextExpiry: null, expired: 0, unit: 'ครั้ง', valueCost: 99, id: 'STRAY-ID',
    });
    for (const k of JUNK) expect(k in out).toBe(false);
  });

  it('A3 no undefined leaves anywhere (V14 — setDoc rejects undefined)', () => {
    for (const input of [emptyProductForm(), { productName: 'P', productType: 'ยา' }, {}]) {
      const out = normalizeProduct(input);
      for (const [k, v] of Object.entries(out)) expect(v, `key ${k}`).not.toBeUndefined();
    }
  });

  it('A4 preserves EVERY emptyProductForm field (no canonical field lost)', () => {
    const out = normalizeProduct(emptyProductForm());
    for (const k of Object.keys(emptyProductForm())) expect(k in out, `field ${k}`).toBe(true);
  });

  it('A5 real-prod-shape round-trip: legit survive, junk gone, fields not wiped', () => {
    // a realistic full be_products doc (from the Rule R diag schema) PLUS junk
    // that a stock-row edit would inject.
    const realDoc = {
      ...emptyProductForm(),
      productName: 'เนื้อเยื่อเทียม Matigen 5*7*0.4 cm', productType: 'สินค้าสิ้นเปลือง',
      categoryName: 'อุปกรณ์', mainUnitName: 'ชิ้น', price: 1200, productCode: 'MTG-5740',
      stockConfig: { trackStock: true, unit: 'ชิ้น', minAlert: 0, isControlled: false },
      createdBy: 'admin1', updatedBy: 'admin2', _branchIdBackfilledFrom: '',
    };
    const polluted = { ...realDoc, batches: [{ batchId: 'X' }], totalRemaining: 3, unit: 'ครั้ง', valueCost: 50, id: 'STRAY' };
    const out = normalizeProduct(polluted);
    // junk gone
    for (const k of JUNK) expect(k in out).toBe(false);
    // legit fields NOT wiped
    expect(out.productType).toBe('สินค้าสิ้นเปลือง');
    expect(out.categoryName).toBe('อุปกรณ์');
    expect(out.mainUnitName).toBe('ชิ้น');
    expect(out.price).toBe(1200);
    expect(out.stockConfig.trackStock).toBe(true);
    expect(out.createdBy).toBe('admin1');
  });

  it('A6 invalid input (null/array/string) → safe empty-default object, no throw', () => {
    for (const bad of [null, undefined, [], 'x', 42]) {
      const out = normalizeProduct(bad);
      expect(out.productType).toBe('ยา');
      expect(out.productName).toBe('');
      for (const v of Object.values(out)) expect(v).not.toBeUndefined();
    }
  });
});

describe('V145.E normalizeProduct — adversarial edge cases', () => {
  it('E1 prototype-pollution guard: __proto__ own-key does NOT pollute the output', () => {
    const evil = JSON.parse('{"productName":"X","productType":"ยา","__proto__":{"polluted":true}}');
    const out = normalizeProduct(evil);
    expect(out.polluted).toBeUndefined();                       // prototype NOT polluted
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);  // proto intact
    expect(({}).polluted).toBeUndefined();                      // global proto clean
  });

  it('E2 constructor / prototype keys are NOT copied as data fields', () => {
    const evil = JSON.parse('{"productName":"Y","productType":"ยา","_keep":1,"constructor":"bad","prototype":"bad"}');
    const out = normalizeProduct(evil);
    expect(out._keep).toBe(1);                       // legit forensic still preserved
    expect(typeof out.constructor).toBe('function'); // native, not 'bad'
    expect(Object.prototype.hasOwnProperty.call(out, 'prototype')).toBe(false);
  });

  it('E3 stockConfig null preserved as null; object preserved; (no undefined)', () => {
    expect(normalizeProduct({ ...emptyProductForm(), productName: 'A', productType: 'ยา', stockConfig: null }).stockConfig).toBeNull();
    const cfg = { trackStock: true, unit: 'ครั้ง' };
    expect(normalizeProduct({ ...emptyProductForm(), productName: 'A', productType: 'ยา', stockConfig: cfg }).stockConfig).toEqual(cfg);
    // absent → key not present (NOT undefined leaf)
    const out = normalizeProduct(emptyProductForm());
    expect('stockConfig' in out).toBe(false);
  });

  it('E4 administrationTimes with mixed junk → trimmed string list only', () => {
    const out = normalizeProduct({ ...emptyProductForm(), productName: 'A', productType: 'ยา', administrationTimes: [null, '', 123, '  เช้า  ', false, 'เย็น'] });
    expect(out.administrationTimes).toEqual(['เช้า', 'เย็น']);
  });

  it('E5 forensic _key with undefined value is NOT copied (V14)', () => {
    const out = normalizeProduct({ ...emptyProductForm(), productName: 'A', productType: 'ยา', _undef: undefined, _real: 'x' });
    expect('_undef' in out).toBe(false);
    expect(out._real).toBe('x');
  });

  it('E6 save-path composition (mirrors saveProduct): branchId + stockConfig preserved, junk dropped', () => {
    // mirror the REAL saveProduct composition:
    //   { ...normalizeProduct(data), branchId: _resolveBranchIdForWrite(data), productId, createdAt, updatedAt }
    const resolveBranchIdForWrite = (d) =>
      (d && typeof d.branchId === 'string' && d.branchId.trim()) ? d.branchId : 'CTX-BRANCH';
    const fullDoc = {
      ...emptyProductForm(), productName: 'Matigen', productType: 'สินค้าสิ้นเปลือง',
      categoryName: 'อุปกรณ์', mainUnitName: 'กล่อง', price: 1200, branchId: 'BR-NAKHON',
      stockConfig: { trackStock: true, unit: 'กล่อง' }, createdBy: 'u1', _branchIdBackfilledAt: 't',
    };
    // modal form (full doc) + user changes unit + leaked stock-row junk
    const data = { ...emptyProductForm(), ...fullDoc, mainUnitName: 'ชิ้น', batches: [{ x: 1 }], totalRemaining: 5, unit: 'ครั้ง', valueCost: 9, id: 'STRAY', createdAt: 't0' };
    const saved = { ...normalizeProduct(data), branchId: resolveBranchIdForWrite(data), productId: 'P1', createdAt: data.createdAt || 'now', updatedAt: 'now' };
    expect(saved.branchId).toBe('BR-NAKHON');           // NOT jumped to CTX-BRANCH (data.branchId wins)
    expect(saved.mainUnitName).toBe('ชิ้น');             // edit applied
    expect(saved.categoryName).toBe('อุปกรณ์');          // not wiped
    expect(saved.price).toBe(1200);                     // not wiped
    expect(saved.stockConfig).toEqual({ trackStock: true, unit: 'กล่อง' });
    expect(saved.createdBy).toBe('u1');
    expect(saved._branchIdBackfilledAt).toBe('t');
    for (const k of JUNK) expect(k in saved).toBe(false); // junk never reaches the doc
    expect(saved.productId).toBe('P1');
    for (const v of Object.values(saved)) expect(v).not.toBeUndefined();
  });
});

describe('V145.G source-grep — wiring contract (anti-drift)', () => {
  it('G1 normalizeProduct has NO leading "...form" spread (whitelist enforced)', () => {
    const code = src('lib/productValidation.js');
    const fn = code.slice(code.indexOf('export function normalizeProduct'));
    const body = fn.slice(0, fn.indexOf('\n}'));
    expect(body).not.toMatch(/\n\s*\.\.\.form,/);
    expect(body).not.toMatch(/\n\s*\.\.\.f,/);
    expect(body).toContain('AV175');
    // curated extras preserved
    expect(body).toContain('out.stockConfig');
    expect(body).toContain("k.startsWith('_')");
  });

  it('G2 StockBalancePanel live map carries canonicalUnit/Category/Type + full doc', () => {
    const code = src('components/backend/StockBalancePanel.jsx');
    expect(code).toContain('canonicalUnit');
    expect(code).toContain('canonicalCategory');
    expect(code).toContain('canonicalType');
    expect(code).toMatch(/full:\s*p/);
  });

  it('G3 products row uses canonicalUnit (batch fallback) + category + type + fullProduct', () => {
    const code = src('components/backend/StockBalancePanel.jsx');
    expect(code).toMatch(/unit:\s*\(tEntry\?\.canonicalUnit\)\s*\|\|\s*b\.unit/);
    expect(code).toMatch(/category:\s*tEntry\?\.canonicalCategory/);
    expect(code).toMatch(/productType:\s*tEntry\?\.canonicalType/);
    expect(code).toMatch(/fullProduct:\s*tEntry\?\.full/);
  });

  it('G4 onEditProduct passes p.fullProduct (NOT the bare aggregated row)', () => {
    const code = src('components/backend/StockBalancePanel.jsx');
    expect(code).toMatch(/onEditProduct\(p\.fullProduct\s*\|\|\s*\{\s*productId:\s*p\.productId\s*\}\)/);
    // anti-regression: no bare onEditProduct(p)
    expect(code).not.toMatch(/onEditProduct\(p\)/);
  });

  it('G5 table has td-category + td-type, NO td-capacity / มูลค่าทุน column', () => {
    const code = src('components/backend/StockBalancePanel.jsx');
    expect(code).toContain('data-testid="td-category"');
    expect(code).toContain('data-testid="td-type"');
    expect(code).toContain('data-testid="th-category"');
    expect(code).not.toContain('data-testid="td-capacity"');
    expect(code).not.toContain('data-testid="th-capacity"');
    // no per-row cost render (valueCost stays in the useMemo for the header summary only)
    expect(code).not.toMatch(/฿\{fmtQty\(p\.valueCost\)\}/);
  });

  it('G6 StockTab + CentralStockTab use a getProduct fallback handler (no bare setEditingProduct prop)', () => {
    for (const f of ['components/backend/StockTab.jsx', 'components/backend/CentralStockTab.jsx']) {
      const code = src(f);
      expect(code, f).toContain('getProduct');
      expect(code, f).toMatch(/onEditProduct=\{handleEditProduct\}/);
      // the guard: full obj has productType → use it; else fetch
      expect(code, f).toMatch(/obj\s*&&\s*obj\.productType/);
      expect(code, f).not.toMatch(/onEditProduct=\{setEditingProduct\}/);
    }
  });

  it('G7 listenToProducts effect RE-SUBSCRIBES on branch switch (deps:[selectedBranchId], not [])', () => {
    const code = src('components/backend/StockBalancePanel.jsx');
    // the products-map effect must close with [selectedBranchId], not []
    expect(code).toMatch(/setProductThresholdMap\(map\)[\s\S]{0,1200}\}\s*,\s*\[selectedBranchId\]\)/);
  });
});
