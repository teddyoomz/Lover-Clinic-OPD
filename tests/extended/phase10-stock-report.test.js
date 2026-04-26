// Phase 10.5 — Stock Report aggregator: 30+ adversarial scenarios.
// Aligned with /audit-reports-accuracy AR1–AR15.

import { describe, it, expect } from 'vitest';
import {
  aggregateStockReport,
  buildStockReportRow,
  buildStockReportColumns,
  NEAR_EXPIRY_DAYS,
} from '../src/lib/stockReportAggregator.js';
import { assertReconcile } from '../src/lib/reportsUtils.js';
import { buildCSV } from '../src/lib/csvExport.js';

/* ─── Fixtures ───────────────────────────────────────────────────────────── */

// Fixed "now" for deterministic tests — avoids flaking on daily clock drift.
const NOW = '2026-04-19T00:00:00.000Z';

const FIX_PRODUCTS = [
  {
    id: 'P001', name: 'Botox 100U', type: 'ยา', category: 'Botox',
    status: 'ใช้งาน', stockConfig: { trackStock: true, unit: 'U' },
  },
  {
    id: 'P002', name: 'Acetin', type: 'ยา', category: 'ยาฉีด',
    status: 'ใช้งาน', stockConfig: { trackStock: true, unit: 'amp.' },
  },
  {
    id: 'P003', name: 'Filler', type: 'ยา', category: 'filler',
    status: 'ใช้งาน', stockConfig: { trackStock: true, unit: 'cc' },
  },
  {
    id: 'P004', name: 'Paused Product', type: 'สินค้าหน้าร้าน', category: 'Mask',
    status: 'พักใช้งาน', stockConfig: { trackStock: true, unit: 'ชิ้น' },
  },
  {
    id: 'P005', name: 'Supply X', type: 'สินค้าสิ้นเปลือง', category: 'mk',
    status: 'ใช้งาน', stockConfig: { trackStock: true, unit: 'อัน' },
  },
  // No batches → should only appear if showZeroQty=true
  {
    id: 'P099', name: 'Never Stocked', type: 'ยา', category: 'HIFU',
    status: 'ใช้งาน', stockConfig: { trackStock: true, unit: 'ครั้ง' },
  },
];

const FIX_BATCHES = [
  // P001: 2 batches, no expiry on 1, far future on another → safe stock
  {
    batchId: 'B001a', productId: 'P001', productName: 'Botox 100U',
    qty: { remaining: 500, total: 500 }, originalCost: 50, unit: 'U',
    expiresAt: null, status: 'active',
  },
  {
    batchId: 'B001b', productId: 'P001', productName: 'Botox 100U',
    qty: { remaining: 1500, total: 2000 }, originalCost: 60, unit: 'U',
    expiresAt: '2027-01-01T00:00:00.000Z', status: 'active', // far future
  },

  // P002: 3 batches — near-expiry + safe + already expired
  {
    batchId: 'B002a', productId: 'P002', productName: 'Acetin',
    qty: { remaining: 50, total: 50 }, originalCost: 100, unit: 'amp.',
    expiresAt: '2026-05-10T00:00:00.000Z', status: 'active', // 21 days → near
  },
  {
    batchId: 'B002b', productId: 'P002', productName: 'Acetin',
    qty: { remaining: 20, total: 20 }, originalCost: 110, unit: 'amp.',
    expiresAt: '2026-03-01T00:00:00.000Z', status: 'active', // already expired
  },
  {
    batchId: 'B002c', productId: 'P002', productName: 'Acetin',
    qty: { remaining: 100, total: 100 }, originalCost: 90, unit: 'amp.',
    expiresAt: '2027-06-01T00:00:00.000Z', status: 'active', // > 30 days → safe
  },

  // P003: 1 batch, boundary exact 30 days → should count as near-expiry
  {
    batchId: 'B003a', productId: 'P003', productName: 'Filler',
    qty: { remaining: 10, total: 10 }, originalCost: 5000, unit: 'cc',
    expiresAt: '2026-05-19T00:00:00.000Z', status: 'active', // exactly 30 days
  },

  // P004: batches but product is paused → still shown; status filter will drop
  {
    batchId: 'B004a', productId: 'P004', productName: 'Paused Product',
    qty: { remaining: 5, total: 5 }, originalCost: 200, unit: 'ชิ้น',
    expiresAt: null, status: 'active',
  },

  // P005: legacy scalar qty (not {remaining,total})
  {
    batchId: 'B005a', productId: 'P005', productName: 'Supply X',
    qty: 25, originalCost: 40, unit: 'อัน',
    expiresAt: null, status: 'active',
  },

  // Orphan: productId not in master_data — should still appear
  {
    batchId: 'B_ORPHAN', productId: 'ORPHAN_PID', productName: 'Ghost Product',
    qty: { remaining: 3, total: 3 }, originalCost: 15, unit: 'กล่อง',
    expiresAt: null, status: 'active',
  },

  // Zero-qty batch — should never contribute to totals
  {
    batchId: 'B_ZERO', productId: 'P001', productName: 'Botox 100U',
    qty: { remaining: 0, total: 500 }, originalCost: 99999, unit: 'U',
    expiresAt: null, status: 'active',
  },
];

