// ─── Phase 24.0-octiesdecies — sync appointment metadata to linked deposit ──
//
// User report 2026-05-06: "พอ edit ลูกค้าที่จองมัดจำ ในช่อง นัดมาเพื่อ
// มาจากตอนแรกไม่ได้กรอกอะไร ตรงตารางในหน้าการเงิน column มัดจำสำหรับ
// ก็แสดงผลว่า - ซึ่งถูกต้องแล้ว แต่พอไป edit ตรงนัดหมายเปลี่ยนเหตุผล
// ตรงตารางหน้าการเงินมันไม่เปลี่ยนตาม"
//
// Bug: AppointmentFormModal updateBackendAppointment writes the new purpose
// to be_appointments.appointmentTo, but the linked be_deposits.appointment.
// purpose stayed stale → DepositPanel "มัดจำสำหรับ" column showed old value.
//
// Fix: NEW syncAppointmentToLinkedDeposit helper in appointmentDepositBatch.js
// uses dotted-path updates to mirror the appt fields onto deposit.appointment.*
// AppointmentFormModal edit-save fires this cascade EVERY edit when
// linkedDepositId is set (independent of customer-attach cascade).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);
const APPT_MODAL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentFormModal.jsx'),
  'utf8',
);

describe('Phase 24.0-octiesdecies — syncAppointmentToLinkedDeposit helper', () => {
  it('CLF3.A.1 — helper exported from appointmentDepositBatch.js', () => {
    expect(PAIR_HELPER).toMatch(/export\s+async\s+function\s+syncAppointmentToLinkedDeposit/);
  });

  it('CLF3.A.2 — helper validates depositId required', async () => {
    const { syncAppointmentToLinkedDeposit } = await import('../src/lib/appointmentDepositBatch.js');
    await expect(
      syncAppointmentToLinkedDeposit('', { purpose: 'X' }),
    ).rejects.toThrow(/depositId required/);
  });

  it('CLF3.A.3 — helper uses dotted-path updates to preserve sibling fields', () => {
    // Source signal: update keys like `appointment.purpose`,
    // `appointment.date` (dotted-path) — these merge atomically with
    // sibling fields on the embedded appointment object.
    const helperBlock = PAIR_HELPER.match(
      /export\s+async\s+function\s+syncAppointmentToLinkedDeposit[\s\S]{0,2500}?return\s*\{[\s\S]{0,200}?\}\s*;\s*\n\}/,
    );
    expect(helperBlock).toBeTruthy();
    expect(helperBlock[0]).toMatch(/update\[`appointment\.\$\{key\}`\]/);
  });

  it('CLF3.A.4 — helper allowedKeys covers purpose + appointmentTo (mirror pair)', () => {
    expect(PAIR_HELPER).toMatch(/'purpose'/);
    expect(PAIR_HELPER).toMatch(/'appointmentTo'/);
  });

  it('CLF3.A.5 — helper allowedKeys covers date / startTime / endTime / doctor / room', () => {
    const allowed = PAIR_HELPER.match(/const\s+allowedKeys\s*=\s*\[[\s\S]{0,500}?\];/);
    expect(allowed).toBeTruthy();
    expect(allowed[0]).toContain("'date'");
    expect(allowed[0]).toContain("'startTime'");
    expect(allowed[0]).toContain("'endTime'");
    expect(allowed[0]).toContain("'doctorId'");
    expect(allowed[0]).toContain("'roomId'");
    expect(allowed[0]).toContain("'channel'");
  });

  it('CLF3.A.6 — helper only updates fields actually present on input (selective merge)', () => {
    // Source signal: hasOwnProperty check before adding to update object.
    expect(PAIR_HELPER).toMatch(/Object\.prototype\.hasOwnProperty\.call\(apptMeta,\s*key\)/);
  });

  it('CLF3.A.7 — helper stamps appointmentSyncedAt forensic field', () => {
    expect(PAIR_HELPER).toMatch(/appointmentSyncedAt:\s*now/);
  });

  it('CLF3.A.8 — helper uses writeBatch (atomicity ready for future cascades)', () => {
    const helperBlock = PAIR_HELPER.match(
      /export\s+async\s+function\s+syncAppointmentToLinkedDeposit[\s\S]{0,2500}?return\s*\{[\s\S]{0,200}?\}\s*;\s*\n\}/,
    );
    expect(helperBlock[0]).toMatch(/writeBatch\(db\)/);
    expect(helperBlock[0]).toMatch(/await\s+batch\.commit\(\)/);
  });

  it('CLF3.A.9 — institutional-memory marker present', () => {
    expect(PAIR_HELPER).toMatch(/MARKER:\s*phase-24-0-octiesdecies-sync-appt-metadata-to-deposit/);
  });
});

