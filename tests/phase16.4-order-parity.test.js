// tests/phase16.4-order-parity.test.js — Phase 16.4 (2026-04-29)
//
// Source-grep + filter-logic regression bank for the Phase 16.4 Order parity
// gaps (G1-G6). All gaps are additive UI controls on existing `OrderPanel.jsx`
// + `CentralStockOrderPanel.jsx`; no backend changes (`createStockOrder` /
// `createCentralStockOrder` already accept all the wired fields).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ORDER_PANEL_PATH = 'src/components/backend/OrderPanel.jsx';
const CENTRAL_PANEL_PATH = 'src/components/backend/CentralStockOrderPanel.jsx';
const ORDER_PANEL = readFileSync(ORDER_PANEL_PATH, 'utf-8');
const CENTRAL_PANEL = readFileSync(CENTRAL_PANEL_PATH, 'utf-8');

describe('OP.G1 — Branch OrderPanel discount inputs', () => {
  it('G1.1 — discount + discountType state hooks added', () => {
    expect(ORDER_PANEL).toMatch(/const \[discount, setDiscount\] = useState/);
    expect(ORDER_PANEL).toMatch(/const \[discountType, setDiscountType\] = useState\('amount'\)/);
  });

  it('G1.2 — discount + discountType passed to createStockOrder payload', () => {
    expect(ORDER_PANEL).toMatch(/discount:\s*Number\(discount\)\s*\|\|\s*0/);
    expect(ORDER_PANEL).toMatch(/discountType:\s*discountType === 'percent'/);
  });

  it('G1.3 — discount input rendered with data-field attribute', () => {
    expect(ORDER_PANEL).toMatch(/data-field="discount"/);
    expect(ORDER_PANEL).toMatch(/data-field="discountType"/);
  });

  it('G1.4 — Phase 16.4 marker present', () => {
    expect(ORDER_PANEL).toMatch(/Phase 16\.4/);
  });
});

describe('OP.G2/G3/G6 — list filters present in BOTH panels', () => {
  for (const [label, src] of [['Branch OrderPanel', ORDER_PANEL], ['CentralStockOrderPanel', CENTRAL_PANEL]]) {
    describe(label, () => {
      it(`${label}.1 — statusFilter state`, () => {
        expect(src).toMatch(/const \[statusFilter, setStatusFilter\] = useState\('all'\)/);
      });
      it(`${label}.2 — costTypeFilter state`, () => {
        expect(src).toMatch(/const \[costTypeFilter, setCostTypeFilter\] = useState\('all'\)/);
      });
      it(`${label}.3 — periodFrom + periodTo states`, () => {
        expect(src).toMatch(/const \[periodFrom, setPeriodFrom\] = useState\(''\)/);
        expect(src).toMatch(/const \[periodTo, setPeriodTo\] = useState\(''\)/);
      });
      it(`${label}.4 — filteredOrders memo applies status/cost/period filters`, () => {
        expect(src).toMatch(/statusFilter !== 'all'/);
        expect(src).toMatch(/costTypeFilter !== 'all'/);
        expect(src).toMatch(/if \(periodFrom \|\| periodTo\)/);
      });
      it(`${label}.5 — pagination key includes filter values (resets on change)`, () => {
        expect(src).toMatch(/statusFilter[^|]*costTypeFilter[^|]*periodFrom[^|]*periodTo/);
      });
      it(`${label}.6 — filter UI dropdowns rendered with data-field`, () => {
        expect(src).toMatch(/data-field="filter-status"/);
        expect(src).toMatch(/data-field="filter-cost-type"/);
      });
    });
  }
});

describe('OP.G4 — cancelReason surfaced in row table', () => {
  it('G4.1 — Branch OrderPanel renders cancelReason for cancelled rows', () => {
    expect(ORDER_PANEL).toMatch(/data-testid="order-cancel-reason"/);
    expect(ORDER_PANEL).toMatch(/o\.cancelReason &&/);
  });
  it('G4.2 — CentralStockOrderPanel renders cancelReason for cancelled rows', () => {
    expect(CENTRAL_PANEL).toMatch(/data-testid="cpo-cancel-reason"/);
    expect(CENTRAL_PANEL).toMatch(/o\.status === 'cancelled' \|\| o\.status === 'cancelled_post_receive'/);
  });
  it('G4.3 — Branch panel handles cancelled_post_receive variant', () => {
    expect(ORDER_PANEL).toMatch(/cancelled_post_receive/);
  });
});

describe('OP.G6 — period date-range filter date discipline', () => {
  it('G6.1 — both panels use slice(0, 10) for ISO date comparison', () => {
    expect(ORDER_PANEL).toMatch(/o\.importedDate[^)]*\)\.slice\(0,\s*10\)/);
    expect(CENTRAL_PANEL).toMatch(/o\.importedDate[^)]*\)\.slice\(0,\s*10\)/);
  });
  it('G6.2 — empty importedDate excluded when range filter active', () => {
    expect(ORDER_PANEL).toMatch(/if \(!date\) return false/);
    expect(CENTRAL_PANEL).toMatch(/if \(!date\) return false/);
  });
});

