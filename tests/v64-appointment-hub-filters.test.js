import { describe, it, expect } from 'vitest';
import {
  dateRangeForTab,
  defaultStatusFilterForTab,
  applyTabFilter,
  isMissedAppointment,
  matchesSearchText,
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
