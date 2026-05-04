// AP1 schema-based slot reservation (2026-05-04, V15 #13 candidate).
// Extended for AP1-bis (V15 #14): multi-slot 15-min interval reservation.
//
// Tests the deterministic slot-key builder(s) + ensures the createBackendAppointment
// + updateBackendAppointment + deleteBackendAppointment paths use the runTransaction
// + slot-doc pattern. Also locks the firestore.rules entry shape.
//
// Source-grep regression bank — pure (no Firestore I/O, no React mount).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildAppointmentSlotKey,
  buildAppointmentSlotKeys,
  SLOT_INTERVAL_MIN,
} from '../src/lib/backendClient.js';

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

  test('A2.3 createBackendAppointment uses runTransaction with slot guard (AP1-bis multi-slot)', () => {
    expect(SRC).toMatch(/await runTransaction\(db, async \(tx\) => \{/);
    // AP1-bis: reads ALL slot refs via Promise.all (multi-slot, was singular tx.get).
    expect(SRC).toMatch(/await Promise\.all\(slotRefs\.map\(\(ref\) => tx\.get\(ref\)\)\)/);
    expect(SRC).toMatch(/AP1_COLLISION/);
  });

  test('A2.4 createBackendAppointment writes slots[i] + appointment atomically (AP1-bis multi-slot)', () => {
    // tx.set(slotRefs[i], ...) AND tx.set(appointmentDoc(appointmentId), ...) inside same tx
    expect(SRC).toMatch(/tx\.set\(slotRefs\[i\],[\s\S]*?tx\.set\(appointmentDoc\(appointmentId\)/);
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

  test('A2.8 updateBackendAppointment handles time-change slot rotation (AP1-bis array)', () => {
    // AP1-bis: comparison is array-based now (length+sig), not single key.
    expect(SRC).toMatch(/const timeChanged = oldKeys\.length > 0 && newKeys\.length > 0 && oldKeySig !== newKeySig/);
  });

  test('A2.9 fallback path: legacy appts without time fields skip the tx', () => {
    expect(SRC).toMatch(/Legacy path: no slot key.*plain setDoc/);
  });
});

// ─── A5 buildAppointmentSlotKeys (AP1-bis multi-slot helper) ───────────────
describe('A5 buildAppointmentSlotKeys (AP1-bis range-overlap fix)', () => {
  test('A5.1 09:00-10:00 returns 4 slots [09:00, 09:15, 09:30, 09:45]', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04',
      doctorId: 'DOC-1',
      startTime: '09:00',
      endTime: '10:00',
    });
    expect(keys).toEqual([
      '2026-05-04_DOC-1_09:00',
      '2026-05-04_DOC-1_09:15',
      '2026-05-04_DOC-1_09:30',
      '2026-05-04_DOC-1_09:45',
    ]);
  });

  test('A5.2 09:30-10:30 returns 4 slots [09:30, 09:45, 10:00, 10:15]', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04',
      doctorId: 'DOC-1',
      startTime: '09:30',
      endTime: '10:30',
    });
    expect(keys).toEqual([
      '2026-05-04_DOC-1_09:30',
      '2026-05-04_DOC-1_09:45',
      '2026-05-04_DOC-1_10:00',
      '2026-05-04_DOC-1_10:15',
    ]);
  });

  test('A5.3 range-overlap detection: 09:00-10:00 + 09:30-10:30 share ≥1 slot', () => {
    const a = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '10:00',
    });
    const b = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:30', endTime: '10:30',
    });
    const shared = a.filter((k) => b.includes(k));
    // Both reserve 09:30 + 09:45 — collision detected via tx.get on these slots.
    expect(shared.length).toBeGreaterThanOrEqual(2);
    expect(shared).toContain('2026-05-04_DOC-1_09:30');
    expect(shared).toContain('2026-05-04_DOC-1_09:45');
  });

  test('A5.4 NO overlap: 09:00-10:00 + 10:00-11:00 share 0 slots', () => {
    const a = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '10:00',
    });
    const b = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '10:00', endTime: '11:00',
    });
    const shared = a.filter((k) => b.includes(k));
    expect(shared).toEqual([]);
  });

  test('A5.5 floor start to nearest interval (09:10 starts at 09:00)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:10', endTime: '09:30',
    });
    // 09:10 floors to 09:00, 09:30 ceils to 09:30 → emits [09:00, 09:15]
    expect(keys).toEqual([
      '2026-05-04_DOC-1_09:00',
      '2026-05-04_DOC-1_09:15',
    ]);
  });

  test('A5.6 ceil end to nearest interval (09:25 ends at 09:30)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '09:25',
    });
    // 09:00 floor 09:00, 09:25 ceil 09:30 → emits [09:00, 09:15]
    expect(keys).toEqual([
      '2026-05-04_DOC-1_09:00',
      '2026-05-04_DOC-1_09:15',
    ]);
  });

  test('A5.7 missing endTime → single slot at floor(start)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:10',
    });
    expect(keys).toEqual(['2026-05-04_DOC-1_09:00']);
  });

  test('A5.8 end <= start → single slot at floor(start)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '09:00',
    });
    expect(keys).toEqual(['2026-05-04_DOC-1_09:00']);
  });

  test('A5.9 missing date returns []', () => {
    expect(buildAppointmentSlotKeys({ doctorId: 'DOC-1', startTime: '09:00' })).toEqual([]);
  });

  test('A5.10 missing doctorId returns []', () => {
    expect(buildAppointmentSlotKeys({ date: '2026-05-04', startTime: '09:00' })).toEqual([]);
  });

  test('A5.11 invalid startTime returns []', () => {
    expect(buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: 'invalid',
    })).toEqual([]);
    expect(buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '25:00',
    })).toEqual([]);
  });

  test('A5.12 forbidden chars in doctorId sanitized (slash/dot → dash)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04',
      doctorId: 'DOC/1.A',
      startTime: '09:00',
      endTime: '09:30',
    });
    expect(keys).toEqual([
      '2026-05-04_DOC-1-A_09:00',
      '2026-05-04_DOC-1-A_09:15',
    ]);
  });

  test('A5.13 deterministic — same inputs always yield same array', () => {
    const args = { date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '10:00' };
    const a = buildAppointmentSlotKeys(args);
    const b = buildAppointmentSlotKeys({ ...args });
    expect(a).toEqual(b);
  });

  test('A5.14 null/undefined input handled', () => {
    expect(buildAppointmentSlotKeys(null)).toEqual([]);
    expect(buildAppointmentSlotKeys(undefined)).toEqual([]);
    expect(buildAppointmentSlotKeys({})).toEqual([]);
  });

  test('A5.15 SLOT_INTERVAL_MIN exported and equals 15', () => {
    expect(SLOT_INTERVAL_MIN).toBe(15);
  });

  test('A5.16 30-min interval works (configurable)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '10:00',
    }, 30);
    expect(keys).toEqual([
      '2026-05-04_DOC-1_09:00',
      '2026-05-04_DOC-1_09:30',
    ]);
  });

  test('A5.17 midnight edge case (00:00-01:00 returns 4 slots)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '00:00', endTime: '01:00',
    });
    expect(keys).toEqual([
      '2026-05-04_DOC-1_00:00',
      '2026-05-04_DOC-1_00:15',
      '2026-05-04_DOC-1_00:30',
      '2026-05-04_DOC-1_00:45',
    ]);
  });

  test('A5.18 keys are sorted by time (ascending)', () => {
    const keys = buildAppointmentSlotKeys({
      date: '2026-05-04', doctorId: 'DOC-1', startTime: '09:00', endTime: '11:00',
    });
    const times = keys.map((k) => k.split('_')[2]);
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
  });
});

