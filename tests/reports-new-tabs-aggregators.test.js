// Reports-home new-tabs — pure aggregator unit + reconcile + adversarial.
// 4 groups: AS (alt-sales) · OS (outstanding) · MV (movements) · SA (stock-alert).
// audit-reports-accuracy: every footer total === Σ row values, exact.
import { describe, it, expect } from 'vitest';
import { aggregateAltSales } from '../src/lib/altSalesReportAggregator.js';
import { aggregateOutstanding } from '../src/lib/outstandingSalesAggregator.js';
import { aggregateStockAlert } from '../src/lib/stockAlertReportAggregator.js';

describe('AS aggregateAltSales', () => {
  // Realized revenue = online {paid,completed}, vendor {confirmed}. Others are
  // pipeline/void and MUST NOT count toward the total (audit-reports-accuracy).
  const online = [
    { id: 'O1', transferDate: '2026-07-01', customerName: 'ก', amount: 1000, status: 'completed' },
    { id: 'O2', transferDate: '2026-07-02', customerName: 'ข', amount: 300, status: 'paid' },
    { id: 'O3', transferDate: '2026-07-03', customerName: 'ค', amount: 200, status: 'pending' },   // not paid → excluded from total
    { id: 'O4', transferDate: '2026-07-04', customerName: 'ง', amount: 500, status: 'cancelled' },  // void → excluded
  ];
  const vendor = [
    { id: 'V1', saleDate: '2026-07-01', vendorName: 'ด', totalAmount: 2000, status: 'confirmed' },
    { id: 'V2', saleDate: '2026-07-02', vendorName: 'ต', totalAmount: 300, status: 'draft' },       // not confirmed → excluded
  ];

  it('AS1 rows map the canonical amount fields (online.amount / vendor.totalAmount)', () => {
    const r = aggregateAltSales(online, vendor);
    expect(r.onlineRows[0].amount).toBe(1000);
    expect(r.vendorRows[0].amount).toBe(2000);
    expect(r.onlineRows).toHaveLength(4);
    expect(r.vendorRows).toHaveLength(2);
  });
  it('AS2 totals count only realized (online paid+completed / vendor confirmed)', () => {
    const r = aggregateAltSales(online, vendor);
    expect(r.totals.online).toBe(1300); // 1000 + 300; pending+cancelled excluded
    expect(r.totals.vendor).toBe(2000); // draft excluded
    expect(r.totals.total).toBe(3300);
  });
  it('AS3 footer total === Σ realized row amounts (audit-reports-accuracy)', () => {
    const r = aggregateAltSales(online, vendor);
    const realized = [
      ...r.onlineRows.filter(x => x.status === 'paid' || x.status === 'completed'),
      ...r.vendorRows.filter(x => x.status === 'confirmed'),
    ].reduce((s, x) => s + x.amount, 0);
    expect(r.totals.total).toBe(realized);
  });
  it('AS4 adversarial: empty/null/NaN amounts → 0, no throw', () => {
    const r = aggregateAltSales([{ id: 'x', amount: null }, { id: 'y', amount: 'abc' }], null);
    expect(r.totals.total).toBe(0);
    expect(r.onlineRows).toHaveLength(2);
    expect(r.vendorRows).toHaveLength(0);
  });
});

