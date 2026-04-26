// Phase 10.3 — Customer Report aggregator: 30+ adversarial scenarios.
// Aligned with /audit-reports-accuracy AR1–AR15.

import { describe, it, expect } from 'vitest';
import {
  aggregateCustomerReport,
  buildCustomerReportRow,
  buildCustomerSalesIndex,
  buildCustomerReportColumns,
} from '../src/lib/customerReportAggregator.js';
import { roundTHB, assertReconcile } from '../src/lib/reportsUtils.js';
import { buildCSV } from '../src/lib/csvExport.js';
import {
  FIXTURE_CUSTOMERS, FIXTURE_SALES,
  EXPECTED_TOTALS_NO_FILTER, EXPECTED_MARKETING_ONLY, EXPECTED_APRIL_ONLY,
} from './_fixtures/phase10-customers-fixture.js';

const APRIL_RANGE = { from: '2026-04-01', to: '2026-04-30' };

/* ─── AR3 — Cancelled sales never contribute to purchase summary ────────── */

describe('AR3 — cancelled sales excluded from per-customer purchase summary', () => {
  it('default: cancelled sale excluded from totalAmount + count', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    const gold = out.rows.find(r => r.customerId === 'CUST_GOLD');
    // GOLD has 3 active + 1 cancelled. Active total = 10k+25k+5k = 40k
    expect(gold.purchaseTotal).toBe(40000);
    expect(gold.purchaseCount).toBe(3);
  });

  it('cancelled sale never updates lastDate (only active sales count)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    const gold = out.rows.find(r => r.customerId === 'CUST_GOLD');
    // Cancelled sale was 2026-04-17. Latest active is 2026-04-18.
    expect(gold.purchaseLastDate).toBe('2026-04-18');
  });
});

/* ─── AR1 — Date filter applies to PURCHASE SUMMARY only, not customer list */

describe('AR1 — date range narrows purchase summary subquery, not customer base', () => {
  it('with no date range: customer list = ALL customers, purchase total = all-time', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    expect(out.rows).toHaveLength(6);
    expect(out.totals.purchaseTotal).toBe(EXPECTED_TOTALS_NO_FILTER.purchaseTotal);
  });

  it('with April-only range: customer list still = ALL, purchase total excludes March', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, APRIL_RANGE);
    expect(out.rows).toHaveLength(6); // base list unchanged
    expect(out.totals.purchaseTotal).toBe(EXPECTED_APRIL_ONLY.purchaseTotal);
    // BUSY (March 25 sale) → 0 in April-only window
    const busy = out.rows.find(r => r.customerId === 'CUST_BUSY');
    expect(busy.purchaseTotal).toBe(0);
    expect(busy.purchaseCount).toBe(0);
  });

  it('boundary: from=to=YYYY-MM-DD captures sales on exactly that day', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, { from: '2026-04-10', to: '2026-04-10' });
    const gold = out.rows.find(r => r.customerId === 'CUST_GOLD');
    // Only the 10000 sale on Apr 10 falls in this window
    expect(gold.purchaseTotal).toBe(10000);
    expect(gold.purchaseCount).toBe(1);
  });

  it('empty range (from > to) → all purchase summaries are 0', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, { from: '2026-04-30', to: '2026-04-01' });
    out.rows.forEach(r => {
      expect(r.purchaseTotal).toBe(0);
      expect(r.purchaseCount).toBe(0);
    });
  });
});

/* ─── AR2 — Empty / null inputs ──────────────────────────────────────────── */

describe('AR2 — empty/null/invalid input safety', () => {
  it('empty arrays return empty rows + zero totals', () => {
    const out = aggregateCustomerReport([], []);
    expect(out.rows).toEqual([]);
    expect(out.totals).toMatchObject({
      count: 0, depositBalance: 0, walletBalance: 0, points: 0,
      purchaseTotal: 0, purchaseUnpaidCount: 0,
    });
  });

  it('null inputs do not throw + zero totals', () => {
    expect(() => aggregateCustomerReport(null, null)).not.toThrow();
    const out = aggregateCustomerReport(null, null);
    expect(out.totals.purchaseTotal).toBe(0);
  });

  it('totals never NaN with malformed customer.finance fields', () => {
    const malformed = [{
      proClinicId: 'X', proClinicHN: 'X',
      patientData: {}, finance: { depositBalance: 'abc', totalWalletBalance: null, loyaltyPoints: undefined },
    }];
    const out = aggregateCustomerReport(malformed, []);
    Object.values(out.totals).forEach(v => expect(Number.isFinite(v)).toBe(true));
  });

  it('customer with no patientData → name fallback to "-"', () => {
    const out = aggregateCustomerReport([{ proClinicId: 'X' }], []);
    expect(out.rows[0].customerName).toBe('-');
  });
});

/* ─── AR4 — Currency rounding (roundTHB everywhere) ──────────────────────── */

