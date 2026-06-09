// Deposit-in-reports (2026-06-09) — pure-logic test bank.
// Covers: loadDepositsByDateRange contract (via depositReportUtils + aggregator),
// depositReportUtils, paymentSummaryAggregator (no-double-count + reconcile +
// gross-no-refund + cancelled-excluded + union + drill-down).
import { describe, it, expect } from 'vitest';
import {
  depositsReceivedInRange,
  sumSystemRemainingDeposits,
  buildDepositDeepLinkUrl,
} from '../src/lib/depositReportUtils.js';
import {
  aggregatePaymentSummary,
  getMethodDocuments,
  refundsInPeriod,
  canonicalMethod,
  getPaymentSummaryColumns,
} from '../src/lib/paymentSummaryAggregator.js';

const dep = (o = {}) => ({
  depositId: o.depositId || 'DEP-1', customerId: 'C1', customerHN: 'HN1', customerName: 'ลูกค้า',
  amount: 1000, usedAmount: 0, remainingAmount: 1000,
  paymentChannel: 'เงินสด', paymentDate: '2026-06-09', status: 'active',
  refundAmount: 0, refundDate: null, branchId: 'BR-A', ...o,
});
// A real sale: deposit deducted BEFORE channels → channels never carry มัดจำ.
const sale = (o = {}) => ({
  saleId: o.saleId || 'INV-1', id: o.saleId || 'INV-1', saleDate: '2026-06-09',
  status: 'active', branchId: 'BR-A', customerHN: 'HN9', customerName: 'นายขาย',
  billing: { netTotal: o.netTotal ?? 2500, depositApplied: o.depositApplied ?? 0 },
  payment: { channels: o.channels || [{ method: 'เงินสด', amount: o.netTotal ?? 2500 }] },
  ...o,
});
const RANGE = { from: '2026-06-01', to: '2026-06-30' };

describe('A · depositReportUtils', () => {
  it('A1 depositsReceivedInRange excludes cancelled, filters paymentDate', () => {
    const list = [
      dep({ depositId: 'D-in', paymentDate: '2026-06-10' }),
      dep({ depositId: 'D-cancel', status: 'cancelled' }),
      dep({ depositId: 'D-before', paymentDate: '2026-05-30' }),
      dep({ depositId: 'D-after', paymentDate: '2026-07-02' }),
      dep({ depositId: 'D-refunded', status: 'refunded' }), // money DID come in
      dep({ depositId: 'D-used', status: 'used' }),
    ];
    const out = depositsReceivedInRange(list, RANGE).map(d => d.depositId);
    expect(out).toEqual(['D-in', 'D-refunded', 'D-used']);
  });
  it('A2 sumSystemRemainingDeposits = Σ remaining of active|partial only', () => {
    const list = [
      dep({ status: 'active', remainingAmount: 1000 }),
      dep({ status: 'partial', remainingAmount: 400 }),
      dep({ status: 'used', remainingAmount: 0 }),
      dep({ status: 'refunded', remainingAmount: 999 }), // ignored
      dep({ status: 'cancelled', remainingAmount: 999 }), // ignored
    ];
    expect(sumSystemRemainingDeposits(list)).toBe(1400);
  });
  it('A3 sum handles empty/null/garbage', () => {
    expect(sumSystemRemainingDeposits([])).toBe(0);
    expect(sumSystemRemainingDeposits(null)).toBe(0);
    expect(sumSystemRemainingDeposits([{ status: 'active', remainingAmount: 'x' }])).toBe(0);
  });
  it('A4 buildDepositDeepLinkUrl shape + encodes', () => {
    const url = buildDepositDeepLinkUrl('DEP 12&x');
    expect(url).toContain('tab=finance');
    expect(url).toContain('subtab=deposit');
    expect(url).toContain('deposit=DEP%2012%26x');
  });
});

