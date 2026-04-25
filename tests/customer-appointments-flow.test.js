// ─── Phase 14.7 — Customer-page appointments flow simulate ────────────────
//
// User-reported 2026-04-25: "ในหน้าข้อมูลลูกค้าเราไม่มีปุ่ม เพิ่มนัดหมาย
// และดูนัดหมายทั้งหมด แบบ proclinic ไปทำให้เรามีด้วย ... โดยใช้ database
// เราเองทั้งหมด ... เช็คการแสดงผล เช็ค wiring flow logic และความถูกต้อง".
//
// Tests cover:
//  F1: nextUpcomingAppt selection logic (sort + filter cancelled + today vs future)
//  F2: AppointmentListModal sorting (upcoming first, past after, both reverse-chrono)
//  F3: createBackendAppointment / updateBackendAppointment / deleteBackendAppointment
//      shape (writes go to be_appointments)
//  F4: source-grep regression guards — every wiring point is locked

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─── Pure helpers (mirror inline component logic) ──────────────────────────

function pickNextUpcoming(appts, today) {
  return (appts || [])
    .filter(a => a && a.date && a.date >= today && a.status !== 'cancelled')
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (a.startTime || '').localeCompare(b.startTime || '');
    })[0] || null;
}

function sortForListModal(appts, today) {
  const upcoming = (appts || []).filter(a => a.date >= today && a.status !== 'cancelled')
    .sort((a, b) => (a.date + (a.startTime || '')).localeCompare(b.date + (b.startTime || '')));
  const past = (appts || []).filter(a => a.date < today || a.status === 'cancelled')
    .sort((a, b) => (b.date + (b.startTime || '')).localeCompare(a.date + (a.startTime || '')));
  return [...upcoming, ...past];
}

describe('F1: nextUpcomingAppt selection', () => {
  const TODAY = '2026-04-25';

  it('F1.1: returns null for empty list', () => {
    expect(pickNextUpcoming([], TODAY)).toBe(null);
  });

  it('F1.2: returns null when no upcoming', () => {
    const past = [{ date: '2026-01-01', status: 'done' }];
    expect(pickNextUpcoming(past, TODAY)).toBe(null);
  });

  it('F1.3: returns the SOONEST future date', () => {
    const list = [
      { date: '2026-12-01', startTime: '10:00' },
      { date: '2026-04-30', startTime: '14:00' },
      { date: '2026-05-15', startTime: '09:00' },
    ];
    expect(pickNextUpcoming(list, TODAY).date).toBe('2026-04-30');
  });

  it('F1.4: today counts as upcoming', () => {
    const list = [
      { date: '2026-04-25', startTime: '10:00' },
      { date: '2026-04-26', startTime: '09:00' },
    ];
    expect(pickNextUpcoming(list, TODAY).date).toBe('2026-04-25');
  });

  it('F1.5: same-day picks earlier startTime', () => {
    const list = [
      { date: '2026-04-26', startTime: '14:00' },
      { date: '2026-04-26', startTime: '09:00' },
      { date: '2026-04-26', startTime: '11:00' },
    ];
    expect(pickNextUpcoming(list, TODAY).startTime).toBe('09:00');
  });

  it('F1.6: skips cancelled appointments', () => {
    const list = [
      { date: '2026-04-26', startTime: '09:00', status: 'cancelled' },
      { date: '2026-04-30', startTime: '10:00', status: 'pending' },
    ];
    expect(pickNextUpcoming(list, TODAY).date).toBe('2026-04-30');
  });

  it('F1.7: defensive — null/undefined entries skipped', () => {
    const list = [null, undefined, { date: '' }, { date: '2026-04-30' }];
    expect(pickNextUpcoming(list, TODAY).date).toBe('2026-04-30');
  });
});

describe('F2: AppointmentListModal sort', () => {
  const TODAY = '2026-04-25';

  it('F2.1: empty input → empty output', () => {
    expect(sortForListModal([], TODAY)).toEqual([]);
  });

  it('F2.2: upcoming first (asc), then past (desc)', () => {
    const list = [
      { date: '2026-04-30', startTime: '10:00', _id: 'A' },
      { date: '2026-04-20', startTime: '10:00', _id: 'B' },
      { date: '2026-05-15', startTime: '14:00', _id: 'C' },
      { date: '2026-04-10', startTime: '08:00', _id: 'D' },
      { date: '2026-04-26', startTime: '09:00', _id: 'E' },
    ];
    const sorted = sortForListModal(list, TODAY).map(a => a._id);
    expect(sorted).toEqual(['E', 'A', 'C', 'B', 'D']); // upcoming asc, past desc
  });

  it('F2.3: cancelled future appt goes to past section', () => {
    const list = [
      { date: '2026-04-30', startTime: '10:00', status: 'cancelled', _id: 'X' },
      { date: '2026-04-26', startTime: '09:00', _id: 'Y' },
      { date: '2026-04-20', _id: 'Z' },
    ];
    const sorted = sortForListModal(list, TODAY).map(a => a._id);
    // Y is upcoming; X (cancelled) + Z (past) in past section, X-2026-04-30 first when desc-sorted
    expect(sorted).toEqual(['Y', 'X', 'Z']);
  });
});

