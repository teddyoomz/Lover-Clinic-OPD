// tests/phase-21-0-deposit-booking-pair-helper.test.js
// Phase 21.0 — P1 — appointmentDepositBatch pure-helper unit tests
//
// Tests the pure builders + id-mint without invoking Firestore. The
// runtime writeBatch path is exercised by the flow-simulate test.

import { describe, test, expect, vi, beforeAll } from 'vitest';

// Mock firebase + firestore exports BEFORE importing the helper so the
// module's getApp() / writeBatch references don't blow up in test env.
vi.mock('../src/firebase.js', () => ({
  db: { __mock_db: true },
  appId: 'test-app-id',
}));
vi.mock('../src/lib/branchSelection.js', () => ({
  resolveSelectedBranchId: () => 'TEST-BR-1234',
}));
vi.mock('firebase/firestore', () => ({
  doc: (...args) => ({ __doc: true, args }),
  getDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn(async () => undefined),
  })),
  // appointment-loop R1 (2026-06-03) — createDepositBookingPair /
  // createAppointmentForExistingDeposit now reserve AP1-bis slots inside a
  // runTransaction (was a plain writeBatch with NO slot guard → double-booking).
  // Default tx: no slot is taken (get→!exists) so the happy path commits.
  runTransaction: vi.fn(async (_db, cb) => cb({
    get: vi.fn(async () => ({ exists: () => false, data: () => ({}) })),
    set: vi.fn(),
    update: vi.fn(),
  })),
  serverTimestamp: () => ({ __serverTimestamp: true }),
}));

let helper;
beforeAll(async () => {
  helper = await import('../src/lib/appointmentDepositBatch.js');
});

