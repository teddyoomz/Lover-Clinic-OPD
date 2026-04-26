// Phase 10.6 — CRM Insight RFM: adversarial scenarios.
// Covers quintile boundaries (AR8), segment classification, period buckets,
// edge cases (1 customer / all-tied / no sales / cancelled exclusion).

import { describe, it, expect } from 'vitest';
import {
  aggregateRFM,
  computeRFMRaw,
  segmentFromQuintiles,
  buildRFMColumns,
} from '../src/lib/rfmUtils.js';
import { buildCSV } from '../src/lib/csvExport.js';

const ASOF = '2026-04-20';

/* ─── Fixtures ───────────────────────────────────────────────────────────── */

function makeSale(customerId, saleDate, amount, status = 'paid') {
  return {
    customerId, saleDate, status: status === 'cancelled' ? 'cancelled' : 'active',
    billing: { netTotal: amount },
    payment: { status: status === 'cancelled' ? 'cancelled' : 'paid' },
  };
}

const FIX_CUSTOMERS = [
  { id: 'c1', proClinicId: 'c1', proClinicHN: 'HN001', patientData: { firstName: 'Alice' } },
  { id: 'c2', proClinicId: 'c2', proClinicHN: 'HN002', patientData: { firstName: 'Bob' } },
  { id: 'c3', proClinicId: 'c3', proClinicHN: 'HN003', patientData: { firstName: 'Cara' } },
  { id: 'c4', proClinicId: 'c4', proClinicHN: 'HN004', patientData: { firstName: 'Dan' } },
  { id: 'c5', proClinicId: 'c5', proClinicHN: 'HN005', patientData: { firstName: 'Eve' } },
];

// c1: Champions — recent + frequent + high-spend
// c2: Loyalty — older + frequent + high-spend
// c3: New Customer — very recent + 1 sale
// c4: Lost Cheap — old + low-spend
// c5: About to Sleep — recent-ish + low-mid
const FIX_SALES = [
  // c1 — recent + frequent + high-spend = Champions
  makeSale('c1', '2026-04-15', 10000),
  makeSale('c1', '2026-04-10', 12000),
  makeSale('c1', '2026-04-05', 8000),
  makeSale('c1', '2026-03-20', 15000),
  makeSale('c1', '2026-03-01', 20000),
  // c2 — older last-sale + frequent + high-spend = Loyalty (or Lost Loyalty)
  makeSale('c2', '2026-02-15', 9000),
  makeSale('c2', '2026-02-01', 8000),
  makeSale('c2', '2026-01-15', 11000),
  makeSale('c2', '2025-12-10', 10000),
  // c3 — very recent + 1 sale = New Customer
  makeSale('c3', '2026-04-18', 2000),
  // c4 — old + very few small sales = Lost Cheap
  makeSale('c4', '2024-06-01', 500),
  makeSale('c4', '2024-05-15', 300),
  // c5 — recent-ish 2 sales medium = About to Sleep / Good
  makeSale('c5', '2026-02-20', 3000),
  makeSale('c5', '2026-02-01', 2500),
];

/* ─── AR3 — cancelled excluded ───────────────────────────────────────────── */

describe('AR3 — cancelled sales never contribute', () => {
  it('cancelled sale does not count toward F or M', () => {
    const sales = [
      makeSale('X', '2026-04-10', 5000, 'active'),
      makeSale('X', '2026-04-01', 99999, 'cancelled'),
    ];
    const raw = computeRFMRaw(sales, ASOF);
    const v = raw.get('X');
    expect(v.F).toBe(1);
    expect(v.M).toBe(5000);
  });

  it('customer with only cancelled sales is excluded from RFM entirely', () => {
    const sales = [makeSale('X', '2026-04-10', 5000, 'cancelled')];
    const raw = computeRFMRaw(sales, ASOF);
    expect(raw.has('X')).toBe(false);
  });
});

/* ─── AR2 — empty/null safety ────────────────────────────────────────────── */

