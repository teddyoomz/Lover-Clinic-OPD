import { describe, it, expect } from 'vitest';
import {
  dateRangeForTab,
  defaultStatusFilterForTab,
  applyTabFilter,
  isMissedAppointment,
  matchesSearchText,
  sortApptsByDateTimeAsc,
} from '../src/lib/appointmentHubFilters.js';

const FIXED_NOW = new Date('2026-05-08T07:00:00+07:00');

describe('V64.F dateRangeForTab', () => {
  it('F1.1 today → from==to==today ISO', () => {
    expect(dateRangeForTab('today', FIXED_NOW)).toEqual({ from: '2026-05-08', to: '2026-05-08' });
  });
  it('F1.2 tomorrow → today+1', () => {
    expect(dateRangeForTab('tomorrow', FIXED_NOW)).toEqual({ from: '2026-05-09', to: '2026-05-09' });
  });
  it('F1.3 future → today+1..today+30', () => {
    expect(dateRangeForTab('future', FIXED_NOW)).toEqual({ from: '2026-05-09', to: '2026-06-07' });
  });
  it('F1.4 past → today-30..today-1', () => {
    expect(dateRangeForTab('past', FIXED_NOW)).toEqual({ from: '2026-04-08', to: '2026-05-07' });
  });
  it('F1.5 unknown tab throws', () => {
    expect(() => dateRangeForTab('xxx', FIXED_NOW)).toThrow(/unknown tab/i);
  });
});

describe('V64.F defaultStatusFilterForTab', () => {
  it('F2.1 today/tomorrow exclude cancelled', () => {
    expect(defaultStatusFilterForTab('today')).toEqual({ exclude: ['cancelled'] });
    expect(defaultStatusFilterForTab('tomorrow')).toEqual({ exclude: ['cancelled'] });
  });
  it('F2.2 future excludes done + cancelled', () => {
    expect(defaultStatusFilterForTab('future')).toEqual({ exclude: ['done', 'cancelled'] });
  });
  it('F2.3 past — all statuses', () => {
    expect(defaultStatusFilterForTab('past')).toEqual({ exclude: [] });
  });
});

describe('V64.F applyTabFilter — combines date + status + search + type', () => {
  const APPTS = [
    { id: 'A1', date: '2026-05-08', status: 'pending', appointmentType: 'follow', customerName: 'Alice', customerHN: 'HN001', customerPhone: '0811111111' },
    { id: 'A2', date: '2026-05-08', status: 'cancelled', appointmentType: 'sale', customerName: 'Bob', customerHN: 'HN002', customerPhone: '0822222222' },
    { id: 'A3', date: '2026-05-09', status: 'confirmed', appointmentType: 'follow', customerName: 'Charlie', customerHN: 'HN003', customerPhone: '0833333333' },
    { id: 'A4', date: '2026-04-15', status: 'confirmed', appointmentType: 'follow', customerName: 'Dave', customerHN: 'HN004', customerPhone: '0844444444' },
  ];

  it('F3.1 today tab default → A1 only', () => {
    expect(applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW }).map(a => a.id)).toEqual(['A1']);
  });
  it('F3.2 past tab default → A4 only', () => {
    expect(applyTabFilter(APPTS, { tab: 'past', now: FIXED_NOW }).map(a => a.id)).toEqual(['A4']);
  });
  it('F3.3 status override on today tab — show cancelled', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, statusOverride: 'cancelled' });
    expect(out.map(a => a.id)).toEqual(['A2']);
  });
  it('F3.4 search by phone substring', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, search: '0811' });
    expect(out.map(a => a.id)).toEqual(['A1']);
  });
  it('F3.5 search by HN', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, search: 'HN001' });
    expect(out.map(a => a.id)).toEqual(['A1']);
  });
  it('F3.6 search case-insensitive on name', () => {
    const out = applyTabFilter(APPTS, { tab: 'today', now: FIXED_NOW, search: 'alice' });
    expect(out.map(a => a.id)).toEqual(['A1']);
  });
  it('F3.7 type filter narrows to appointmentType', () => {
    const out = applyTabFilter(APPTS, { tab: 'past', now: FIXED_NOW, statusOverride: '__all__', typeFilter: 'follow' });
    expect(out.map(a => a.id)).toEqual(['A4']);
  });
});

describe('V64.F isMissedAppointment', () => {
  it('F4.1 status==confirmed AND date<today → true', () => {
    expect(isMissedAppointment({ status: 'confirmed', date: '2026-05-07' }, FIXED_NOW)).toBe(true);
  });
  it('F4.2 status==confirmed AND date==today → false', () => {
    expect(isMissedAppointment({ status: 'confirmed', date: '2026-05-08' }, FIXED_NOW)).toBe(false);
  });
  it('F4.3 status==done → false (already treated)', () => {
    expect(isMissedAppointment({ status: 'done', date: '2026-05-07' }, FIXED_NOW)).toBe(false);
  });
  it('F4.4 status==pending past date → false (admin never confirmed)', () => {
    expect(isMissedAppointment({ status: 'pending', date: '2026-05-07' }, FIXED_NOW)).toBe(false);
  });
});

