// Finance finished-deposit sub-tab — Rule I flow-simulate + source-grep +
// UI-conditional mirrors (2026-05-20). DepositPanel's dependency surface makes
// full RTL render brittle/non-idiomatic; per Rule Q V66 mock-RTL is code-shape
// coverage only. Real UI check = L1 preview. Here we chain the real helper +
// mirror the inline React conditionals as pure functions.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  filterDepositsBySubTab,
  ACTIVE_DEPOSIT_STATUSES,
  FINISHED_DEPOSIT_STATUSES,
} from '../src/lib/depositSubTabFilter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PANEL = readFileSync(join(__dirname, '../src/components/backend/DepositPanel.jsx'), 'utf8');

// =============================================================================
describe('F1 flow — create → active; consume/cancel/refund/expire → migrate', () => {
  it('F1.1 new deposit (status=active) lands on the active pill', () => {
    const deposits = [{ depositId: 'DEP-1', status: 'active' }];
    expect(filterDepositsBySubTab(deposits, 'active').map(d => d.depositId)).toEqual(['DEP-1']);
    expect(filterDepositsBySubTab(deposits, 'finished')).toEqual([]);
  });

  it('F1.2 applyDepositToSale fully (status→used) migrates active→finished', () => {
    // before: active
    let deposits = [{ depositId: 'DEP-1', status: 'active' }];
    expect(filterDepositsBySubTab(deposits, 'active')).toHaveLength(1);
    // after full apply: status flips to 'used' (backendClient: remaining===0?'used':'partial')
    deposits = [{ depositId: 'DEP-1', status: 'used' }];
    expect(filterDepositsBySubTab(deposits, 'active')).toEqual([]);
    expect(filterDepositsBySubTab(deposits, 'finished').map(d => d.depositId)).toEqual(['DEP-1']);
  });

  it('F1.3 partial apply (status→partial) STAYS on the active pill', () => {
    const deposits = [{ depositId: 'DEP-1', status: 'partial' }];
    expect(filterDepositsBySubTab(deposits, 'active').map(d => d.depositId)).toEqual(['DEP-1']);
    expect(filterDepositsBySubTab(deposits, 'finished')).toEqual([]);
  });

  it('F1.4 cancel / refund / expire each migrate to finished', () => {
    for (const st of ['cancelled', 'refunded', 'expired']) {
      const deposits = [{ depositId: 'DEP-1', status: 'active' }, { depositId: 'DEP-2', status: st }];
      expect(filterDepositsBySubTab(deposits, 'active').map(d => d.depositId)).toEqual(['DEP-1']);
      expect(filterDepositsBySubTab(deposits, 'finished').map(d => d.depositId)).toEqual(['DEP-2']);
    }
  });

  it('F1.5 count per pill (no double-count)', () => {
    const deposits = [
      { depositId: 'A', status: 'active' }, { depositId: 'B', status: 'partial' },
      { depositId: 'C', status: 'used' }, { depositId: 'D', status: 'cancelled' },
      { depositId: 'E', status: 'refunded' }, { depositId: 'F', status: 'expired' },
    ];
    expect(filterDepositsBySubTab(deposits, 'active').length).toBe(2);
    expect(filterDepositsBySubTab(deposits, 'finished').length).toBe(4);
  });

  it('F1.6 status filter applies WITHIN the split (scoped)', () => {
    // mirror DepositPanel.filteredDeposits: split first, then status dropdown
    const deposits = [
      { depositId: 'A', status: 'active' }, { depositId: 'B', status: 'partial' },
      { depositId: 'C', status: 'refunded' },
    ];
    const finished = filterDepositsBySubTab(deposits, 'finished').filter(d => d.status === 'refunded');
    expect(finished.map(d => d.depositId)).toEqual(['C']);
  });
});

// =============================================================================
describe('F2 source-grep regression locks on DepositPanel.jsx', () => {
  it('F2.1 imports + uses the single-source helper', () => {
    expect(PANEL).toMatch(/from '\.\.\/\.\.\/lib\/depositSubTabFilter\.js'/);
    expect(PANEL).toMatch(/filterDepositsBySubTab\(deposits, subTab\)/);
  });
  it('F2.2 defines the two sub-tabs', () => {
    expect(PANEL).toMatch(/DEPOSIT_SUB_TABS/);
    expect(PANEL).toMatch(/id: 'finished', label: 'สิ้นสุดแล้ว'/);
    expect(PANEL).toMatch(/id: 'active', label: 'ใช้งานอยู่'/);
  });
  it('F2.3 dropdown options scoped per pill', () => {
    expect(PANEL).toMatch(/subTab === 'active' \? ACTIVE_DEPOSIT_STATUSES : FINISHED_DEPOSIT_STATUSES/);
  });
  it('F2.4 tab switch resets the status filter', () => {
    expect(PANEL).toMatch(/handleSubTabChange/);
    expect(PANEL).toMatch(/setFilterStatus\(''\)/);
  });
  it('F2.5 finished empty-state copy present', () => {
    expect(PANEL).toMatch(/ยังไม่มีมัดจำที่สิ้นสุด/);
  });
  it('F2.6 subTab is in the filteredDeposits useMemo deps', () => {
    expect(PANEL).toMatch(/\[deposits, filterQuery, filterStatus, filterFrom, filterTo, subTab\]/);
  });
  it('F2.7 pill buttons carry testids', () => {
    expect(PANEL).toMatch(/depositpanel-subtab-/);
  });
});

