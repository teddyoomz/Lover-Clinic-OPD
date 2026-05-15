// V71 — Today sub-pill filter (กำลังรอ / เสร็จแล้ว).
// applyTabFilter accepts `todaySubPill: 'waiting'|'completed'` — ignored unless tab==='today'.
// subPillCountsForToday derives counts from same apptList.

import { describe, it, expect } from 'vitest';
import { applyTabFilter, subPillCountsForToday } from '../src/lib/appointmentHubFilters.js';

const now = new Date('2026-05-15T10:00:00+07:00');
const today = '2026-05-15';

const baseAppts = [
  { id: 'A1', date: today, startTime: '10:00', status: 'confirmed', serviceCompletedAt: null },
  { id: 'A2', date: today, startTime: '11:00', status: 'confirmed', serviceCompletedAt: { seconds: 12345 } },
  { id: 'A3', date: today, startTime: '12:00', status: 'pending', serviceCompletedAt: null },
  { id: 'A4', date: '2026-05-16', startTime: '09:00', status: 'pending', serviceCompletedAt: null },
];

describe('V71 applyTabFilter todaySubPill', () => {
  it('S2.1 today + waiting → only !serviceCompletedAt rows', () => {
    const out = applyTabFilter(baseAppts, { tab: 'today', todaySubPill: 'waiting', now });
    expect(out.map(a => a.id).sort()).toEqual(['A1', 'A3']);
  });

  it('S2.2 today + completed → only serviceCompletedAt!=null rows', () => {
    const out = applyTabFilter(baseAppts, { tab: 'today', todaySubPill: 'completed', now });
    expect(out.map(a => a.id)).toEqual(['A2']);
  });

  it('S2.3 today + no todaySubPill → both (legacy default = all today rows)', () => {
    const out = applyTabFilter(baseAppts, { tab: 'today', now });
    expect(out.map(a => a.id).sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('S2.4 tomorrow tab — todaySubPill param ignored', () => {
    const out = applyTabFilter(baseAppts, { tab: 'tomorrow', todaySubPill: 'completed', now });
    expect(out.map(a => a.id)).toEqual(['A4']);
  });
});

describe('V71 subPillCountsForToday', () => {
  it('S2.5 derives waiting/completed counts from apptList', () => {
    const counts = subPillCountsForToday(baseAppts, now);
    expect(counts).toEqual({ waiting: 2, completed: 1 });
  });

  it('S2.6 ignores non-today appts', () => {
    const onlyTomorrow = [
      { id: 'X', date: '2026-05-16', status: 'confirmed', serviceCompletedAt: null },
    ];
    expect(subPillCountsForToday(onlyTomorrow, now)).toEqual({ waiting: 0, completed: 0 });
  });

  it('S2.7 handles serviceCompletedAt as Firestore Timestamp object (truthy check, not value)', () => {
    const fsTimestamp = { toDate: () => new Date(), seconds: 1, nanoseconds: 0 };
    const list = [
      { id: 'A', date: today, status: 'confirmed', serviceCompletedAt: fsTimestamp },
    ];
    expect(subPillCountsForToday(list, now)).toEqual({ waiting: 0, completed: 1 });
  });
});