describe('B · aggregate — no double-count + reconcile', () => {
  it('B1 NO DOUBLE-COUNT: deposit applied to a sale is counted once (as มัดจำ), never inflates a sale channel', () => {
    // customer paid 1000 deposit (cash) earlier; today buys 2500 net + applies the deposit.
    // The sale's cash channel covers only netTotal (2500) — NO มัดจำ channel exists.
    const sales = [sale({ saleId: 'INV-1', netTotal: 2500, depositApplied: 1000,
      channels: [{ method: 'เงินสด', amount: 2500 }] })];
    const deposits = [dep({ depositId: 'DEP-1', amount: 1000, paymentChannel: 'เงินสด' })];
    const out = aggregatePaymentSummary(sales, deposits, RANGE);
    const cash = out.rows.find(r => r.method === 'เงินสด');
    expect(cash.salesAmount).toBe(2500);     // channels only
    expect(cash.depositAmount).toBe(1000);   // deposit received, counted once
    expect(cash.total).toBe(3500);
    // The 'มัดจำ' canonical method row must NOT exist from a sale channel:
    const madjam = out.rows.find(r => r.method === 'มัดจำ');
    expect(madjam).toBeUndefined();
  });
  it('B2 reconcile: Σ rows.total === totals.total === salesTotal + depositTotal', () => {
    const sales = [
      sale({ saleId: 'A', channels: [{ method: 'เงินสด', amount: 1000 }, { method: 'โอน', amount: 500 }] }),
      sale({ saleId: 'B', channels: [{ method: 'QR', amount: 300 }] }),
    ];
    const deposits = [dep({ depositId: 'D1', amount: 700, paymentChannel: 'โอน' }),
                      dep({ depositId: 'D2', amount: 200, paymentChannel: 'QR' })];
    const out = aggregatePaymentSummary(sales, deposits, RANGE);
    const rowSum = out.rows.reduce((s, r) => s + r.total, 0);
    expect(rowSum).toBe(out.totals.total);
    expect(out.totals.salesAmount + out.totals.depositAmount).toBe(out.totals.total);
    expect(out.totals.total).toBe(1000 + 500 + 300 + 700 + 200); // 2700
  });
  it('B3 cancelled sale + cancelled deposit excluded', () => {
    const sales = [sale({ saleId: 'X', status: 'cancelled', channels: [{ method: 'เงินสด', amount: 9999 }] })];
    const deposits = [dep({ status: 'cancelled', amount: 8888 })];
    const out = aggregatePaymentSummary(sales, deposits, RANGE);
    expect(out.totals.total).toBe(0);
    expect(out.rows.length).toBe(0);
  });
  it('B4 refund NOT subtracted (gross) + refundsTotal reported separately', () => {
    const deposits = [dep({ amount: 1000, refundAmount: 300, refundDate: '2026-06-15', status: 'partial' })];
    const out = aggregatePaymentSummary([], deposits, RANGE);
    expect(out.rows.find(r => r.method === 'เงินสด').depositAmount).toBe(1000); // gross
    expect(out.refundsTotal).toBe(300);
  });
  it('B5 union: a channel present only in deposits creates a row', () => {
    const deposits = [dep({ amount: 5000, paymentChannel: 'โอน' })];
    const out = aggregatePaymentSummary([], deposits, RANGE);
    const t = out.rows.find(r => r.method === 'โอน');
    expect(t.salesAmount).toBe(0);
    expect(t.depositAmount).toBe(5000);
    expect(t.total).toBe(5000);
  });
  it('B6 docCount = unique sales + deposit count per method', () => {
    const sales = [sale({ saleId: 'A' }), sale({ saleId: 'B' })]; // both เงินสด
    const deposits = [dep({ depositId: 'D1', paymentChannel: 'เงินสด' }),
                      dep({ depositId: 'D2', paymentChannel: 'เงินสด' })];
    const out = aggregatePaymentSummary(sales, deposits, RANGE);
    expect(out.rows.find(r => r.method === 'เงินสด').docCount).toBe(4);
  });
  it('B7 branch filter narrows both sides', () => {
    const sales = [sale({ saleId: 'A', branchId: 'BR-A' }), sale({ saleId: 'B', branchId: 'BR-B', channels: [{ method: 'เงินสด', amount: 9 }] })];
    const deposits = [dep({ depositId: 'D1', branchId: 'BR-A', amount: 100 }), dep({ depositId: 'D2', branchId: 'BR-B', amount: 9 })];
    const out = aggregatePaymentSummary(sales, deposits, { ...RANGE, branchId: 'BR-A' });
    expect(out.totals.depositAmount).toBe(100);
    expect(out.totals.salesAmount).toBe(2500); // only BR-A sale
  });
});

describe('C · drill-down + columns + adversarial', () => {
  it('C1 getMethodDocuments returns sales + deposits tagged, date-sorted', () => {
    const sales = [sale({ saleId: 'INV-1', saleDate: '2026-06-09' })];
    const deposits = [dep({ depositId: 'DEP-1', paymentDate: '2026-06-10', paymentChannel: 'เงินสด' })];
    const docs = getMethodDocuments(sales, deposits, 'เงินสด', RANGE);
    expect(docs.map(d => d.type)).toEqual(['deposit', 'sale']); // 06-10 before 06-09
    expect(docs.find(d => d.type === 'sale').id).toBe('INV-1');
    expect(docs.find(d => d.type === 'deposit').amount).toBe(1000);
  });
  it('C2 columns expose salesAmount/depositAmount/total/docCount', () => {
    const keys = getPaymentSummaryColumns().map(c => c.key);
    expect(keys).toEqual(['method', 'salesAmount', 'depositAmount', 'total', 'docCount', 'percentage']);
  });
  it('C3 canonicalMethod aliases', () => {
    expect(canonicalMethod('cash')).toBe('เงินสด');
    expect(canonicalMethod('Bank Transfer')).toBe('โอน');
    expect(canonicalMethod('')).toBe('อื่นๆ');
    expect(canonicalMethod(undefined)).toBe('อื่นๆ');
  });
  it('C4 adversarial: empty/null inputs do not throw', () => {
    expect(() => aggregatePaymentSummary(null, null, {})).not.toThrow();
    const out = aggregatePaymentSummary(null, null, {});
    expect(out.rows).toEqual([]);
    expect(out.totals.total).toBe(0);
    expect(getMethodDocuments(null, null, 'เงินสด', {})).toEqual([]);
  });
  it('C5 refundsInPeriod filters by refundDate range', () => {
    const list = [
      dep({ refundAmount: 100, refundDate: '2026-06-15T08:00:00Z' }),
      dep({ refundAmount: 200, refundDate: '2026-05-01' }), // out of range
      dep({ refundAmount: 0, refundDate: '2026-06-20' }),
    ];
    expect(refundsInPeriod(list, '2026-06-01', '2026-06-30')).toBe(100);
  });
});
