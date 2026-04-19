// Phase 10.7 — Revenue Analysis by Procedure: adversarial scenarios.

import { describe, it, expect } from 'vitest';
import {
  aggregateRevenueByProcedure,
  flattenRevenueLines,
  buildRevenueColumns,
} from '../src/lib/revenueAnalysisAggregator.js';
import { assertReconcile } from '../src/lib/reportsUtils.js';
import { buildCSV } from '../src/lib/csvExport.js';

const FIX_COURSES = [
  { id: 'C100', name: 'Hugel ทั่วหน้า', procedure_type_name: 'ไม่ระบุ', category_name: 'Botox' },
  { id: 'C200', name: 'Laser หน้า 10 ครั้ง', procedure_type_name: 'ไม่ระบุ', category_name: 'Laser' },
  { id: 'C300', name: 'นวดหน้า', procedure_type_name: 'ทรีทเมนท์', category_name: 'Treatment' },
];

function makeSale(id, saleDate, courses, billing = {}, status = 'active') {
  return {
    saleId: id, id, saleDate, status,
    items: { courses },
    billing: { netTotal: 0, depositApplied: 0, walletApplied: 0, ...billing },
  };
}

const SALES = [
  // One course item per sale — simple case
  makeSale('INV-1', '2026-04-10', [
    { id: 'C100', name: 'Hugel ทั่วหน้า', qty: 12, lineTotal: 280000, promotionName: '' },
  ], { netTotal: 280000 }),

  // Multi-item sale with deposit proportional split (sum 115000 — 112.40 dep)
  makeSale('INV-2', '2026-04-12', [
    { id: 'C300', name: 'นวดหน้า', qty: 5, lineTotal: 115000, promotionName: '' },
  ], { netTotal: 114887.60, depositApplied: 112.40 }),

  // Multi-item sale spanning 2 categories, deposit + wallet
  makeSale('INV-3', '2026-04-15', [
    { id: 'C200', name: 'Laser หน้า 10 ครั้ง', qty: 27, lineTotal: 267300, promotionName: '' },
  ], { netTotal: 247216.33, depositApplied: 10183.67, walletApplied: 9900 }),

  // Cancelled sale — must not contribute
  makeSale('INV-CANCELLED', '2026-04-16', [
    { id: 'C100', name: 'Hugel ทั่วหน้า', qty: 100, lineTotal: 1000000 },
  ], { netTotal: 1000000 }, 'cancelled'),

  // Sale with course NOT in master (orphan) — should still appear with 'ไม่ระบุ'
  makeSale('INV-4', '2026-04-17', [
    { id: 'C999', name: 'Ghost Course', qty: 3, lineTotal: 30000 },
  ], { netTotal: 30000 }),

  // Sale with promotion name
  makeSale('INV-5', '2026-04-18', [
    { id: 'C100', name: 'Hugel ทั่วหน้า', qty: 2, lineTotal: 40000, promotionName: 'โปรเดือนเมษา' },
  ], { netTotal: 40000 }),

  // Sale with multi-item proportional split (2 items)
  makeSale('INV-6', '2026-04-19', [
    { id: 'C100', name: 'Hugel ทั่วหน้า', qty: 1, lineTotal: 20000 },
    { id: 'C300', name: 'นวดหน้า', qty: 1, lineTotal: 5000 },
  ], { netTotal: 23000, depositApplied: 2000 }),

  // Out-of-range sale (March)
  makeSale('INV-MARCH', '2026-03-01', [
    { id: 'C100', name: 'Hugel ทั่วหน้า', qty: 50, lineTotal: 50000 },
  ], { netTotal: 50000 }),
];

const APRIL = { from: '2026-04-01', to: '2026-04-30' };

/* ─── AR3 — cancelled ─────────────────────────────────────────────────────── */

describe('AR3 — cancelled excluded', () => {
  it('cancelled sale lines never flow through', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    // If the 100-qty cancelled sale flowed through, total qty would include 100
    expect(out.totals.qty).toBeLessThan(100);
  });
});

/* ─── AR2 — empty/null safety ────────────────────────────────────────────── */

describe('AR2 — empty/null safety', () => {
  it('empty inputs → empty rows', () => {
    const out = aggregateRevenueByProcedure([], [], {});
    expect(out.rows).toEqual([]);
    expect(out.totals.count).toBe(0);
    expect(out.totals.paidAmount).toBe(0);
  });

  it('null inputs → no throw', () => {
    expect(() => aggregateRevenueByProcedure(null, null, {})).not.toThrow();
  });

  it('sale with no courses items is skipped', () => {
    const out = aggregateRevenueByProcedure([{ saleId: 'X', saleDate: '2026-04-01', items: {}, billing: { netTotal: 100 } }], FIX_COURSES, APRIL);
    expect(out.rows).toEqual([]);
  });
});

