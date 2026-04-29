// tests/phase16.7-quinquies-payroll.test.js — Phase 16.7-quinquies (2026-04-29 session 33)
//
// computeAutoPayrollForPersons + clampPayDayToMonth coverage.
// Pure helpers; no Firebase; deterministic given inputs.

import { describe, it, expect } from 'vitest';
import {
  clampPayDayToMonth,
  computeAutoPayrollForPersons,
} from '../src/lib/payrollHelpers.js';

describe('PR.A — clampPayDayToMonth', () => {
  it('PR.A.1 — Feb non-leap: 31 → 28', () => {
    expect(clampPayDayToMonth('2026-02', 31)).toBe(28);
  });
  it('PR.A.2 — Feb leap year: 31 → 29', () => {
    expect(clampPayDayToMonth('2024-02', 31)).toBe(29);
  });
  it('PR.A.3 — Apr 30-day: 31 → 30', () => {
    expect(clampPayDayToMonth('2026-04', 31)).toBe(30);
  });
  it('PR.A.4 — Jul 31-day: 31 → 31', () => {
    expect(clampPayDayToMonth('2026-07', 31)).toBe(31);
  });
  it('PR.A.5 — Day 15: any month → 15', () => {
    expect(clampPayDayToMonth('2026-04', 15)).toBe(15);
    expect(clampPayDayToMonth('2026-02', 15)).toBe(15);
  });
  it('PR.A.6 — invalid yearMonth → 1', () => {
    expect(clampPayDayToMonth('', 25)).toBe(1);
    expect(clampPayDayToMonth('not-a-date', 25)).toBe(1);
  });
});

describe('PR.B — computeAutoPayrollForPersons single-month + single-person', () => {
  const persons = [{ id: 'D-1', salary: 30000, salaryDate: 25 }];
  const today = '2026-04-29';

  it('PR.B.1 — payDate in range AND payDate <= today → 1 entry', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, today);
    expect(m.size).toBe(1);
    expect(m.get('D-1').totalSalary).toBe(30000);
    expect(m.get('D-1').payDates).toEqual(['2026-04-25']);
  });

  it('PR.B.2 — payDate after today → skipped (future)', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-20');
    expect(m.size).toBe(0);
  });

  it('PR.B.3 — payDate before from → skipped', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-26', to: '2026-04-30' }, today);
    expect(m.size).toBe(0);
  });

  it('PR.B.4 — payDate after to → skipped', () => {
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-24' }, today);
    expect(m.size).toBe(0);
  });
});

describe('PR.C — multi-month range', () => {
  it('PR.C.1 — 3-month range × payday=15 → 3 entries when today >= last', () => {
    const persons = [{ id: 'D-1', salary: 10000, salaryDate: 15 }];
    const m = computeAutoPayrollForPersons(persons, { from: '2026-02-01', to: '2026-04-30' }, '2026-04-29');
    expect(m.get('D-1').totalSalary).toBe(30000);
    expect(m.get('D-1').payDates).toEqual(['2026-02-15', '2026-03-15', '2026-04-15']);
  });
});

describe('PR.D — Feb-31 clamp scenario', () => {
  it('PR.D.1 — payday=31 + Feb-only filter → 28 (non-leap)', () => {
    const persons = [{ id: 'D-1', salary: 10000, salaryDate: 31 }];
    const m = computeAutoPayrollForPersons(persons, { from: '2026-02-01', to: '2026-02-28' }, '2026-02-28');
    expect(m.get('D-1').payDates).toEqual(['2026-02-28']);
    expect(m.get('D-1').totalSalary).toBe(10000);
  });
});

describe('PR.E — adversarial inputs', () => {
  it('PR.E.1 — null persons → empty Map', () => {
    expect(computeAutoPayrollForPersons(null, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.2 — salary=0 → skipped', () => {
    const persons = [{ id: 'D-1', salary: 0, salaryDate: 25 }];
    expect(computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.3 — salaryDate=null → skipped', () => {
    const persons = [{ id: 'D-1', salary: 30000, salaryDate: null }];
    expect(computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.4 — salaryDate=32 → skipped', () => {
    const persons = [{ id: 'D-1', salary: 30000, salaryDate: 32 }];
    expect(computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29').size).toBe(0);
  });
  it('PR.E.5 — multiple persons → all aggregated', () => {
    const persons = [
      { id: 'D-1', salary: 30000, salaryDate: 25 },
      { id: 'S-1', salary: 25000, salaryDate: 1 },
    ];
    const m = computeAutoPayrollForPersons(persons, { from: '2026-04-01', to: '2026-04-30' }, '2026-04-29');
    expect(m.size).toBe(2);
    expect(m.get('D-1').totalSalary).toBe(30000);
    expect(m.get('S-1').totalSalary).toBe(25000);
  });
});