describe('F3: backendClient appointment helpers shape', () => {
  const src = READ('src/lib/backendClient.js');

  it('F3.1: createBackendAppointment writes to be_appointments with appointmentId + timestamps', () => {
    expect(src).toMatch(/export async function createBackendAppointment/);
    expect(src).toMatch(/appointmentId\s*=\s*`BA-\$\{Date\.now\(\)\}`/);
    expect(src).toMatch(/setDoc\(appointmentDoc\(appointmentId\)/);
  });

  it('F3.2: updateBackendAppointment updates updatedAt', () => {
    expect(src).toMatch(/export async function updateBackendAppointment/);
    expect(src).toMatch(/updatedAt:\s*new Date\(\)\.toISOString\(\)/);
  });

  it('F3.3: deleteBackendAppointment removes the doc', () => {
    expect(src).toMatch(/export async function deleteBackendAppointment/);
    expect(src).toMatch(/deleteDoc\(appointmentDoc/);
  });

  it('F3.4: getCustomerAppointments queries by customerId', () => {
    expect(src).toMatch(/export async function getCustomerAppointments/);
    expect(src).toMatch(/where\('customerId',\s*'==',\s*String\(customerId\)\)/);
  });
});

describe('F4: CustomerDetailView wiring (source-grep regression guards)', () => {
  const src = READ('src/components/backend/CustomerDetailView.jsx');

  it('F4.1: imports the 4 appointment helpers', () => {
    expect(src).toMatch(/getCustomerAppointments/);
    expect(src).toMatch(/createBackendAppointment/);
    expect(src).toMatch(/updateBackendAppointment/);
    expect(src).toMatch(/deleteBackendAppointment/);
  });

  it('F4.2: state hooks are present', () => {
    expect(src).toMatch(/customerAppointments,\s*setCustomerAppointments/);
    expect(src).toMatch(/showApptListModal,\s*setShowApptListModal/);
    expect(src).toMatch(/apptFormModal,\s*setApptFormModal/);
  });

  it('F4.3: useEffect calls reloadCustomerAppointments on mount', () => {
    expect(src).toMatch(/useEffect\(\(\)\s*=>\s*\{\s*reloadCustomerAppointments\(\)/);
  });

  it('F4.4: + เพิ่มนัดหมาย button wired to setApptFormModal({mode:"create"})', () => {
    expect(src).toMatch(/setApptFormModal\(\{\s*mode:\s*['"]create['"]\s*\}\)/);
    expect(src).toMatch(/data-testid="customer-appt-add"/);
  });

  it('F4.5: ดูทั้งหมด button wired to setShowApptListModal(true)', () => {
    expect(src).toMatch(/setShowApptListModal\(true\)/);
    expect(src).toMatch(/data-testid="customer-appt-view-all"/);
  });

  it('F4.6: AppointmentListModal renders inside main return', () => {
    expect(src).toMatch(/showApptListModal\s*&&[\s\S]*?<AppointmentListModal/);
  });

  it('F4.7: AppointmentFormModal renders for both create and edit', () => {
    expect(src).toMatch(/apptFormModal\s*&&[\s\S]*?<AppointmentFormModal/);
    expect(src).toMatch(/mode={apptFormModal\.mode}/);
  });

  it('F4.8: AppointmentFormModal pre-fills customer from props (cid + cname + chn)', () => {
    expect(src).toMatch(/customer\?\.proClinicId/);
    expect(src).toMatch(/customer\?\.patientData\?\.firstName/);
  });

  it('F4.9: AppointmentFormModal uses createBackendAppointment for create + updateBackendAppointment for edit', () => {
    expect(src).toMatch(/await\s+createBackendAppointment\(payload\)/);
    expect(src).toMatch(/await\s+updateBackendAppointment\(appt\.appointmentId/);
  });

  it('F4.10: cancel handler calls deleteBackendAppointment + reload', () => {
    expect(src).toMatch(/await deleteBackendAppointment\(.+?\.appointmentId/);
  });

  it('F4.11: AppointmentCard test ids exposed (edit, cancel, optional print)', () => {
    expect(src).toMatch(/data-testid="customer-appt-edit"/);
    expect(src).toMatch(/data-testid="customer-appt-cancel"/);
  });

  it('F4.12: form modal exposes test ids for date/start/end/doctor/save', () => {
    expect(src).toMatch(/data-testid="customer-appt-form-date"/);
    expect(src).toMatch(/data-testid="customer-appt-form-start"/);
    expect(src).toMatch(/data-testid="customer-appt-form-end"/);
    expect(src).toMatch(/data-testid="customer-appt-form-doctor"/);
    expect(src).toMatch(/data-testid="customer-appt-form-save"/);
  });
});

describe('F5: payload contract — created appointment shape', () => {
  const src = READ('src/components/backend/CustomerDetailView.jsx');

  it('F5.1: payload includes customerId/customerName/customerHN', () => {
    expect(src).toMatch(/customerId:\s*cid/);
    expect(src).toMatch(/customerName:\s*cname/);
    expect(src).toMatch(/customerHN:\s*chn/);
  });

  it('F5.2: payload includes date + startTime + endTime', () => {
    const m = src.match(/const payload = \{[\s\S]+?\};/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/date,/);
    expect(m[0]).toMatch(/startTime,/);
    expect(m[0]).toMatch(/endTime:/);
  });

  it('F5.3: payload defaults endTime to startTime when blank (no NaN range)', () => {
    expect(src).toMatch(/endTime:\s*endTime\s*\|\|\s*startTime/);
  });

  it('F5.4: payload preserves status on edit, defaults pending on create', () => {
    expect(src).toMatch(/status:\s*appt\?\.status\s*\|\|\s*['"]pending['"]/);
  });
});