/* ─── AR2 — Input safety ─────────────────────────────────────────────────── */

describe('AR2 — empty/null input safety', () => {
  it('empty arrays return empty rows + zero totals', () => {
    const out = aggregateStockReport([], [], { nowISO: NOW });
    expect(out.rows).toEqual([]);
    expect(out.totals.productCount).toBe(0);
    expect(out.totals.totalValue).toBe(0);
  });

  it('null inputs do not throw', () => {
    expect(() => aggregateStockReport(null, null, { nowISO: NOW })).not.toThrow();
    expect(aggregateStockReport(null, null, { nowISO: NOW }).rows).toEqual([]);
  });

  it('malformed nowISO falls back to Date.now (no crash)', () => {
    expect(() => aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: 'not-a-date' }))
      .not.toThrow();
  });
});

/* ─── Row building + weighted-avg cost ───────────────────────────────────── */

describe('weighted-average cost', () => {
  it('P001: 500×50 + 1500×60 = 115000 / 2000 = 57.50', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P001');
    expect(r.totalQty).toBe(2000);
    expect(r.weightedAvgCost).toBe(57.5);
    expect(r.totalValue).toBe(115000);
  });

  it('weighted-avg excludes zero-qty batches so their cost does not pollute', () => {
    // B_ZERO has cost=99999 but qty=0 — must NOT shift the P001 average above
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P001');
    expect(r.weightedAvgCost).toBe(57.5); // not nudged by the 99999 ghost
  });

  it('zero-qty batches never contribute to totalQty or totalValue', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P001');
    // total from real batches: 500+1500=2000; zero-qty batch excluded
    expect(r.totalQty).toBe(2000);
  });

  it('legacy scalar qty (not {remaining,total}) is handled', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P005');
    expect(r.totalQty).toBe(25);
    expect(r.weightedAvgCost).toBe(40);
    expect(r.totalValue).toBe(1000);
  });

  it('product with no batches AND showZeroQty=false is hidden', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    expect(out.rows.find(x => x.productId === 'P099')).toBeUndefined();
  });

  it('showZeroQty=true surfaces zero-qty products', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW, showZeroQty: true });
    const p99 = out.rows.find(x => x.productId === 'P099');
    expect(p99).toBeDefined();
    expect(p99.totalQty).toBe(0);
    expect(p99.weightedAvgCost).toBe(0);
  });
});

/* ─── Expiry classification ──────────────────────────────────────────────── */

