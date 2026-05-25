// Rule I (2026-05-26) — OPD-pending lifecycle: tab ↔ cleanup ↔ save chain.
// Chains the REAL pure helpers so a refactor can't silently break the contract.
import { describe, it, expect } from 'vitest';
import { isAppointmentOpdPending, resolveCardOpdState } from '../src/lib/opdSessionState.js';
import { applyTabFilter } from '../src/lib/appointmentHubFilters.js';
import { decideCleanupAction } from '../src/lib/opdSessionCleanupCore.js';

const TODAY = '2026-06-01';
const now = new Date(`${TODAY}T03:00:00Z`); // Bangkok 2026-06-01

// Pure mirror of the in-view opd-pending pipeline (applyTabFilter + state filter).
function opdPendingList(appts, sessionsById) {
  return applyTabFilter(appts, { tab: 'opd-pending', now })
    .filter((a) => isAppointmentOpdPending({
      appt: a,
      linkedSession: a.linkedOpdSessionId ? sessionsById[a.linkedOpdSessionId] || null : null,
    }));
}

describe('OPD-pending lifecycle — tab ↔ cleanup ↔ save', () => {
  it('C (link sent, future) appears in tab; cleanup keeps it (date not passed)', () => {
    const appt = { id: 'x', date: '2026-06-05', startTime: '10:00', status: 'pending', linkedOpdSessionId: 's' };
    const sess = { id: 's', createdAt: now.getTime(), linkedAppointmentId: 'x' }; // no patientData → C
    expect(opdPendingList([appt], { s: sess })).toHaveLength(1);
    const cleanup = decideCleanupAction({ ...sess, appointmentDate: appt.date }, now.getTime(), undefined, TODAY);
    expect(cleanup.action).toBe('skip'); // future + fresh
  });

  it('D (filled, date passed) leaves the tab (past hidden) AND cleanup hard-deletes it (Q3=A)', () => {
    const appt = { id: 'x', date: '2026-05-25', startTime: '10:00', status: 'pending', linkedOpdSessionId: 's' };
    const sess = { id: 's', createdAt: now.getTime(), linkedAppointmentId: 'x', patientData: { firstName: 'a' } }; // D
    expect(resolveCardOpdState({ appt, linkedSession: sess })).toBe('D');
    expect(opdPendingList([appt], { s: sess })).toHaveLength(0); // date < today → out of range
    const cleanup = decideCleanupAction({ ...sess, appointmentDate: appt.date }, now.getTime(), undefined, TODAY);
    expect(cleanup.action).toBe('delete');
    expect(cleanup.reason).toBe('appt-date-passed');
  });

  it('after save: appt gets customerId (state A) → leaves the tab', () => {
    const appt = { id: 'x', date: '2026-06-05', startTime: '10:00', status: 'pending', linkedOpdSessionId: 's', customerId: 'cust-1' };
    expect(resolveCardOpdState({ appt, linkedSession: { patientData: { firstName: 'a' } } })).toBe('A');
    expect(opdPendingList([appt], { s: { patientData: { firstName: 'a' } } })).toHaveLength(0);
  });

  it('B (no link, future) appears (Q1); cancelled never appears', () => {
    const b = { id: 'b', date: '2026-06-03', startTime: '09:00', status: 'pending' };
    const cancelled = { id: 'c', date: '2026-06-03', startTime: '09:00', status: 'cancelled', linkedOpdSessionId: 's2' };
    const list = opdPendingList([b, cancelled], { s2: { patientData: { firstName: 'z' } } });
    expect(list.map((a) => a.id)).toEqual(['b']);
  });
});
