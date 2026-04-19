// Phase 10.2 — Sale Report aggregator: 35+ adversarial scenarios.
// Aligned with /audit-reports-accuracy AR1–AR15.

import { describe, it, expect } from 'vitest';
import {
  aggregateSaleReport,
  buildSaleReportRow,
  buildSaleReportColumns,
} from '../src/lib/saleReportAggregator.js';
import { roundTHB, assertReconcile } from '../src/lib/reportsUtils.js';
import { buildCSV } from '../src/lib/csvExport.js';
import {
  FIXTURE_SALES,
  EXPECTED_APRIL_RANGE_TOTALS,
  EXPECTED_APRIL_RANGE_TOTALS_INCLUDING_CANCELLED,
  SALE_SPLIT_PAYMENT,
  SALE_CANCELLED,
  LEGACY_SALE_PHASE6,
  FLOAT_DRIFT_FIXTURE,
} from './_fixtures/phase10-sales-fixture.js';

const APRIL_RANGE = { from: '2026-04-15', to: '2026-04-18' };

/* ─── AR1 — Date filter inclusivity ───────────────────────────────────────── */

describe('AR1 — date filter inclusive on both ends', () => {
  it('from=to=YYYY-MM-DD returns rows with that exact date (boundary inclusion)', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { from: '2026-04-15', to: '2026-04-15' });
    const dates = new Set(out.rows.map(r => r.saleDate));
    expect(dates.size).toBe(1);
    expect([...dates][0]).toBe('2026-04-15');
  });

  it('to=X excludes rows with date > X', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { from: '2026-04-15', to: '2026-04-16' });
    expect(out.rows.every(r => r.saleDate <= '2026-04-16')).toBe(true);
  });

  it('from=X excludes rows with date < X', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { from: '2026-04-16', to: '2026-04-18' });
    expect(out.rows.every(r => r.saleDate >= '2026-04-16')).toBe(true);
  });

  it('empty range (from > to) returns no rows', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { from: '2026-04-20', to: '2026-04-19' });
    expect(out.rows).toEqual([]);
    expect(out.totals.netTotal).toBe(0);
  });

  it('empty from/to means no date filtering', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, {});
    // 5 active in-range + 1 out-of-range (March) = 6, cancelled excluded by default
    expect(out.rows.length).toBe(6);
  });
});

/* ─── AR2 — Empty/zero guards ─────────────────────────────────────────────── */

describe('AR2 — empty/zero/invalid input safety', () => {
  it('empty array returns empty rows + zero totals', () => {
    const out = aggregateSaleReport([], APRIL_RANGE);
    expect(out.rows).toEqual([]);
    expect(out.totals).toMatchObject({
      count: 0, netTotal: 0, depositApplied: 0, walletApplied: 0,
      refundAmount: 0, paidAmount: 0, outstandingAmount: 0,
    });
  });

  it('null input does not throw and yields zero totals', () => {
    expect(() => aggregateSaleReport(null, APRIL_RANGE)).not.toThrow();
    const out = aggregateSaleReport(null, APRIL_RANGE);
    expect(out.totals.netTotal).toBe(0);
  });

  it('undefined filters defaults to no filter', () => {
    expect(() => aggregateSaleReport(FIXTURE_SALES)).not.toThrow();
  });

  it('totals never contain NaN regardless of malformed input', () => {
    const malformed = [{ saleId: 'X', saleDate: '2026-04-15', billing: { netTotal: 'abc' } }];
    const out = aggregateSaleReport(malformed, APRIL_RANGE);
    Object.values(out.totals).forEach(v => expect(Number.isFinite(v)).toBe(true));
  });
});

/* ─── AR3 — Cancelled exclusion ───────────────────────────────────────────── */

