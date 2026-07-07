import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fmtThaiDate } from '../src/lib/dateFormat.js';
import { parseQtyString } from '../src/lib/courseUtils.js';
import { parseStatusFromCourse, deriveEffectiveStatus, STATUS_ACTIVE, STATUS_USED } from '../src/lib/remainingCourseUtils.js';

// ─── Rule I full-flow simulate — customer patient-link ───
// Pure mirrors of api/patient-view appointment mapping + course split, so the
// contract (branch name + FULL Thai month + future-only + render shape) is
// locked even though the endpoint itself runs as a serverless fn.

// Mirror of the endpoint's appointment mapping (api/patient-view.js).
function mapAppt(a, branchNameOf) {
  const start = a.startTime || a.time || '';
  const end = a.endTime || '';
  const timeStr = start ? (end ? `${start} - ${end} น.` : `${start} น.`) : '';
  return {
    date: a.date ? fmtThaiDate(a.date, { monthStyle: 'full', yearStyle: 'full' }) : '',
    time: timeStr,
    doctor: a.doctorName || '',
    branch: branchNameOf(a.branchId) || '',
    room: a.roomName || '',
    status: a.status || '',
  };
}
const futureActive = (appts, today) =>
  appts.filter(a => (!a.date || String(a.date) >= today) && a.status !== 'cancelled');