/* ─── Proportional split math ────────────────────────────────────────────── */

describe('proportional split — depositApplied across course items', () => {
  it('single-item sale: entire deposit goes to the single line', () => {
    const idx = new Map();
    for (const c of FIX_COURSES) idx.set(c.id, c);
    const lines = flattenRevenueLines([SALES[1]], idx); // INV-2: 1 item, deposit 112.40
    expect(lines).toHaveLength(1);
    expect(lines[0].depositShare).toBeCloseTo(112.40, 2);
    expect(lines[0].paidShare).toBeCloseTo(114887.60, 2);
  });

  it('multi-item sale: deposit splits by line-total weight, sums to total', () => {
    const idx = new Map();
    for (const c of FIX_COURSES) idx.set(c.id, c);
    const lines = flattenRevenueLines([SALES[6]], idx); // INV-6: 2 items 20k+5k, deposit 2000
    expect(lines).toHaveLength(2);
    const sum = lines.reduce((s, ln) => s + ln.depositShare, 0);
    expect(sum).toBeCloseTo(2000, 2);
    // Weighted split: line 20000 gets 1600, line 5000 gets 400 (4:1 ratio)
    const hugel = lines.find(ln => ln.courseId === 'C100');
    const massage = lines.find(ln => ln.courseId === 'C300');
    expect(hugel.depositShare).toBeCloseTo(1600, 2);
    expect(massage.depositShare).toBeCloseTo(400, 2);
  });

  it('paidShare = lineTotal - deposit - wallet - refund (per line)', () => {
    const idx = new Map();
    for (const c of FIX_COURSES) idx.set(c.id, c);
    const lines = flattenRevenueLines([SALES[2]], idx); // INV-3: 267300 - 10183.67 dep - 9900 wal
    const ln = lines[0];
    expect(ln.lineTotal).toBeCloseTo(267300, 2);
    expect(ln.paidShare).toBeCloseTo(267300 - 10183.67 - 9900, 2);
  });
});

/* ─── Master data join ───────────────────────────────────────────────────── */

describe('course master data join', () => {
  it('resolves procedureType + category from master by courseId', () => {
    const out = aggregateRevenueByProcedure([SALES[0]], FIX_COURSES, APRIL);
    const row = out.rows[0];
    expect(row.procedureType).toBe('ไม่ระบุ');
    expect(row.category).toBe('Botox');
    expect(row.courseName).toBe('Hugel ทั่วหน้า');
  });

  it('orphan course (not in master) falls back to ไม่ระบุ/ไม่ระบุ + name from sale item', () => {
    const out = aggregateRevenueByProcedure([SALES[4]], FIX_COURSES, APRIL);
    const row = out.rows[0];
    expect(row.procedureType).toBe('ไม่ระบุ');
    expect(row.category).toBe('ไม่ระบุ');
    expect(row.courseName).toBe('Ghost Course');
  });

  it('name-based fallback when courseId missing but name matches', () => {
    const sale = makeSale('INV-NAME', '2026-04-01', [
      { id: '', name: 'Hugel ทั่วหน้า', qty: 1, lineTotal: 10000 },
    ], { netTotal: 10000 });
    const out = aggregateRevenueByProcedure([sale], FIX_COURSES, APRIL);
    expect(out.rows[0].category).toBe('Botox');
  });
});

/* ─── Grouping ───────────────────────────────────────────────────────────── */

describe('grouping by procedureType × category × course × promotion', () => {
  it('same course + same promo = 1 group; different promo = 2 groups', () => {
    const sale1 = makeSale('A', '2026-04-01', [{ id: 'C100', name: 'X', qty: 1, lineTotal: 100, promotionName: 'P1' }]);
    const sale2 = makeSale('B', '2026-04-02', [{ id: 'C100', name: 'X', qty: 1, lineTotal: 100, promotionName: 'P2' }]);
    const out = aggregateRevenueByProcedure([sale1, sale2], FIX_COURSES, APRIL);
    expect(out.rows).toHaveLength(2);
    expect(out.rows.map(r => r.promotionName).sort()).toEqual(['P1', 'P2']);
  });

  it('same course + same promo across multiple sales → qty sums', () => {
    const sale1 = makeSale('A', '2026-04-01', [{ id: 'C100', name: 'X', qty: 3, lineTotal: 300 }]);
    const sale2 = makeSale('B', '2026-04-02', [{ id: 'C100', name: 'X', qty: 5, lineTotal: 500 }]);
    const out = aggregateRevenueByProcedure([sale1, sale2], FIX_COURSES, APRIL);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].qty).toBe(8);
    expect(out.rows[0].lineTotal).toBe(800);
  });
});

