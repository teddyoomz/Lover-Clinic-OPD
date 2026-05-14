import { describe, it, expect } from 'vitest';
import {
  CENTRAL_BUCKETS,
  resolveCentralBucketScope,
  assertWarehouseMasterProtected,
  centralBucketDefaultsForUI,
} from '../src/lib/centralStockBuckets.js';

describe('CS1 CENTRAL_BUCKETS schema', () => {
  it('CS1.1 frozen', () => {
    expect(Object.isFrozen(CENTRAL_BUCKETS)).toBe(true);
  });

  it('CS1.2 has 4 buckets in canonical order', () => {
    expect(Object.keys(CENTRAL_BUCKETS)).toEqual([
      'cs_po', 'cs_stock_ledger', 'cs_transfers_withdrawals', 'cs_adjustments',
    ]);
  });

  it('CS1.3 every bucket has required fields', () => {
    for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
      expect(typeof b.label, `${id}.label`).toBe('string');
      expect(typeof b.description, `${id}.description`).toBe('string');
      expect(Array.isArray(b.collections), `${id}.collections`).toBe(true);
      expect(Array.isArray(b.counterDocs), `${id}.counterDocs`).toBe(true);
      expect(typeof b.defaultChecked, `${id}.defaultChecked`).toBe('boolean');
      expect(Object.isFrozen(b), `${id} frozen`).toBe(true);
    }
  });

  it('CS1.4 cs_po has counter doc + centralWarehouseId filter (V66 fix — prod field name)', () => {
    expect(CENTRAL_BUCKETS.cs_po.counterDocs).toEqual(['be_central_stock_orders_counter']);
    expect(CENTRAL_BUCKETS.cs_po.collections[0].name).toBe('be_central_stock_orders');
    // V66 fix 2026-05-15: prod uses `centralWarehouseId` (verified at
    // backendClient.js:5855); pre-fix had `warehouseId` (invented).
    expect(CENTRAL_BUCKETS.cs_po.collections[0].filterField).toBe('centralWarehouseId');
  });

  it('CS1.5 cs_transfers_withdrawals has orFilterField on both transfers + withdrawals (V66 fix — prod field names)', () => {
    const transfers = CENTRAL_BUCKETS.cs_transfers_withdrawals.collections.find(c => c.name === 'be_stock_transfers');
    expect(transfers.filterField).toBe('sourceLocationId');
    // V66 fix: prod uses `destinationLocationId` (verified at backendClient.js:7684);
    // pre-fix had `destLocationId` (invented).
    expect(transfers.orFilterField).toBe('destinationLocationId');
    const withdrawals = CENTRAL_BUCKETS.cs_transfers_withdrawals.collections.find(c => c.name === 'be_stock_withdrawals');
    expect(withdrawals.filterField).toBe('sourceLocationId');
    // V66 fix: withdrawals now also handle cross-direction (central as dest);
    // field verified at backendClient.js:8059-8060.
    expect(withdrawals.orFilterField).toBe('destinationLocationId');
  });

  it('CS1.6 all 4 buckets defaultChecked=true (no opt-in-only in central)', () => {
    for (const b of Object.values(CENTRAL_BUCKETS)) {
      expect(b.defaultChecked).toBe(true);
    }
  });

  it('CS1.7 no bucket includes warehouse master collection', () => {
    for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
      for (const c of b.collections) {
        expect(c.name, `${id} must not include be_central_stock_warehouses`).not.toBe('be_central_stock_warehouses');
      }
    }
  });

  it('CS1.8 cs_stock_ledger includes batches + movements (V66 fix — be_central_stock_movements removed, empty in prod)', () => {
    const names = CENTRAL_BUCKETS.cs_stock_ledger.collections.map(c => c.name).sort();
    expect(names).toContain('be_stock_batches');
    expect(names).toContain('be_stock_movements');
    // V66 fix 2026-05-15: be_central_stock_movements REMOVED — Rule R diag
    // confirmed empty in prod (stale collection from branchBackupCore.UNIVERSAL).
    expect(names).not.toContain('be_central_stock_movements');
    // V66 fix: filterField for stock collections corrected to `branchId` (prod
    // actual field per backendClient.js:5439, 5466; pre-fix had `locationId`
    // which exists only on post-Phase 15.2 docs subset).
    const batches = CENTRAL_BUCKETS.cs_stock_ledger.collections.find(c => c.name === 'be_stock_batches');
    expect(batches.filterField).toBe('branchId');
    const movements = CENTRAL_BUCKETS.cs_stock_ledger.collections.find(c => c.name === 'be_stock_movements');
    expect(movements.filterField).toBe('branchId');
  });

  it('CS1.9 cs_adjustments uses branchId filterField (V66 fix — prod field, not locationId)', () => {
    const adj = CENTRAL_BUCKETS.cs_adjustments.collections[0];
    expect(adj.name).toBe('be_stock_adjustments');
    // V66 fix: be_stock_adjustments has `branchId` field only (verified at
    // backendClient.js:6291); pre-fix had `locationId` which doesn't exist.
    expect(adj.filterField).toBe('branchId');
  });
});