describe('AR4 — currency rounded via roundTHB', () => {
  it('PLAT customer wallet balance 8500.5 stays as 8500.5 (not 8500.49999...)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const plat = out.rows.find(r => r.customerId === 'CUST_PLAT');
    expect(plat.walletBalance).toBe(8500.5);
  });

  it('BUSY customer deposit 100.33 preserved exactly (no float drift)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const busy = out.rows.find(r => r.customerId === 'CUST_BUSY');
    expect(busy.depositBalance).toBe(100.33);
  });

  it('PLAT purchase total 50000.5 + 100000 + 25000 = 175000.5 (no IEEE drift)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    const plat = out.rows.find(r => r.customerId === 'CUST_PLAT');
    expect(plat.purchaseTotal).toBe(175000.5);
  });
});

/* ─── AR5 — Footer reconciliation ────────────────────────────────────────── */

describe('AR5 — footer total === sum of row values', () => {
  it('no-filter totals reconcile across all numeric columns', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    expect(out.totals).toMatchObject(EXPECTED_TOTALS_NO_FILTER);
    expect(assertReconcile(out, ['depositBalance', 'walletBalance', 'points', 'purchaseTotal', 'purchaseUnpaidCount'])).toEqual([]);
  });

  it('marketing-only filter still reconciles (footer matches filtered subset)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, { marketingConsentOnly: true });
    expect(out.totals).toMatchObject(EXPECTED_MARKETING_ONLY);
    expect(assertReconcile(out, ['depositBalance', 'walletBalance', 'points', 'purchaseTotal', 'purchaseUnpaidCount'])).toEqual([]);
  });

  it('search filter narrows + footer matches filtered subset', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, { searchText: 'CUST_GOLD' });
    // Search hay = HN+name+phone — won't match the synthetic id "CUST_GOLD"
    expect(out.rows).toHaveLength(0);

    // But searching by HN works
    const out2 = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, { searchText: 'HN67000001' });
    expect(out2.rows).toHaveLength(1);
    expect(out2.rows[0].customerId).toBe('CUST_GOLD');
    expect(out2.totals.purchaseTotal).toBe(40000);
  });
});

/* ─── AR15 — Idempotency / determinism ───────────────────────────────────── */

describe('AR15 — aggregator is deterministic + non-mutating', () => {
  it('same input twice → identical output', () => {
    const a = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    const b = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    expect(a).toEqual(b);
  });

  it('shuffled input produces same totals', () => {
    const shuf = [...FIXTURE_CUSTOMERS].reverse();
    const a = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    const b = aggregateCustomerReport(shuf, FIXTURE_SALES);
    expect(b.totals).toEqual(a.totals);
  });

  it('does not mutate input customers', () => {
    const before = JSON.stringify(FIXTURE_CUSTOMERS);
    aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    expect(JSON.stringify(FIXTURE_CUSTOMERS)).toBe(before);
  });

  it('does not mutate input sales', () => {
    const before = JSON.stringify(FIXTURE_SALES);
    aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    expect(JSON.stringify(FIXTURE_SALES)).toBe(before);
  });
});

/* ─── Filters: marketing / membership / source / search ─────────────────── */

describe('Filters', () => {
  it('marketingConsentOnly=true returns only consenting customers', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, { marketingConsentOnly: true });
    out.rows.forEach(r => expect(r.consentMarketing).toBe(true));
    expect(out.rows.map(r => r.customerId).sort()).toEqual(['CUST_GOLD', 'CUST_PLAT', 'CUST_REG']);
  });

  it('membershipFilter=GOLD returns only GOLD members', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { membershipFilter: 'GOLD' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].customerId).toBe('CUST_GOLD');
  });

  it('membershipFilter=DIAMOND', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { membershipFilter: 'DIAMOND' });
    expect(out.rows.map(r => r.customerId)).toEqual(['CUST_DIA']);
  });

  it('membershipFilter=Platinum', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { membershipFilter: 'Platinum' });
    expect(out.rows.map(r => r.customerId)).toEqual(['CUST_PLAT']);
  });

  it('membershipFilter=none returns customers WITHOUT membership', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { membershipFilter: 'none' });
    expect(out.rows.map(r => r.customerId).sort()).toEqual(['CUST_BUSY', 'CUST_NEW', 'CUST_REG']);
  });

  it('sourceFilter=Facebook narrows correctly', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { sourceFilter: 'Facebook' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].customerId).toBe('CUST_DIA');
  });

  it('searchText matches customer name (Thai)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES, { searchText: 'ปกป้อง' });
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].customerId).toBe('CUST_GOLD');
  });

  it('searchText matches HN', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { searchText: 'HN66' });
    expect(out.rows.map(r => r.customerId)).toEqual(['CUST_PLAT']);
  });

  it('searchText matches phone', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { searchText: '0812345678' });
    expect(out.rows.map(r => r.customerId)).toEqual(['CUST_GOLD']);
  });

  it('searchText is case-insensitive', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, [], { searchText: 'hn66' });
    expect(out.rows).toHaveLength(1);
  });
});

/* ─── Sort order ─────────────────────────────────────────────────────────── */

