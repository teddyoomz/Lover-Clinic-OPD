// tests/create-deposit-for-existing-appointment.test.js
// Task E5 — reverse helper: create a deposit for an EXISTING appointment (flip-to in edit).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { buildDepositPairPayload } from '../src/lib/appointmentDepositBatch.js';

const SRC = fs.readFileSync('src/lib/appointmentDepositBatch.js', 'utf8');

describe('createDepositForExistingAppointment', () => {
  it('is exported + reuses buildDepositPairPayload + writeBatch + updates the appointment doc', () => {
    expect(SRC).toMatch(/export async function createDepositForExistingAppointment\(appointmentId, depositData = \{\}\)/);
    expect(SRC).toMatch(/buildDepositPairPayload\(/);
    expect(SRC).toMatch(/batch\.update\(apptRef/);
    expect(SRC).toMatch(/appointmentType:\s*'deposit-booking'/);
    expect(SRC).toMatch(/linkedDepositId:\s*depositId/);
  });

  it('builder links deposit→appointment via linkedAppointmentId + money fields correct', () => {
    const payload = buildDepositPairPayload({
      depositData: {
        amount: 2000, paymentChannel: 'เงินสด',
        appointment: { type: 'deposit-booking', date: '2026-05-25', startTime: '10:00' },
      },
      depositId: 'DEP-1', appointmentId: 'BA-1', branchId: 'BR-A',
    });
    expect(payload.linkedAppointmentId).toBe('BA-1');
    expect(payload.amount).toBe(2000);
    expect(payload.remainingAmount).toBe(2000);
    expect(payload.usedAmount).toBe(0);
    expect(payload.status).toBe('active');
    expect(payload.hasAppointment).toBe(true);
  });
});
