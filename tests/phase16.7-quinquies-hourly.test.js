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

describe('HR.G — recurring schedules (Phase 16.7-quinquies-bis)', () => {
  // April 2026 calendar: Mondays = 6, 13, 20, 27. Sundays = 5, 12, 19, 26.
  // dayOfWeek: 0=Sun, 1=Mon, ..., 6=Sat
  it('HR.G.1 — recurring Monday × 4.5h × 300 ฿ = 4 × 1350 = 5400 ฿ when all 4 Mondays elapsed', () => {
    const schedules = [{
      staffId: 'D-1', date: '', dayOfWeek: 1,
      startTime: '08:30', endTime: '13:00', type: 'recurring',
    }];
    // Now = end of April 2026 (after April 27 Monday)
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 30, 23, 59));
    expect(m.get('D-1').totalHours).toBe(18); // 4.5 × 4 Mondays
    expect(m.get('D-1').totalAmount).toBe(5400); // 18 × 300
  });

  it('HR.G.2 — leave override on a Monday excludes that occurrence', () => {
    const schedules = [
      { staffId: 'D-1', date: '', dayOfWeek: 1, startTime: '08:30', endTime: '13:00', type: 'recurring' },
      { staffId: 'D-1', date: '2026-04-13', dayOfWeek: null, startTime: '', endTime: '', type: 'leave' },
    ];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 30, 23, 59));
    // 3 Mondays counted (April 6, 20, 27); April 13 excluded by leave override
    expect(m.get('D-1').totalHours).toBe(13.5); // 4.5 × 3
    expect(m.get('D-1').totalAmount).toBe(4050); // 13.5 × 300
  });

  it('HR.G.3 — recurring future occurrence (endTime > now) is skipped', () => {
    const schedules = [{
      staffId: 'D-1', date: '', dayOfWeek: 1,
      startTime: '08:30', endTime: '13:00', type: 'recurring',
    }];
    // Now = April 14, 2026 — after April 6 + 13 Mondays elapsed; April 20 + 27 still future
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 14, 0, 0));
    expect(m.get('D-1').totalHours).toBe(9); // 4.5 × 2
  });

  it('HR.G.4 — invalid dayOfWeek (null/undefined/7) skipped', () => {
    const schedules = [
      { staffId: 'D-1', date: '', dayOfWeek: null, startTime: '08:30', endTime: '13:00', type: 'recurring' },
      { staffId: 'D-1', date: '', dayOfWeek: 7, startTime: '08:30', endTime: '13:00', type: 'recurring' },
      { staffId: 'D-1', date: '', startTime: '08:30', endTime: '13:00', type: 'recurring' }, // missing
    ];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 30, 23, 59));
    expect(m.size).toBe(0);
  });

  it('HR.G.5 — type="weekly" alias also works', () => {
    const schedules = [{
      staffId: 'D-1', date: '', dayOfWeek: 1, // Monday
      startTime: '09:00', endTime: '12:00', type: 'weekly',
    }];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 30, 23, 59));
    expect(m.get('D-1').totalHours).toBe(12); // 3h × 4 Mondays
  });

  it('HR.G.6 — recurring + per-date entries combine correctly', () => {
    const schedules = [
      { staffId: 'D-1', date: '', dayOfWeek: 1, startTime: '09:00', endTime: '12:00', type: 'recurring' }, // Mondays × 3h
      { staffId: 'D-1', date: '2026-04-29', startTime: '14:00', endTime: '18:00', type: 'work' }, // Wed extra 4h
    ];
    const m = computeHourlyFromSchedules(schedules, persons, { from: '2026-04-01', to: '2026-04-30' }, new Date(2026, 3, 30, 23, 59));
    expect(m.get('D-1').totalHours).toBe(16); // 12 (Mondays) + 4 (Wed)
    expect(m.get('D-1').totalAmount).toBe(4800);
  });

  it('HR.G.7 — branch filter on recurring entry', () => {
    const schedules = [
      { staffId: 'D-1', date: '', dayOfWeek: 1, startTime: '09:00', endTime: '12:00', type: 'recurring', branchId: 'BR-A' },
      { staffId: 'D-1', date: '', dayOfWeek: 2, startTime: '09:00', endTime: '12:00', type: 'recurring', branchId: 'BR-B' },
    ];
    const m = computeHourlyFromSchedules(
      schedules, persons,
      { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] },
      new Date(2026, 3, 30, 23, 59),
    );
    expect(m.get('D-1').totalHours).toBe(12); // Mondays only — BR-B Tuesdays excluded
  });

  it('HR.G.8 — recurring with empty branchId still counted (no filter applied)', () => {
    const schedules = [{
      staffId: 'D-1', date: '', dayOfWeek: 1,
      startTime: '09:00', endTime: '12:00', type: 'recurring', branchId: '',
    }];
    const m = computeHourlyFromSchedules(
      schedules, persons,
      { from: '2026-04-01', to: '2026-04-30', branchIds: ['BR-A'] },
      new Date(2026, 3, 30, 23, 59),
    );
    expect(m.get('D-1').totalHours).toBe(12); // empty branchId on schedule → not filtered out
  });
});