// Mirror the in-memory filter logic for behavioral testing without React
function applyFilters(orders, filter) {
  const q = (filter.search || '').trim().toLowerCase();
  return orders.filter(o => {
    if (q && !((o.vendorName || '').toLowerCase().includes(q) || (o.orderId || '').toLowerCase().includes(q))) return false;
    if (filter.statusFilter && filter.statusFilter !== 'all') {
      const s = String(o.status || 'active');
      if (filter.statusFilter === 'cancelled' && s !== 'cancelled' && s !== 'cancelled_post_receive') return false;
      if (filter.statusFilter === 'active' && (s === 'cancelled' || s === 'cancelled_post_receive')) return false;
    }
    if (filter.costTypeFilter && filter.costTypeFilter !== 'all') {
      const items = Array.isArray(o.items) ? o.items : [];
      const hasPremium = items.some(it => !!it.isPremium);
      const hasCostBearing = items.some(it => !it.isPremium && (Number(it.cost) || 0) > 0);
      const hasZeroCost = items.some(it => (Number(it.cost) || 0) === 0);
      if (filter.costTypeFilter === 'premium-only' && !hasPremium) return false;
      if (filter.costTypeFilter === 'with-cost' && !hasCostBearing) return false;
      if (filter.costTypeFilter === 'no-cost' && !hasZeroCost) return false;
    }
    if (filter.periodFrom || filter.periodTo) {
      const date = String(o.importedDate || '').slice(0, 10);
      if (!date) return false;
      if (filter.periodFrom && date < filter.periodFrom) return false;
      if (filter.periodTo && date > filter.periodTo) return false;
    }
    return true;
  });
}

describe('OP.G_Filter_Behavior — filter combination correctness', () => {
  const sampleOrders = [
    { orderId: 'ORD-1', vendorName: 'Vendor A', importedDate: '2026-04-01', status: 'active',
      items: [{ cost: 100, isPremium: false }] },
    { orderId: 'ORD-2', vendorName: 'Vendor B', importedDate: '2026-04-15', status: 'cancelled',
      cancelReason: 'ทดสอบ', items: [{ cost: 50, isPremium: false }] },
    { orderId: 'ORD-3', vendorName: 'Vendor C', importedDate: '2026-04-20', status: 'cancelled_post_receive',
      cancelReason: 'ของไม่ครบ', items: [{ cost: 200, isPremium: true }] },
    { orderId: 'ORD-4', vendorName: 'Vendor D', importedDate: '2026-04-25', status: 'active',
      items: [{ cost: 0, isPremium: true }] },
    { orderId: 'ORD-5', vendorName: 'Vendor E', importedDate: '2026-04-29', status: 'active',
      items: [{ cost: 0, isPremium: false }] },
  ];

  it('G_FB.1 — statusFilter=cancelled returns BOTH cancelled + cancelled_post_receive', () => {
    const out = applyFilters(sampleOrders, { statusFilter: 'cancelled' });
    expect(out.map(o => o.orderId)).toEqual(['ORD-2', 'ORD-3']);
  });

  it('G_FB.2 — statusFilter=active excludes cancelled_post_receive', () => {
    const out = applyFilters(sampleOrders, { statusFilter: 'active' });
    expect(out.map(o => o.orderId)).toEqual(['ORD-1', 'ORD-4', 'ORD-5']);
  });

  it('G_FB.3 — costTypeFilter=premium-only includes orders with any premium item', () => {
    const out = applyFilters(sampleOrders, { costTypeFilter: 'premium-only' });
    expect(out.map(o => o.orderId)).toEqual(['ORD-3', 'ORD-4']);
  });

  it('G_FB.4 — costTypeFilter=with-cost excludes orders that are pure-premium / pure-zero', () => {
    const out = applyFilters(sampleOrders, { costTypeFilter: 'with-cost' });
    // ORD-1 (cost 100), ORD-2 (cost 50), ORD-3 (cost 200 but premium → not cost-bearing)
    // ORD-4 cost 0 + premium → no cost-bearing
    // ORD-5 cost 0 + non-premium → cost is 0, not bearing
    expect(out.map(o => o.orderId)).toEqual(['ORD-1', 'ORD-2']);
  });

  it('G_FB.5 — costTypeFilter=no-cost includes orders with at least one cost=0 item', () => {
    const out = applyFilters(sampleOrders, { costTypeFilter: 'no-cost' });
    expect(out.map(o => o.orderId)).toEqual(['ORD-4', 'ORD-5']);
  });

  it('G_FB.6 — periodFrom/periodTo applies inclusive range', () => {
    const out = applyFilters(sampleOrders, { periodFrom: '2026-04-15', periodTo: '2026-04-25' });
    expect(out.map(o => o.orderId)).toEqual(['ORD-2', 'ORD-3', 'ORD-4']);
  });

  it('G_FB.7 — only periodFrom (open-ended) works', () => {
    const out = applyFilters(sampleOrders, { periodFrom: '2026-04-20' });
    expect(out.map(o => o.orderId)).toEqual(['ORD-3', 'ORD-4', 'ORD-5']);
  });

  it('G_FB.8 — combined filters (status + period) intersect', () => {
    const out = applyFilters(sampleOrders, { statusFilter: 'cancelled', periodFrom: '2026-04-18' });
    expect(out.map(o => o.orderId)).toEqual(['ORD-3']);
  });

  it('G_FB.9 — empty importedDate excluded when range filter active (G6.2 lock)', () => {
    const orders = [{ orderId: 'X1', vendorName: 'X', importedDate: '', status: 'active', items: [] }];
    expect(applyFilters(orders, { periodFrom: '2026-04-01' }).length).toBe(0);
    expect(applyFilters(orders, {}).length).toBe(1);  // no filter → kept
  });

  it('G_FB.10 — search across vendorName + orderId case-insensitive', () => {
    const out1 = applyFilters(sampleOrders, { search: 'vendor a' });
    expect(out1.map(o => o.orderId)).toEqual(['ORD-1']);
    const out2 = applyFilters(sampleOrders, { search: 'ord-3' });
    expect(out2.map(o => o.orderId)).toEqual(['ORD-3']);
  });
});