// ─── A6 source-grep — backendClient.js wires AP1-bis multi-slot pattern ────
describe('A6 source-grep — AP1-bis multi-slot wiring', () => {
  const SRC = read('src/lib/backendClient.js');

  test('A6.1 SLOT_INTERVAL_MIN constant declared', () => {
    expect(SRC).toMatch(/export const SLOT_INTERVAL_MIN = 15/);
  });

  test('A6.2 buildAppointmentSlotKeys (plural) is exported', () => {
    expect(SRC).toMatch(/export function buildAppointmentSlotKeys/);
  });

  test('A6.3 createBackendAppointment uses buildAppointmentSlotKeys (plural)', () => {
    // Inside createBackendAppointment body, the slot-keys variable comes from
    // the plural builder (multi-slot AP1-bis).
    expect(SRC).toMatch(/const slotKeys = data\?\.skipServerCollisionCheck[\s\S]*?: buildAppointmentSlotKeys\(/);
  });

  test('A6.4 createBackendAppointment maps slotKeys → slotRefs and reads via Promise.all', () => {
    expect(SRC).toMatch(/const slotRefs = slotKeys\.map\(\(k\) => appointmentSlotDoc\(k\)\)/);
    expect(SRC).toMatch(/await Promise\.all\(slotRefs\.map\(\(ref\) => tx\.get\(ref\)\)\)/);
  });

  test('A6.5 _releaseAppointmentSlot uses buildAppointmentSlotKeys + writeBatch', () => {
    expect(SRC).toMatch(/async function _releaseAppointmentSlot[\s\S]*?const slotKeys = buildAppointmentSlotKeys\(/);
    expect(SRC).toMatch(/async function _releaseAppointmentSlot[\s\S]*?writeBatch\(db\)/);
  });

  test('A6.6 updateBackendAppointment uses buildAppointmentSlotKeys for both old + new', () => {
    expect(SRC).toMatch(/const oldKeys = buildAppointmentSlotKeys\(/);
    expect(SRC).toMatch(/const newKeys = buildAppointmentSlotKeys\(/);
  });

  test('A6.7 updateBackendAppointment slot rotation uses writeBatch (atomic within slot collection)', () => {
    expect(SRC).toMatch(/const releaseBatch = writeBatch\(db\)/);
    expect(SRC).toMatch(/const reserveBatch = writeBatch\(db\)/);
  });

  test('A6.8 collision error message references the slot key for debugging', () => {
    expect(SRC).toMatch(/AP1_COLLISION: slot \$\{slotKeys\[i\]\}/);
  });

  test('A6.9 AP1-bis marker comment present (institutional memory)', () => {
    expect(SRC).toMatch(/AP1-bis \(2026-05-04\)/);
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
