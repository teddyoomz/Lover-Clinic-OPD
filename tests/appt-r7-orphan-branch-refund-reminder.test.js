// tests/appt-r7-orphan-branch-refund-reminder.test.js
// appointment-loop R7 (2026-06-03) — convergence-hunt fixes, Tier-2 regression
// (Rule P). Real-prod L2: scripts/e2e-appt-r7-orphan-and-refund-release.mjs (9/0).
//
//  A (P1, ghost-collision): clearing the doctor (→ ไม่ระบุ) on a roomless appt
//     orphaned the old doctor slots (release was gated on newKeys.length>0).
//  B (P1, branch relocate): the edit payload stamped selectedBranchId
//     unconditionally → editing a cross-branch appt relocated it (+ orphaned its
//     deposit across the branch boundary).
//  C1 (P1, slot leak): refundDeposit touched only the deposit → a fully-refunded
//     unused deposit-booking left a phantom slot-holding 'pending' appointment.
//  C2/LEAD2 (P1, reminder suppressed): the reminder log key is date-agnostic →
//     a reschedule after a 'sent' reminder suppressed the new date's reminder.

import { describe, it, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildReminderLogDoc } from '../src/lib/lineReminderClient.js';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const BACKEND = read('src/lib/backendClient.js');
const MODAL = read('src/components/backend/AppointmentFormModal.jsx');
const FIRE = read('api/cron/line-reminder-fire.js');

function fnExport(src, name) {
  const re = new RegExp(`export (?:async )?function ${name}\\b`);
  const m = re.exec(src); if (!m) throw new Error(`fn ${name} not found`);
  const rest = src.slice(m.index + 1);
  const nxt = rest.search(/\nexport (?:async )?function /);
  return src.slice(m.index, nxt < 0 ? src.length : m.index + 1 + nxt);
}

describe('R7.A — updateBackendAppointment releases old slots on ANY key-set change', () => {
  const body = fnExport(BACKEND, 'updateBackendAppointment');
  test('A.1 the change signal is the key-set diff, NOT gated on newKeys being non-empty', () => {
    expect(body).toMatch(/const keysChanged = oldKeySig !== newKeySig;/);
    expect(body).toMatch(/\} else if \(keysChanged\) \{/);
  });
  test('A.2 [ANTI-REGRESSION] the release no longer requires newKeys.length>0 (the orphan gate)', () => {
    // the pre-R7 timeChanged required `newKeys.length > 0` — must be gone
    expect(body).not.toMatch(/oldKeys\.length > 0 && newKeys\.length > 0 && oldKeySig/);
    // the release is guarded only on having OLD keys to release
    expect(body).toMatch(/if \(oldKeys\.length > 0\) \{[\s\S]*?releaseBatch\.delete/);
  });
});

describe('R7.B — AppointmentFormModal preserves the appointment’s branchId on edit', () => {
  test('B.1 the edit payload uses appt.branchId (immutable-after-create), not the selected branch', () => {
    expect(MODAL).toMatch(/branchId: \(mode === 'edit' && appt\) \? \(appt\.branchId \|\| selectedBranchId\) : selectedBranchId/);
  });
  test('B.2 [unit] the branchId expression preserves the appt branch on edit, uses selected on create', () => {
    const resolve = (mode, appt, selectedBranchId) => (mode === 'edit' && appt) ? (appt.branchId || selectedBranchId) : selectedBranchId;
    expect(resolve('edit', { branchId: 'BR-A' }, 'BR-B')).toBe('BR-A');   // edit a cross-branch appt → stays BR-A
    expect(resolve('edit', { branchId: '' }, 'BR-B')).toBe('BR-B');       // legacy appt w/o branch → fill selected
    expect(resolve('create', null, 'BR-B')).toBe('BR-B');                 // new appt → current branch
  });
});

describe('R7.C1 — refundDeposit releases the linked appt slot on a full UNUSED refund', () => {
  const body = fnExport(BACKEND, 'refundDeposit');
  test('C1.1 a full refund of an UNUSED deposit flags releaseAppt (used → never cancel the visit)', () => {
    expect(body).toMatch(/releaseAppt: fullRefund && \(Number\(cur\.usedAmount\) \|\| 0\) === 0/);
  });
  test('C1.2 on releaseAppt it cancels the linked appointment (which releases the AP1 slots)', () => {
    expect(body).toMatch(/if \(out\.releaseAppt && out\.linkedAppointmentId\)/);
    expect(body).toMatch(/updateBackendAppointment\(out\.linkedAppointmentId, \{ status: 'cancelled' \}\)/);
  });
});

describe('R7.C2 — reminder idempotency is date-aware (re-fire on reschedule)', () => {
  test('C2.1 buildReminderLogDoc stamps sentForDate', () => {
    const doc = buildReminderLogDoc({ appointmentId: 'BA-1', customerId: 'C', branchId: 'BR', reminderType: 'dayBefore', status: 'sent', sentForDate: '2099-01-02' });
    expect(doc.sentForDate).toBe('2099-01-02');
  });
  test('C2.2 sentForDate defaults to null (legacy-safe; never undefined for setDoc)', () => {
    const doc = buildReminderLogDoc({ appointmentId: 'BA-1', customerId: 'C', branchId: 'BR', reminderType: 'dayBefore', status: 'skipped-cancelled' });
    expect(doc.sentForDate).toBeNull();
  });
  test('C2.3 the fire cron suppresses only when sentForDate matches (or is legacy-null), else re-fires', () => {
    expect(FIRE).toMatch(/const sentFor = existingLog\.data\(\)\.sentForDate;/);
    expect(FIRE).toMatch(/if \(sentFor == null \|\| sentFor === appt\.date\) \{[\s\S]*?return \{ status: 'already-sent' \};/);
    // the sent-log write stamps the date
    expect(FIRE).toMatch(/sentForDate: appt\.date,/);
  });
});