describe('Phase 21.0 — P1 pure helpers', () => {
  test('P1.1 mintPairIds returns DEP-{ts} + BA-{ts}-{8hex}', () => {
    // Phase 24.0-vicies (2026-05-06) — suffix bumped 4 → 8 hex chars
    // (16-bit → 32-bit entropy) to drop tight-loop collision rate from
    // ~7.6% (100 ids in same ms) to ~2.3e-6 (1000 ids).
    const { depositId, appointmentId } = helper.mintPairIds();
    expect(depositId).toMatch(/^DEP-\d{13}$/);
    expect(appointmentId).toMatch(/^BA-\d{13}-[0-9a-f]{8}$/);
  });

  test('P1.2 mintPairIds emits unique appointment ids on repeated calls', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const { appointmentId } = helper.mintPairIds();
      ids.add(appointmentId);
    }
    expect(ids.size).toBe(100);
  });

  test('P1.3 buildAppointmentPairPayload sets type = deposit-booking + cross-link', () => {
    const payload = helper.buildAppointmentPairPayload({
      depositData: {
        customerId: 'TEST-CUST-1',
        customerName: 'Test Patient',
        customerHN: 'HN-001',
        appointment: {
          date: '2026-05-10',
          startTime: '10:00',
          endTime: '10:15',
          doctorId: 'doc-1',
          doctorName: 'Dr. Smith',
        },
      },
      depositId: 'DEP-123',
      appointmentId: 'BA-456-ab',
      branchId: 'TEST-BR-X',
    });
    expect(payload.appointmentType).toBe('deposit-booking');
    expect(payload.linkedDepositId).toBe('DEP-123');
    expect(payload.spawnedFromDepositId).toBe('DEP-123');
    expect(payload.appointmentId).toBe('BA-456-ab');
    expect(payload.branchId).toBe('TEST-BR-X');
    expect(payload.customerId).toBe('TEST-CUST-1');
    expect(payload.date).toBe('2026-05-10');
    expect(payload.startTime).toBe('10:00');
    expect(payload.endTime).toBe('10:15');
  });

  test('P1.4 buildAppointmentPairPayload defaults endTime to startTime when missing', () => {
    const payload = helper.buildAppointmentPairPayload({
      depositData: { appointment: { date: '2026-05-10', startTime: '10:00' } },
      depositId: 'DEP-x',
      appointmentId: 'BA-x',
      branchId: 'BR-x',
    });
    expect(payload.endTime).toBe('10:00');
  });

  test('P1.5 buildAppointmentPairPayload preserves arrays without aliasing', () => {
    const ids = ['a1', 'a2'];
    const names = ['A1', 'A2'];
    const payload = helper.buildAppointmentPairPayload({
      depositData: {
        appointment: {
          date: '2026-05-10', startTime: '10:00',
          assistantIds: ids, assistantNames: names,
        },
      },
      depositId: 'DEP-x', appointmentId: 'BA-x', branchId: null,
    });
    expect(payload.assistantIds).toEqual(['a1', 'a2']);
    expect(payload.assistantNames).toEqual(['A1', 'A2']);
  });

  test('P1.6 buildDepositPairPayload includes linkedAppointmentId cross-link', () => {
    const payload = helper.buildDepositPairPayload({
      depositData: {
        customerId: 'C1',
        amount: '500',
        paymentChannel: 'เงินสด',
        appointment: { date: '2026-05-10', startTime: '10:00' },
      },
      depositId: 'DEP-1',
      appointmentId: 'BA-1',
      branchId: 'BR-1',
    });
    expect(payload.linkedAppointmentId).toBe('BA-1');
    expect(payload.depositId).toBe('DEP-1');
    expect(payload.amount).toBe(500);
    expect(payload.remainingAmount).toBe(500);
    expect(payload.usedAmount).toBe(0);
    expect(payload.status).toBe('active');
    expect(payload.hasAppointment).toBe(true);
    expect(payload.branchId).toBe('BR-1');
  });

  test('P1.7 createDepositBookingPair throws when missing depositData', async () => {
    await expect(helper.createDepositBookingPair({}))
      .rejects.toThrow('depositData required');
  });

  test('P1.8 createDepositBookingPair throws when missing appointment', async () => {
    await expect(
      helper.createDepositBookingPair({
        depositData: { customerId: 'C', hasAppointment: true },
      })
    ).rejects.toThrow('appointment required');
  });

  test('P1.9 createDepositBookingPair throws when appointment lacks date/startTime', async () => {
    await expect(
      helper.createDepositBookingPair({
        depositData: { hasAppointment: true, appointment: {} },
      })
    ).rejects.toThrow(/date.*startTime|startTime.*date/i);
  });

  test('P1.10 createDepositBookingPair reserves AP1-bis slots + writes both docs atomically (appointment-loop R1)', async () => {
    // appointment-loop R1 (2026-06-03) — was a plain writeBatch with NO slot
    // reservation → the deposit-booking flow BYPASSED the AP1-bis double-booking
    // guard (reproduced on real prod: 2 concurrent deposit bookings same
    // doctor+slot → appts=2 deposits=2 collisions=0). Now ONE runTransaction
    // reserves a be_appointment_slots doc per 15-min interval + writes the
    // deposit + appointment atomically. 10:00-11:00 → 4 interval slots; with the
    // deposit + appointment doc that's 6 tx.set + 4 slot tx.get.
    const { runTransaction } = await import('firebase/firestore');
    runTransaction.mockClear();
    const txGet = vi.fn(async () => ({ exists: () => false, data: () => ({}) }));
    const txSet = vi.fn();
    runTransaction.mockImplementationOnce(async (_db, cb) => cb({ get: txGet, set: txSet, update: vi.fn() }));
    const result = await helper.createDepositBookingPair({
      depositData: {
        customerId: 'C1',
        hasAppointment: true,
        appointment: { date: '2026-05-10', startTime: '10:00', endTime: '11:00', doctorId: 'DOC-1' },
      },
      branchId: 'BR-test',
    });
    expect(runTransaction).toHaveBeenCalledTimes(1);
    expect(txGet).toHaveBeenCalledTimes(4);            // 4 interval slot reads (10:00/10:15/10:30/10:45)
    expect(txSet).toHaveBeenCalledTimes(6);            // 4 slots + 1 deposit + 1 appointment
    expect(result.depositId).toMatch(/^DEP-/);
    expect(result.appointmentId).toMatch(/^BA-/);
  });

  test('P1.10-bis createDepositBookingPair throws AP1_COLLISION when an interval slot is already taken', async () => {
    // appointment-loop R1 — the atomic guard: if any reserved interval slot
    // already belongs to a non-cancelled appointment, the whole pair write
    // aborts (no deposit, no appointment) with code AP1_COLLISION.
    const { runTransaction } = await import('firebase/firestore');
    runTransaction.mockImplementationOnce(async (_db, cb) => cb({
      get: vi.fn(async () => ({ exists: () => true, data: () => ({ appointmentId: 'BA-existing', cancelled: false }) })),
      set: vi.fn(),
      update: vi.fn(),
    }));
    await expect(helper.createDepositBookingPair({
      depositData: {
        customerId: 'C1',
        hasAppointment: true,
        appointment: { date: '2026-05-10', startTime: '10:00', endTime: '11:00', doctorId: 'DOC-1' },
      },
      branchId: 'BR-test',
    })).rejects.toMatchObject({ code: 'AP1_COLLISION' });
  });

  test('P1.11 cancelDepositBookingPair returns pairCancelled=false when no link', async () => {
    const { getDoc, writeBatch } = await import('firebase/firestore');
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ usedAmount: 0, linkedAppointmentId: '' }),
    });
    const updateMock = vi.fn();
    const commitMock = vi.fn(async () => undefined);
    writeBatch.mockReturnValue({
      set: vi.fn(),
      update: updateMock,
      commit: commitMock,
    });
    const result = await helper.cancelDepositBookingPair('DEP-1', { cancelNote: 'test' });
    expect(result.pairCancelled).toBe(false);
    expect(updateMock).toHaveBeenCalledTimes(1);  // Only deposit, no appt
  });

  test('P1.12 cancelDepositBookingPair updates BOTH docs when link present', async () => {
    const { getDoc, writeBatch } = await import('firebase/firestore');
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ usedAmount: 0, linkedAppointmentId: 'BA-X' }),
    });
    const updateMock = vi.fn();
    const commitMock = vi.fn(async () => undefined);
    writeBatch.mockReturnValue({
      set: vi.fn(),
      update: updateMock,
      commit: commitMock,
    });
    const result = await helper.cancelDepositBookingPair('DEP-1', { cancelNote: 'test' });
    expect(result.pairCancelled).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(2);  // deposit + appointment
    expect(result.appointmentId).toBe('BA-X');
  });

  test('P1.13 cancelDepositBookingPair refuses when usedAmount > 0', async () => {
    const { getDoc } = await import('firebase/firestore');
    getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({ usedAmount: 100, linkedAppointmentId: 'BA-X' }),
    });
    await expect(helper.cancelDepositBookingPair('DEP-1', { cancelNote: 'x' }))
      .rejects.toThrow(/มัดจำถูกใช้/);
  });

  test('P1.14 phase-21-0 marker present in helper source', () => {
    const { readFileSync } = require('node:fs');
    const SRC = readFileSync('src/lib/appointmentDepositBatch.js', 'utf8');
    expect(SRC).toMatch(/MARKER:\s*phase-21-0-deposit-booking-pair-helper/);
    expect(SRC).toMatch(/Phase 21\.0/);
  });
});
