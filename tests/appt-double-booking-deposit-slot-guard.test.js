// tests/appt-double-booking-deposit-slot-guard.test.js
// appointment-loop R1 (2026-06-03) — regression lock for the deposit-booking
// double-booking fix.
//
// BUG (reproduced on REAL prod, scripts/e2e-appointment-double-booking-concurrency.mjs):
//   createBackendAppointment reserves a be_appointment_slots doc per 15-min
//   interval inside a runTransaction (AP1-bis atomic double-booking guard). The
//   DEPOSIT-booking writers (createDepositBookingPair / createAppointmentForExistingDeposit)
//   did a plain writeBatch.set(appt) with NO slot reservation → the money-backed
//   booking flow had ZERO atomic double-booking protection and the two flows
//   were mutually blind. Pre-fix D1: 2 concurrent deposit bookings same
//   doctor+slot → appts=2 deposits=2 collisions=0. Post-fix: appts=1 collisions=1.
//
// FIX: extract the pure slot-key builders to src/lib/appointmentSlotKeys.js so
// appointmentDepositBatch reserves the SAME slots (one namespace, mutually
// exclusive). cancel/delete release the slots (no orphans). Callers surface
// AP1_COLLISION as a friendly Thai message instead of a swallow / false success.
//
// This file locks the fix SHAPE (source-grep) + the pure slot-key contract
// (unit). The BEHAVIOR is proven by the real-prod L2 e2e (16/0).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildAppointmentSlotKeys, buildAppointmentSlotKey, buildAppointmentRoomSlotKeys, buildAppointmentGuardKeys, SLOT_INTERVAL_MIN } from '../src/lib/appointmentSlotKeys.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const SLOTKEYS = read('src/lib/appointmentSlotKeys.js');
const DEPOSIT = read('src/lib/appointmentDepositBatch.js');
const BACKEND = read('src/lib/backendClient.js');
const DEPOSIT_PANEL = read('src/components/backend/DepositPanel.jsx');
const ADMIN_DASH = read('src/pages/AdminDashboard.jsx');

// Slice an `export ... function NAME` body up to the NEXT top-level export so
// source-grep asserts are scoped to that function regardless of its length.
function fnExport(src, name) {
  const m = src.match(new RegExp(`export (?:async )?function ${name}\\b`));
  if (!m) return '';
  const start = m.index;
  const rest = src.slice(start + m[0].length);
  const next = rest.search(/\nexport (?:async )?function /);
  return src.slice(start, next >= 0 ? start + m[0].length + next : src.length);
}
// Slice a non-exported helper by a bounded span.
function span(src, marker, n = 1500) {
  const i = src.indexOf(marker);
  return i < 0 ? '' : src.slice(i, i + n);
}