/* ─── AR5 — Reconciliation ───────────────────────────────────────────────── */

describe('AR5 — totals reconcile to row sums', () => {
  it('lineTotal + paidAmount + deposit + wallet all reconcile', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    const errs = assertReconcile(out, ['lineTotal', 'paidAmount', 'depositApplied', 'walletApplied', 'refundAmount']);
    expect(errs).toEqual([]);
  });

  it('lineTotal − deposit − wallet − refund = paidAmount (total)', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    const calc = out.totals.lineTotal - out.totals.depositApplied - out.totals.walletApplied - out.totals.refundAmount;
    expect(Math.abs(calc - out.totals.paidAmount)).toBeLessThan(0.1); // allow rounding <1 sat
  });
});

/* ─── Filters ────────────────────────────────────────────────────────────── */

describe('filters', () => {
  it('procedureType filter narrows rows', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, { ...APRIL, procedureType: 'ทรีทเมนท์' });
    expect(out.rows.every(r => r.procedureType === 'ทรีทเมนท์')).toBe(true);
    expect(out.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('category filter narrows', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, { ...APRIL, category: 'Laser' });
    expect(out.rows.every(r => r.category === 'Laser')).toBe(true);
  });

  it('searchText matches course name', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, { ...APRIL, searchText: 'Laser' });
    expect(out.rows.every(r => r.courseName.toLowerCase().includes('laser'))).toBe(true);
  });

  it('searchText matches promotion name', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, { ...APRIL, searchText: 'โปรเดือนเมษา' });
    expect(out.rows.length).toBe(1);
    expect(out.rows[0].promotionName).toContain('โปรเดือนเมษา');
  });
});

/* ─── Date range ─────────────────────────────────────────────────────────── */

describe('AR1 — date range filter', () => {
  it('April range excludes March sale', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    // INV-MARCH should not contribute 50 qty
    const hugelRow = out.rows.find(r => r.courseName === 'Hugel ทั่วหน้า' && r.promotionName === '-');
    expect(hugelRow).toBeDefined();
    // In-range Hugel qty: 12 (INV-1) + 1 (INV-6) = 13 (INV-5 has promo name, separate group)
    expect(hugelRow.qty).toBe(13);
  });
});

/* ─── Type/Category summary ──────────────────────────────────────────────── */

describe('type + category summaries for bar chart', () => {
  it('typeSummary percentages sum to ≤100', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    const sum = out.meta.typeSummary.reduce((s, t) => s + t.pct, 0);
    expect(sum).toBeLessThanOrEqual(100.5);
  });

  it('categorySummary entries sorted by paidAmount desc', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    const paid = out.meta.categorySummary.map(c => c.paidAmount);
    const sorted = [...paid].sort((a, b) => b - a);
    expect(paid).toEqual(sorted);
  });
});

/* ─── Column spec + CSV ──────────────────────────────────────────────────── */

describe('column spec + CSV', () => {
  it('buildRevenueColumns returns 10 cols matching intel', () => {
    const cols = buildRevenueColumns();
    expect(cols).toHaveLength(10);
    const labels = cols.map(c => c.label);
    expect(labels).toEqual([
      'ประเภทหัตถการคอร์ส', 'หมวดหมู่คอร์ส', 'คอร์ส', 'โปรโมชัน',
      'จำนวน', 'ยอดรวม', 'หักมัดจำ', 'หัก Wallet', 'คืนเงิน', 'ยอดชำระเงิน',
    ]);
  });

  it('CSV has UTF-8 BOM', () => {
    const out = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    const csv = buildCSV(out.rows, buildRevenueColumns());
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });
});

/* ─── AR15 — pure ─────────────────────────────────────────────────────────── */

describe('AR15 — pure / idempotent', () => {
  it('same input → same output', () => {
    const a = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    const b = aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    expect(a).toEqual(b);
  });

  it('does not mutate sales input', () => {
    const snap = JSON.parse(JSON.stringify(SALES));
    aggregateRevenueByProcedure(SALES, FIX_COURSES, APRIL);
    expect(SALES).toEqual(snap);
  });
});