describe('expiry classification', () => {
  it('P002: near=50, expired=20, safe=100 (boundary-driven)', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P002');
    expect(r.totalQty).toBe(170); // all active batches
    expect(r.nearExpiryQty).toBe(50);
    expect(r.expiredQty).toBe(20);
  });

  it('exact-30-day batch counts as near-expiry (boundary inclusive)', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P003');
    expect(r.nearExpiryQty).toBe(10);
    expect(r.expiredQty).toBe(0);
  });

  it('null expiresAt → batch counts to totalQty but NOT to expiry buckets', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P001');
    expect(r.totalQty).toBe(2000);
    expect(r.nearExpiryQty).toBe(0); // neither batch has expiry within 30 days
    expect(r.expiredQty).toBe(0);
  });

  it('NEAR_EXPIRY_DAYS constant is 30 days (matches ProClinic default)', () => {
    expect(NEAR_EXPIRY_DAYS).toBe(30);
  });
});

/* ─── Orphan batch handling ──────────────────────────────────────────────── */

describe('orphan batches (productId missing from master_data)', () => {
  it('orphan batch still produces a row with productName fallback', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'ORPHAN_PID');
    expect(r).toBeDefined();
    expect(r.productName).toBe('Ghost Product'); // from batch
    expect(r.totalQty).toBe(3);
  });

  it('orphan row has empty type/category (no master doc) but still shows', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'ORPHAN_PID');
    expect(r.productType).toBe('');
    expect(r.productCategory).toBe('');
  });
});

/* ─── AR5 — Reconciliation ───────────────────────────────────────────────── */

describe('AR5 — footer reconciles to row sums', () => {
  it('totalQty, totalValue, nearExpiryQty, expiredQty all reconcile', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const sum = (k) => out.rows.reduce((s, r) => s + r[k], 0);
    expect(out.totals.totalQty).toBe(Math.round(sum('totalQty') * 100) / 100);
    expect(out.totals.totalValue).toBe(Math.round(sum('totalValue') * 100) / 100);
    expect(out.totals.nearExpiryQty).toBe(Math.round(sum('nearExpiryQty') * 100) / 100);
    expect(out.totals.expiredQty).toBe(Math.round(sum('expiredQty') * 100) / 100);
  });

  it('shared assertReconcile helper returns no errors', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const errs = assertReconcile(out, ['totalQty', 'totalValue', 'nearExpiryQty', 'expiredQty']);
    expect(errs).toEqual([]);
  });

  it('near30ProductCount matches rows with nearExpiryQty > 0', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const n = out.rows.filter(r => r.nearExpiryQty > 0).length;
    expect(out.totals.near30ProductCount).toBe(n);
  });

  it('expiredProductCount matches rows with expiredQty > 0', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const n = out.rows.filter(r => r.expiredQty > 0).length;
    expect(out.totals.expiredProductCount).toBe(n);
  });
});

/* ─── Filters ────────────────────────────────────────────────────────────── */

describe('filters', () => {
  it('productType=ยา returns only medicine rows', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW, productType: 'ยา' });
    for (const r of out.rows) {
      if (r.productId !== 'ORPHAN_PID') { // orphan has no type
        expect(r.productType).toBe('ยา');
      }
    }
  });

  it('productCategory=Botox returns only Botox rows', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW, productCategory: 'Botox' });
    expect(out.rows.every(r => r.productCategory === 'Botox')).toBe(true);
  });

  it('productStatus=พักใช้งาน returns only paused products', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW, productStatus: 'พักใช้งาน' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].productId).toBe('P004');
  });

  it('searchText matches product name (case-insensitive, Thai/English)', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW, searchText: 'botox' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].productId).toBe('P001');
  });

  it('searchText matches product code', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW, searchText: 'P003' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].productId).toBe('P003');
  });

  it('combined filters AND together', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, {
      nowISO: NOW,
      productType: 'ยา',
      productCategory: 'ยาฉีด',
      productStatus: 'ใช้งาน',
    });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].productId).toBe('P002');
  });
});

/* ─── Unit resolution ────────────────────────────────────────────────────── */