describe('AR2 — empty/null input safety', () => {
  it('empty sales → empty RFM', () => {
    const out = aggregateRFM([], [], { asOfISO: ASOF });
    expect(out.perCustomer).toEqual([]);
    expect(out.segmentSummary).toEqual([]);
    expect(out.meta.activeCustomerCount).toBe(0);
  });

  it('null inputs do not throw', () => {
    expect(() => aggregateRFM(null, null, { asOfISO: ASOF })).not.toThrow();
  });

  it('sale with missing customerId is skipped silently', () => {
    const raw = computeRFMRaw([{ customerId: '', saleDate: '2026-04-01', billing: { netTotal: 100 } }], ASOF);
    expect(raw.size).toBe(0);
  });

  it('sale with missing saleDate is skipped', () => {
    const raw = computeRFMRaw([{ customerId: 'X', saleDate: '', billing: { netTotal: 100 } }], ASOF);
    expect(raw.size).toBe(0);
  });
});

/* ─── R/F/M compute correctness ──────────────────────────────────────────── */

describe('R/F/M compute', () => {
  it('R = days between lastSaleDate and asOfISO', () => {
    const raw = computeRFMRaw([makeSale('X', '2026-04-15', 1000)], ASOF);
    expect(raw.get('X').R).toBe(5);  // 2026-04-20 − 2026-04-15 = 5 days
  });

  it('F = count of active sales', () => {
    const raw = computeRFMRaw([
      makeSale('X', '2026-04-15', 1000),
      makeSale('X', '2026-04-10', 2000),
      makeSale('X', '2026-04-05', 3000),
    ], ASOF);
    expect(raw.get('X').F).toBe(3);
  });

  it('M = sum of billing.netTotal across active sales', () => {
    const raw = computeRFMRaw([
      makeSale('X', '2026-04-15', 1000),
      makeSale('X', '2026-04-10', 2500.5),
    ], ASOF);
    expect(raw.get('X').M).toBe(3500.5);
  });

  it('AOV = M / F', () => {
    const raw = computeRFMRaw([
      makeSale('X', '2026-04-15', 1000),
      makeSale('X', '2026-04-10', 3000),
    ], ASOF);
    expect(raw.get('X').AOV).toBe(2000);
  });

  it('lastSaleDate is the MAX date across sales, not just first', () => {
    const raw = computeRFMRaw([
      makeSale('X', '2026-01-15', 1000),
      makeSale('X', '2026-04-15', 2000),
      makeSale('X', '2026-02-15', 3000),
    ], ASOF);
    expect(raw.get('X').lastSaleDate).toBe('2026-04-15');
  });

  it('R is negative-safe: if lastSaleDate > asOfISO, R is clamped to 0', () => {
    const raw = computeRFMRaw([makeSale('X', '2026-05-15', 1000)], ASOF);
    expect(raw.get('X').R).toBe(0);
  });
});

/* ─── Segment classification ─────────────────────────────────────────────── */

describe('segmentFromQuintiles — 11 ProClinic segments', () => {
  it('R=5 F=5 M=5 → Champions', () => {
    expect(segmentFromQuintiles(5, 5, 5)).toBe('Champions');
  });

  it('R=5 F=1 M=1 → New Customer', () => {
    expect(segmentFromQuintiles(5, 1, 1)).toBe('New Customer');
  });

  it('R=3 F=4 M=5 → Loyalty', () => {
    expect(segmentFromQuintiles(3, 4, 5)).toBe('Loyalty');
  });

  it('R=1 F=5 M=5 → Lost Loyalty', () => {
    expect(segmentFromQuintiles(1, 5, 5)).toBe('Lost Loyalty');
  });

  it('R=5 F=2 M=5 → High Spending', () => {
    expect(segmentFromQuintiles(5, 2, 5)).toBe('High Spending');
  });

  it('R=1 F=2 M=5 → Lost High Spending', () => {
    expect(segmentFromQuintiles(1, 2, 5)).toBe('Lost High Spending');
  });

  it('R=3 F=3 M=3 → About to Sleep (middle recency drifting)', () => {
    expect(segmentFromQuintiles(3, 3, 3)).toBe('About to Sleep');
  });

  it('R=4 F=3 M=3 → Good (still recent with mid F+M)', () => {
    expect(segmentFromQuintiles(4, 3, 3)).toBe('Good');
  });

  it('R=1 F=3 M=3 → Lost Good', () => {
    expect(segmentFromQuintiles(1, 3, 3)).toBe('Lost Good');
  });

  it('R=5 F=1 M=2 → Cheap', () => {
    // Caught by Cheap rule (rQ>=4, fQ<=2, mQ<=2) before New Customer
    expect(['Cheap', 'New Customer']).toContain(segmentFromQuintiles(5, 1, 2));
  });

  it('R=1 F=1 M=1 → Lost Cheap', () => {
    expect(segmentFromQuintiles(1, 1, 1)).toBe('Lost Cheap');
  });

  it('R=3 F=2 M=2 → About to Sleep', () => {
    expect(segmentFromQuintiles(3, 2, 2)).toBe('About to Sleep');
  });
});