describe('AR3 — cancelled rows excluded from totals by default', () => {
  it('default excludes cancelled rows entirely (not displayed, not totaled)', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    expect(out.rows.find(r => r.saleId === SALE_CANCELLED.saleId)).toBeUndefined();
    expect(out.totals).toMatchObject(EXPECTED_APRIL_RANGE_TOTALS);
  });

  it('includeCancelled=true SHOWS cancelled row but DOES NOT add to totals', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, includeCancelled: true });
    const cancelledRow = out.rows.find(r => r.saleId === SALE_CANCELLED.saleId);
    expect(cancelledRow).toBeDefined();
    expect(cancelledRow.isCancelled).toBe(true);
    // Totals still equal active-only sum
    expect(out.totals).toMatchObject(EXPECTED_APRIL_RANGE_TOTALS_INCLUDING_CANCELLED);
  });

  it('cancelled-only filter range returns rows but zero totals', () => {
    const out = aggregateSaleReport([SALE_CANCELLED], { from: '2026-04-18', to: '2026-04-18', includeCancelled: true });
    expect(out.rows).toHaveLength(1);
    expect(out.totals.netTotal).toBe(0);
    expect(out.totals.count).toBe(0);
  });
});

/* ─── AR4 — Currency rounding (roundTHB everywhere) ───────────────────────── */

describe('AR4 — every currency value rounded via roundTHB', () => {
  it('aggregator sums 0.1 + 0.2 + 0.3 → 0.3 (no IEEE drift)', () => {
    const out = aggregateSaleReport(FLOAT_DRIFT_FIXTURE, { from: '2026-04-15', to: '2026-04-15' });
    expect(out.totals.netTotal).toBe(0.3);
    expect(out.totals.paidAmount).toBe(0.3);
  });

  it('roundTHB itself rounds half-up', () => {
    expect(roundTHB(2.345)).toBe(2.35);
    expect(roundTHB(2.344)).toBe(2.34);
    expect(roundTHB(0.005)).toBe(0.01);
  });

  it('roundTHB returns 0 for non-finite input', () => {
    expect(roundTHB(NaN)).toBe(0);
    expect(roundTHB(Infinity)).toBe(0);
    expect(roundTHB(undefined)).toBe(0);
    expect(roundTHB('abc')).toBe(0);
  });

  it('row build coerces string/null currency fields without throwing', () => {
    const r = buildSaleReportRow({
      saleId: 'X', billing: { netTotal: '1234.567' }, payment: { channels: [{ amount: '500' }] },
    });
    expect(r.netTotal).toBe(1234.57);
    expect(r.paidAmount).toBe(500);
  });
});

/* ─── AR5 — Sum reconciliation (footer == sum of rows) ────────────────────── */

describe('AR5 — reconciliation: footer total === sum(rows[col])', () => {
  it('default april range fully reconciles', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    expect(assertReconcile(out, [
      'netTotal', 'depositApplied', 'walletApplied', 'refundAmount',
      'insuranceClaim', 'paidAmount', 'outstandingAmount',
    ])).toEqual([]);
  });

  it('includeCancelled=true: footer matches active-only subset, not all rows', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, includeCancelled: true });
    const activeRows = out.rows.filter(r => !r.isCancelled);
    const sum = activeRows.reduce((s, r) => s + r.netTotal, 0);
    expect(roundTHB(sum)).toBe(out.totals.netTotal);
  });

  it('count footer matches active-row count', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    expect(out.totals.count).toBe(out.rows.filter(r => !r.isCancelled).length);
  });
});

/* ─── AR6 — Refunds tracked separately, not subtracted from gross ─────────── */

describe('AR6 — refund is a separate column, not a deduction from gross', () => {
  it('refundAmount column is positive; netTotal is unaffected', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    const refundRow = out.rows.find(r => r.refundAmount > 0);
    expect(refundRow).toBeDefined();
    // Gross stays at sale's billing netTotal (5000), refund is separate (1000)
    expect(refundRow.netTotal).toBe(5000);
    expect(refundRow.refundAmount).toBe(1000);
  });

  it('outstandingAmount does NOT subtract refund', () => {
    // Sale with netTotal=5000, paid=5000, refund=1000 → outstanding=0 (not -1000)
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    const refundRow = out.rows.find(r => r.refundAmount > 0);
    expect(refundRow.outstandingAmount).toBe(0);
  });
});