describe('Rule I — customer patient-link full flow', () => {
  const today = '2026-05-25';
  const branches = { 'BR-NM': 'นครราชสีมา', 'BR-R3': 'พระราม 3' };
  const branchNameOf = (b) => branches[b] || '';

  it('F1: future-only + cancelled-excluded + branch resolved + FULL Thai month', () => {
    const raw = [
      { date: '2026-05-28', startTime: '10:00', endTime: '10:30', doctorName: 'นพ. สมชาย ใจดี', branchId: 'BR-NM', status: 'confirmed' },
      { date: '2026-06-12', startTime: '14:30', branchId: 'BR-R3', status: 'pending' },
      { date: '2026-05-24', startTime: '19:00', branchId: 'BR-NM', status: 'confirmed' }, // past → dropped
      { date: '2026-07-01', startTime: '09:00', branchId: 'BR-NM', status: 'cancelled' }, // cancelled → dropped
    ];
    const out = futureActive(raw, today).map(a => mapAppt(a, branchNameOf));
    expect(out).toHaveLength(2);
    expect(out[0].date).toBe('28 พฤษภาคม 2569');      // FULL month + พ.ศ.
    expect(out[0].time).toBe('10:00 - 10:30 น.');
    expect(out[0].branch).toBe('นครราชสีมา');           // resolved name (not branchId)
    expect(out[1].date).toBe('12 มิถุนายน 2569');
    expect(out[1].branch).toBe('พระราม 3');
    // NOT abbreviated month
    expect(out.every(a => !/พ\.ค\.|มิ\.ย\.|ก\.ค\./.test(a.date))).toBe(true);
    // branch is a NAME, never a raw BR- id
    expect(out.every(a => !/^BR-/.test(a.branch))).toBe(true);
  });

  it("F1b: missing branchId / unknown branch → empty branch (AppointmentCard hides 📍)", () => {
    const out = mapAppt({ date: '2026-06-01', startTime: '11:00', branchId: '' }, branchNameOf);
    expect(out.branch).toBe('');
    const out2 = mapAppt({ date: '2026-06-01', startTime: '11:00', branchId: 'BR-GONE' }, branchNameOf);
    expect(out2.branch).toBe('');
  });

  it('F2: courses active/expired split (mirror endpoint + fetchCoursesViaApi)', () => {
    const all = [
      { name: 'A', expiryDate: '2026-12-31' },
      { name: 'B', expiryDate: '2026-01-01' },
      { name: 'C' }, // no expiry → active
    ];
    expect(all.filter(c => !c.expiryDate || c.expiryDate >= today).map(c => c.name)).toEqual(['A', 'C']);
    expect(all.filter(c => c.expiryDate && c.expiryDate < today).map(c => c.name)).toEqual(['B']);
  });

  it('F3: customer-mode sessionData shape feeds the EXISTING render keys (2026-07-07: hn/brokerProClinicHN STRIPPED end-to-end — endpoint no longer returns hn, page no longer maps or renders it)', () => {
    // endpoint response → PatientDashboard customer-mode map (post header-strip)
    const data = { ok: true, patientName: 'อุดม', patientData: { firstName: 'อุดม', lastName: 'ศ' },
      courses: [{ name: 'X' }], expiredCourses: [], appointments: [{ date: '28 พฤษภาคม 2569', branch: 'นครราชสีมา', time: '10:00 น.' }] };
    const sessionData = {
      __customerMode: true, patientLinkEnabled: true,
      patientData: data.patientData,
      latestCourses: { courses: data.courses, expiredCourses: data.expiredCourses, appointments: data.appointments, patientName: data.patientName, success: true },
    };
    // render reads: sessionData.latestCourses.{appointments,courses} / sessionData.patientData
    expect(sessionData.latestCourses.appointments[0].branch).toBe('นครราชสีมา');
    expect(sessionData.latestCourses.appointments[0].date).toBe('28 พฤษภาคม 2569');
    expect(sessionData.latestCourses.courses).toHaveLength(1);
    expect(sessionData.__customerMode).toBe(true);
    // lock the strip: neither the endpoint nor the page carries hn anymore
    const EP = readFileSync('api/patient-view.js', 'utf8');
    expect(EP).not.toMatch(/^\s*hn,\s*$/m);
    expect(EP).not.toMatch(/proClinicHN \|\| customerData\.hn_no/);
    const PD = readFileSync('src/pages/PatientDashboard.jsx', 'utf8');
    expect(PD).not.toMatch(/brokerProClinicHN/);
    expect(PD).not.toMatch(/getInitials/);
    expect(PD).not.toMatch(/HN \{hn\}/);
  });

  it('F4: AppointmentCard already renders branch (📍) — source-grep, no UI change needed', () => {
    const PD = readFileSync('src/pages/PatientDashboard.jsx', 'utf8');
    expect(PD).toMatch(/\[a\.branch, a\.room\]|a\.branch \|\| a\.room|\(a\.branch \|\| a\.room\)/);
  });

  it('F5: endpoint maps time from startTime (Rule R diag: real field is startTime, not time)', () => {
    const SRC = readFileSync('api/patient-view.js', 'utf8');
    expect(SRC).toMatch(/a\.startTime/);
    // PatientDashboard customer-mode does NOT call fetchCoursesViaApi (anon can't read be_*)
    const PD = readFileSync('src/pages/PatientDashboard.jsx', 'utf8');
    expect(PD).toMatch(/__customerMode/);
    expect(PD).toMatch(/sessionData\?\.__customerMode\) return/); // auto-sync guarded
  });

  // ── F6: used-up / depleted courses excluded from the patient view (2026-05-25 fix) ──
  // Stored status doesn't auto-flip → derive effective status (buffet-safe).
  const isUsableActive = (c) => {
    const { remaining, total } = parseQtyString(c.qty || '');
    return deriveEffectiveStatus(parseStatusFromCourse(c), Number(total) || 0, Number(remaining) || 0) === STATUS_ACTIVE;
  };
  it('F6.1: finite depleted course (0/1, stale active status) is EXCLUDED', () => {
    expect(isUsableActive({ qty: '0 / 1 ครั้ง', status: 'กำลังใช้งาน' })).toBe(false);
    expect(deriveEffectiveStatus('กำลังใช้งาน', 1, 0)).toBe(STATUS_USED);
  });
  it('F6.2: course with remaining (9/12) is KEPT', () => {
    expect(isUsableActive({ qty: '9 / 12 ครั้ง', status: 'กำลังใช้งาน' })).toBe(true);
  });
  it('F6.3: buffet / unlimited (qty unparseable → total 0) is KEPT (not wrongly excluded)', () => {
    expect(isUsableActive({ qty: 'ไม่จำกัด', status: 'กำลังใช้งาน' })).toBe(true);
    expect(isUsableActive({ qty: '', status: 'กำลังใช้งาน' })).toBe(true);
  });
  it('F6.4: refunded / cancelled courses are EXCLUDED', () => {
    expect(isUsableActive({ qty: '1 / 1 ครั้ง', status: 'คืนเงิน' })).toBe(false);
    expect(isUsableActive({ qty: '1 / 1 ครั้ง', status: 'ยกเลิก' })).toBe(false);
  });
  it('F6.5: real ไพบูลย์ case — 2× "0/1" used-up → 0 shown (active + expired both empty)', () => {
    const all = [
      { qty: '0 / 1 ครั้ง', status: 'กำลังใช้งาน', expiryDate: '2026-06-24' },
      { qty: '0 / 1 ครั้ง', status: 'กำลังใช้งาน' },
      { qty: '5 / 10 ครั้ง', status: 'กำลังใช้งาน' },
    ];
    const today = '2026-05-25';
    const usable = all.filter(isUsableActive);
    const courses = usable.filter(c => !c.expiryDate || String(c.expiryDate) >= today);
    const expired = usable.filter(c => c.expiryDate && String(c.expiryDate) < today);
    expect(usable).toHaveLength(1); // only 5/10 survives
    expect(courses).toHaveLength(1);
    expect(expired).toHaveLength(0);
  });
  it('F6.6: patient-view course gating single-sourced in customerLinkPayloadCore + PatientDashboard still gates (class-of-bug lock; AV135 relocated the endpoint half to the core)', () => {
    const CORE = readFileSync('src/lib/customerLinkPayloadCore.js', 'utf8');
    const EP = readFileSync('api/patient-view.js', 'utf8');
    const PD = readFileSync('src/pages/PatientDashboard.jsx', 'utf8');
    // AV135 (2026-05-26): the endpoint's course gating moved into the shared core
    // (consumed by api/patient-view.js AND the cleanup cron) — gating lives THERE now:
    expect(CORE).toMatch(/deriveEffectiveStatus/);
    expect(CORE).toMatch(/parseStatusFromCourse/);
    expect(CORE).toMatch(/isUsableActive/);
    // endpoint delegates to the core (no re-inline); old expiry-only filter gone:
    expect(EP).toMatch(/computeUsableCourses/);
    expect(EP).not.toMatch(/allCourses\.filter\(c => !c\.expiryDate/);
    // PatientDashboard admin/legacy ProClinic-sync path (fetchCoursesViaApi) still gates inline:
    expect(PD).toMatch(/deriveEffectiveStatus/);
    expect(PD).toMatch(/parseStatusFromCourse/);
    expect(PD).toMatch(/isUsableActive/);
  });

  // ── F7: completed/serviced appointments excluded from "นัดหมายครั้งต่อไป" (2026-05-25) ──
  const COMPLETED_APPT_STATUSES = new Set(['done', 'completed', 'มาตามนัด', 'ชำระเงิน']);
  const isUpcomingAppt = (a) =>
    a.status !== 'cancelled' && !a.serviceCompletedAt && !a.wasServiceCompleted
    && !COMPLETED_APPT_STATUSES.has(String(a.status || '').trim());
  it('F7.1: pending/confirmed kept; done/completed/มาตามนัด/ชำระเงิน + cancelled + serviceCompleted excluded', () => {
    expect(isUpcomingAppt({ status: 'pending' })).toBe(true);
    expect(isUpcomingAppt({ status: 'confirmed' })).toBe(true);
    expect(isUpcomingAppt({ status: 'done' })).toBe(false);
    expect(isUpcomingAppt({ status: 'completed' })).toBe(false);
    expect(isUpcomingAppt({ status: 'มาตามนัด' })).toBe(false);
    expect(isUpcomingAppt({ status: 'ชำระเงิน' })).toBe(false);
    expect(isUpcomingAppt({ status: 'cancelled' })).toBe(false);
    expect(isUpcomingAppt({ status: 'confirmed', serviceCompletedAt: '2026-05-25T10:00:00Z' })).toBe(false);
    expect(isUpcomingAppt({ status: 'confirmed', wasServiceCompleted: true })).toBe(false);
  });
  it('F7.2: real ไพบูลย์ case — done-today dropped, pending-future kept', () => {
    const all = [
      { date: '2026-05-25', status: 'done', serviceCompletedAt: 'x' },
      { date: '2026-06-04', status: 'pending' },
    ];
    const today = '2026-05-25';
    const out = all.filter(a => (!a.date || a.date >= today) && isUpcomingAppt(a));
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe('2026-06-04');
  });
  it('F7.3: patient-view appt completed-exclusion single-sourced in core + PatientDashboard still excludes (class-of-bug lock; AV135 relocated the endpoint half)', () => {
    const CORE = readFileSync('src/lib/customerLinkPayloadCore.js', 'utf8');
    const EP = readFileSync('api/patient-view.js', 'utf8');
    const PD = readFileSync('src/pages/PatientDashboard.jsx', 'utf8');
    // AV135 (2026-05-26): endpoint's appt completed-exclusion moved into the shared core:
    expect(CORE).toMatch(/COMPLETED_APPT_STATUSES/);
    expect(CORE).toMatch(/serviceCompletedAt/);
    expect(CORE).toMatch(/'มาตามนัด'/);
    // endpoint delegates:
    expect(EP).toMatch(/isAppointmentUpcoming/);
    // PatientDashboard (admin/legacy sync path) still excludes inline:
    expect(PD).toMatch(/COMPLETED_APPT_STATUSES/);
    expect(PD).toMatch(/serviceCompletedAt/);
    expect(PD).toMatch(/'มาตามนัด'/);
  });
});