describe('Sort order', () => {
  it('default: newest registered first (clonedAt desc)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    // Order: NEW(2026-04-15), BUSY(2026-03-20), REG(2026-02-10), DIA(2025-09-15), GOLD(2025-08-20), PLAT(2024-12-01)
    expect(out.rows.map(r => r.customerId)).toEqual([
      'CUST_NEW', 'CUST_BUSY', 'CUST_REG', 'CUST_DIA', 'CUST_GOLD', 'CUST_PLAT',
    ]);
  });
});

/* ─── Row-level derivations ──────────────────────────────────────────────── */

describe('Row derivations', () => {
  it('GOLD customer name = "คุณ ปกป้อง ซื่อตรง"', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const gold = out.rows.find(r => r.customerId === 'CUST_GOLD');
    expect(gold.customerName).toBe('คุณ ปกป้อง ซื่อตรง');
  });

  it('membership badge = "GOLD" for member, "ลูกค้าทั่วไป" for non-member', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    expect(out.rows.find(r => r.customerId === 'CUST_GOLD').membershipBadge).toBe('GOLD');
    expect(out.rows.find(r => r.customerId === 'CUST_REG').membershipBadge).toBe('ลูกค้าทั่วไป');
  });

  it('NEW customer with empty patientData → genderBirth = "--"', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const newC = out.rows.find(r => r.customerId === 'CUST_NEW');
    expect(newC.genderBirth).toBe('--');
    expect(newC.occupationIncome).toBe('--');
  });

  it('GOLD genderBirth = "ชาย / 15/03/1985"', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const gold = out.rows.find(r => r.customerId === 'CUST_GOLD');
    expect(gold.genderBirth).toBe('ชาย / 15/03/1985');
  });

  it('GOLD occupationIncome = "แพทย์ / 50000-100000"', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const gold = out.rows.find(r => r.customerId === 'CUST_GOLD');
    expect(gold.occupationIncome).toBe('แพทย์ / 50000-100000');
  });

  it('source defaults to "-" when empty', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const newC = out.rows.find(r => r.customerId === 'CUST_NEW');
    expect(newC.source).toBe('-');
  });

  it('registeredDate is YYYY-MM-DD slice of clonedAt', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, []);
    const gold = out.rows.find(r => r.customerId === 'CUST_GOLD');
    expect(gold.registeredDate).toBe('2025-08-20');
  });
});

/* ─── buildCustomerSalesIndex ────────────────────────────────────────────── */

describe('buildCustomerSalesIndex', () => {
  it('groups sales by customerId', () => {
    const idx = buildCustomerSalesIndex(FIXTURE_SALES);
    expect(idx.get('CUST_GOLD').count).toBe(3);
    expect(idx.get('CUST_DIA').count).toBe(2);
    expect(idx.get('CUST_PLAT').count).toBe(3);
  });

  it('skips cancelled sales', () => {
    const idx = buildCustomerSalesIndex(FIXTURE_SALES);
    // Cancelled sale was customerId=CUST_GOLD, 99999 — must NOT appear in totals
    expect(idx.get('CUST_GOLD').totalAmount).toBe(40000);
  });

  it('returns empty Map for empty input', () => {
    expect(buildCustomerSalesIndex([]).size).toBe(0);
    expect(buildCustomerSalesIndex(null).size).toBe(0);
  });

  it('respects from/to range', () => {
    const idx = buildCustomerSalesIndex(FIXTURE_SALES, { from: '2026-04-01', to: '2026-04-15' });
    // GOLD sales in this range: Apr 10 (10k) + Apr 15 (25k). Apr 18 (5k) excluded.
    expect(idx.get('CUST_GOLD').totalAmount).toBe(35000);
    expect(idx.get('CUST_GOLD').count).toBe(2);
  });
});

/* ─── AR11 — CSV/table parity ────────────────────────────────────────────── */

describe('AR11 — column spec drives both table and CSV (1:1)', () => {
  it('buildCustomerReportColumns returns 9 columns matching ProClinic spec', () => {
    const cols = buildCustomerReportColumns();
    expect(cols).toHaveLength(9);
    expect(cols.map(c => c.label)).toEqual([
      'ลูกค้า', 'เพศ / วันเกิด', 'อาชีพ / รายได้', 'ที่มา',
      'เงินมัดจำ', 'Wallet', 'คะแนน',
      'การสั่งซื้อ', 'วันที่ลงทะเบียน',
    ]);
  });

  it('CSV produces a row per customer with composite purchase summary', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    const cols = buildCustomerReportColumns();
    const csv = buildCSV(out.rows, cols);
    // GOLD's total + last-date + unpaid count appear in composite cell
    expect(csv).toContain('40000');
    expect(csv).toContain('2026-04-18');
  });

  it('CSV has UTF-8 BOM (Excel Thai)', () => {
    const out = aggregateCustomerReport(FIXTURE_CUSTOMERS, FIXTURE_SALES);
    const csv = buildCSV(out.rows, buildCustomerReportColumns());
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
