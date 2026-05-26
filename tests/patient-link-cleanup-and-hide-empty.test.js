import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  PATIENT_LINK_EMPTY_GRACE_MS,
  isUsableActiveCourse,
  computeUsableCourses,
  isAppointmentUpcoming,
  isCustomerLinkEmpty,
  decidePatientLinkCleanup,
} from '../src/lib/customerLinkPayloadCore.js';

// ─── Patient-link hide-empty + auto-cleanup (AV135) ───
// Exercises the REAL shared core (not mirrors) used by BOTH api/patient-view.js
// (render payload) AND api/cron/patient-link-cleanup-sweep.js (isEmpty + decide),
// so the "empty" definition + the cleanup state machine are locked. UI render is
// source-grep-locked (Section F) + verified L1 real-browser on the anon link.

const TODAY = '2026-05-26';
const DAY = 24 * 60 * 60 * 1000;
const ROOT = resolve(__dirname, '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

// qty string format = "remaining / total unit" (courseUtils.parseQtyString).
const finite = (r, t) => ({ qty: `${r} / ${t} ครั้ง`, status: 'กำลังใช้งาน' });
const buffet = (r) => ({ qty: `${r} / 0 ครั้ง`, status: 'กำลังใช้งาน' }); // total 0 = unlimited

describe('A — computeUsableCourses', () => {
  it('A1: finite with remaining → usable remaining', () => {
    const { remaining, expired } = computeUsableCourses([finite(3, 5)], TODAY);
    expect(remaining).toHaveLength(1);
    expect(expired).toHaveLength(0);
  });
  it('A2: finite depleted (0/5) → dropped (effective ใช้หมดแล้ว, not usable)', () => {
    const { remaining } = computeUsableCourses([finite(0, 5)], TODAY);
    expect(remaining).toHaveLength(0);
  });
  it('A3: buffet (total 0, remaining>0) → kept as usable', () => {
    const { remaining } = computeUsableCourses([buffet(2)], TODAY);
    expect(remaining).toHaveLength(1);
  });
  it('A4: refunded / cancelled → dropped', () => {
    const { remaining } = computeUsableCourses(
      [{ qty: '2 / 5 ครั้ง', status: 'คืนเงิน' }, { qty: '1 / 5 ครั้ง', status: 'ยกเลิก' }], TODAY);
    expect(remaining).toHaveLength(0);
  });
  it('A5: usable but expiryDate < today → expired bucket, not remaining', () => {
    const { remaining, expired } = computeUsableCourses(
      [{ ...finite(2, 5), expiryDate: '2026-01-01' }], TODAY);
    expect(remaining).toHaveLength(0);
    expect(expired).toHaveLength(1);
  });
  it('A6: usable with expiryDate >= today → remaining', () => {
    const { remaining } = computeUsableCourses([{ ...finite(2, 5), expiryDate: '2027-01-01' }], TODAY);
    expect(remaining).toHaveLength(1);
  });
  it('A7: null / non-array → empty', () => {
    expect(computeUsableCourses(null, TODAY).remaining).toHaveLength(0);
    expect(computeUsableCourses(undefined, TODAY).expired).toHaveLength(0);
  });
  it('A8: isUsableActiveCourse direct — buffet true, depleted false', () => {
    expect(isUsableActiveCourse(buffet(1))).toBe(true);
    expect(isUsableActiveCourse(finite(0, 3))).toBe(false);
  });
});

describe('B — isAppointmentUpcoming', () => {
  it('B1: future date + confirmed → upcoming', () => {
    expect(isAppointmentUpcoming({ date: '2026-06-01', status: 'confirmed' }, TODAY)).toBe(true);
  });
  it('B2: today + pending → upcoming (>= today)', () => {
    expect(isAppointmentUpcoming({ date: TODAY, status: 'pending' }, TODAY)).toBe(true);
  });
  it('B3: past date → not upcoming', () => {
    expect(isAppointmentUpcoming({ date: '2026-05-01', status: 'confirmed' }, TODAY)).toBe(false);
  });
  it('B4: cancelled → not upcoming', () => {
    expect(isAppointmentUpcoming({ date: '2026-06-01', status: 'cancelled' }, TODAY)).toBe(false);
  });
  it('B5: completed statuses → not upcoming', () => {
    for (const s of ['done', 'completed', 'มาตามนัด', 'ชำระเงิน']) {
      expect(isAppointmentUpcoming({ date: '2026-06-01', status: s }, TODAY)).toBe(false);
    }
  });
  it('B6: serviceCompletedAt / wasServiceCompleted → not upcoming', () => {
    expect(isAppointmentUpcoming({ date: '2026-06-01', status: 'confirmed', serviceCompletedAt: 'x' }, TODAY)).toBe(false);
    expect(isAppointmentUpcoming({ date: '2026-06-01', status: 'confirmed', wasServiceCompleted: true }, TODAY)).toBe(false);
  });
  it('B7: missing date → upcoming (kept)', () => {
    expect(isAppointmentUpcoming({ status: 'confirmed' }, TODAY)).toBe(true);
  });
  it('B8: null → not upcoming', () => {
    expect(isAppointmentUpcoming(null, TODAY)).toBe(false);
  });
});

describe('C — isCustomerLinkEmpty', () => {
  it('C1: remaining course → NOT empty (even with no appt)', () => {
    expect(isCustomerLinkEmpty({ courses: [finite(2, 5)], appointments: [], todayISO: TODAY })).toBe(false);
  });
  it('C2: upcoming appt → NOT empty (even with no course)', () => {
    expect(isCustomerLinkEmpty({ courses: [], appointments: [{ date: '2026-06-01', status: 'confirmed' }], todayISO: TODAY })).toBe(false);
  });
  it('C3: only expired courses + no appt → EMPTY (expired ≠ คอร์สคงเหลือ)', () => {
    expect(isCustomerLinkEmpty({ courses: [{ ...finite(2, 5), expiryDate: '2026-01-01' }], appointments: [], todayISO: TODAY })).toBe(true);
  });
  it('C4: only depleted/terminal courses + only past/cancelled appts → EMPTY', () => {
    expect(isCustomerLinkEmpty({
      courses: [finite(0, 5), { qty: '1/5 ครั้ง', status: 'ยกเลิก' }],
      appointments: [{ date: '2026-05-01', status: 'confirmed' }, { date: '2026-06-01', status: 'cancelled' }],
      todayISO: TODAY,
    })).toBe(true);
  });
  it('C5: nothing at all → EMPTY', () => {
    expect(isCustomerLinkEmpty({ courses: [], appointments: [], todayISO: TODAY })).toBe(true);
    expect(isCustomerLinkEmpty({ courses: null, appointments: null, todayISO: TODAY })).toBe(true);
  });
});

describe('D — decidePatientLinkCleanup', () => {
  const NOW = Date.UTC(2026, 4, 26); // fixed epoch
  it('D1: empty + no emptySince → STAMP now', () => {
    const r = decidePatientLinkCleanup({}, true, NOW);
    expect(r.action).toBe('stamp');
    expect(r.patch).toEqual({ patientLinkEmptySince: NOW });
  });
  it('D2: empty + within 30d grace → SKIP', () => {
    const r = decidePatientLinkCleanup({ patientLinkEmptySince: NOW - 10 * DAY }, true, NOW);
    expect(r.action).toBe('skip');
  });
  it('D3: empty + exactly 30d → DELETE (>= boundary)', () => {
    const r = decidePatientLinkCleanup({ patientLinkEmptySince: NOW - PATIENT_LINK_EMPTY_GRACE_MS }, true, NOW);
    expect(r.action).toBe('delete');
  });
  it('D4: empty + > 30d → DELETE with clear-token patch (Q4=A true delete)', () => {
    const r = decidePatientLinkCleanup({ patientLinkEmptySince: NOW - 31 * DAY }, true, NOW);
    expect(r.action).toBe('delete');
    expect(r.patch.patientLinkToken).toBe(null);
    expect(r.patch.patientLinkEnabled).toBe(false);
    expect(r.patch.patientLinkEmptySince).toBe(null);
    expect(r.patch.patientLinkAutoDeleteReason).toBe('stale-empty-30d');
    // pure patch carries NO serverTimestamp (cron adds patientLinkAutoDeletedAt)
    expect('patientLinkAutoDeletedAt' in r.patch).toBe(false);
  });
  it('D5: has data + emptySince set → CLEAR the stamp (clock reset)', () => {
    const r = decidePatientLinkCleanup({ patientLinkEmptySince: NOW - 5 * DAY }, false, NOW);
    expect(r.action).toBe('clear');
    expect(r.patch).toEqual({ patientLinkEmptySince: null });
  });
  it('D6: has data + no emptySince → SKIP', () => {
    expect(decidePatientLinkCleanup({}, false, NOW).action).toBe('skip');
  });
  it('D7: just under boundary (29.99d) → SKIP (not yet)', () => {
    const r = decidePatientLinkCleanup({ patientLinkEmptySince: NOW - (PATIENT_LINK_EMPTY_GRACE_MS - 1) }, true, NOW);
    expect(r.action).toBe('skip');
  });
  it('D8: non-numeric emptySince treated as unstamped → STAMP', () => {
    const r = decidePatientLinkCleanup({ patientLinkEmptySince: 'bad' }, true, NOW);
    expect(r.action).toBe('stamp');
  });
});

describe('E — flow-simulate (lifecycle)', () => {
  it('E1: stamp@day0 → skip@day10 → DELETE@day31', () => {
    const doc = {};
    const d0 = Date.UTC(2026, 4, 1);
    let r = decidePatientLinkCleanup(doc, true, d0);
    expect(r.action).toBe('stamp');
    Object.assign(doc, r.patch); // emptySince = d0

    r = decidePatientLinkCleanup(doc, true, d0 + 10 * DAY);
    expect(r.action).toBe('skip');

    r = decidePatientLinkCleanup(doc, true, d0 + 31 * DAY);
    expect(r.action).toBe('delete');
    expect(r.patch.patientLinkToken).toBe(null);
  });

  it('E2: data returns before grace → CLEAR resets the clock → re-empty re-STAMPS', () => {
    const doc = {};
    const d0 = Date.UTC(2026, 4, 1);
    Object.assign(doc, decidePatientLinkCleanup(doc, true, d0).patch); // stamp d0

    // day10 — data returns
    let r = decidePatientLinkCleanup(doc, false, d0 + 10 * DAY);
    expect(r.action).toBe('clear');
    Object.assign(doc, r.patch); // emptySince = null
    expect(doc.patientLinkEmptySince).toBe(null);

    // day12 — empty again → re-stamp from day12 (NOT day0 → clock reset)
    r = decidePatientLinkCleanup(doc, true, d0 + 12 * DAY);
    expect(r.action).toBe('stamp');
    expect(r.patch.patientLinkEmptySince).toBe(d0 + 12 * DAY);

    // would only delete 30d AFTER day12, i.e. not at day31 (only 19d empty)
    Object.assign(doc, r.patch);
    expect(decidePatientLinkCleanup(doc, true, d0 + 31 * DAY).action).toBe('skip');
  });

  it('E3: stable — re-deciding a freshly-stamped doc within grace stays skip (idempotent)', () => {
    const doc = { patientLinkEmptySince: Date.UTC(2026, 4, 20) };
    const now = Date.UTC(2026, 4, 26);
    expect(decidePatientLinkCleanup(doc, true, now).action).toBe('skip');
    expect(decidePatientLinkCleanup(doc, true, now).action).toBe('skip'); // re-run = same
  });
});

describe('F — AV135 source-grep (single-source + true-delete + UI gate)', () => {
  const core = read('src/lib/customerLinkPayloadCore.js');
  const endpoint = read('api/patient-view.js');
  const cron = read('api/cron/patient-link-cleanup-sweep.js');
  const ui = read('src/pages/PatientDashboard.jsx');

  it('F1: core is pure — no firebase import statement', () => {
    expect(core).not.toMatch(/from\s+['"]firebase/);
    expect(core).not.toMatch(/require\(['"]firebase/);
  });
  it('F2: endpoint imports the core helpers (not re-inlined)', () => {
    expect(endpoint).toMatch(/import\s*\{[^}]*computeUsableCourses[^}]*isAppointmentUpcoming[^}]*\}\s*from\s*'\.\.\/src\/lib\/customerLinkPayloadCore\.js'/);
    // old inline filter removed
    expect(endpoint).not.toContain('const COMPLETED_APPT_STATUSES');
    expect(endpoint).not.toContain("const isUsableActive");
  });
  it('F3: cron imports isCustomerLinkEmpty + decidePatientLinkCleanup', () => {
    expect(cron).toMatch(/import\s*\{[^}]*isCustomerLinkEmpty[^}]*decidePatientLinkCleanup[^}]*\}\s*from/);
  });
  it('F4: cron uses batch.update (NOT batch.delete) on the customer ref — true-delete = clear token', () => {
    expect(cron).toContain('batch.update(ref');
    expect(cron).not.toContain('batch.delete(');
  });
  it('F5: cron is CRON_SECRET-gated + canonical artifacts path', () => {
    expect(cron).toContain('CRON_SECRET');
    expect(cron).toContain('artifacts/${APP_ID}/public/data');
  });
  it('F6: UI hides courses empty box in customer-mode (gated !isCustomerMode)', () => {
    expect(ui).toContain('const isCustomerMode = !!sessionData?.__customerMode');
    expect(ui).toContain('{!isCustomerMode && courses.length === 0 && (');
  });
  it('F7: UI subtle line gated to customer-mode + all-empty', () => {
    expect(ui).toContain('isCustomerMode && appointments.length === 0 && courses.length === 0 && expiredCourses.length === 0');
    expect(ui).toContain('tx.noneYet');
    expect(ui).toContain("noneYet: 'ยังไม่มีนัดหมายหรือคอร์สในขณะนี้'");
  });
  it('F8: vercel.json registers the daily cron', () => {
    const vj = read('vercel.json');
    expect(vj).toContain('/api/cron/patient-link-cleanup-sweep');
  });
});
