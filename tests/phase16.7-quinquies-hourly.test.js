// tests/phase16.7-quinquies-hourly.test.js — Phase 16.7-quinquies (2026-04-29 session 33)
//
// computeHourlyFromSchedules coverage. Pure helper; uses local Date.

import { describe, it, expect } from 'vitest';
import { computeHourlyFromSchedules } from '../src/lib/payrollHelpers.js';

const persons = [{ id: 'D-1', hourlyIncome: 300 }, { id: 'S-1', hourlyIncome: 100 }];

describe('HR.A — single shift', () => {
  it('HR.A.1 — 3-hour shift × 300 ฿/hr = 900 ฿', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.get('D-1').totalAmount).toBe(900);
    expect(m.get('D-1').totalHours).toBe(3);
  });
});

describe('HR.B — type filtering', () => {
  it('HR.B.1 — type=leave → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'leave' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.size).toBe(0);
  });
  it('HR.B.2 — type=off → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'off' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.size).toBe(0);
  });
  it('HR.B.3 — type=holiday → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'holiday' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
  it('HR.B.4 — status=cancelled → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work', status: 'cancelled' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
});

describe('HR.C — endTime > now (not yet elapsed)', () => {
  it('HR.C.1 — endTime in the future → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '23:00', type: 'work' }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 12, 0));
    expect(m.size).toBe(0);
  });
});

describe('HR.D — multiple shifts same day', () => {
  it('HR.D.1 — morning + evening shifts both elapse → sum', () => {
    const schedules = [
      { staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' },
      { staffId: 'D-1', date: '2026-04-29', startTime: '13:00', endTime: '17:00', type: 'work' },
    ];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0));
    expect(m.get('D-1').totalHours).toBe(7);
    expect(m.get('D-1').totalAmount).toBe(2100);
  });
});

describe('HR.E — branch filter', () => {
  it('HR.E.1 — branchIds=[BR-A] excludes schedule with branchId=BR-B', () => {
    const schedules = [
      { staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work', branchId: 'BR-A' },
      { staffId: 'D-1', date: '2026-04-29', startTime: '13:00', endTime: '17:00', type: 'work', branchId: 'BR-B' },
    ];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] }, new Date(2026, 3, 29, 23, 0));
    expect(m.get('D-1').totalHours).toBe(3);
  });
});

describe('HR.F — adversarial', () => {
  it('HR.F.1 — null schedules → empty Map', () => {
    expect(computeHourlyFromSchedules(null, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date()).size).toBe(0);
  });
  it('HR.F.2 — hourlyIncome=0 → person skipped', () => {
    const persons2 = [{ id: 'D-1', hourlyIncome: 0 }];
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '09:00', endTime: '12:00', type: 'work' }];
    expect(computeHourlyFromSchedules(schedules, persons2, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
  it('HR.F.3 — endTime <= startTime → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2026-04-29', startTime: '12:00', endTime: '09:00', type: 'work' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
  it('HR.F.4 — date out of range → skipped', () => {
    const schedules = [{ staffId: 'D-1', date: '2025-12-29', startTime: '09:00', endTime: '12:00', type: 'work' }];
    expect(computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 29, 23, 0)).size).toBe(0);
  });
});
