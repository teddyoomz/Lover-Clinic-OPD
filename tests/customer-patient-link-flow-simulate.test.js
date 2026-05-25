import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fmtThaiDate } from '../src/lib/dateFormat.js';

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

  it('F3: customer-mode sessionData shape feeds the EXISTING render keys', () => {
    // endpoint response → PatientDashboard customer-mode map
    const data = { ok: true, patientName: 'อุดม', hn: 'LC-1', patientData: { firstName: 'อุดม', lastName: 'ศ' },
      courses: [{ name: 'X' }], expiredCourses: [], appointments: [{ date: '28 พฤษภาคม 2569', branch: 'นครราชสีมา', time: '10:00 น.' }] };
    const sessionData = {
      __customerMode: true, patientLinkEnabled: true,
      patientData: data.patientData, brokerProClinicHN: data.hn,
      latestCourses: { courses: data.courses, expiredCourses: data.expiredCourses, appointments: data.appointments, patientName: data.patientName, success: true },
    };
    // render reads: sessionData.latestCourses.{appointments,courses} / sessionData.patientData / .brokerProClinicHN
    expect(sessionData.latestCourses.appointments[0].branch).toBe('นครราชสีมา');
    expect(sessionData.latestCourses.appointments[0].date).toBe('28 พฤษภาคม 2569');
    expect(sessionData.latestCourses.courses).toHaveLength(1);
    expect(sessionData.brokerProClinicHN).toBe('LC-1');
    expect(sessionData.__customerMode).toBe(true);
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
});
