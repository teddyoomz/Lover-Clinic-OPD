// tests/appt-r9-message-roomid-restore-slots.test.js
// appointment-loop R9 (2026-06-03) — convergence-hunt fixes, Tier-2 regression
// (Rule P). Real-prod L2: scripts/e2e-appt-r9-restore-slot-rebuild.mjs (5/0).
//
//  AP1-msg (P2): the ATOMIC slot-guard throw carries e.slotKey/e.atomic but NO
//     e.collision → the modal rendered a blank "...: - ()" AND always said
//     "แพทย์" even for a ROOM collision. FIX: room-vs-doctor message from slotKey.
//  roomName→roomId (P2): the soft room-conflict keyed on roomName; the atomic
//     guard keys on roomId → divergent verdicts. FIX: soft scan keys on roomId.
//  restore-slots (P2): be_appointment_slots are keyed date_doctor_time (not by
//     branch/customer) → branch + customer-only RESTORE dropped them → restored
//     appts lost the atomic ROOM guard (a different doctor could double-book the
//     room; same-doctor is still soft-scanned). FIX: the restore executors
//     rebuild slot docs via computeAppointmentSlotDocs.

import { describe, it, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { computeAppointmentSlotDocs } from '../src/lib/appointmentSlotKeys.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const MODAL = read('src/components/backend/AppointmentFormModal.jsx');
const BRANCH_RESTORE = read('api/admin/branch-restore.js');
const WS_RESTORE = read('api/admin/_lib/wholeSystemRestoreExecutor.js');

describe('R9 — AP1 collision message is clear for the ATOMIC (room/doctor) throw', () => {
  test('msg.1 the catch handles the atomic case (no e.collision) with a room-vs-doctor message', () => {
    expect(MODAL).toMatch(/String\(e\.slotKey \|\| ''\)\.startsWith\('ROOM__'\)/);
    expect(MODAL).toMatch(/ห้องตรวจนี้ถูกจองในช่วงเวลานี้แล้ว/);
    expect(MODAL).toMatch(/ช่วงเวลานี้มีนัดของแพทย์ท่านนี้อยู่แล้ว/);
  });
});

describe('R9 — the soft room-conflict scan keys on roomId (matches the atomic guard)', () => {
  test('room.1 sameRoom compares roomId, not roomName', () => {
    expect(MODAL).toMatch(/const sameRoom = formData\.roomId && a\.roomId && String\(a\.roomId\) === String\(formData\.roomId\);/);
    expect(MODAL).not.toMatch(/const sameRoom = formData\.roomName && a\.roomName && a\.roomName === formData\.roomName;/);
  });
});

describe('R9 — restore rebuilds be_appointment_slots for restored live appts', () => {
  test('rs.1 computeAppointmentSlotDocs builds doctor+room slot docs for a live appt', () => {
    const out = computeAppointmentSlotDocs({ id: 'BA-1', date: '2099-01-01', doctorId: 'D1', roomId: 'R1', startTime: '10:00', endTime: '11:00', status: 'confirmed' }, { takenAt: 'T' });
    const keys = out.map(o => o.key);
    expect(keys).toContain('2099-01-01_D1_10:00');          // doctor interval
    expect(keys).toContain('ROOM__2099-01-01_R1_10:00');    // room interval
    expect(out.every(o => o.doc.cancelled === false && o.doc.appointmentId === 'BA-1' && o.doc.takenAt === 'T')).toBe(true);
  });
  test('rs.2 a cancelled appt → no slot docs (no phantom over-block)', () => {
    expect(computeAppointmentSlotDocs({ id: 'BA-1', date: '2099-01-01', doctorId: 'D1', startTime: '10:00', endTime: '11:00', status: 'cancelled' })).toEqual([]);
  });
  test('rs.3 an id-less / doctor-less appt → no slot docs', () => {
    expect(computeAppointmentSlotDocs({ date: '2099-01-01', doctorId: 'D1', startTime: '10:00', endTime: '11:00', status: 'confirmed' })).toEqual([]);  // no id
    expect(computeAppointmentSlotDocs({ id: 'BA-1', date: '2099-01-01', startTime: '10:00', endTime: '11:00', status: 'confirmed' })).toEqual([]);     // no doctor/room
  });
  test('rs.4 both restore executors rebuild slots via computeAppointmentSlotDocs', () => {
    expect(BRANCH_RESTORE).toMatch(/import \{ computeAppointmentSlotDocs \}/);
    expect(BRANCH_RESTORE).toMatch(/computeAppointmentSlotDocs\(a, \{ takenAt \}\)/);
    expect(BRANCH_RESTORE).toMatch(/if \(Array\.isArray\(file\.collections\?\.be_appointments\)\)/);
    expect(WS_RESTORE).toMatch(/import \{ computeAppointmentSlotDocs \}/);
    expect(WS_RESTORE).toMatch(/computeAppointmentSlotDocs\(a, \{ takenAt \}\)/);
    // only rebuild when slots were NOT in the manifest (no-op for full scope)
    expect(WS_RESTORE).toMatch(/const hasSlots = cols\.some\(c => c\.name === 'be_appointment_slots'\);/);
    expect(WS_RESTORE).toMatch(/if \(!apptCol \|\| hasSlots\) return 0;/);
  });
});