describe('unit resolution', () => {
  it('unit pulled from batch when present', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows.find(x => x.productId === 'P002');
    expect(r.unit).toBe('amp.');
  });

  it('falls back to product.stockConfig.unit when no batch has unit', () => {
    const bs = [{
      batchId: 'B_no_unit', productId: 'P001', productName: 'Botox 100U',
      qty: { remaining: 10, total: 10 }, originalCost: 100,
      expiresAt: null, status: 'active', /* no unit */
    }];
    const out = aggregateStockReport(bs, FIX_PRODUCTS, { nowISO: NOW });
    const r = out.rows[0];
    expect(r.unit).toBe('U'); // from P001.stockConfig.unit
  });
});

/* ─── Column spec + CSV ──────────────────────────────────────────────────── */

describe('column spec + CSV', () => {
  it('buildStockReportColumns returns exactly 9 columns matching ProClinic intel', () => {
    const cols = buildStockReportColumns();
    expect(cols).toHaveLength(9);
    const labels = cols.map(c => c.label);
    expect(labels).toEqual([
      'รหัสสินค้า', 'ชื่อสินค้า', 'ประเภท', 'หมวดหมู่',
      'ต้นทุน/หน่วย', 'จำนวน', 'มูลค่ารวม', 'ใกล้หมดอายุ', 'หมดอายุ',
    ]);
  });

  it('CSV includes UTF-8 BOM', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const csv = buildCSV(out.rows, buildStockReportColumns());
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it('CSV qty column uses unit formatter', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const cols = buildStockReportColumns({
      fmtQty: (v, unit) => unit ? `${v} ${unit}` : String(v),
    });
    const csv = buildCSV(out.rows, cols);
    expect(csv).toMatch(/50 amp\./); // P002 near-expiry row
    expect(csv).toMatch(/2000 U/);   // P001 total qty
  });

  it('CSV money column uses fmtMoney formatter', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const cols = buildStockReportColumns({
      fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
    });
    const csv = buildCSV(out.rows, cols);
    expect(csv).toContain('115,000.00'); // P001 totalValue
  });
});

/* ─── AR15 — Idempotent ──────────────────────────────────────────────────── */

describe('AR15 — pure / idempotent', () => {
  it('same input → same output', () => {
    const o1 = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const o2 = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    expect(o1).toEqual(o2);
  });

  it('does not mutate inputs', () => {
    const bsCopy = JSON.parse(JSON.stringify(FIX_BATCHES));
    aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    expect(FIX_BATCHES).toEqual(bsCopy);
  });
});

/* ─── Row builder direct ─────────────────────────────────────────────────── */

describe('buildStockReportRow — direct', () => {
  it('product with single batch returns expected shape', () => {
    const row = buildStockReportRow(
      FIX_PRODUCTS[0],
      [FIX_BATCHES[0]],
      Date.parse(NOW),
    );
    expect(row).toMatchObject({
      productId: 'P001',
      productCode: 'P001',
      productName: 'Botox 100U',
      productType: 'ยา',
      productCategory: 'Botox',
      productStatus: 'ใช้งาน',
      unit: 'U',
      totalQty: 500,
      weightedAvgCost: 50,
      totalValue: 25000,
      nearExpiryQty: 0,
      expiredQty: 0,
      batchCount: 1,
    });
  });

  it('product with no batches returns zero qty row', () => {
    const row = buildStockReportRow(FIX_PRODUCTS[5], [], Date.parse(NOW));
    expect(row.totalQty).toBe(0);
    expect(row.weightedAvgCost).toBe(0);
    expect(row.totalValue).toBe(0);
    expect(row.nearExpiryQty).toBe(0);
    expect(row.expiredQty).toBe(0);
  });
});

/* ─── Sort order ─────────────────────────────────────────────────────────── */

describe('sort order', () => {
  it('rows sorted by productName asc (Thai locale-aware)', () => {
    const out = aggregateStockReport(FIX_BATCHES, FIX_PRODUCTS, { nowISO: NOW });
    const names = out.rows.map(r => r.productName);
    const manualSorted = [...names].sort((a, b) => a.localeCompare(b, 'th'));
    expect(names).toEqual(manualSorted);
  });
});
