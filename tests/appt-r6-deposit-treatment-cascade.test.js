// tests/appt-r6-deposit-treatment-cascade.test.js
// appointment-loop R6 (2026-06-03) — convergence-hunt fixes, Tier-2 regression
// (Rule P). Real-prod L2 proof: scripts/e2e-appt-r6-deposit-treatment-cascade.mjs (12/0).
//
//  A (P1, V67-class): buildAppointmentPairPayload DROPPED notifyChannel → every
//     deposit-booking got NO LINE reminder (cron filters notifyChannel.includes).
//  B/C/D (P1, Rule T): cancel/delete pair were getDoc→writeBatch (non-atomic) → a
//     concurrent applyDepositToSale lost-updated → cancelled deposit + used funds
//     (re-spendable money). + cancel crashed on a keep-deposit dangling appt FK.
//  E (P1): treatment delete left appt.linkedTreatmentId dangling → bricked appt.
//  F (P2): the reminder cron had no per-appt fault isolation.

import { describe, it, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildAppointmentPairPayload } from '../src/lib/appointmentDepositBatch.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const DEPO = read('src/lib/appointmentDepositBatch.js');
const BACKEND = read('src/lib/backendClient.js');
const CRON = read('api/cron/line-reminder-fire.js');

// fnExport(src, name) — slice from `export ... function name(` to the next top-level `export`.
function fnExport(src, name) {
  const re = new RegExp(`export (?:async )?function ${name}\\b`);
  const m = re.exec(src);
  if (!m) throw new Error(`fn ${name} not found`);
  const rest = src.slice(m.index + 1);
  const nxt = rest.search(/\nexport (?:async )?function /);
  return src.slice(m.index, nxt < 0 ? src.length : m.index + 1 + nxt);
}

describe('R6.A — deposit-booking appt carries notifyChannel (V67-class field-drop fix)', () => {
  const appt = (notifyChannel) => buildAppointmentPairPayload({
    depositData: { customerId: 'C', appointment: { date: '2099-01-01', startTime: '10:00', notifyChannel } },
    depositId: 'DEP-1', appointmentId: 'BA-1', branchId: 'BR-1',
  });

  test('A.1 [line] propagates → the cron-eligible field is present', () => {
    expect(appt(['line']).notifyChannel).toEqual(['line']);
  });
  test('A.2 undefined → [] (never undefined; field always exists, no false opt-in)', () => {
    expect(appt(undefined).notifyChannel).toEqual([]);
  });
  test('A.3 a non-array (corrupt) → [] (defensive)', () => {
    expect(appt('line').notifyChannel).toEqual([]);
  });
  test('A.4 createAppointmentForExistingDeposit ALSO carries notifyChannel', () => {
    const body = fnExport(DEPO, 'createAppointmentForExistingDeposit');
    expect(body).toMatch(/notifyChannel: Array\.isArray\(apptPayload\.notifyChannel\)/);
  });
});

describe('R6.B/C/D — deposit cancel/delete pair are ATOMIC (Rule T) + tolerate a missing appt', () => {
  const cancel = fnExport(DEPO, 'cancelDepositBookingPair');
  const del = fnExport(DEPO, 'deleteDepositBookingPair');

  test('B/C.1 cancel re-reads + re-guards usedAmount INSIDE a runTransaction', () => {
    expect(cancel).toMatch(/await runTransaction\(db, async \(tx\)/);
    expect(cancel).toMatch(/const s = await tx\.get\(depositRef\)/);
    expect(cancel).toMatch(/Number\(d\.usedAmount\) \|\| 0\) > 0/);
  });
  test('B.2 cancel reads the appt in-tx + updates ONLY if it exists (no NOT_FOUND crash)', () => {
    expect(cancel).toMatch(/const apptSnap = apptRef \? await tx\.get\(apptRef\)/);
    expect(cancel).toMatch(/if \(apptRef && apptSnap\.exists\(\)\)/);
  });
  test('B/C.3 [ANTI-REGRESSION] no blind writeBatch deposit-mutation survives in the pair helpers', () => {
    expect(cancel).not.toMatch(/const batch = writeBatch\(db\)/);
    expect(del).not.toMatch(/const batch = writeBatch\(db\)/);
  });
  test('C/D.4 delete re-guards usedAmount INSIDE a runTransaction', () => {
    expect(del).toMatch(/await runTransaction\(db, async \(tx\)/);
    expect(del).toMatch(/const s = await tx\.get\(depRef\)/);
    expect(del).toMatch(/Number\(s\.data\(\)\?\.usedAmount\) \|\| 0\) > 0/);
  });
});

describe('R6.E — treatment delete CLEARS the appointment’s dangling linkedTreatmentId', () => {
  const body = fnExport(BACKEND, 'deleteBackendTreatment');
  test('E.1 queries be_appointments by linkedTreatmentId == treatmentId and clears it', () => {
    expect(body).toMatch(/where\('linkedTreatmentId', '==', treatmentId\)/);
    expect(body).toMatch(/updateDoc\(d\.ref, \{\s*linkedTreatmentId: '',/);
  });
  test('E.2 the clear is best-effort (try/catch) so it never blocks the delete', () => {
    // the deleteDoc happens, THEN the link-clear in a try/catch
    expect(body).toMatch(/await deleteDoc\(treatmentDoc\(treatmentId\)\);[\s\S]*try \{[\s\S]*linkedTreatmentId/);
    expect(body).toMatch(/linkedTreatmentId clear skipped/);
  });
});

describe('R6.F — reminder cron has per-appointment fault isolation', () => {
  test('F.1 runReminderPipeline + the per-appt reads are wrapped so one failure cannot halt the batch', () => {
    // the for-loop body opens a try BEFORE the customer read + pipeline call ...
    const loop = CRON.slice(CRON.indexOf('for (const apptDoc of apptsSnap.docs)'));
    expect(loop).toMatch(/try \{[\s\S]*?runReminderPipeline\(/);          // pipeline inside the try
    // ... and closes with a catch that counts a failure + continues (no rethrow)
    expect(loop).toMatch(/\} catch \(err\) \{[\s\S]*?summary\.failed\+\+;/);
    expect(loop).toMatch(/failed \(isolated\)/);
  });
});