describe('OS aggregateOutstanding', () => {
  // Sale total = billing.netTotal (recon canonical). Paid = Σ payment.channels[]
  // (the REAL money field on be_sales — verified prod 2026-07-08; totalPaidAmount
  // is undefined on live sales). Exclude cancelled/refunded + AUDIT_SALE_SOURCES.
  const sales = [
    { id: 'S1', saleId: 'INV-1', saleDate: '2026-07-01', customerName: 'ก', billing: { netTotal: 1000 }, payment: { channels: [{ method: 'เงินสด', amount: 400, enabled: true }] }, status: 'active' },
    { id: 'S2', saleId: 'INV-2', saleDate: '2026-07-02', customerName: 'ข', billing: { netTotal: 500 }, payment: { status: 'paid', channels: [{ method: 'QR', amount: 500, enabled: true }] }, status: 'active' }, // fully paid → excluded
    { id: 'S3', saleId: 'INV-3', saleDate: '2026-07-03', customerName: 'ค', billing: { netTotal: 800 }, payment: { channels: [] }, status: 'cancelled' }, // cancelled → excluded
    { id: 'S4', saleId: 'INV-4', saleDate: '2026-07-04', customerName: 'ง', billing: { netTotal: 200 }, payment: { channels: [] }, source: 'reduceRemaining' }, // audit-source → excluded
  ];
  it('OS1 only genuinely-unpaid, non-cancelled, non-audit rows (paid = Σchannels)', () => {
    const r = aggregateOutstanding(sales);
    expect(r.rows.map(x => x.ref)).toEqual(['INV-1']);
    expect(r.rows[0].paid).toBe(400);
    expect(r.rows[0].outstanding).toBe(600);
  });
  it('OS2 outstanding total === Σ row outstanding (audit-reports-accuracy)', () => {
    const r = aggregateOutstanding(sales);
    expect(r.totals.outstanding).toBe(r.rows.reduce((s, x) => s + x.outstanding, 0));
    expect(r.totals.count).toBe(1);
  });
  it('OS3 float precision → 2dp, epsilon skips ~0', () => {
    const r = aggregateOutstanding([{ id: 'z', billing: { netTotal: 100.001 }, payment: { channels: [{ amount: 100, enabled: true }] } }]);
    expect(r.rows).toHaveLength(0); // 0.001 < 0.005 epsilon
  });
  it('OS4 disabled channels excluded + legacy totalPaidAmount fallback', () => {
    const r = aggregateOutstanding([
      { id: 'a', billing: { netTotal: 300 }, payment: { channels: [{ amount: 100, enabled: true }, { amount: 50, enabled: false }] }, status: 'active' }, // paid 100 (disabled skipped) → 200
      { id: 'b', total: 150, totalPaidAmount: 50 }, // legacy: no payment.channels → falls back to totalPaidAmount 50 → 100
    ]);
    expect(r.rows.map(x => x.outstanding).sort((a, b) => a - b)).toEqual([100, 200]);
  });
  it('OS5 netTotal already nets deposit/wallet — paid=Σchannels must not double-count (false-positive guard)', () => {
    // real prod shape: subtotal 17900 − billDiscount 1000 − depositApplied 1000 = netTotal 15900,
    // fully covered by a 15900 channel → outstanding 0. The bug read totalPaidAmount(undefined→0) → flagged 15900.
    const r = aggregateOutstanding([
      { id: 'd', billing: { subtotal: 17900, billDiscount: 1000, depositApplied: 1000, netTotal: 15900 }, payment: { status: 'paid', channels: [{ amount: 15900, enabled: true }] }, status: 'active' },
    ]);
    expect(r.rows).toHaveLength(0);
    expect(r.totals.outstanding).toBe(0);
  });
});

describe('SA aggregateStockAlert', () => {
  const NOW = new Date('2026-07-07T00:00:00Z');
  const batches = [
    { id: 'B1', productId: 'P1', productName: 'A', qty: { remaining: 3 }, expiresAt: '2026-06-01', status: 'available' }, // expired
    { id: 'B2', productId: 'P1', productName: 'A', qty: { remaining: 2 }, expiresAt: '2026-08-01', status: 'available' }, // near (~25d, thr 90)
    { id: 'B3', productId: 'P2', productName: 'B', qty: { remaining: 4 }, expiresAt: '2027-06-01', status: 'available' }, // ok, low-stock (thr 10)
    { id: 'B4', productId: 'P3', productName: 'C', qty: { remaining: 0 }, expiresAt: '2025-01-01', status: 'available' }, // depleted → skipped everywhere
  ];
  const products = [
    { id: 'P1', productName: 'A', alertDayBeforeExpire: 90, alertQtyBeforeOutOfStock: 0 },
    { id: 'P2', productName: 'B', alertQtyBeforeOutOfStock: 10 },
  ];
  it('SA1 expired lot detected (non-zero qty only)', () => {
    const r = aggregateStockAlert(batches, products, NOW);
    expect(r.expired.map(x => x.batch)).toEqual(['B1']);
    expect(r.expired[0].overdueDays).toBeGreaterThan(0);
  });
  it('SA2 near-expiry uses per-product alertDayBeforeExpire', () => {
    const r = aggregateStockAlert(batches, products, NOW);
    expect(r.nearExpiry.map(x => x.batch)).toEqual(['B2']);
  });
  it('SA3 low-stock sums non-expired remaining vs threshold', () => {
    const r = aggregateStockAlert(batches, products, NOW);
    // P2 remaining 4 <= 10 → low; P1 threshold 0 → skipped; expired B1 not counted
    expect(r.lowStock.map(x => x.productId)).toEqual(['P2']);
    expect(r.lowStock[0].remaining).toBe(4);
  });
  it('SA4 empty/no-expiry/no-threshold → no throw, empty buckets', () => {
    const r = aggregateStockAlert([{ id: 'x', productId: 'z', qty: { remaining: 1 } }], [], NOW);
    expect(r.counts).toEqual({ expired: 0, nearExpiry: 0, lowStock: 0 });
  });
});
