// ③ (2026-05-26) — opd_session auto-delete when the linked appointment date
// has passed. decideCleanupAction date-passed branch + cron be_appointments join.
import { describe, it, expect, vi } from 'vitest';
import { decideCleanupAction } from '../src/lib/opdSessionCleanupCore.js';

// ③ cron sweep test (T6) — mock firebase-admin so importing the cron file
// doesn't pull the real package into vitest. sweepOpdSessionCleanup uses
// FieldValue.serverTimestamp() (archive/hide) + the injected `db`.
vi.mock('firebase-admin/app', () => ({ initializeApp: vi.fn(), cert: vi.fn(), getApps: () => [{}] }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(), FieldValue: { serverTimestamp: () => '__ts__' } }));
import { sweepOpdSessionCleanup } from '../api/cron/opd-session-cleanup-sweep.js';

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

// ── T6 (③ cron be_appointments join) ────────────────────────────────────────
function mockDb({ sessions, appts }) {
  const apptMap = new Map(appts.map((a) => [a.id, a]));
  const calls = { deletes: [], updates: [] };
  const makeRef = (id) => ({ id });
  return {
    _calls: calls,
    collection: (path) => ({
      limit: () => ({
        get: async () => ({
          size: sessions.length,
          docs: sessions.map((s) => ({ id: s.id, ref: makeRef(s.id), data: () => s })),
        }),
      }),
      doc: (id) => makeRef(`${path}/${id}`),
    }),
    // be_appointments join: getAll(...refs) → snaps with .id + exists + data()
    getAll: async (...refs) => refs.map((r) => {
      const id = String(r.id).split('/').pop();
      const a = apptMap.get(id);
      return { id, exists: !!a, data: () => a || null };
    }),
    doc: (...seg) => makeRef(seg.join('/')),
    batch: () => ({
      delete: (ref) => calls.deletes.push(ref.id),
      update: (ref, patch) => calls.updates.push({ id: ref.id, patch }),
      commit: async () => {},
    }),
  };
}

describe('sweepOpdSessionCleanup — be_appointments join (③)', () => {
  it('joins appt date by linkedAppointmentId → deletes when appt date passed', async () => {
    const now = new Date('2026-06-01T03:00:00Z').getTime(); // Bangkok today 2026-06-01
    const db = mockDb({
      sessions: [
        { id: 's-past', createdAt: now, linkedAppointmentId: 'a-past', patientData: { firstName: 'x' } },
        { id: 's-future', createdAt: now, linkedAppointmentId: 'a-future' },
      ],
      appts: [
        { id: 'a-past', date: '2026-05-20' },
        { id: 'a-future', date: '2026-06-20' },
      ],
    });
    const r = await sweepOpdSessionCleanup({ db, now, apply: true });
    expect(db._calls.deletes).toContain('s-past');       // date passed → delete (even with patientData)
    expect(db._calls.deletes).not.toContain('s-future'); // future → preserved
    expect(r.deleted).toBeGreaterThanOrEqual(1);
  });
});
