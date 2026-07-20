// ─── Done-tab sort (2026-07-20) — วันนี้·เสร็จแล้ว เรียงคนที่เพิ่งกดเสร็จบนสุด ──
// S1 comparator unit (timestamp-shape safe) · S2 source-grep: HubView wires the
// comparator ONLY for today+completed; the 3 pre-existing sort branches stay
// (silent-regression guard for กำลังรอ / past / asc tabs).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  svcCompletedMs,
  sortApptsByServiceCompletedDesc,
  applyTabFilter,
} from '../src/lib/appointmentHubFilters.js';

const ts = (iso) => ({ toMillis: () => Date.parse(iso) }); // Firestore Timestamp shape
const secs = (iso) => ({ seconds: Math.floor(Date.parse(iso) / 1000), nanoseconds: 0 });

describe('S1 — svcCompletedMs + sortApptsByServiceCompletedDesc', () => {
  it('S1.1 handles Firestore Timestamp {toMillis}', () => {
    expect(svcCompletedMs(ts('2026-07-20T07:40:00.000Z'))).toBe(Date.parse('2026-07-20T07:40:00.000Z'));
  });
  it('S1.2 handles {seconds,nanoseconds} shape', () => {
    expect(svcCompletedMs(secs('2026-07-20T07:40:00.000Z'))).toBe(Date.parse('2026-07-20T07:40:00.000Z'));
  });
  it('S1.3 handles Date (optimistic stamp) + ISO string + number', () => {
    const d = new Date('2026-07-20T04:15:00.000Z');
    expect(svcCompletedMs(d)).toBe(d.getTime());
    expect(svcCompletedMs('2026-07-20T04:15:00.000Z')).toBe(d.getTime());
    expect(svcCompletedMs(d.getTime())).toBe(d.getTime());
  });
  it('S1.4 null/undefined/garbage → 0 (sorts to bottom)', () => {
    expect(svcCompletedMs(null)).toBe(0);
    expect(svcCompletedMs(undefined)).toBe(0);
    expect(svcCompletedMs('not-a-date')).toBe(0);
    expect(svcCompletedMs({ toMillis: () => { throw new Error('boom'); } })).toBe(0);
  });
  it('S1.5 desc order — most recently completed first (mixed shapes)', () => {
    const appts = [
      { id: 'A', serviceCompletedAt: ts('2026-07-20T07:02:00.000Z') },   // 14:02 BKK
      { id: 'B', serviceCompletedAt: secs('2026-07-20T04:15:00.000Z') }, // 11:15 BKK
      { id: 'C', serviceCompletedAt: new Date('2026-07-20T07:40:00.000Z') }, // 14:40 BKK
    ];
    expect(sortApptsByServiceCompletedDesc(appts).map(a => a.id)).toEqual(['C', 'A', 'B']);
  });
  it('S1.6 missing stamp sorts to bottom', () => {
    const appts = [
      { id: 'X', serviceCompletedAt: null },
      { id: 'Y', serviceCompletedAt: ts('2026-07-20T01:00:00.000Z') },
    ];
    expect(sortApptsByServiceCompletedDesc(appts).map(a => a.id)).toEqual(['Y', 'X']);
  });
  it('S1.7 returns NEW array, does not mutate input; non-array → []', () => {
    const input = [
      { id: 'A', serviceCompletedAt: ts('2026-07-20T01:00:00.000Z') },
      { id: 'B', serviceCompletedAt: ts('2026-07-20T02:00:00.000Z') },
    ];
    const before = input.map(a => a.id);
    const out = sortApptsByServiceCompletedDesc(input);
    expect(input.map(a => a.id)).toEqual(before);
    expect(out).not.toBe(input);
    expect(sortApptsByServiceCompletedDesc(null)).toEqual([]);
    expect(sortApptsByServiceCompletedDesc(undefined)).toEqual([]);
  });
  it('S1.8 chains with the real completed sub-pill filter (Rule I mini-chain)', () => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const appts = [
      { id: 'W', date: iso, status: 'confirmed', startTime: '09:00', serviceCompletedAt: null },
      { id: 'D1', date: iso, status: 'confirmed', startTime: '10:00', serviceCompletedAt: ts('2026-07-20T03:00:00.000Z') },
      { id: 'D2', date: iso, status: 'confirmed', startTime: '08:00', serviceCompletedAt: ts('2026-07-20T05:00:00.000Z') },
    ];
    const completed = applyTabFilter(appts, { tab: 'today', now: today, todaySubPill: 'completed' });
    expect(completed.map(a => a.id).sort()).toEqual(['D1', 'D2']); // W excluded
    expect(sortApptsByServiceCompletedDesc(completed).map(a => a.id)).toEqual(['D2', 'D1']);
  });
});

describe('S2 — AppointmentHubView wiring (source-grep; silent-regression guards)', () => {
  const src = readFileSync('src/components/admin/AppointmentHubView.jsx', 'utf8');
  it('S2.1 imports sortApptsByServiceCompletedDesc from appointmentHubFilters', () => {
    expect(src).toMatch(/sortApptsByServiceCompletedDesc/);
  });
  it("S2.2 applies it ONLY for today + completed sub-pill", () => {
    expect(src).toMatch(/activeTab === 'today' && todaySubPill === 'completed'\s*\?\s*sortApptsByServiceCompletedDesc\(scoped\)/);
  });
  it('S2.3 pre-existing sort branches untouched (กำลังรอ confirmedFirst / past desc / asc)', () => {
    expect(src).toMatch(/sortApptsConfirmedFirst\(scoped\)/);
    expect(src).toMatch(/sortApptsByDateTimeDesc\(scoped\)/);
    expect(src).toMatch(/sortApptsByDateTimeAsc\(scoped\)/);
  });
});