describe('appointment-loop R1 — shared slot-key module (extraction)', () => {
  test('R1.1 appointmentSlotKeys exports the pure builders', () => {
    expect(SLOT_INTERVAL_MIN).toBe(15);
    expect(typeof buildAppointmentSlotKeys).toBe('function');
    expect(typeof buildAppointmentSlotKey).toBe('function');
    expect(SLOTKEYS).not.toMatch(/from ['"]firebase/);
    expect(SLOTKEYS).not.toMatch(/from ['"]\.\.\/firebase/);
  });

  test('R1.2 buildAppointmentSlotKeys emits one key per 15-min interval (AP1-bis)', () => {
    expect(buildAppointmentSlotKeys({ date: '2026-05-10', doctorId: 'D1', startTime: '10:00', endTime: '11:00' }))
      .toEqual(['2026-05-10_D1_10:00', '2026-05-10_D1_10:15', '2026-05-10_D1_10:30', '2026-05-10_D1_10:45']);
  });

  test('R1.3 range-overlap shares an interval slot (the collision the legacy key missed)', () => {
    const a = buildAppointmentSlotKeys({ date: '2026-05-10', doctorId: 'D1', startTime: '09:00', endTime: '10:00' });
    const b = buildAppointmentSlotKeys({ date: '2026-05-10', doctorId: 'D1', startTime: '09:30', endTime: '10:30' });
    expect(a.some((k) => b.includes(k))).toBe(true);
  });

  test('R1.4 no doctor / no parseable time → no keys (legacy/open-ended → no guard)', () => {
    expect(buildAppointmentSlotKeys({ date: '2026-05-10', startTime: '10:00' })).toEqual([]);
    expect(buildAppointmentSlotKeys({ date: '2026-05-10', doctorId: 'D1', startTime: 'xx' })).toEqual([]);
  });

  test('R1.5 backendClient re-exports the builders from the shared module (no duplicate local def)', () => {
    expect(BACKEND).toMatch(/from ['"]\.\/appointmentSlotKeys\.js['"]/);
    expect(BACKEND).toMatch(/export \{[^}]*buildAppointmentSlotKeys[^}]*\}/);
    expect(BACKEND).not.toMatch(/export function buildAppointmentSlotKeys\s*\(/);
  });
});

describe('appointment-loop R1 — deposit-booking writers reserve slots atomically', () => {
  test('R1.6 appointmentDepositBatch imports the shared guard keys + runTransaction + helpers', () => {
    expect(DEPOSIT).toMatch(/import \{ buildAppointmentGuardKeys \} from ['"]\.\/appointmentSlotKeys\.js['"]/);
    expect(DEPOSIT).toMatch(/runTransaction/);
    expect(DEPOSIT).toMatch(/const appointmentSlotDoc =/);
    expect(DEPOSIT).toMatch(/async function _reserveAppointmentSlotsInTx/);
    expect(DEPOSIT).toMatch(/async function _appointmentSlotKeysForRelease/);
  });

  test('R1.7 the reservation helper throws AP1_COLLISION + reserves every guard slot', () => {
    const body = span(DEPOSIT, '_reserveAppointmentSlotsInTx', 1500);
    expect(body).toMatch(/buildAppointmentGuardKeys/);   // R2: doctor + room namespaces
    expect(body).toMatch(/tx\.get/);
    expect(body).toMatch(/err\.code = ['"]AP1_COLLISION['"]/);
    expect(body).toMatch(/tx\.set\(slotRefs/);
  });

  test('R1.8 createDepositBookingPair uses runTransaction + reserves slots (NOT a bare writeBatch.set)', () => {
    const body = fnExport(DEPOSIT, 'createDepositBookingPair');
    expect(body).toMatch(/runTransaction\(db, async \(tx\) =>/);
    expect(body).toMatch(/_reserveAppointmentSlotsInTx\(tx/);
    expect(body).toMatch(/tx\.set\(depositDoc\(depositId\)/);
    expect(body).toMatch(/tx\.set\(appointmentDoc\(appointmentId\)/);
    expect(body).not.toMatch(/batch\.set\(appointmentDoc\(appointmentId\), apptPayload\)/);
  });

  test('R1.9 createAppointmentForExistingDeposit uses runTransaction + reserves slots', () => {
    const body = fnExport(DEPOSIT, 'createAppointmentForExistingDeposit');
    expect(body).toMatch(/runTransaction\(db, async \(tx\) =>/);
    expect(body).toMatch(/_reserveAppointmentSlotsInTx\(tx/);
    expect(body).toMatch(/tx\.set\(appointmentDoc\(appointmentId\), newApptPayload\)/);
    expect(body).not.toMatch(/batch\.set\(appointmentDoc\(appointmentId\), newApptPayload\)/);
  });

  test('R1.10 cancel + delete pair RELEASE the slot docs (no orphan slots)', () => {
    const cancel = fnExport(DEPOSIT, 'cancelDepositBookingPair');
    expect(cancel).toMatch(/_appointmentSlotKeysForRelease\(appointmentId\)/);
    expect(cancel).toMatch(/batch\.delete\(appointmentSlotDoc\(k\)\)/);
    const del = fnExport(DEPOSIT, 'deleteDepositBookingPair');
    expect(del).toMatch(/_appointmentSlotKeysForRelease\(appointmentId\)/);
    expect(del).toMatch(/batch\.delete\(appointmentSlotDoc\(k\)\)/);
  });
});

describe('appointment-loop R1 — callers surface the collision (no swallow / no false success)', () => {
  test('R1.11 DepositPanel.handleSave maps AP1_COLLISION to a friendly Thai message', () => {
    expect(DEPOSIT_PANEL).toMatch(/err\?\.code === ['"]AP1_COLLISION['"]/);
    expect(DEPOSIT_PANEL).toMatch(/มีนัดของแพทย์ท่านนี้อยู่แล้ว/);
  });

  test('R1.12 confirmCreateDeposit (kiosk) does NOT show a false success on collision', () => {
    expect(ADMIN_DASH).toMatch(/let pairBookingCollision = false/);
    expect(ADMIN_DASH).toMatch(/pairBookingCollision = pairErr\?\.code === ['"]AP1_COLLISION['"]/);
    // the success toast is now gated on the collision flag
    expect(ADMIN_DASH).toMatch(/showToast\(pairBookingCollision/);
  });
});

describe('appointment-loop R1 — class-of-bug classifier (all appointment-create slot-guard paths)', () => {
  // Fixed this round: the 2 deposit writers. Pre-existing-guarded:
  // createBackendAppointment. Flagged-deferred (next loop rounds, own repro):
  // room-dimension collisions (slot keys are doctor-only) + un-cancel re-reserve.
  test('R1.13 createBackendAppointment still has its AP1-bis runTransaction guard (untouched)', () => {
    const body = fnExport(BACKEND, 'createBackendAppointment');
    expect(body).toMatch(/runTransaction\(db, async \(tx\) =>/);
    expect(body).toMatch(/buildAppointmentSlotKeys/);
    expect(body).toMatch(/AP1_COLLISION/);
  });

  test('R1.14 createDepositForExistingAppointment links a deposit to an EXISTING appt (no NEW slot reservation)', () => {
    const body = fnExport(DEPOSIT, 'createDepositForExistingAppointment');
    expect(body).toMatch(/batch\.set\(depositDoc\(depositId\)/);
    expect(body).toMatch(/batch\.update\(apptRef/);
    expect(body).not.toMatch(/_reserveAppointmentSlotsInTx/);
  });
});

// ─── R2 — room dimension (B) + un-cancel re-reserve (C) ──────────────────────
// Both reproduced on REAL prod (scripts/diag-appointment-room-uncancel-probe.mjs:
// B → 2 doctors same room+time both succeeded; C → un-cancel did NOT re-reserve).
describe('appointment-loop R2 — room slot namespace (B)', () => {
  test('R2.1 buildAppointmentRoomSlotKeys emits ROOM__-prefixed keys per interval', () => {
    expect(buildAppointmentRoomSlotKeys({ date: '2026-05-10', roomId: 'R1', startTime: '10:00', endTime: '11:00' }))
      .toEqual(['ROOM__2026-05-10_R1_10:00', 'ROOM__2026-05-10_R1_10:15', 'ROOM__2026-05-10_R1_10:30', 'ROOM__2026-05-10_R1_10:45']);
    expect(buildAppointmentRoomSlotKeys({ date: '2026-05-10', startTime: '10:00' })).toEqual([]); // no room → no keys
  });

  test('R2.2 buildAppointmentGuardKeys = doctor keys + room keys; a room key can NEVER equal a doctor key', () => {
    const keys = buildAppointmentGuardKeys({ date: '2026-05-10', doctorId: 'D1', roomId: 'R1', startTime: '10:00', endTime: '10:15' });
    expect(keys).toContain('2026-05-10_D1_10:00');          // doctor
    expect(keys).toContain('ROOM__2026-05-10_R1_10:00');    // room
    // doctor keys start with the date; room keys start with ROOM__ → disjoint namespaces
    const docKeys = keys.filter((k) => !k.startsWith('ROOM__'));
    const roomKeys = keys.filter((k) => k.startsWith('ROOM__'));
    expect(docKeys.some((k) => roomKeys.includes(k))).toBe(false);
  });

  test('R2.3 createBackendAppointment guards the room (uses buildAppointmentGuardKeys with roomId)', () => {
    const body = fnExport(BACKEND, 'createBackendAppointment');
    expect(body).toMatch(/buildAppointmentGuardKeys\(\{/);
    expect(body).toMatch(/roomId: data\?\.roomId/);
  });

  test('R2.4 deposit reserve helper accepts roomId + both create callers forward it', () => {
    const helper = span(DEPOSIT, 'async function _reserveAppointmentSlotsInTx', 400);
    expect(helper).toMatch(/roomId/);
    expect(helper).toMatch(/buildAppointmentGuardKeys/);
    expect(fnExport(DEPOSIT, 'createDepositBookingPair')).toMatch(/roomId: apptPayload\.roomId/);
    expect(fnExport(DEPOSIT, 'createAppointmentForExistingDeposit')).toMatch(/roomId: newApptPayload\.roomId/);
  });

  test('R2.5 release helpers use buildAppointmentGuardKeys (release the room slots too)', () => {
    expect(span(DEPOSIT, 'async function _appointmentSlotKeysForRelease', 700)).toMatch(/buildAppointmentGuardKeys/);
    expect(span(BACKEND, 'async function _releaseAppointmentSlot', 900)).toMatch(/buildAppointmentGuardKeys/);
  });
});

describe('appointment-loop R2 — un-cancel re-reserves the slot (C)', () => {
  test('R2.6 updateBackendAppointment re-reserves slots on cancelled→non-cancelled', () => {
    const body = fnExport(BACKEND, 'updateBackendAppointment');
    expect(body).toMatch(/const becameUncancelled = oldData\.status === ['"]cancelled['"]/);
    expect(body).toMatch(/else if \(becameUncancelled && newKeys\.length > 0\)/);
    // the re-reserve writes the new slot docs
    expect(body).toMatch(/reBatch\.set\(appointmentSlotDoc\(key\)/);
  });
});