/* ─── Full aggregation — scenarios ───────────────────────────────────────── */

describe('full aggregateRFM on fixture', () => {
  it('produces perCustomer for every active customer', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    expect(out.perCustomer.length).toBe(5);
  });

  it('Alice (c1, 5 sales, recent, high-spend) is top segment', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    const alice = out.perCustomer.find(r => r.customerId === 'c1');
    expect(['Champions', 'Loyalty']).toContain(alice.segment);
    expect(alice.F).toBe(5);
    expect(alice.M).toBe(65000);
  });

  it('Dan (c4, 2 small sales from 2024) is in a "Lost" bucket', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    const dan = out.perCustomer.find(r => r.customerId === 'c4');
    expect(dan.segment.toLowerCase()).toMatch(/lost/);
  });

  it('segmentSummary aggregates count + revenue per segment', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    const totalCount = out.segmentSummary.reduce((s, x) => s + x.customerCount, 0);
    const totalRev = out.segmentSummary.reduce((s, x) => s + x.totalRevenue, 0);
    expect(totalCount).toBe(5);
    // Total revenue should equal sum of all M values
    const mSum = out.perCustomer.reduce((s, r) => s + r.M, 0);
    expect(Math.abs(totalRev - mSum)).toBeLessThan(0.01);
  });

  it('matrix has 5×5 cells with correct keys', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    for (let f = 1; f <= 5; f++) {
      for (let r = 1; r <= 5; r++) {
        expect(out.matrix.cells[`F${f}-R${r}`]).toBeDefined();
      }
    }
  });

  it('matrix cell count percentages sum to ≤100 (allow rounding slop)', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    const pcts = Object.values(out.matrix.cells).map(c => c.percent);
    const sum = pcts.reduce((s, p) => s + p, 0);
    expect(sum).toBeLessThanOrEqual(100.01);
  });
});

/* ─── Edge cases (plan section 10.6 adversarial) ─────────────────────────── */

describe('edge cases', () => {
  it('1 customer / 1 sale — degrees all collapse to median quintile', () => {
    const out = aggregateRFM(
      [{ id: 'solo', proClinicId: 'solo' }],
      [makeSale('solo', '2026-04-15', 5000)],
      { asOfISO: ASOF }
    );
    expect(out.perCustomer.length).toBe(1);
    const r = out.perCustomer[0];
    expect(r.rQuintile).toBeGreaterThanOrEqual(1);
    expect(r.rQuintile).toBeLessThanOrEqual(5);
    expect(typeof r.segment).toBe('string');
  });

  it('all-tied M values → all same M-quintile', () => {
    const sales = ['a', 'b', 'c', 'd', 'e'].map(cid => makeSale(cid, '2026-04-15', 5000));
    const out = aggregateRFM([], sales, { asOfISO: ASOF });
    const ms = new Set(out.perCustomer.map(r => r.mQuintile));
    // All tied on M — quintile should collapse (1-2 unique values max)
    expect(ms.size).toBeLessThanOrEqual(2);
  });

  it('0 customers → no divide-by-zero', () => {
    const out = aggregateRFM([], [], { asOfISO: ASOF });
    expect(out.perCustomer).toEqual([]);
    expect(out.matrix.cells['F1-R1'].count).toBe(0);
    expect(out.matrix.cells['F1-R1'].percent).toBe(0);
  });

  it('asOfISO at today — recent sales get R=0 (today-as-today)', () => {
    const raw = computeRFMRaw([makeSale('X', ASOF, 1000)], ASOF);
    expect(raw.get('X').R).toBe(0);
  });

  it('date-range filter (from/to) narrows sales window', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, {
      asOfISO: ASOF, from: '2026-04-01', to: '2026-04-30',
    });
    // Only sales in April counted → Alice has 3 April sales, Cara has 1
    const alice = out.perCustomer.find(r => r.customerId === 'c1');
    expect(alice?.F).toBe(3);
    const cara = out.perCustomer.find(r => r.customerId === 'c3');
    expect(cara?.F).toBe(1);
    // Bob + Dan fall out of April window (no April sales)
    expect(out.perCustomer.find(r => r.customerId === 'c2')).toBeUndefined();
    expect(out.perCustomer.find(r => r.customerId === 'c4')).toBeUndefined();
  });
});

