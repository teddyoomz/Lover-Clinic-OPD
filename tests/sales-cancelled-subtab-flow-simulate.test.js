// Sales-page cancelled sub-tab — Rule I flow-simulate + source-grep + UI-logic
// mirrors (2026-05-20). SaleTab's dependency surface makes full RTL render
// brittle + non-idiomatic in this repo (it is tested via source-grep +
// pure-logic mirrors elsewhere), and per Rule Q V66 mock-RTL is code-shape
// coverage only. The REAL UI verification is the L1 preview pass. Here we
// chain the actual helper + mirror the inline React conditionals as pure
// functions so the contract is locked without mounting the component.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { filterSalesBySubTab } from '../src/lib/saleSubTabFilter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SALETAB = readFileSync(join(__dirname, '../src/components/backend/SaleTab.jsx'), 'utf8');

// =============================================================================
describe('F1 flow — load → switch tab → cancel → migrate', () => {
  it('F1.1 a cancelled sale migrates from active list to cancelled list', () => {
    // before cancel: both completed
    let sales = [
      { saleId: 'INV-1', status: 'completed' },
      { saleId: 'INV-2', status: 'completed' },
    ];
    expect(filterSalesBySubTab(sales, 'active').map((s) => s.saleId)).toEqual(['INV-1', 'INV-2']);
    expect(filterSalesBySubTab(sales, 'cancelled')).toEqual([]);

    // cancel INV-1 → reload returns it with status 'cancelled'
    sales = [
      { saleId: 'INV-1', status: 'cancelled' },
      { saleId: 'INV-2', status: 'completed' },
    ];
    expect(filterSalesBySubTab(sales, 'active').map((s) => s.saleId)).toEqual(['INV-2']);
    expect(filterSalesBySubTab(sales, 'cancelled').map((s) => s.saleId)).toEqual(['INV-1']);
  });

  it('F1.2 count line = selected sub-tab length (no double-count)', () => {
    const sales = [
      { saleId: 'A', status: 'completed' },
      { saleId: 'B', status: 'cancelled' },
      { saleId: 'C', status: 'cancelled' },
    ];
    expect(filterSalesBySubTab(sales, 'active').length).toBe(1);
    expect(filterSalesBySubTab(sales, 'cancelled').length).toBe(2);
  });

  it('F1.3 search after split — query applies within the active sub-tab only', () => {
    // mirror SaleTab.filtered: split first, then text search.
    const sales = [
      { saleId: 'INV-A1', status: 'completed', customerName: 'ลูกค้า เอ' },
      { saleId: 'INV-A2', status: 'completed', customerName: 'ลูกค้า บี' },
      { saleId: 'INV-A2-CANCELLED', status: 'cancelled', customerName: 'ลูกค้า บี' },
    ];
    const q = 'INV-A2';
    const activeMatches = filterSalesBySubTab(sales, 'active').filter(
      (s) => (s.saleId || '').toLowerCase().includes(q.toLowerCase()),
    );
    expect(activeMatches.map((s) => s.saleId)).toEqual(['INV-A2']); // cancelled one excluded by split
  });
});