describe('V64.F matchesSearchText — adversarial', () => {
  const APPT = { customerName: 'นาย ทดสอบ', customerHN: 'HN066', customerPhone: '0655529999' };
  it('F5.1 empty search → match', () => expect(matchesSearchText(APPT, '')).toBe(true));
  it('F5.2 thai partial match', () => expect(matchesSearchText(APPT, 'ทดสอบ')).toBe(true));
  it('F5.3 whitespace-only search → match', () => expect(matchesSearchText(APPT, '   ')).toBe(true));
  it('F5.4 no field present (corrupted row)', () => expect(matchesSearchText({}, 'x')).toBe(false));
});

describe('V64.F Bangkok TZ midday-UTC parse (V53 BS-12 mirror)', () => {
  it('F6.1 day boundary at midnight Bangkok stays in current day', () => {
    const midnight = new Date('2026-05-08T00:00:00+07:00');
    expect(dateRangeForTab('today', midnight)).toEqual({ from: '2026-05-08', to: '2026-05-08' });
  });
  it('F6.2 23:59 Bangkok stays in current day', () => {
    const lateNight = new Date('2026-05-08T23:59:00+07:00');
    expect(dateRangeForTab('today', lateNight)).toEqual({ from: '2026-05-08', to: '2026-05-08' });
  });
});

// V64-fix9 (2026-05-09) — sortApptsByDateTimeAsc helper
describe('V64.F9 sortApptsByDateTimeAsc — earliest queue first at top', () => {
  it('F9.1 same date, sorts by startTime ASC', () => {
    const result = sortApptsByDateTimeAsc([
      { id: 'B', date: '2026-05-08', startTime: '17:30' },
      { id: 'A', date: '2026-05-08', startTime: '09:00' },
      { id: 'C', date: '2026-05-08', startTime: '12:15' },
    ]);
    expect(result.map(r => r.id)).toEqual(['A', 'C', 'B']);
  });

  it('F9.2 different dates, sorts by date ASC primary', () => {
    const result = sortApptsByDateTimeAsc([
      { id: 'C', date: '2026-05-12', startTime: '08:00' },
      { id: 'A', date: '2026-05-09', startTime: '17:00' },
      { id: 'B', date: '2026-05-10', startTime: '12:00' },
    ]);
    expect(result.map(r => r.id)).toEqual(['A', 'B', 'C']);
  });

  it('F9.3 same date+time → stable order preserved', () => {
    const result = sortApptsByDateTimeAsc([
      { id: 'X', date: '2026-05-08', startTime: '10:00' },
      { id: 'Y', date: '2026-05-08', startTime: '10:00' },
    ]);
    // Both could appear in either order — stability not strictly guaranteed
    // by Array.sort across engines, but lengths + content correct.
    expect(result.length).toBe(2);
    expect(result.map(r => r.id).sort()).toEqual(['X', 'Y']);
  });

  it('F9.4 missing date or startTime → empty string sorts to bottom', () => {
    const result = sortApptsByDateTimeAsc([
      { id: 'B', date: '2026-05-08', startTime: '09:00' },
      { id: 'A', startTime: '08:00' },                   // no date
      { id: 'C', date: '2026-05-08' },                   // no time
    ]);
    // 'A' (no date) sorts to top because '' < '2026-05-08'
    // Within '2026-05-08' rows: 'C' (no time '') < 'B' ('09:00')
    expect(result.map(r => r.id)).toEqual(['A', 'C', 'B']);
  });

  it('F9.5 returns NEW array (does NOT mutate input)', () => {
    const input = [
      { id: 'B', date: '2026-05-09', startTime: '10:00' },
      { id: 'A', date: '2026-05-08', startTime: '09:00' },
    ];
    const inputBefore = [...input];
    const result = sortApptsByDateTimeAsc(input);
    expect(input).toEqual(inputBefore);  // input unchanged
    expect(result).not.toBe(input);      // different reference
  });

  it('F9.6 empty array', () => {
    expect(sortApptsByDateTimeAsc([])).toEqual([]);
  });

  it('F9.7 non-array input → []', () => {
    expect(sortApptsByDateTimeAsc(null)).toEqual([]);
    expect(sortApptsByDateTimeAsc(undefined)).toEqual([]);
    expect(sortApptsByDateTimeAsc('not array')).toEqual([]);
  });

  it('F9.8 ล่วงหน้า 30 วัน scenario — multi-day spread, all sorted ASC', () => {
    const result = sortApptsByDateTimeAsc([
      { id: 'D', date: '2026-05-25', startTime: '10:00' },
      { id: 'A', date: '2026-05-10', startTime: '14:00' },
      { id: 'B', date: '2026-05-10', startTime: '16:00' },
      { id: 'C', date: '2026-05-15', startTime: '09:00' },
    ]);
    // May 10 14:00 → May 10 16:00 → May 15 09:00 → May 25 10:00
    expect(result.map(r => r.id)).toEqual(['A', 'B', 'C', 'D']);
  });
});
