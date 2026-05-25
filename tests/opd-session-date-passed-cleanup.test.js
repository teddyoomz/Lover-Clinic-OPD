// ③ (2026-05-26) — opd_session auto-delete when the linked appointment date
// has passed. decideCleanupAction date-passed branch + cron be_appointments join.
import { describe, it, expect } from 'vitest';
import { decideCleanupAction } from '../src/lib/opdSessionCleanupCore.js';

const TODAY = '2026-06-01';
const freshMs = Date.now(); // within 2h → would normally skip

describe('decideCleanupAction — appt-date-passed (③)', () => {
  it('past appt date → delete, even with patientData (Q3=A)', () => {
    const r = decideCleanupAction(
      { appointmentDate: '2026-05-30', patientData: { firstName: 'x' }, linkedAppointmentId: 'a' },
      freshMs, undefined, TODAY,
    );
    expect(r.action).toBe('delete');
    expect(r.reason).toBe('appt-date-passed');
  });
  it('today appt date → NOT date-passed (falls through; fresh → skip)', () => {
    const r = decideCleanupAction({ appointmentDate: TODAY, linkedAppointmentId: 'a' }, freshMs, undefined, TODAY);
    expect(r.action).toBe('skip');
  });
  it('future appt date → falls through', () => {
    const r = decideCleanupAction({ appointmentDate: '2026-06-10', linkedAppointmentId: 'a' }, freshMs, undefined, TODAY);
    expect(r.action).toBe('skip');
  });
  it('no appointmentDate → unchanged legacy (expired+linked+no-data → hide)', () => {
    // createdAt 3h ago + now=Date.now() → age > 2h timeout → expired branch.
    const r = decideCleanupAction({ linkedAppointmentId: 'a', createdAt: Date.now() - 3 * 60 * 60 * 1000 }, Date.now(), undefined, TODAY);
    expect(r.action).toBe('hide');
  });
  it('isPermanent wins over date-passed', () => {
    const r = decideCleanupAction({ isPermanent: true, appointmentDate: '2026-05-01' }, freshMs, undefined, TODAY);
    expect(r.action).toBe('skip');
    expect(r.reason).toBe('permanent-link');
  });
  it('isArchived wins over date-passed', () => {
    const r = decideCleanupAction({ isArchived: true, appointmentDate: '2026-05-01' }, freshMs, undefined, TODAY);
    expect(r.action).toBe('skip');
  });
  it('no todayISO param → date branch is a no-op (backward compat)', () => {
    // legacy 3-arg callers (no todayISO) must keep old behavior. createdAt 3h
    // ago + now=Date.now() → expired; without todayISO the date branch skips.
    const r = decideCleanupAction({ appointmentDate: '2026-05-01', linkedAppointmentId: 'a', createdAt: Date.now() - 3 * 60 * 60 * 1000 }, Date.now());
    expect(r.action).toBe('hide'); // not delete — date branch skipped without todayISO
  });
});
