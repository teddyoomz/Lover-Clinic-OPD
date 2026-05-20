// Sub-tab END-TO-END USER SIMULATION (2026-05-20). Pure mirrors of the real
// SaleTab.filtered + DepositPanel.filteredDeposits screen logic, chained across
// a realistic admin session: load → toggle pill → search → scoped filter →
// date-range → perform an action (cancel/apply) → reload → assert migration.
// Also asserts branch isolation (the loaded list is already branch-scoped).

import { describe, it, expect } from 'vitest';
import { filterSalesBySubTab } from '../src/lib/saleSubTabFilter.js';
import { filterDepositsBySubTab, FINISHED_DEPOSIT_STATUSES } from '../src/lib/depositSubTabFilter.js';

// ── Screen mirrors (exact logic from the components) ──
function salesScreen(sales, { subTab = 'active', filterStatus = '', filterQuery = '' } = {}) {
  let list = filterSalesBySubTab(sales, subTab);
  if (subTab === 'active' && filterStatus) list = list.filter(s => s.payment?.status === filterStatus || s.status === filterStatus);
  if (filterQuery.trim()) {
    const q = filterQuery.toLowerCase();
    list = list.filter(s => (s.customerName || '').toLowerCase().includes(q) || (s.saleId || '').toLowerCase().includes(q) || (s.customerHN || '').includes(q));
  }
  return list;
}
function depositScreen(deposits, { subTab = 'active', filterStatus = '', filterQuery = '', filterFrom = '', filterTo = '' } = {}) {
  let list = filterDepositsBySubTab(deposits, subTab);
  if (filterStatus) list = list.filter(d => d.status === filterStatus);
  if (filterFrom) list = list.filter(d => (d.paymentDate || '') >= filterFrom);
  if (filterTo) list = list.filter(d => (d.paymentDate || '') <= filterTo);
  if (filterQuery.trim()) {
    const q = filterQuery.trim().toLowerCase();
    list = list.filter(d => (d.customerName || '').toLowerCase().includes(q) || (d.customerHN || '').toLowerCase().includes(q) || (d.depositId || '').toLowerCase().includes(q));
  }
  return list;
}

// =============================================================================
describe('E1 — sales: full admin session', () => {
  // mirrors the user's real นครราชสีมา branch: 2 active + 9 cancelled
  let sales = [
    { saleId: 'INV-A1', status: 'active', payment: { status: 'paid' }, customerName: 'ชาติชาย' },
    { saleId: 'INV-A2', status: 'active', payment: { status: 'unpaid' }, customerName: 'สุขเกษม' },
    ...Array.from({ length: 9 }, (_, i) => ({ saleId: `INV-C${i}`, status: 'cancelled', payment: { status: 'paid' }, customerName: 'วันเพ็ญ' })),
  ];

  it('E1.1 default active shows only 2 non-cancelled', () => {
    expect(salesScreen(sales, { subTab: 'active' }).map(s => s.saleId)).toEqual(['INV-A1', 'INV-A2']);
  });
  it('E1.2 search within active narrows', () => {
    expect(salesScreen(sales, { subTab: 'active', filterQuery: 'INV-A2' }).map(s => s.saleId)).toEqual(['INV-A2']);
  });
  it('E1.3 switch to cancelled shows 9 (filterStatus reset to "")', () => {
    expect(salesScreen(sales, { subTab: 'cancelled', filterStatus: '' })).toHaveLength(9);
  });
  it('E1.4 payment filter on active tab (paid) narrows to 1', () => {
    expect(salesScreen(sales, { subTab: 'active', filterStatus: 'paid' }).map(s => s.saleId)).toEqual(['INV-A1']);
  });
  it('E1.5 cancel INV-A1 → reload → active 1, cancelled 10', () => {
    sales = sales.map(s => s.saleId === 'INV-A1' ? { ...s, status: 'cancelled' } : s);
    expect(salesScreen(sales, { subTab: 'active' })).toHaveLength(1);
    expect(salesScreen(sales, { subTab: 'cancelled' })).toHaveLength(10);
  });
});

