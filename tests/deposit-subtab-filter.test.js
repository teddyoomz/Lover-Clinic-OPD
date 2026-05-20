import { describe, it, expect } from 'vitest';
import {
  ACTIVE_DEPOSIT_STATUSES,
  FINISHED_DEPOSIT_STATUSES,
  isFinishedDeposit,
  filterDepositsBySubTab,
} from '../src/lib/depositSubTabFilter.js';

const mk = (id, status) => ({ depositId: id, status });
const ACTIVE = mk('DEP-1', 'active');
const PARTIAL = mk('DEP-2', 'partial');
const USED = mk('DEP-3', 'used');
const CANCELLED = mk('DEP-4', 'cancelled');
const REFUNDED = mk('DEP-5', 'refunded');
const EXPIRED = mk('DEP-6', 'expired');
const NOSTATUS = { depositId: 'DEP-7' };

describe('depositSubTabFilter — A. status sets', () => {
  it('A.1 active set = active + partial (matches codebase usable convention)', () => {
    expect(ACTIVE_DEPOSIT_STATUSES).toEqual(['active', 'partial']);
  });
  it('A.2 finished set = used + cancelled + refunded + expired', () => {
    expect(FINISHED_DEPOSIT_STATUSES).toEqual(['used', 'cancelled', 'refunded', 'expired']);
  });
  it('A.3 the two sets are disjoint', () => {
    expect(ACTIVE_DEPOSIT_STATUSES.some((s) => FINISHED_DEPOSIT_STATUSES.includes(s))).toBe(false);
  });
});

describe('depositSubTabFilter — B. predicate isFinishedDeposit', () => {
  it('B.1 used/cancelled/refunded/expired → true', () => {
    expect([USED, CANCELLED, REFUNDED, EXPIRED].map(isFinishedDeposit)).toEqual([true, true, true, true]);
  });
  it('B.2 active/partial → false', () => {
    expect([ACTIVE, PARTIAL].map(isFinishedDeposit)).toEqual([false, false]);
  });
  it('B.3 missing status / null / undefined → false (stays usable side)', () => {
    expect(isFinishedDeposit(NOSTATUS)).toBe(false);
    expect(isFinishedDeposit(null)).toBe(false);
    expect(isFinishedDeposit(undefined)).toBe(false);
  });
});

describe('depositSubTabFilter — C. partition', () => {
  const all = [ACTIVE, PARTIAL, USED, CANCELLED, REFUNDED, EXPIRED];
  it('C.1 active pill keeps only active + partial', () => {
    const r = filterDepositsBySubTab(all, 'active');
    expect(r.map((d) => d.depositId)).toEqual(['DEP-1', 'DEP-2']);
  });
  it('C.2 finished pill keeps only the 4 terminal statuses', () => {
    const r = filterDepositsBySubTab(all, 'finished');
    expect(r.map((d) => d.depositId)).toEqual(['DEP-3', 'DEP-4', 'DEP-5', 'DEP-6']);
  });
  it('C.3 partition complete + disjoint', () => {
    const act = filterDepositsBySubTab(all, 'active');
    const fin = filterDepositsBySubTab(all, 'finished');
    expect(act.length + fin.length).toBe(all.length);
    expect(act.some((d) => fin.includes(d))).toBe(false);
  });
  it('C.4 unknown subTab defaults to active behaviour', () => {
    expect(filterDepositsBySubTab(all, 'whatever').map((d) => d.depositId)).toEqual(['DEP-1', 'DEP-2']);
  });
});

describe('depositSubTabFilter — D. adversarial', () => {
  it('D.1 non-array input → []', () => {
    expect(filterDepositsBySubTab(null, 'active')).toEqual([]);
    expect(filterDepositsBySubTab(undefined, 'finished')).toEqual([]);
    expect(filterDepositsBySubTab({}, 'active')).toEqual([]);
  });
  it('D.2 empty array → []', () => expect(filterDepositsBySubTab([], 'finished')).toEqual([]));
  it('D.3 null members tolerated', () => {
    expect(filterDepositsBySubTab([null, ACTIVE, undefined, USED], 'finished')).toEqual([USED]);
  });
  it('D.4 unknown status (not in either set) → active pill (stays visible)', () => {
    const weird = mk('DEP-X', 'frozen');
    expect(filterDepositsBySubTab([weird], 'active')).toEqual([weird]);
    expect(filterDepositsBySubTab([weird], 'finished')).toEqual([]);
  });
  it('D.5 missing-status deposit → active pill', () => {
    expect(filterDepositsBySubTab([NOSTATUS], 'active')).toEqual([NOSTATUS]);
    expect(filterDepositsBySubTab([NOSTATUS], 'finished')).toEqual([]);
  });
  it('D.6 Thai customerName + commas do not affect partition', () => {
    const t = { depositId: 'DEP-ก', status: 'refunded', customerName: 'นางสาว วันเพ็ญ เดือนสิบสอง' };
    expect(filterDepositsBySubTab([t], 'finished')).toEqual([t]);
  });
  it('D.7 idempotent — re-filtering active yields same set', () => {
    const all = [ACTIVE, PARTIAL, USED];
    const once = filterDepositsBySubTab(all, 'active');
    expect(filterDepositsBySubTab(once, 'active')).toEqual(once);
  });
  it('D.8 forward-compat — unknown fields preserved', () => {
    const f = { depositId: 'DEP-f', status: 'used', _futureField: 99 };
    expect(filterDepositsBySubTab([f], 'finished')[0]._futureField).toBe(99);
  });
});
