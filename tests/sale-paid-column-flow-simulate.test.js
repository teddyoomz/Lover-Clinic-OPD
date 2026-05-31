// Task 4 (2026-05-31) — Rule I flow-simulate. Chains the REAL helpers + REAL
// usePagination the way SaleTab's row render + pager do, across paid/split/unpaid/
// 0฿/fallback shapes. Proves the per-row paid+tone + the 30/page slice end-to-end.
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { resolveSalePaidAmount, resolveSalePaidTone } from '../src/lib/financeUtils.js';
import { usePagination } from '../src/lib/usePagination.js';

const SALES = [
  { saleId: 'A-full',   billing: { netTotal: 8900 },  payment: { channels: [{ amount: 8900 }] } },
  { saleId: 'B-split',  billing: { netTotal: 8900 },  payment: { channels: [{ amount: 5000 }] } },
  { saleId: 'C-unpaid', billing: { netTotal: 42500 }, payment: { channels: [] } },
  { saleId: 'D-zero',   billing: { netTotal: 0 },     payment: { channels: [{ amount: 0 }] } },
  { saleId: 'E-tpa',    billing: { netTotal: 5000 },  totalPaidAmount: 5000 },
];

describe('F1 — row paid + tone chain (mirrors SaleTab row render)', () => {
  it('computes paid + tone per row', () => {
    const out = SALES.map((s) => {
      const p = resolveSalePaidAmount(s);
      return [s.saleId, p, resolveSalePaidTone(p, s.billing.netTotal)];
    });
    expect(out).toEqual([
      ['A-full', 8900, 'full'],
      ['B-split', 5000, 'partial'],
      ['C-unpaid', 0, 'zero'],
      ['D-zero', 0, 'full'],   // 0฿ paid-in-full = full (green)
      ['E-tpa', 5000, 'full'], // fallback to totalPaidAmount
    ]);
  });
});

describe('F2 — pagination 30/page (real usePagination)', () => {
  const big = Array.from({ length: 35 }, (_, i) => ({ saleId: `S${i}` }));
  it('page 1 shows 30, totals correct', () => {
    const { result } = renderHook(() => usePagination(big, { pageSize: 30, key: 'k1' }));
    expect(result.current.visibleItems).toHaveLength(30);
    expect(result.current.totalPages).toBe(2);
    expect(result.current.totalCount).toBe(35);
  });
  it('<=30 rows → 1 page (Pagination auto-hides)', () => {
    const { result } = renderHook(() => usePagination(big.slice(0, 30), { pageSize: 30, key: 'k2' }));
    expect(result.current.totalPages).toBe(1);
  });
});
