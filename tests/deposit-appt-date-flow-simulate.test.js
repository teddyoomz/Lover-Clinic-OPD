import { describe, it, expect } from 'vitest';

// 2026-05-27 — Rule I flow-simulate for DepositPanel "มัดจำสำหรับ" appt-date cell.
// Pure MIRROR of the render-decision + nav-URL logic. The source-grep test
// (deposit-appt-date.test.jsx) LOCKS the real JSX to this logic; the REAL render
// verification is Rule Q-vis (real browser, plan Task 3 Step 3). Mirror alone != verified.

// Mirror of the cell decision (real JSX in DepositPanel.jsx "deposit-purpose-cell" td)
function decideApptCell(dep, fmtThaiDate) {
  const hasAppt = (dep.hasAppointment || dep.linkedAppointmentId) && dep.appointment?.date;
  if (hasAppt) {
    const t = dep.appointment.startTime;
    return { kind: 'date', label: `📅 นัด ${fmtThaiDate(dep.appointment.date)}${t ? ` · ${t}` : ''}`, clickable: true };
  }
  const noAppt = !dep.hasAppointment && !dep.linkedAppointmentId
    && dep.status !== 'cancelled' && dep.status !== 'refunded';
  if (noAppt) return { kind: 'noappt', label: 'ยังไม่นัด', clickable: false };
  return { kind: 'none' };
}

// Mirror of gotoApptDate URL builder
function apptUrl(origin, dep) {
  const apptDate = String(dep.appointment?.date || '').trim();
  if (!apptDate) return null;
  return `${origin}/?backend=1&tab=appointment-deposit&date=${encodeURIComponent(apptDate)}`;
}

const fmt = () => '28 พ.ค. 2569'; // stand-in for fmtThaiDate (real impl tested elsewhere)

describe('deposit appt-date cell — flow-simulate (Rule I)', () => {
  it('has appt + startTime → clickable date+time', () => {
    const r = decideApptCell({ hasAppointment: true, appointment: { date: '2026-05-28', startTime: '14:30' } }, fmt);
    expect(r.kind).toBe('date');
    expect(r.clickable).toBe(true);
    expect(r.label).toBe('📅 นัด 28 พ.ค. 2569 · 14:30');
  });
  it('has appt via linkedAppointmentId, no startTime → date only (defensive)', () => {
    const r = decideApptCell({ linkedAppointmentId: 'BA-1', appointment: { date: '2026-05-28' } }, fmt);
    expect(r.kind).toBe('date');
    expect(r.label).toBe('📅 นัด 28 พ.ค. 2569');
  });
  it('no appt + active → ยังไม่นัด (not clickable)', () => {
    const r = decideApptCell({ hasAppointment: false, status: 'active' }, fmt);
    expect(r).toEqual({ kind: 'noappt', label: 'ยังไม่นัด', clickable: false });
  });
  it('no appt + partial → ยังไม่นัด', () => {
    expect(decideApptCell({ hasAppointment: false, status: 'partial' }, fmt).kind).toBe('noappt');
  });
  it('no appt + cancelled → none', () => {
    expect(decideApptCell({ hasAppointment: false, status: 'cancelled' }, fmt).kind).toBe('none');
  });
  it('no appt + refunded → none', () => {
    expect(decideApptCell({ hasAppointment: false, status: 'refunded' }, fmt).kind).toBe('none');
  });
  it('nav URL encodes the appt date; null when no date', () => {
    expect(apptUrl('https://x.app', { appointment: { date: '2026-05-28' } }))
      .toBe('https://x.app/?backend=1&tab=appointment-deposit&date=2026-05-28');
    expect(apptUrl('https://x.app', { appointment: {} })).toBeNull();
    expect(apptUrl('https://x.app', {})).toBeNull();
  });
});
