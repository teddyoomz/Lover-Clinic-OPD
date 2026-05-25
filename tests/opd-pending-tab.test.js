// ② (2026-05-26) — "รอ/ยังไม่ลง OPD" tab: state B+C+D membership + opd-pending
// filter cases. Pure-helper unit tests.
import { describe, it, expect } from 'vitest';
import { isAppointmentOpdPending } from '../src/lib/opdSessionState.js';
import { dateRangeForTab, defaultStatusFilterForTab } from '../src/lib/appointmentHubFilters.js';

const filled = { patientData: { firstName: 'x' } };
const saved = { patientData: { firstName: 'x' }, opdRecordedAt: '2026-01-01', brokerStatus: 'done' };

describe('isAppointmentOpdPending (②, states B/C/D)', () => {
  it('B: booking, no link → true', () => {
    expect(isAppointmentOpdPending({ appt: { id: 'a' }, linkedSession: null })).toBe(true);
  });
  it('C: link sent, not filled → true', () => {
    expect(isAppointmentOpdPending({ appt: { linkedOpdSessionId: 's' }, linkedSession: null })).toBe(true);
    expect(isAppointmentOpdPending({ appt: { linkedOpdSessionId: 's' }, linkedSession: { patientData: {} } })).toBe(true);
  });
  it('D: filled, not saved → true', () => {
    expect(isAppointmentOpdPending({ appt: { linkedOpdSessionId: 's' }, linkedSession: filled })).toBe(true);
  });
  it('A: existing customer → false', () => {
    expect(isAppointmentOpdPending({ appt: { customerId: 'c', linkedOpdSessionId: 's' }, linkedSession: filled })).toBe(false);
  });
  it('E: saved → false', () => {
    expect(isAppointmentOpdPending({ appt: { linkedOpdSessionId: 's' }, linkedSession: saved })).toBe(false);
  });
  it('cancelled → false regardless of state', () => {
    expect(isAppointmentOpdPending({ appt: { status: 'cancelled', linkedOpdSessionId: 's' }, linkedSession: filled })).toBe(false);
  });
});

describe('opd-pending tab filter cases (②)', () => {
  const now = new Date('2026-06-01T03:00:00Z'); // Bangkok 10:00 → today 2026-06-01
  it('dateRangeForTab opd-pending = today..today+30 (includes today)', () => {
    expect(dateRangeForTab('opd-pending', now)).toEqual({ from: '2026-06-01', to: '2026-07-01' });
  });
  it('defaultStatusFilterForTab opd-pending excludes cancelled', () => {
    expect(defaultStatusFilterForTab('opd-pending')).toEqual({ exclude: ['cancelled'] });
  });
});