describe('CS2 resolveCentralBucketScope', () => {
  it('CS2.1 empty array throws EMPTY_BUCKET_SET', () => {
    expect(() => resolveCentralBucketScope([])).toThrow('EMPTY_BUCKET_SET');
    expect(() => resolveCentralBucketScope(null)).toThrow('EMPTY_BUCKET_SET');
    expect(() => resolveCentralBucketScope(undefined)).toThrow('EMPTY_BUCKET_SET');
  });

  it('CS2.2 unknown bucket throws UNKNOWN_BUCKET', () => {
    expect(() => resolveCentralBucketScope(['nope'])).toThrow('UNKNOWN_BUCKET: nope');
  });

  it('CS2.3 cs_po returns orders + counter', () => {
    const r = resolveCentralBucketScope(['cs_po']);
    expect(r.collections.map(c => c.name)).toEqual(['be_central_stock_orders']);
    expect(r.counterDocs).toEqual(['be_central_stock_orders_counter']);
  });

  it('CS2.4 all 4 buckets returns deduped union', () => {
    const r = resolveCentralBucketScope(['cs_po', 'cs_stock_ledger', 'cs_transfers_withdrawals', 'cs_adjustments']);
    expect(r.collections.length).toBeGreaterThanOrEqual(6);
    expect(r.counterDocs).toEqual(['be_central_stock_orders_counter']);
  });

  it('CS2.5 collections preserve order across buckets', () => {
    const r = resolveCentralBucketScope(['cs_stock_ledger', 'cs_po']);
    // cs_stock_ledger comes first → batches first
    expect(r.collections[0].name).toBe('be_stock_batches');
  });
});

describe('CS3 assertWarehouseMasterProtected', () => {
  it('CS3.1 accepts non-master collections', () => {
    expect(() => assertWarehouseMasterProtected([
      { name: 'be_stock_batches' }, { name: 'be_central_stock_orders' },
    ])).not.toThrow();
  });

  it('CS3.2 throws on be_central_stock_warehouses', () => {
    expect(() => assertWarehouseMasterProtected([
      { name: 'be_central_stock_warehouses' },
    ])).toThrow('WAREHOUSE_MASTER_NOT_WIPEABLE');
  });

  it('CS3.3 accepts string list (not only object)', () => {
    expect(() => assertWarehouseMasterProtected(['be_stock_batches'])).not.toThrow();
    expect(() => assertWarehouseMasterProtected(['be_central_stock_warehouses'])).toThrow('WAREHOUSE_MASTER_NOT_WIPEABLE');
  });

  it('CS3.4 mixed list throws on first warehouse master encountered', () => {
    expect(() => assertWarehouseMasterProtected([
      { name: 'be_stock_batches' },
      { name: 'be_central_stock_warehouses' },
      { name: 'be_central_stock_orders' },
    ])).toThrow('WAREHOUSE_MASTER_NOT_WIPEABLE');
  });

  it('CS3.5 empty array no-op', () => {
    expect(() => assertWarehouseMasterProtected([])).not.toThrow();
  });
});

describe('CS4 centralBucketDefaultsForUI', () => {
  it('CS4.1 returns all 4 keys', () => {
    const d = centralBucketDefaultsForUI();
    expect(Object.keys(d).sort()).toEqual(['cs_adjustments', 'cs_po', 'cs_stock_ledger', 'cs_transfers_withdrawals']);
  });

  it('CS4.2 all values true (no opt-in-only)', () => {
    const d = centralBucketDefaultsForUI();
    expect(d).toEqual({ cs_po: true, cs_stock_ledger: true, cs_transfers_withdrawals: true, cs_adjustments: true });
  });
});