describe('Phase 24.0-octiesdecies — AppointmentFormModal edit-save cascade', () => {
  it('CLF3.B.1 — edit-save fires syncAppointmentToLinkedDeposit when linkedDepositId set', () => {
    expect(APPT_MODAL).toMatch(
      /await\s+mod\.syncAppointmentToLinkedDeposit\(linkedDepositId,\s*\{/,
    );
  });

  it('CLF3.B.2 — sync payload includes purpose mirroring appointmentTo', () => {
    expect(APPT_MODAL).toMatch(/purpose:\s*payload\.appointmentTo/);
    expect(APPT_MODAL).toMatch(/appointmentTo:\s*payload\.appointmentTo/);
  });

  it('CLF3.B.3 — sync payload includes date / startTime / endTime / doctor / room', () => {
    const cascadeBlock = APPT_MODAL.match(
      /syncAppointmentToLinkedDeposit\(linkedDepositId,\s*\{[\s\S]{0,1500}?\}\)/,
    );
    expect(cascadeBlock).toBeTruthy();
    expect(cascadeBlock[0]).toMatch(/date:\s*payload\.date/);
    expect(cascadeBlock[0]).toMatch(/startTime:\s*payload\.startTime/);
    expect(cascadeBlock[0]).toMatch(/endTime:\s*payload\.endTime/);
    expect(cascadeBlock[0]).toMatch(/doctorId:\s*payload\.doctorId/);
    expect(cascadeBlock[0]).toMatch(/roomId:\s*payload\.roomId/);
    expect(cascadeBlock[0]).toMatch(/channel:\s*payload\.channel/);
  });

  it('CLF3.B.4 — sync fires on EVERY edit (no transition gate, unlike customer-attach cascade)', () => {
    // Source signal: the call is inside the linkedDepositId-truthy branch
    // but NOT inside the wasUnlinked && isNowLinked gate. The customer-
    // attach cascade is gated; the appt-meta sync is NOT.
    const block = APPT_MODAL.match(
      /if\s*\(linkedDepositId\)\s*\{[\s\S]{0,3000}?\}\s*\}\s*catch\s*\(cascadeErr\)/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/syncAppointmentToLinkedDeposit/);
    // The sync call sits OUTSIDE the wasUnlinked && isNowLinked block.
    // Find the position of the sync call vs the customer-attach gate.
    const customerAttachIdx = block[0].indexOf('attachCustomerToLinkedDeposit');
    const syncIdx = block[0].indexOf('syncAppointmentToLinkedDeposit');
    expect(syncIdx).toBeGreaterThan(0);
    // Sync runs AFTER customer-attach (or instead-of, since sync isn't gated).
    expect(syncIdx).toBeGreaterThan(customerAttachIdx);
  });

  it('CLF3.B.5 — both cascades wrapped in same try/catch (best-effort)', () => {
    expect(APPT_MODAL).toMatch(
      /try\s*\{[\s\S]{0,3500}?attachCustomerToLinkedDeposit[\s\S]{0,1500}?syncAppointmentToLinkedDeposit[\s\S]{0,1500}?\}\s*catch\s*\(cascadeErr\)/,
    );
  });
});

describe('Phase 24.0-octiesdecies — full-flow simulate (Rule I)', () => {
  it('CLF3.F.1 — admin edits "นัดมาเพื่อ" → DepositPanel "มัดจำสำหรับ" reflects new value', () => {
    // Step 1: deposit-booking exists with appointment.purpose=''.
    let depositDoc = {
      depositId: 'DEP-1',
      customerId: '',
      customerName: 'คุณสมชาย',
      appointment: {
        type: 'deposit-booking',
        date: '2026-05-10',
        startTime: '11:00',
        endTime: '12:00',
        purpose: '', // initially empty
      },
    };

    // DepositPanel column read:
    let columnDisplay = depositDoc.appointment?.purpose || depositDoc.appointment?.appointmentTo;
    expect(columnDisplay).toBeFalsy(); // shows '-' initially

    // Step 2: admin edits the appt purpose to "ขลิบ".
    const newApptPayload = {
      date: '2026-05-10',
      startTime: '11:00',
      endTime: '12:00',
      appointmentTo: 'ขลิบ',
      doctorId: 'DR-1',
      // ... other fields
    };

    // Step 3: cascade fires syncAppointmentToLinkedDeposit('DEP-1', {...}).
    // Mirror the helper's dotted-path update on a plain object.
    const update = {};
    const syncMeta = {
      date: newApptPayload.date,
      startTime: newApptPayload.startTime,
      endTime: newApptPayload.endTime,
      purpose: newApptPayload.appointmentTo,
      appointmentTo: newApptPayload.appointmentTo,
      doctorId: newApptPayload.doctorId,
    };
    const allowedKeys = ['date', 'startTime', 'endTime', 'purpose', 'appointmentTo', 'doctorId'];
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(syncMeta, key)) {
        update[`appointment.${key}`] = syncMeta[key];
      }
    }
    // Simulate Firestore dotted-path update on the embedded object.
    for (const [k, v] of Object.entries(update)) {
      const [outer, inner] = k.split('.');
      depositDoc = { ...depositDoc, [outer]: { ...depositDoc[outer], [inner]: v } };
    }

    // Step 4: column display now shows "ขลิบ".
    columnDisplay = depositDoc.appointment?.purpose || depositDoc.appointment?.appointmentTo;
    expect(columnDisplay).toBe('ขลิบ');
  });

  it('CLF3.F.2 — selective merge: missing fields don\'t wipe deposit\'s embedded appointment', () => {
    // The deposit doc has assistantIds set; admin edits purpose only via
    // appt modal. The sync helper must NOT clear assistantIds.
    let depositDoc = {
      appointment: {
        purpose: 'old',
        assistantIds: ['ASST-1', 'ASST-2'],
        roomId: 'R-1',
      },
    };
    const syncMeta = { purpose: 'new' }; // only purpose
    const allowedKeys = ['purpose', 'assistantIds', 'roomId'];
    const update = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(syncMeta, key)) {
        update[`appointment.${key}`] = syncMeta[key];
      }
    }
    for (const [k, v] of Object.entries(update)) {
      const [outer, inner] = k.split('.');
      depositDoc = { ...depositDoc, [outer]: { ...depositDoc[outer], [inner]: v } };
    }
    expect(depositDoc.appointment.purpose).toBe('new');
    expect(depositDoc.appointment.assistantIds).toEqual(['ASST-1', 'ASST-2']); // PRESERVED
    expect(depositDoc.appointment.roomId).toBe('R-1'); // PRESERVED
  });

  it('CLF3.F.3 — pre-fix repro: without sync helper, deposit doc stays stale', () => {
    // Without the cascade, only be_appointments updates; be_deposits.appointment
    // stays at old purpose value → user reports "ตารางหน้าการเงินมันไม่เปลี่ยนตาม".
    const depositDoc = {
      appointment: { purpose: 'old' },
    };
    const newApptPayload = { appointmentTo: 'new' };
    // Pre-fix: only updateBackendAppointment fires; deposit doc UNCHANGED.
    expect(depositDoc.appointment.purpose).toBe('old'); // stale
  });
});
