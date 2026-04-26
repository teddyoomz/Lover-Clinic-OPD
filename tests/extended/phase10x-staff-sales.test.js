// Phase 10.X2 — Staff Sales aggregator tests.

import { describe, it, expect } from 'vitest';
import {
  aggregateStaffSales,
  splitSaleAcrossSellers,
  buildStaffColumns,
  buildDoctorColumns,
} from '../src/lib/staffSalesAggregator.js';
import { buildCSV } from '../src/lib/csvExport.js';

function sale({ id, date = '2026-04-10', net = 1000, paid = null, status = 'active', sellers = [], doctorName = '', doctorId = '' }) {
  return {
    saleId: id, id, saleDate: date, status,
    billing: { netTotal: net },
    payment: { status: 'paid', channels: [{ amount: paid ?? net }] },
    sellers, doctorName, doctorId,
  };
}

/* ─── Split math ─────────────────────────────────────────────────────────── */

describe('splitSaleAcrossSellers', () => {
  it('single seller = full amount', () => {
    const s = sale({ id: 'A', net: 1000, paid: 1000, sellers: [{ id: 's1', name: 'Alice' }] });
    const shares = splitSaleAcrossSellers(s);
    expect(shares).toHaveLength(1);
    expect(shares[0].netShare).toBeCloseTo(1000, 2);
    expect(shares[0].paidShare).toBeCloseTo(1000, 2);
  });

  it('two sellers with no share = even split', () => {
    const s = sale({ id: 'A', net: 1000, sellers: [{ id: 's1', name: 'A' }, { id: 's2', name: 'B' }] });
    const shares = splitSaleAcrossSellers(s);
    expect(shares[0].netShare).toBeCloseTo(500, 2);
    expect(shares[1].netShare).toBeCloseTo(500, 2);
  });

  it('share-weighted split (2:1 ratio)', () => {
    const s = sale({ id: 'A', net: 900, sellers: [
      { id: 's1', name: 'A', share: 2 },
      { id: 's2', name: 'B', share: 1 },
    ]});
    const shares = splitSaleAcrossSellers(s);
    expect(shares[0].netShare).toBeCloseTo(600, 2);
    expect(shares[1].netShare).toBeCloseTo(300, 2);
  });

  it('last seller absorbs rounding remainder so sum === net exactly', () => {
    const s = sale({ id: 'A', net: 100, sellers: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]});
    const shares = splitSaleAcrossSellers(s);
    const sum = shares.reduce((s2, sh) => s2 + sh.netShare, 0);
    expect(sum).toBeCloseTo(100, 6); // exact (no drift)
  });

  it('empty sellers → empty array', () => {
    const s = sale({ id: 'A', sellers: [] });
    expect(splitSaleAcrossSellers(s)).toEqual([]);
  });

  it('zero total weight → zero shares', () => {
    const s = sale({ id: 'A', net: 1000, sellers: [
      { id: 'a', name: 'A', share: 0 },
      { id: 'b', name: 'B', share: 0 },
    ]});
    const shares = splitSaleAcrossSellers(s);
    expect(shares[0].netShare).toBe(0);
    expect(shares[1].netShare).toBe(0);
  });
});

/* ─── Aggregation ────────────────────────────────────────────────────────── */

describe('aggregateStaffSales — staff grouping', () => {
  it('groups by seller across multiple sales', () => {
    const sales = [
      sale({ id: '1', net: 1000, sellers: [{ id: 's1', name: 'Alice' }] }),
      sale({ id: '2', net: 2000, sellers: [{ id: 's1', name: 'Alice' }] }),
      sale({ id: '3', net: 500,  sellers: [{ id: 's2', name: 'Bob' }] }),
    ];
    const out = aggregateStaffSales(sales);
    const alice = out.staffRows.find(r => r.staffName === 'Alice');
    const bob = out.staffRows.find(r => r.staffName === 'Bob');
    expect(alice.netShare).toBe(3000);
    expect(alice.saleCount).toBe(2);
    expect(bob.netShare).toBe(500);
  });

  it('multi-seller sale splits net across sellers (even 50/50)', () => {
    const sales = [
      sale({ id: '1', net: 1000, sellers: [
        { id: 's1', name: 'Alice' },
        { id: 's2', name: 'Bob' },
      ]}),
    ];
    const out = aggregateStaffSales(sales);
    const alice = out.staffRows.find(r => r.staffName === 'Alice');
    const bob = out.staffRows.find(r => r.staffName === 'Bob');
    expect(alice.netShare).toBeCloseTo(500, 2);
    expect(bob.netShare).toBeCloseTo(500, 2);
  });

  it('staff with no id uses name:Xxx key (dedup across sales)', () => {
    const sales = [
      sale({ id: '1', net: 1000, sellers: [{ name: 'NoIdSeller' }] }),
      sale({ id: '2', net: 500,  sellers: [{ name: 'NoIdSeller' }] }),
    ];
    const out = aggregateStaffSales(sales);
    expect(out.staffRows).toHaveLength(1);
    expect(out.staffRows[0].netShare).toBe(1500);
  });

  it('cancelled sale excluded (AR3)', () => {
    const sales = [
      sale({ id: '1', net: 1000, sellers: [{ id: 's1', name: 'A' }] }),
      sale({ id: '2', net: 99999, status: 'cancelled', sellers: [{ id: 's1', name: 'A' }] }),
    ];
    const out = aggregateStaffSales(sales);
    expect(out.staffRows[0].netShare).toBe(1000);
    expect(out.totals.cancelledCount).toBe(1);
  });

  it('rows sorted by netShare desc', () => {
    const sales = [
      sale({ id: '1', net: 500,  sellers: [{ id: 'a', name: 'A' }] }),
      sale({ id: '2', net: 2000, sellers: [{ id: 'b', name: 'B' }] }),
      sale({ id: '3', net: 1000, sellers: [{ id: 'c', name: 'C' }] }),
    ];
    const out = aggregateStaffSales(sales);
    expect(out.staffRows.map(r => r.staffName)).toEqual(['B', 'C', 'A']);
  });
});

