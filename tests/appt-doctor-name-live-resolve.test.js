// Regression — appointment views live-resolve the doctor name at render (2026-06-04).
// Bug surface 2 (same class as the saveDoctor stale-name): the appointment views
// rendered `appt.doctorName` RAW — a snapshot frozen at appointment-creation — so
// renaming a doctor in tab=doctors never propagated to EXISTING appointments
// ("ไม่อัพเดทตามฐานข้อมูล"). Fix: resolveDoctorName(appt, doctorMap) live-resolves by
// doctorId from be_doctors, snapshot is the fallback (deleted doctor / no map).
// V108/V111/V113 live-resolve-at-render class.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveDoctorName, buildDoctorMap } from '../src/lib/appointmentDisplay.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const MAP = buildDoctorMap([{ id: 'DOC-X', name: 'หมอมุก' }]);

describe('resolveDoctorName — pure helper', () => {
  it('LIVE master name wins over a stale snapshot (the fix)', () => {
    expect(resolveDoctorName({ doctorId: 'DOC-X', doctorName: 'บริบูรณ์ วังแก้ว' }, MAP)).toBe('หมอมุก');
  });
  it('falls back to snapshot when doctor not in map (deleted doctor)', () => {
    expect(resolveDoctorName({ doctorId: 'DOC-GONE', doctorName: 'อดีตหมอ' }, MAP)).toBe('อดีตหมอ');
  });
  it('falls back to snapshot when no map supplied', () => {
    expect(resolveDoctorName({ doctorId: 'DOC-X', doctorName: 'snapshot' }, null)).toBe('snapshot');
  });
  it('falls back to snapshot when appt has no doctorId (walk-in / pick-later)', () => {
    expect(resolveDoctorName({ doctorName: 'note' }, MAP)).toBe('note');
  });
  it('plain-object map also works (not just native Map)', () => {
    expect(resolveDoctorName({ doctorId: 'DOC-X', doctorName: 'old' }, { 'DOC-X': { name: 'หมอมุก' } })).toBe('หมอมุก');
  });
  it('empty live name does NOT blank out — snapshot fallback', () => {
    const m2 = buildDoctorMap([{ id: 'DOC-Y', name: '' }]);
    expect(resolveDoctorName({ doctorId: 'DOC-Y', doctorName: 'snapshot' }, m2)).toBe('snapshot');
  });
  it('numeric doctorId coerced to string for lookup', () => {
    expect(resolveDoctorName({ doctorId: 123, doctorName: 'old' }, { '123': { name: 'หมอเลข' } })).toBe('หมอเลข');
  });
  it('null/empty appt → empty string (caller renders its own placeholder)', () => {
    expect(resolveDoctorName(null, MAP)).toBe('');
    expect(resolveDoctorName({}, MAP)).toBe('');
  });
});

describe('every appointment render site live-resolves the doctor (source-grep lock)', () => {
  const renderSites = [
    'src/components/backend/AppointmentCalendarView.jsx',
    'src/components/backend/AppointmentDetailBody.jsx',
    'src/components/backend/AppointmentAgendaView.jsx',
    'src/components/admin/AppointmentHubRowCard.jsx',
  ];
  for (const file of renderSites) {
    it(`${file.split('/').pop()} uses resolveDoctorName(appt, doctorMap)`, () => {
      expect(read(file)).toMatch(/resolveDoctorName\(appt,\s*doctorMap\)/);
    });
  }
  it('old raw-snapshot doctor renders are GONE (anti-regression)', () => {
    for (const file of ['AppointmentCalendarView', 'AppointmentDetailBody', 'AppointmentAgendaView']) {
      expect(read(`src/components/backend/${file}.jsx`)).not.toMatch(/👨‍⚕️ \{appt\.doctorName \|\| 'ไม่ระบุแพทย์'\}/);
    }
    expect(read('src/components/admin/AppointmentHubRowCard.jsx')).not.toMatch(/\{appt\.doctorName \|\| '-'\}/);
  });
  it('hub view loads a live doctorMap (useDoctorMap) + passes it to the row card', () => {
    const hub = read('src/components/admin/AppointmentHubView.jsx');
    expect(hub).toMatch(/useDoctorMap\(\)/);
    expect(hub).toMatch(/doctorMap=\{doctorMap\}/);
  });
  it('calendar passes its doctorMap to the agenda view', () => {
    expect(read('src/components/backend/AppointmentCalendarView.jsx')).toMatch(/AppointmentAgendaView[\s\S]{0,200}doctorMap=\{doctorMap\}/);
  });
  it('useDoctorMap hook loads doctors includeHidden (legacy/hidden resolve)', () => {
    const hook = read('src/hooks/useDoctorMap.js');
    expect(hook).toMatch(/listDoctors\(\{\s*includeHidden:\s*true\s*\}\)/);
    expect(hook).toMatch(/buildDoctorMap/);
  });
});

describe('rename propagates to EXISTING appointments — flow simulate', () => {
  it('an old appt with a frozen snapshot shows the LIVE name after the doctor is renamed', () => {
    const existingAppt = { doctorId: 'DOC-mpwmsm1i', doctorName: 'บริบูรณ์ วังแก้ว' }; // snapshot at creation
    // admin renames in tab=doctors → saveDoctor recomputes be_doctors.name → useDoctorMap reads it
    const liveMap = buildDoctorMap([{ id: 'DOC-mpwmsm1i', name: 'หมอมุก' }]);
    expect(resolveDoctorName(existingAppt, liveMap)).toBe('หมอมุก');
  });
});
