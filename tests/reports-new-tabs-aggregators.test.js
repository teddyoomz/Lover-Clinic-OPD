// Reports-home new-tabs — pure aggregator unit + reconcile + adversarial.
// 4 groups: AS (alt-sales) · OS (outstanding) · MV (movements) · SA (stock-alert).
// audit-reports-accuracy: every footer total === Σ row values, exact.
import { describe, it, expect } from 'vitest';
import { aggregateAltSales } from '../src/lib/altSalesReportAggregator.js';

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