describe('aggregateStaffSales — doctor grouping', () => {
  it('groups by doctorName (full amount, not split)', () => {
    const sales = [
      sale({ id: '1', net: 1000, doctorName: 'Dr A', sellers: [{ id: 's1', name: 'Alice' }] }),
      sale({ id: '2', net: 2000, doctorName: 'Dr A', sellers: [{ id: 's2', name: 'Bob' }] }),
      sale({ id: '3', net: 500,  doctorName: 'Dr B', sellers: [] }),
    ];
    const out = aggregateStaffSales(sales);
    const drA = out.doctorRows.find(r => r.doctorName === 'Dr A');
    const drB = out.doctorRows.find(r => r.doctorName === 'Dr B');
    expect(drA.netTotal).toBe(3000);   // full amount — not share-split
    expect(drA.saleCount).toBe(2);
    expect(drB.netTotal).toBe(500);
  });

  it('missing doctorName/doctorId → sale not in doctorRows', () => {
    const sales = [sale({ id: '1', net: 1000, sellers: [{ id: 's1', name: 'A' }] })];
    const out = aggregateStaffSales(sales);
    expect(out.doctorRows).toHaveLength(0);
  });
});

/* ─── Date range + search ────────────────────────────────────────────────── */

describe('filters', () => {
  it('from/to narrows date window', () => {
    const sales = [
      sale({ id: '1', date: '2026-03-30', net: 1000, sellers: [{ name: 'A' }] }),
      sale({ id: '2', date: '2026-04-15', net: 2000, sellers: [{ name: 'A' }] }),
      sale({ id: '3', date: '2026-05-01', net: 9000, sellers: [{ name: 'A' }] }),
    ];
    const out = aggregateStaffSales(sales, { from: '2026-04-01', to: '2026-04-30' });
    expect(out.staffRows[0].netShare).toBe(2000);
  });

  it('searchText filters staffName + doctorName', () => {
    const sales = [
      sale({ id: '1', net: 1000, sellers: [{ name: 'Alice' }], doctorName: 'Dr A' }),
      sale({ id: '2', net: 500,  sellers: [{ name: 'Bob' }],   doctorName: 'Dr B' }),
    ];
    const out = aggregateStaffSales(sales, { searchText: 'alice' });
    expect(out.staffRows).toHaveLength(1);
    expect(out.staffRows[0].staffName).toBe('Alice');
  });
});

/* ─── AR2 safety ─────────────────────────────────────────────────────────── */

describe('AR2 safety', () => {
  it('empty input → empty rows', () => {
    const out = aggregateStaffSales([]);
    expect(out.staffRows).toEqual([]);
    expect(out.doctorRows).toEqual([]);
  });

  it('null input no throw', () => {
    expect(() => aggregateStaffSales(null)).not.toThrow();
  });

  it('sale with no sellers and no doctor → no contribution anywhere', () => {
    const out = aggregateStaffSales([sale({ id: '1', net: 1000 })]);
    expect(out.staffRows).toEqual([]);
    expect(out.doctorRows).toEqual([]);
    expect(out.totals.saleCount).toBe(1); // active still counted
  });
});

/* ─── Totals reconciliation ──────────────────────────────────────────────── */

describe('totals', () => {
  it('sum of staff netShare ≈ totals.netTotal (within 0.01 rounding)', () => {
    const sales = [
      sale({ id: '1', net: 1000, sellers: [{ name: 'A' }, { name: 'B' }] }),
      sale({ id: '2', net: 2000, sellers: [{ name: 'A' }] }),
    ];
    const out = aggregateStaffSales(sales);
    const sum = out.staffRows.reduce((s, r) => s + r.netShare, 0);
    expect(Math.abs(sum - out.totals.netTotal)).toBeLessThan(0.01);
  });
});

/* ─── Column spec + CSV ──────────────────────────────────────────────────── */

describe('column spec', () => {
  it('staff columns = 4', () => expect(buildStaffColumns()).toHaveLength(4));
  it('doctor columns = 4', () => expect(buildDoctorColumns()).toHaveLength(4));

  it('CSV has UTF-8 BOM', () => {
    const out = aggregateStaffSales([sale({ sellers: [{ name: 'A' }] })]);
    const csv = buildCSV(out.staffRows, buildStaffColumns());
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });
});

/* ─── AR15 pure ─────────────────────────────────────────────────────────── */

describe('AR15 pure', () => {
  it('same input → same output', () => {
    const sales = [sale({ id: '1', sellers: [{ name: 'A' }] })];
    expect(aggregateStaffSales(sales)).toEqual(aggregateStaffSales(sales));
  });
});