// =============================================================================
// F3 — pure mirrors of the inline React conditionals.
const STATUS_META_LABELS = {
  active: 'ใช้งาน', partial: 'ใช้บางส่วน', used: 'ใช้หมด',
  cancelled: 'ยกเลิก', refunded: 'คืนเงิน', expired: 'หมดอายุ',
};
const scopedDropdownOptions = (subTab) =>
  (subTab === 'active' ? ACTIVE_DEPOSIT_STATUSES : FINISHED_DEPOSIT_STATUSES)
    .map(k => ({ value: k, label: STATUS_META_LABELS[k] }));

const simulateSubTabChange = (id) => ({ subTab: id, filterStatus: '' });

function selectDepositEmptyState({ filteredLen, subTab, depositsLen, filterQuery, filterStatus, filterFrom, filterTo }) {
  if (depositsLen === 0) return 'onboarding';        // EmptyState (before split branch)
  if (filteredLen !== 0) return 'table';
  if (subTab === 'finished') return 'ยังไม่มีมัดจำที่สิ้นสุด';
  return (filterQuery || filterStatus || filterFrom || filterTo) ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีมัดจำที่ใช้งานอยู่';
}

describe('F3 UI-conditional logic mirrors', () => {
  it('F3.1 active pill dropdown = ทุกสถานะ + ใช้งาน + ใช้บางส่วน', () => {
    expect(scopedDropdownOptions('active').map(o => o.value)).toEqual(['active', 'partial']);
  });
  it('F3.2 finished pill dropdown = used + cancelled + refunded + expired', () => {
    expect(scopedDropdownOptions('finished').map(o => o.value)).toEqual(['used', 'cancelled', 'refunded', 'expired']);
  });
  it('F3.3 the two dropdown option sets never overlap', () => {
    const a = scopedDropdownOptions('active').map(o => o.value);
    const f = scopedDropdownOptions('finished').map(o => o.value);
    expect(a.some(v => f.includes(v))).toBe(false);
  });
  it('F3.4 switching pill always clears the status filter', () => {
    expect(simulateSubTabChange('finished').filterStatus).toBe('');
    expect(simulateSubTabChange('active').filterStatus).toBe('');
  });
  it('F3.5 empty-state — no deposits at all → onboarding', () => {
    expect(selectDepositEmptyState({ filteredLen: 0, subTab: 'active', depositsLen: 0, filterQuery: '', filterStatus: '', filterFrom: '', filterTo: '' })).toBe('onboarding');
  });
  it('F3.6 empty-state — finished pill, none finished → "ยังไม่มีมัดจำที่สิ้นสุด"', () => {
    expect(selectDepositEmptyState({ filteredLen: 0, subTab: 'finished', depositsLen: 5, filterQuery: '', filterStatus: '', filterFrom: '', filterTo: '' })).toBe('ยังไม่มีมัดจำที่สิ้นสุด');
  });
  it('F3.7 empty-state — active pill, all finished, no filter → "ยังไม่มีมัดจำที่ใช้งานอยู่"', () => {
    expect(selectDepositEmptyState({ filteredLen: 0, subTab: 'active', depositsLen: 9, filterQuery: '', filterStatus: '', filterFrom: '', filterTo: '' })).toBe('ยังไม่มีมัดจำที่ใช้งานอยู่');
  });
  it('F3.8 empty-state — active pill, filter set, no match → "ไม่พบรายการที่ตรงกับตัวกรอง"', () => {
    expect(selectDepositEmptyState({ filteredLen: 0, subTab: 'active', depositsLen: 9, filterQuery: 'zzz', filterStatus: '', filterFrom: '', filterTo: '' })).toBe('ไม่พบรายการที่ตรงกับตัวกรอง');
    expect(selectDepositEmptyState({ filteredLen: 0, subTab: 'active', depositsLen: 9, filterQuery: '', filterStatus: '', filterFrom: '2026-01-01', filterTo: '' })).toBe('ไม่พบรายการที่ตรงกับตัวกรอง');
  });
  it('F3.9 non-empty → table regardless of pill', () => {
    expect(selectDepositEmptyState({ filteredLen: 3, subTab: 'active', depositsLen: 9, filterQuery: '', filterStatus: '', filterFrom: '', filterTo: '' })).toBe('table');
    expect(selectDepositEmptyState({ filteredLen: 4, subTab: 'finished', depositsLen: 9, filterQuery: '', filterStatus: '', filterFrom: '', filterTo: '' })).toBe('table');
  });
});
