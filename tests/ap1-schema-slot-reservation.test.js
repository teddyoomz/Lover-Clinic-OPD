// AP1 schema-based slot reservation (2026-05-04, V15 #13 candidate).
//
// Tests the deterministic slot-key builder + ensures the createBackendAppointment
// + updateBackendAppointment + deleteBackendAppointment paths use the runTransaction
// + slot-doc pattern. Also locks the firestore.rules entry shape.
//
// Source-grep regression bank — pure (no Firestore I/O, no React mount).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildAppointmentSlotKey } from '../src/lib/backendClient.js';

const REPO = resolve(process.cwd());
const read = (rel) => readFileSync(resolve(REPO, rel), 'utf8');

// ─── A1 buildAppointmentSlotKey helper ─────────────────────────────────────
describe('A1 buildAppointmentSlotKey', () => {
  test('A1.1 happy path — date_doctor_start_end format', () => {
    expect(buildAppointmentSlotKey({
      date: '2026-05-04',
      doctorId: 'DOC-1',
      startTime: '09:00',
      endTime: '10:00',
    })).toBe('2026-05-04_DOC-1_09:00_10:00');
  });

  test('A1.2 missing endTime falls back to startTime', () => {
    expect(buildAppointmentSlotKey({
      date: '2026-05-04',
      doctorId: 'DOC-1',
      startTime: '09:00',
    })).toBe('2026-05-04_DOC-1_09:00_09:00');
  });

  test('A1.3 missing date returns ""', () => {
    expect(buildAppointmentSlotKey({ doctorId: 'DOC-1', startTime: '09:00' })).toBe('');
  });

  test('A1.4 missing doctorId returns ""', () => {
    expect(buildAppointmentSlotKey({ date: '2026-05-04', startTime: '09:00' })).toBe('');
  });

  test('A1.5 missing startTime returns ""', () => {
    expect(buildAppointmentSlotKey({ date: '2026-05-04', doctorId: 'DOC-1' })).toBe('');
  });

  test('A1.6 forbidden chars in doctorId sanitized (slash/dot → dash)', () => {
    expect(buildAppointmentSlotKey({
      date: '2026-05-04',
      doctorId: 'DOC/1.A',
      startTime: '09:00',
      endTime: '10:00',
    })).toBe('2026-05-04_DOC-1-A_09:00_10:00');
  });

  test('A1.7 deterministic — same inputs always yield same key', () => {
    const args = { date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '10:00' };
    const k1 = buildAppointmentSlotKey(args);
    const k2 = buildAppointmentSlotKey({ ...args });
    expect(k1).toBe(k2);
  });

  test('A1.8 trims whitespace', () => {
    expect(buildAppointmentSlotKey({
      date: '  2026-05-04  ',
      doctorId: '  DOC-1  ',
      startTime: '  09:00  ',
      endTime: '  10:00  ',
    })).toBe('2026-05-04_DOC-1_09:00_10:00');
  });

  test('A1.9 null/undefined inputs handled', () => {
    expect(buildAppointmentSlotKey(null)).toBe('');
    expect(buildAppointmentSlotKey(undefined)).toBe('');
    expect(buildAppointmentSlotKey({})).toBe('');
  });

  test('A1.10 different start times yield different keys', () => {
    const a = buildAppointmentSlotKey({ date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '10:00' });
    const b = buildAppointmentSlotKey({ date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:30', endTime: '10:30' });
    expect(a).not.toBe(b);
  });
});

// ─── A2 source-grep regression guards ──────────────────────────────────────
describe('A2 source-grep — backendClient.js wires the runTransaction slot pattern', () => {
  const SRC = read('src/lib/backendClient.js');

  test('A2.1 appointmentSlotsCol + appointmentSlotDoc helpers exist', () => {
    expect(SRC).toMatch(/const appointmentSlotsCol =.*be_appointment_slots/);
    expect(SRC).toMatch(/const appointmentSlotDoc = \(slotId\)/);
  });

  test('A2.2 buildAppointmentSlotKey is exported', () => {
    expect(SRC).toMatch(/export function buildAppointmentSlotKey/);
  });

  test('A2.3 createBackendAppointment uses runTransaction with slot guard', () => {
    expect(SRC).toMatch(/await runTransaction\(db, async \(tx\) => \{/);
    expect(SRC).toMatch(/const slotSnap = await tx\.get\(slotRef\)/);
    expect(SRC).toMatch(/AP1_COLLISION/);
  });

  test('A2.4 createBackendAppointment writes slot + appointment atomically', () => {
    // tx.set(slotRef, ...) AND tx.set(appointmentDoc(appointmentId), ...) inside same tx
    expect(SRC).toMatch(/tx\.set\(slotRef,[\s\S]*?tx\.set\(appointmentDoc\(appointmentId\)/);
  });

  test('A2.5 _releaseAppointmentSlot helper exists and is called from delete', () => {
    expect(SRC).toMatch(/async function _releaseAppointmentSlot/);
    expect(SRC).toMatch(/await _releaseAppointmentSlot\(apptData\)/);
  });

  test('A2.6 deleteBackendAppointment reads appt before delete (to capture slot key)', () => {
    expect(SRC).toMatch(/export async function deleteBackendAppointment[\s\S]*?const snap = await getDoc\(appointmentDoc\(appointmentId\)\)[\s\S]*?await deleteDoc\(appointmentDoc\(appointmentId\)\)/);
  });

  test('A2.7 updateBackendAppointment handles status=cancelled slot release', () => {
    expect(SRC).toMatch(/becameCancelled.*data\?\.status === 'cancelled'/);
  });

  test('A2.8 updateBackendAppointment handles time-change slot rotation', () => {
    expect(SRC).toMatch(/const timeChanged = oldKey && newKey && oldKey !== newKey/);
  });

  test('A2.9 fallback path: legacy appts without time fields skip the tx', () => {
    expect(SRC).toMatch(/Legacy path: no slot key.*plain setDoc/);
  });
});

// ─── A3 firestore.rules entry ──────────────────────────────────────────────
describe('A3 firestore.rules — be_appointment_slots match block', () => {
  const RULES = read('firestore.rules');

  test('A3.1 be_appointment_slots match block exists', () => {
    expect(RULES).toMatch(/match \/be_appointment_slots\/\{slotId\}/);
  });

  test('A3.2 read+write gated on isClinicStaff()', () => {
    // Find the block and verify the rule line
    const block = RULES.match(/match \/be_appointment_slots\/\{slotId\}\s*\{[^}]+\}/);
    expect(block).not.toBeNull();
    expect(block[0]).toMatch(/allow read, write: if isClinicStaff\(\)/);
  });

  test('A3.3 comment block documents the AP1 fix purpose', () => {
    expect(RULES).toMatch(/AP1.*2026-05-04.*Appointment slot reservation/);
  });
});

// ─── A4 branch-collection-coverage matrix entry ────────────────────────────
describe('A4 branch-collection-coverage matrix', () => {
  const MATRIX_SRC = read('tests/branch-collection-coverage.test.js');

  test('A4.1 be_appointment_slots is classified as global scope', () => {
    expect(MATRIX_SRC).toMatch(/'be_appointment_slots':\s*\{ scope: 'global'/);
  });
});