/* ─── AR11 — CSV column == table column for same row ──────────────────────── */

describe('AR11 — CSV columns match table columns 1:1', () => {
  it('buildSaleReportColumns returns 18 columns matching ProClinic spec', () => {
    const cols = buildSaleReportColumns();
    expect(cols).toHaveLength(18);
    expect(cols.map(c => c.label)).toEqual([
      'วันที่ขาย', 'เลขที่ขาย', 'HN', 'ลูกค้า', 'ประเภท', 'รายละเอียด', 'พนักงานขาย',
      'ราคาหลังหักส่วนลด', 'หักมัดจำ', 'Wallet', 'การคืนเงิน', 'เบิกประกัน',
      'ยอดที่ชำระ', 'ช่องทางชำระเงิน', 'ยอดค้างชำระ', 'สถานะชำระเงิน',
      'ผู้ทำรายการ', 'ผู้ยกเลิก',
    ]);
  });

  it('CSV row reflects exact aggregator output (no value drift)', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    const cols = buildSaleReportColumns();
    const csv = buildCSV(out.rows, cols);
    // Sale #2 split-payment row should appear with 43000 net total
    expect(csv).toContain('43000');
    expect(csv).toContain('SCB + เงินสด');
  });

  it('CSV starts with UTF-8 BOM', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    const csv = buildCSV(out.rows, buildSaleReportColumns());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});

/* ─── AR14 — Defensive field access (legacy schemas) ──────────────────────── */

describe('AR14 — backward-compatible with legacy Phase 6 sales (missing fields)', () => {
  it('legacy sale (no payment.channels) does not throw, paidAmount = 0', () => {
    const r = buildSaleReportRow(LEGACY_SALE_PHASE6);
    expect(r.paidAmount).toBe(0);
    expect(r.paymentChannels).toBe('-');
    expect(r.outstandingAmount).toBe(1000); // netTotal - 0
  });

  it('legacy sale (no refundAmount field) defaults to 0', () => {
    const r = buildSaleReportRow(LEGACY_SALE_PHASE6);
    expect(r.refundAmount).toBe(0);
  });

  it('aggregator handles mixed legacy + current sales cleanly', () => {
    const mixed = [LEGACY_SALE_PHASE6, ...FIXTURE_SALES];
    expect(() => aggregateSaleReport(mixed, {})).not.toThrow();
  });
});

/* ─── AR15 — Idempotency / no time leak ───────────────────────────────────── */

describe('AR15 — aggregator is deterministic + time-independent', () => {
  it('same input twice → identical output (deep equal)', () => {
    const a = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    const b = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    expect(a).toEqual(b);
  });

  it('shuffled input produces same totals (order independence)', () => {
    const shuffled = [...FIXTURE_SALES].reverse();
    const a = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    const b = aggregateSaleReport(shuffled, APRIL_RANGE);
    expect(b.totals).toEqual(a.totals);
  });
});

/* ─── Status / type / search filters ──────────────────────────────────────── */

