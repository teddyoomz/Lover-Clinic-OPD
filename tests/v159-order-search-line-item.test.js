import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Pure mirror of the V159 search predicate (kept in lock-step with OrderPanel).
function orderMatchesQuery(o, q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return true;
  return (o.vendorName || '').toLowerCase().includes(q)
    || (o.orderId || '').toLowerCase().includes(q)
    || (Array.isArray(o.items) ? o.items : []).some(it => (it.productName || '').toLowerCase().includes(q));
}

const order = {
  orderId: 'ORD-20250615', vendorName: 'Supplier ABC',
  items: [{ productName: 'Saline', qty: 1 }, { productName: 'Elonza', qty: 10 }],
};

describe('V159 — order search includes line items', () => {
  it('B1 finds order by line-item productName', () => {
    expect(orderMatchesQuery(order, 'elonza')).toBe(true);
  });
  it('B2 still finds by vendor + orderId (no regression)', () => {
    expect(orderMatchesQuery(order, 'supplier')).toBe(true);
    expect(orderMatchesQuery(order, 'ord-2025')).toBe(true);
  });
  it('B3 no match → false', () => {
    expect(orderMatchesQuery(order, 'zzz')).toBe(false);
  });
  it('B4 source-grep: OrderPanel filter searches items[].productName + passes matchQuery', () => {
    const src = readFileSync('src/components/backend/OrderPanel.jsx', 'utf8');
    expect(src).toMatch(/items[\s\S]{0,80}some\([\s\S]{0,80}productName/);
    expect(src).toMatch(/formatOrderItemsSummary\([^)]*matchQuery/);
    expect(src).not.toMatch(/placeholder="ค้นหา vendor หรือ ORD-\.\.\."/); // old placeholder replaced
  });
  it('B5 CentralStockOrderPanel filter searches items[].productName + matchQuery', () => {
    const src = readFileSync('src/components/backend/CentralStockOrderPanel.jsx', 'utf8');
    expect(src).toMatch(/items[\s\S]{0,80}some\([\s\S]{0,80}productName/);
    expect(src).toMatch(/formatOrderItemsSummary\([^)]*matchQuery/);
  });
});
