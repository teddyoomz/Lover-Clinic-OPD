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
    commit: vi.fn(async () => undefined),
  })),
  serverTimestamp: () => ({ __serverTimestamp: true }),
}));

let helper;
beforeAll(async () => {
  helper = await import('../src/lib/appointmentDepositBatch.js');
});

describe('Phase 21.0 — P1 pure helpers', () => {
  test('P1.1 mintPairIds returns DEP-{ts} + BA-{ts}-{4hex}', () => {
    const { depositId, appointmentId } = helper.mintPairIds();
    expect(depositId).toMatch(/^DEP-\d{13}$/);
    expect(appointmentId).toMatch(/^BA-\d{13}-[0-9a-f]{4}$/);
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

  test('P1.10 createDepositBookingPair calls writeBatch with both docs', async () => {
    const { writeBatch } = await import('firebase/firestore');
    writeBatch.mockClear();
    const setMock = vi.fn();
    const commitMock = vi.fn(async () => undefined);
    writeBatch.mockReturnValue({
      set: setMock,
      update: vi.fn(),
      commit: commitMock,
    });
    const result = await helper.createDepositBookingPair({
      depositData: {
        customerId: 'C1',
        hasAppointment: true,
        appointment: { date: '2026-05-10', startTime: '10:00' },
      },
      branchId: 'BR-test',
    });
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledTimes(2);  // 1 deposit + 1 appointment
    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('depositId');
    expect(result).toHaveProperty('appointmentId');
    expect(result.depositId).toMatch(/^DEP-/);
    expect(result.appointmentId).toMatch(/^BA-/);
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