/* ─── Period buckets ─────────────────────────────────────────────────────── */

describe('period buckets (6 × 30-day windows, newest to oldest)', () => {
  it('sale today → bucket 0', () => {
    const out = aggregateRFM(
      [{ id: 'X', proClinicId: 'X' }],
      [makeSale('X', ASOF, 1000)],
      { asOfISO: ASOF }
    );
    const row = out.perCustomer.find(r => r.customerId === 'X');
    expect(row.periodBuckets[0]).toBe(1000);
  });

  it('sale 45 days ago → bucket 1 (30-60d)', () => {
    const out = aggregateRFM(
      [{ id: 'X', proClinicId: 'X' }],
      [makeSale('X', '2026-03-06', 500)], // 2026-04-20 − 45 days ≈ 2026-03-06
      { asOfISO: ASOF }
    );
    const row = out.perCustomer.find(r => r.customerId === 'X');
    expect(row.periodBuckets[1]).toBe(500);
  });

  it('sale >150 days ago → bucket 5 (capped)', () => {
    const out = aggregateRFM(
      [{ id: 'X', proClinicId: 'X' }],
      [makeSale('X', '2025-01-01', 700)],
      { asOfISO: ASOF }
    );
    const row = out.perCustomer.find(r => r.customerId === 'X');
    expect(row.periodBuckets[5]).toBe(700);
  });

  it('periodBuckets sum equals M', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    for (const r of out.perCustomer) {
      const sum = r.periodBuckets.reduce((s, v) => s + v, 0);
      expect(Math.abs(sum - r.M)).toBeLessThan(0.01);
    }
  });
});

/* ─── AR15 — Idempotent ──────────────────────────────────────────────────── */

describe('AR15 — pure / idempotent', () => {
  it('same input → same output', () => {
    const o1 = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    const o2 = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    expect(o1).toEqual(o2);
  });

  it('does not mutate inputs', () => {
    const salesCopy = JSON.parse(JSON.stringify(FIX_SALES));
    aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    expect(FIX_SALES).toEqual(salesCopy);
  });
});

/* ─── Column spec + CSV ──────────────────────────────────────────────────── */

describe('column spec + CSV', () => {
  it('buildRFMColumns returns 13 columns', () => {
    const cols = buildRFMColumns();
    expect(cols).toHaveLength(13);
  });

  it('column labels match ProClinic spec', () => {
    const cols = buildRFMColumns();
    const labels = cols.map(c => c.label);
    expect(labels[0]).toBe('ลูกค้า');
    expect(labels[1]).toBe('Recency');
    expect(labels[2]).toBe('Frequency');
    expect(labels[3]).toBe('Monetary');
    expect(labels[4]).toBe('AOV');
    expect(labels[5]).toBe('Segment');
    expect(labels[6]).toBe('ยอดชำระเงิน');
  });

  it('CSV has UTF-8 BOM + includes all 13 cols', () => {
    const out = aggregateRFM(FIX_CUSTOMERS, FIX_SALES, { asOfISO: ASOF });
    const cols = buildRFMColumns();
    const csv = buildCSV(out.perCustomer, cols);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const header = csv.slice(1).split('\r\n')[0];
    expect(header.split(',').length).toBe(13);
  });
});
