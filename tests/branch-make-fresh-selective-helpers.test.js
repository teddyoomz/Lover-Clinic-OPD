import { describe, it, expect } from 'vitest';
import { BUCKETS, resolveBucketScope, assertNotT1, bucketDefaultsForUI } from '../src/lib/branchBackupBuckets.js';

// ─── B1 BUCKETS schema ────────────────────────────────────────────────────────
describe('B1 BUCKETS schema', () => {
  it('B1.1 BUCKETS is frozen', () => {
    expect(Object.isFrozen(BUCKETS)).toBe(true);
  });

  it('B1.2 BUCKETS has exactly 7 keys in canonical order', () => {
    const keys = Object.keys(BUCKETS);
    expect(keys).toEqual([
      'appointments',
      'treatments',
      'sales',
      'stock',
      'finance',
      'lineLink',
      'customerActivity',
    ]);
  });

  it('B1.3 every bucket has required fields', () => {
    for (const [id, b] of Object.entries(BUCKETS)) {
      expect(typeof b.label, `${id}.label`).toBe('string');
      expect(typeof b.description, `${id}.description`).toBe('string');
      expect(Array.isArray(b.collections), `${id}.collections`).toBe(true);
      expect(Array.isArray(b.customerSubcollections), `${id}.customerSubcollections`).toBe(true);
      expect(typeof b.defaultChecked, `${id}.defaultChecked`).toBe('boolean');
      expect(Object.isFrozen(b), `${id} frozen`).toBe(true);
    }
  });

  it('B1.4 appointments bucket has correct collections', () => {
    expect(BUCKETS.appointments.collections).toEqual(['be_appointments']);
    expect(BUCKETS.appointments.customerSubcollections).toEqual(['appointments']);
  });

  it('B1.5 sales bucket has all 5 collections', () => {
    expect(BUCKETS.sales.collections).toEqual([
      'be_sales',
      'be_vendor_sales',
      'be_online_sales',
      'be_quotations',
      'be_sale_insurance_claims',
    ]);
  });

  it('B1.6 stock bucket has all 6 collections and no subcollections', () => {
    expect(BUCKETS.stock.collections).toEqual([
      'be_stock_batches',
      'be_stock_movements',
      'be_stock_orders',
      'be_stock_transfers',
      'be_stock_withdrawals',
      'be_stock_adjustments',
    ]);
    expect(BUCKETS.stock.customerSubcollections).toEqual([]);
  });

  it('B1.7 finance bucket includes be_deposits in collections', () => {
    expect(BUCKETS.finance.collections).toContain('be_deposits');
    expect(BUCKETS.finance.collections).toContain('be_expenses');
    expect(BUCKETS.finance.customerSubcollections).toEqual(['deposits']);
  });

  it('B1.8 customerActivity has no top-level collections, only subcollections', () => {
    expect(BUCKETS.customerActivity.collections).toEqual([]);
    expect(BUCKETS.customerActivity.customerSubcollections.length).toBeGreaterThan(0);
  });

  it('B1.9 no bucket contains a T1 collection', () => {
    // T1 = master data: be_products, be_courses, be_staff, be_doctors, etc.
    const T1_GUARD = ['be_products', 'be_courses', 'be_staff', 'be_doctors', 'be_branches'];
    for (const [id, b] of Object.entries(BUCKETS)) {
      for (const c of b.collections) {
        expect(T1_GUARD.includes(c), `${id} must not include T1 collection ${c}`).toBe(false);
      }
    }
  });

  it('B1.10 lineLink bucket has exactly be_link_requests', () => {
    expect(BUCKETS.lineLink.collections).toEqual(['be_link_requests']);
    expect(BUCKETS.lineLink.customerSubcollections).toEqual([]);
  });
});

// ─── B2 resolveBucketScope ────────────────────────────────────────────────────
describe('B2 resolveBucketScope', () => {
  it('B2.1 empty array throws EMPTY_BUCKET_SET', () => {
    expect(() => resolveBucketScope([])).toThrow('EMPTY_BUCKET_SET');
  });

  it('B2.2 unknown bucket ID throws UNKNOWN_BUCKET', () => {
    expect(() => resolveBucketScope(['badId'])).toThrow('UNKNOWN_BUCKET: badId');
  });

  it('B2.3 single bucket returns its merged collections and subcollections', () => {
    const result = resolveBucketScope(['appointments']);
    expect(result.collections).toContain('be_appointments');
    expect(result.subcollections).toContain('appointments');
  });

  it('B2.4 multi-bucket deduplicates overlapping entries', () => {
    // sales + finance both contribute nothing overlapping, but calling twice should dedup
    const result = resolveBucketScope(['appointments', 'appointments']);
    const colCount = result.collections.filter(c => c === 'be_appointments').length;
    expect(colCount).toBe(1);
  });

  it('B2.5 all 7 buckets returns full merged set including deposits and treatments subcollections', () => {
    const all = Object.keys(BUCKETS);
    const result = resolveBucketScope(all);
    expect(result.subcollections).toContain('deposits');
    expect(result.subcollections).toContain('treatments');
    expect(result.collections.length).toBeGreaterThan(0);
  });
});

// ─── B3 assertNotT1 ───────────────────────────────────────────────────────────
describe('B3 assertNotT1', () => {
  it('B3.1 accepts T2/T3 collections without throwing', () => {
    expect(() => assertNotT1(['be_appointments', 'be_sales', 'be_treatments'])).not.toThrow();
  });

  it('B3.2 throws T1_NOT_WIPEABLE on a T1 collection', () => {
    expect(() => assertNotT1(['be_products'])).toThrow('T1_NOT_WIPEABLE');
  });

  it('B3.3 empty array is a no-op', () => {
    expect(() => assertNotT1([])).not.toThrow();
  });

  it('B3.4 mixed list throws on first T1 encountered', () => {
    expect(() => assertNotT1(['be_appointments', 'be_courses', 'be_sales'])).toThrow('T1_NOT_WIPEABLE');
  });
});

// ─── B4 bucketDefaultsForUI ───────────────────────────────────────────────────
describe('B4 bucketDefaultsForUI', () => {
  it('B4.1 returns object with exactly 7 keys', () => {
    const defaults = bucketDefaultsForUI();
    expect(Object.keys(defaults)).toHaveLength(7);
    expect(Object.keys(defaults)).toEqual(Object.keys(BUCKETS));
  });

  it('B4.2 Q4-B contract: 6 buckets true, customerActivity false', () => {
    const defaults = bucketDefaultsForUI();
    expect(defaults.appointments).toBe(true);
    expect(defaults.treatments).toBe(true);
    expect(defaults.sales).toBe(true);
    expect(defaults.stock).toBe(true);
    expect(defaults.finance).toBe(true);
    expect(defaults.lineLink).toBe(true);
    expect(defaults.customerActivity).toBe(false);
  });
});