// =============================================================================
describe('E2 — deposits: full admin session', () => {
  let deposits = [
    { depositId: 'DEP-1', status: 'active', remainingAmount: 5000, paymentDate: '2026-05-20', customerName: 'เอ' },
    { depositId: 'DEP-2', status: 'partial', remainingAmount: 2000, paymentDate: '2026-05-18', customerName: 'บี' },
    { depositId: 'DEP-3', status: 'used', remainingAmount: 0, paymentDate: '2026-05-10', customerName: 'ซี' },
    { depositId: 'DEP-4', status: 'cancelled', remainingAmount: 3000, paymentDate: '2026-05-05', customerName: 'ดี' },
    { depositId: 'DEP-5', status: 'refunded', remainingAmount: 0, paymentDate: '2026-05-01', customerName: 'อี' },
    { depositId: 'DEP-6', status: 'expired', remainingAmount: 1000, paymentDate: '2026-04-20', customerName: 'เอฟ' },
  ];

  it('E2.1 default ใช้งานอยู่ shows active+partial only', () => {
    expect(depositScreen(deposits, { subTab: 'active' }).map(d => d.depositId)).toEqual(['DEP-1', 'DEP-2']);
  });
  it('E2.2 scoped dropdown "partial" on active pill narrows to DEP-2', () => {
    expect(depositScreen(deposits, { subTab: 'active', filterStatus: 'partial' }).map(d => d.depositId)).toEqual(['DEP-2']);
  });
  it('E2.3 switch สิ้นสุดแล้ว (filter reset) shows 4 finished', () => {
    expect(depositScreen(deposits, { subTab: 'finished', filterStatus: '' }).map(d => d.depositId)).toEqual(['DEP-3', 'DEP-4', 'DEP-5', 'DEP-6']);
  });
  it('E2.4 scoped dropdown "refunded" on finished pill narrows to DEP-5', () => {
    expect(depositScreen(deposits, { subTab: 'finished', filterStatus: 'refunded' }).map(d => d.depositId)).toEqual(['DEP-5']);
  });
  it('E2.5 date-range on finished pill (from 2026-05-01) keeps DEP-3,4,5', () => {
    expect(depositScreen(deposits, { subTab: 'finished', filterFrom: '2026-05-01' }).map(d => d.depositId)).toEqual(['DEP-3', 'DEP-4', 'DEP-5']);
  });
  it('E2.6 apply DEP-1 fully (→used) → reload → migrates to finished', () => {
    deposits = deposits.map(d => d.depositId === 'DEP-1' ? { ...d, status: 'used', remainingAmount: 0 } : d);
    expect(depositScreen(deposits, { subTab: 'active' }).map(d => d.depositId)).toEqual(['DEP-2']);
    expect(depositScreen(deposits, { subTab: 'finished' }).some(d => d.depositId === 'DEP-1')).toBe(true);
  });
});

// =============================================================================
describe('E3 — branch isolation (split operates within the branch-scoped load)', () => {
  it('E3.1 sales: each branch list splits independently', () => {
    const branchA = [{ saleId: 'A1', status: 'active' }, { saleId: 'A2', status: 'cancelled' }];
    const branchB = [{ saleId: 'B1', status: 'cancelled' }, { saleId: 'B2', status: 'cancelled' }];
    expect(salesScreen(branchA, { subTab: 'active' }).map(s => s.saleId)).toEqual(['A1']);
    expect(salesScreen(branchB, { subTab: 'active' })).toEqual([]);          // branch B has no active
    expect(salesScreen(branchB, { subTab: 'cancelled' })).toHaveLength(2);
  });
  it('E3.2 deposits: each branch list splits independently', () => {
    const branchA = [{ depositId: 'A1', status: 'active' }, { depositId: 'A2', status: 'used' }];
    const branchB = [{ depositId: 'B1', status: 'expired' }];
    expect(depositScreen(branchA, { subTab: 'active' }).map(d => d.depositId)).toEqual(['A1']);
    expect(depositScreen(branchB, { subTab: 'active' })).toEqual([]);
    expect(depositScreen(branchB, { subTab: 'finished' }).map(d => d.depositId)).toEqual(['B1']);
  });
});