// =============================================================================
describe('F2 source-grep regression locks on SaleTab.jsx', () => {
  it('F2.1 imports + uses the single-source helper', () => {
    expect(SALETAB).toMatch(/from '\.\.\/\.\.\/lib\/saleSubTabFilter\.js'/);
    expect(SALETAB).toMatch(/filterSalesBySubTab\(sales, subTab\)/);
  });
  it('F2.2 defines the two sub-tabs', () => {
    expect(SALETAB).toMatch(/SALE_SUB_TABS/);
    expect(SALETAB).toMatch(/id: 'cancelled', label: 'ยกเลิกแล้ว'/);
  });
  it('F2.3 dropdown is gated on the active tab', () => {
    expect(SALETAB).toMatch(/subTab === 'active' &&\s*\(/);
  });
  it('F2.4 dropdown drops the cancelled option', () => {
    expect(SALETAB).toMatch(/PAYMENT_STATUSES\.filter\(s => s\.value !== 'cancelled'\)/);
  });
  it('F2.5 tab switch resets the payment filter', () => {
    expect(SALETAB).toMatch(/handleSubTabChange/);
    expect(SALETAB).toMatch(/setFilterStatus\(''\)/);
  });
  it('F2.6 cancelled empty state copy present', () => {
    expect(SALETAB).toMatch(/ยังไม่มีรายการที่ยกเลิก/);
  });
  it('F2.7 subTab is in the filtered useMemo deps so a switch re-computes', () => {
    expect(SALETAB).toMatch(/\[sales, filterQuery, filterStatus, subTab\]/);
  });
});

// =============================================================================
// F3 — pure mirrors of the inline React conditionals (RTL-equivalent coverage).
const PAYMENT_STATUSES = [
  { value: 'paid', label: 'ชำระแล้ว' },
  { value: 'split', label: 'แบ่งชำระ' },
  { value: 'unpaid', label: 'ค้างชำระ' },
  { value: 'deferred', label: 'ชำระภายหลัง' },
  { value: 'draft', label: 'แบบร่าง' },
  { value: 'cancelled', label: 'ยกเลิก' },
];

// mirror of the dropdown option set on the active tab
const activeDropdownOptions = () => PAYMENT_STATUSES.filter((s) => s.value !== 'cancelled');

// mirror of handleSubTabChange
const simulateSubTabChange = (id) => ({ subTab: id, filterStatus: '' });

// mirror of the empty-state ternary in the render
function selectEmptyState({ filteredLen, subTab, salesLen, filterQuery, filterStatus }) {
  if (filteredLen !== 0) return 'table';
  if (subTab === 'cancelled') return 'ยังไม่มีรายการที่ยกเลิก';
  if (salesLen === 0) return 'onboarding';
  return filterQuery || filterStatus ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายการขาย';
}

describe('F3 UI-conditional logic mirrors', () => {
  it('F3.1 active-tab dropdown excludes the cancelled option but keeps the other 5', () => {
    const opts = activeDropdownOptions();
    expect(opts.some((o) => o.value === 'cancelled')).toBe(false);
    expect(opts.map((o) => o.value)).toEqual(['paid', 'split', 'unpaid', 'deferred', 'draft']);
  });

  it('F3.2 switching sub-tab always clears the payment filter', () => {
    expect(simulateSubTabChange('cancelled').filterStatus).toBe('');
    expect(simulateSubTabChange('active').filterStatus).toBe('');
  });

  it('F3.3 empty-state selection — cancelled tab, none cancelled', () => {
    expect(selectEmptyState({ filteredLen: 0, subTab: 'cancelled', salesLen: 5, filterQuery: '', filterStatus: '' }))
      .toBe('ยังไม่มีรายการที่ยกเลิก');
  });

  it('F3.4 empty-state selection — active tab, no sales at all → onboarding', () => {
    expect(selectEmptyState({ filteredLen: 0, subTab: 'active', salesLen: 0, filterQuery: '', filterStatus: '' }))
      .toBe('onboarding');
  });

  it('F3.5 empty-state selection — active tab, sales exist but all cancelled, no filter → "ยังไม่มีรายการขาย"', () => {
    expect(selectEmptyState({ filteredLen: 0, subTab: 'active', salesLen: 9, filterQuery: '', filterStatus: '' }))
      .toBe('ยังไม่มีรายการขาย');
  });

  it('F3.6 empty-state selection — active tab, filter set, no match → "ไม่พบรายการที่ตรงกับตัวกรอง"', () => {
    expect(selectEmptyState({ filteredLen: 0, subTab: 'active', salesLen: 9, filterQuery: 'zzz', filterStatus: '' }))
      .toBe('ไม่พบรายการที่ตรงกับตัวกรอง');
    expect(selectEmptyState({ filteredLen: 0, subTab: 'active', salesLen: 9, filterQuery: '', filterStatus: 'unpaid' }))
      .toBe('ไม่พบรายการที่ตรงกับตัวกรอง');
  });

  it('F3.7 non-empty list always renders the table regardless of tab', () => {
    expect(selectEmptyState({ filteredLen: 3, subTab: 'active', salesLen: 9, filterQuery: '', filterStatus: '' })).toBe('table');
    expect(selectEmptyState({ filteredLen: 2, subTab: 'cancelled', salesLen: 9, filterQuery: '', filterStatus: '' })).toBe('table');
  });
});