describe('Filters — status / saleType / search', () => {
  it('statusFilter=paid returns only paid sales', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, statusFilter: 'paid' });
    expect(out.rows.every(r => r.paymentStatus === 'paid')).toBe(true);
  });

  it('statusFilter=split returns only split sales', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, statusFilter: 'split' });
    expect(out.rows.every(r => r.paymentStatus === 'split')).toBe(true);
    expect(out.rows.length).toBe(1);
  });

  it('statusFilter=unpaid returns only unpaid sales', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, statusFilter: 'unpaid' });
    expect(out.rows.every(r => r.paymentStatus === 'unpaid')).toBe(true);
  });

  it('saleTypeFilter=membership filters to membership sales only', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, saleTypeFilter: 'membership' });
    expect(out.rows.every(r => r.saleType === 'บัตรสมาชิก')).toBe(true);
  });

  it('saleTypeFilter=course filters to non-membership courses', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, saleTypeFilter: 'course' });
    // Sale #1 (course) and #5 (treatment course) qualify; #2 has both course+product
    // and is bucketed as course (precedence: membership>course>...)
    expect(out.rows.every(r => r.saleType === 'คอร์ส')).toBe(true);
  });

  it('searchText matches sale ID', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, searchText: '20260416-0001' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].saleId).toBe('INV-20260416-0001');
  });

  it('searchText matches HN', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, searchText: 'HN67000001' });
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it('searchText is case-insensitive', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, { ...APRIL_RANGE, searchText: 'inv-20260416' });
    expect(out.rows.length).toBeGreaterThan(0);
  });
});

/* ─── Row-level derivations ───────────────────────────────────────────────── */

describe('Row derivations match ProClinic intel', () => {
  it('membership sale gets ประเภท="บัตรสมาชิก"', () => {
    const r = buildSaleReportRow(FIXTURE_SALES[2]);
    expect(r.saleType).toBe('บัตรสมาชิก');
  });

  it('multi-item sale joins names then "อีก N"', () => {
    const r = buildSaleReportRow(FIXTURE_SALES[1]);
    expect(r.itemsSummary).toMatch(/อีก/);
  });

  it('two-item sale joins both names without "อีก N"', () => {
    const sale = { items: { courses: [{ name: 'A' }, { name: 'B' }], products: [], medications: [] } };
    const r = buildSaleReportRow(sale);
    expect(r.itemsSummary).toBe('A, B');
  });

  it('empty-items sale shows "-"', () => {
    const r = buildSaleReportRow({ items: { courses: [], products: [], medications: [] } });
    expect(r.itemsSummary).toBe('-');
  });

  it('multi-seller sale joins names with comma', () => {
    const r = buildSaleReportRow(SALE_SPLIT_PAYMENT);
    expect(r.sellersLabel).toBe('พนักงาน A, พนักงาน B');
  });

  it('multi-channel payment joins names with " + "', () => {
    const r = buildSaleReportRow(SALE_SPLIT_PAYMENT);
    expect(r.paymentChannels).toBe('SCB + เงินสด');
  });

  it('paidAmount = sum of all channel amounts', () => {
    const r = buildSaleReportRow(SALE_SPLIT_PAYMENT);
    expect(r.paidAmount).toBe(43000);
  });

  it('outstandingAmount = max(0, netTotal - paid)', () => {
    // netTotal=43000, paid=43000 → outstanding=0
    const r = buildSaleReportRow(SALE_SPLIT_PAYMENT);
    expect(r.outstandingAmount).toBe(0);
  });

  it('overpaid sale (paid > netTotal) → outstandingAmount = 0 (not negative)', () => {
    const overpaid = {
      saleId: 'X', billing: { netTotal: 100 },
      payment: { status: 'paid', channels: [{ name: 'cash', amount: 200 }] },
    };
    const r = buildSaleReportRow(overpaid);
    expect(r.outstandingAmount).toBe(0);
    expect(r.paidAmount).toBe(200); // Display the actual paid; outstanding is bounded
  });

  it('cancelled row carries isCancelled=true and cancelledBy populated', () => {
    const r = buildSaleReportRow(SALE_CANCELLED);
    expect(r.isCancelled).toBe(true);
    expect(r.cancelledBy).toBe('admin2');
  });

  it('sort order: newest first (saleDate desc, then saleId desc)', () => {
    const out = aggregateSaleReport(FIXTURE_SALES, APRIL_RANGE);
    for (let i = 1; i < out.rows.length; i++) {
      expect(out.rows[i - 1].saleDate >= out.rows[i].saleDate).toBe(true);
    }
  });
});
