// Reports-home new-tabs — pure aggregator unit + reconcile + adversarial.
// 4 groups: AS (alt-sales) · OS (outstanding) · MV (movements) · SA (stock-alert).
// audit-reports-accuracy: every footer total === Σ row values, exact.
import { describe, it, expect } from 'vitest';
import { aggregateAltSales } from '../src/lib/altSalesReportAggregator.js';
import { aggregateOutstanding } from '../src/lib/outstandingSalesAggregator.js';

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
  // Sale total = billing.netTotal (recon canonical, verified live 2026-07-07).
  // Paid = totalPaidAmount. Exclude cancelled/refunded + AUDIT_SALE_SOURCES
  // (course-mutation records, not money — the recon false-positive lesson).
  const sales = [
    { id: 'S1', saleId: 'INV-1', saleDate: '2026-07-01', customerName: 'ก', billing: { netTotal: 1000 }, totalPaidAmount: 400, status: 'draft' },
    { id: 'S2', saleId: 'INV-2', saleDate: '2026-07-02', customerName: 'ข', billing: { netTotal: 500 }, totalPaidAmount: 500, status: 'draft' },   // fully paid → excluded
    { id: 'S3', saleId: 'INV-3', saleDate: '2026-07-03', customerName: 'ค', billing: { netTotal: 800 }, totalPaidAmount: 0, status: 'cancelled' }, // cancelled → excluded
    { id: 'S4', saleId: 'INV-4', saleDate: '2026-07-04', customerName: 'ง', billing: { netTotal: 200 }, totalPaidAmount: 0, source: 'reduceRemaining' }, // audit-source → excluded
  ];
  it('OS1 only unpaid, non-cancelled, non-audit rows', () => {
    const r = aggregateOutstanding(sales);
    expect(r.rows.map(x => x.ref)).toEqual(['INV-1']);
    expect(r.rows[0].outstanding).toBe(600);
  });
  it('OS2 outstanding total === Σ row outstanding (audit-reports-accuracy)', () => {
    const r = aggregateOutstanding(sales);
    expect(r.totals.outstanding).toBe(r.rows.reduce((s, x) => s + x.outstanding, 0));
    expect(r.totals.count).toBe(1);
  });
  it('OS3 float precision → 2dp, epsilon skips ~0', () => {
    const r = aggregateOutstanding([{ id: 'z', billing: { netTotal: 100.001 }, totalPaidAmount: 100 }]);
    expect(r.rows).toHaveLength(0); // 0.001 < 0.005 epsilon
  });
  it('OS4 fallback total fields + missing paid → 0, no throw', () => {
    const r = aggregateOutstanding([
      { id: 'a', total: 300, status: 'draft' },                       // legacy `total` field, no paid → outstanding 300
      { id: 'b', billing: { grandTotal: 150 }, payment: { totalPaid: 50 } }, // grandTotal + payment.totalPaid → 100
    ]);
    expect(r.rows.map(x => x.outstanding).sort((a, b) => a - b)).toEqual([100, 300]);
  });
});
