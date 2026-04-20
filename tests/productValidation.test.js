// ─── Phase 12.2 · product validation adversarial tests ────────────────────
import { describe, it, expect } from 'vitest';
import {
  validateProduct, emptyProductForm, normalizeProduct, generateProductId,
  STATUS_OPTIONS, PRODUCT_TYPE_OPTIONS,
} from '../src/lib/productValidation.js';

const base = () => ({ ...emptyProductForm(), productName: 'Paracetamol', productType: 'ยา' });

describe('validateProduct', () => {
  it('PV1: null/array rejected', () => {
    expect(validateProduct(null)?.[0]).toBe('form');
    expect(validateProduct([])?.[0]).toBe('form');
  });
  it('PV2: empty productName rejected', () => {
    expect(validateProduct({ ...base(), productName: '' })?.[0]).toBe('productName');
    expect(validateProduct({ ...base(), productName: '   ' })?.[0]).toBe('productName');
  });
  it('PV3: over-long productName rejected', () => {
    expect(validateProduct({ ...base(), productName: 'x'.repeat(201) })?.[0]).toBe('productName');
  });
  it('PV4: missing productType rejected', () => {
    expect(validateProduct({ ...base(), productType: '' })?.[0]).toBe('productType');
  });
  it('PV5: unknown productType rejected', () => {
    expect(validateProduct({ ...base(), productType: 'ทรัพย์สิน' })?.[0]).toBe('productType');
  });
  it('PV6: each enumerated type accepted', () => {
    for (const t of PRODUCT_TYPE_OPTIONS) {
      expect(validateProduct({ ...base(), productType: t })).toBeNull();
    }
  });
  it('PV7: negative price rejected', () => {
    expect(validateProduct({ ...base(), price: -1 })?.[0]).toBe('price');
  });
  it('PV8: NaN price rejected', () => {
    expect(validateProduct({ ...base(), price: 'abc' })?.[0]).toBe('price');
  });
  it('PV9: zero price accepted (free items)', () => {
    expect(validateProduct({ ...base(), price: 0 })).toBeNull();
  });
  it('PV10: empty-string price accepted', () => {
    expect(validateProduct({ ...base(), price: '' })).toBeNull();
  });
  it('PV11: negative priceInclVat rejected', () => {
    expect(validateProduct({ ...base(), priceInclVat: -5 })?.[0]).toBe('priceInclVat');
  });
  it('PV12: alert thresholds must be ≥ 0', () => {
    expect(validateProduct({ ...base(), alertQtyBeforeOutOfStock: -1 })?.[0]).toBe('alertQtyBeforeOutOfStock');
    expect(validateProduct({ ...base(), alertQtyBeforeMaxStock: -1 })?.[0]).toBe('alertQtyBeforeMaxStock');
    expect(validateProduct({ ...base(), alertDayBeforeExpire: -1 })?.[0]).toBe('alertDayBeforeExpire');
  });
  it('PV13: non-boolean flags rejected', () => {
    expect(validateProduct({ ...base(), isVatIncluded: 'yes' })?.[0]).toBe('isVatIncluded');
    expect(validateProduct({ ...base(), isClaimDrugDiscount: 1 })?.[0]).toBe('isClaimDrugDiscount');
    expect(validateProduct({ ...base(), isTakeawayProduct: 'no' })?.[0]).toBe('isTakeawayProduct');
  });
  it('PV14: each enumerated status accepted', () => {
    for (const s of STATUS_OPTIONS) {
      expect(validateProduct({ ...base(), status: s })).toBeNull();
    }
  });
  it('PV15: unknown status rejected', () => {
    expect(validateProduct({ ...base(), status: 'hidden' })?.[0]).toBe('status');
  });
  it('PV16: over-long free-text rejected', () => {
    expect(validateProduct({ ...base(), indications: 'x'.repeat(1001) })?.[0]).toBe('indications');
    expect(validateProduct({ ...base(), instructions: 'x'.repeat(1001) })?.[0]).toBe('instructions');
  });
  it('PV17: administrationTimes must be array', () => {
    expect(validateProduct({ ...base(), administrationTimes: 'morning' })?.[0]).toBe('administrationTimes');
  });
  it('PV18: valid minimal form accepted', () => {
    expect(validateProduct(base())).toBeNull();
  });
});

describe('normalizeProduct', () => {
  it('PN1: coerces numbers from strings', () => {
    const n = normalizeProduct({ ...base(), price: '100.50', priceInclVat: '107.535', timesPerDay: '3' });
    expect(n.price).toBe(100.5);
    expect(n.priceInclVat).toBeCloseTo(107.535);
    expect(n.timesPerDay).toBe(3);
  });
  it('PN2: empty numeric strings → null', () => {
    const n = normalizeProduct({ ...base(), price: '', priceInclVat: '', alertDayBeforeExpire: '' });
    expect(n.price).toBeNull();
    expect(n.priceInclVat).toBeNull();
    expect(n.alertDayBeforeExpire).toBeNull();
  });
  it('PN3: trim strings', () => {
    const n = normalizeProduct({ ...base(), productName: '  Paracetamol  ', indications: '  X  ' });
    expect(n.productName).toBe('Paracetamol');
    expect(n.indications).toBe('X');
  });
  it('PN4: dedupes administrationTimes + drops blanks', () => {
    const n = normalizeProduct({ ...base(), administrationTimes: [' morning ', '', 'evening'] });
    expect(n.administrationTimes).toEqual(['morning', 'evening']);
  });
});

describe('generateProductId', () => {
  it('PG1: PROD- prefix + 16-hex', () => {
    expect(generateProductId()).toMatch(/^PROD-[0-9a-z]+-[0-9a-f]{16}$/);
  });
  it('PG2: unique across 50 calls', () => {
    const s = new Set();
    for (let i = 0; i < 50; i++) s.add(generateProductId());
    expect(s.size).toBe(50);
  });
});
