// V134 (2026-05-28) — reports-revenue showed manufactured fractions in หักมัดจำ /
// ยอดชำระเงิน (e.g. 4,941.35) because it split each sale's ROUND deposit (1,000)
// proportionally across course lines. User never entered fractions. Fix: rows show
// GROSS per course; deposit/wallet/refund are sale-level FOOTER summaries; net is
// totals.paidAmount. No per-row split → no fractions. Money still conserved.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { aggregateRevenueByProcedure } from '../src/lib/revenueAnalysisAggregator.js';

const AGG_SRC = readFileSync('src/lib/revenueAnalysisAggregator.js', 'utf8');

const COURSES = [
  { id: 'C1', courseName: 'ขลิบ', courseCategory: 'ขลิบ', procedureType: 'หัตถการไม่ดมยาสลบ' },
  { id: 'C2', courseName: 'ตรวจ', courseCategory: 'ตรวจสมรรถภาพ', procedureType: 'หัตถการทั่วไป' },
  { id: 'C3', courseName: 'ฮอร์โมน', courseCategory: 'ฮอร์โมนเพศชาย', procedureType: 'หัตถการทั่วไป' },
];
const sale = (id, courses, billing = {}, status = 'completed') => ({
  saleId: id, id, saleDate: '2026-05-20', status,
  items: { courses }, billing: { depositApplied: 0, walletApplied: 0, ...billing },
});
// the user's exact case: round 1,000 deposit on a 3-course bill
const USER_CASE = [sale('INV-8', [
  { id: 'C1', name: 'ขลิบ', qty: 1, lineTotal: 15900 },
  { id: 'C2', name: 'ตรวจ', qty: 1, lineTotal: 2000 },
  { id: 'C3', name: 'ฮอร์โมน', qty: 1, lineTotal: 13900 },
], { depositApplied: 1000 })];

describe('V134 A — round deposit produces NO per-row fractions (the bug)', () => {
  it('A1 every row: deposit/wallet/refund = 0, paid = gross lineTotal (no 62.89 / 437.11)', () => {
    const { rows } = aggregateRevenueByProcedure(USER_CASE, COURSES, {});
    expect(rows.length).toBe(3);
    for (const r of rows) {
      expect(r.depositApplied).toBe(0);
      expect(r.walletApplied).toBe(0);
      expect(r.refundAmount).toBe(0);
      expect(r.paidAmount).toBe(r.lineTotal);
      expect(Number.isInteger(r.paidAmount)).toBe(true); // gross of integer inputs → integer
    }
    expect(rows.map(r => r.lineTotal).sort((a, b) => a - b)).toEqual([2000, 13900, 15900]);
  });
  it('A2 footer deposit = the round 1,000 (sale-level summary, not split)', () => {
    const { totals } = aggregateRevenueByProcedure(USER_CASE, COURSES, {});
    expect(totals.depositApplied).toBe(1000);
    expect(Number.isInteger(totals.depositApplied)).toBe(true);
  });
  it('A3 net = gross − deposit (31,800 − 1,000 = 30,800)', () => {
    const { totals } = aggregateRevenueByProcedure(USER_CASE, COURSES, {});
    expect(totals.lineTotal).toBe(31800);
    expect(totals.paidAmount).toBe(30800);   // net
    expect(totals.grossPaid).toBe(31800);    // gross course revenue
  });
});

describe('V134 B — conservation + multi-sale footer summary', () => {
  it('B1 footer deposit = Σ each sale billing ONCE (not per-line, not double-counted)', () => {
    const sales = [
      sale('INV-1', [{ id: 'C1', name: 'ขลิบ', qty: 1, lineTotal: 15900 }, { id: 'C2', name: 'ตรวจ', qty: 1, lineTotal: 2000 }], { depositApplied: 1000 }),
      sale('INV-2', [{ id: 'C1', name: 'ขลิบ', qty: 1, lineTotal: 15900 }], { depositApplied: 1000 }),
    ];
    const { totals } = aggregateRevenueByProcedure(sales, COURSES, {});
    expect(totals.depositApplied).toBe(2000); // 2 sales × 1000, each counted once
    expect(totals.lineTotal).toBe(33800);
    expect(totals.paidAmount).toBe(31800);
  });
  it('B2 cancelled sale deposit excluded', () => {
    const sales = [
      sale('OK', [{ id: 'C1', name: 'ขลิบ', qty: 1, lineTotal: 15900 }], { depositApplied: 1000 }),
      sale('X', [{ id: 'C1', name: 'ขลิบ', qty: 1, lineTotal: 99999 }], { depositApplied: 5000 }, 'cancelled'),
    ];
    const { totals } = aggregateRevenueByProcedure(sales, COURSES, {});
    expect(totals.depositApplied).toBe(1000);
    expect(totals.lineTotal).toBe(15900);
  });
});

describe('V134 C — footer deduction is filter-scoped (no leak)', () => {
  it('C1 category filter: footer deposit only counts sales with surviving lines', () => {
    // sale A: only ขลิบ (deposit 1000). sale B: only ฮอร์โมน (deposit 1000).
    const sales = [
      sale('A', [{ id: 'C1', name: 'ขลิบ', qty: 1, lineTotal: 15900 }], { depositApplied: 1000 }),
      sale('B', [{ id: 'C3', name: 'ฮอร์โมน', qty: 1, lineTotal: 13900 }], { depositApplied: 1000 }),
    ];
    const onlyKhlib = aggregateRevenueByProcedure(sales, COURSES, { category: 'ขลิบ' });
    expect(onlyKhlib.totals.depositApplied).toBe(1000); // only sale A's deposit
    expect(onlyKhlib.totals.lineTotal).toBe(15900);
  });
  it('C2 mixed-bill sale counted ONCE even if multiple of its lines survive', () => {
    const sales = [sale('M', [
      { id: 'C2', name: 'ตรวจ', qty: 1, lineTotal: 2000 },
      { id: 'C3', name: 'ฮอร์โมน', qty: 1, lineTotal: 13900 },
    ], { depositApplied: 1000 })];
    // both lines are category 'หัตถการทั่วไป'? no — categories differ; filter by procedureType
    const out = aggregateRevenueByProcedure(sales, COURSES, { procedureType: 'หัตถการทั่วไป' });
    expect(out.rows.length).toBe(2);          // both lines survive
    expect(out.totals.depositApplied).toBe(1000); // sale counted ONCE, not 2000
  });
});

describe('V134 D — source-grep regression', () => {
  it('D1 rows no longer accumulate per-line deposit/wallet/refund shares', () => {
    expect(AGG_SRC).not.toMatch(/cur\.depositApplied \+= ln\.depositShare/);
    expect(AGG_SRC).not.toMatch(/cur\.paidAmount \+= ln\.paidShare/);
  });
  it('D2 aggregator computes sale-level deduction summary + net + grossPaid', () => {
    expect(AGG_SRC).toMatch(/survivingSaleIds/);
    expect(AGG_SRC).toMatch(/grossPaid/);
    expect(AGG_SRC).toMatch(/netPaid/);
  });
});
