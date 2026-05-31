// V71 — markAppointmentServiceCompleted writer.
// Single-doc updateDoc({serviceCompletedAt: serverTimestamp(), serviceCompletedBy: uid}).
// No branch-scope (appt id is the key).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock — Firebase modules
vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    updateDoc: vi.fn(),
    serverTimestamp: vi.fn(() => '__SERVER_TS__'),
    doc: vi.fn((...args) => ({ __doc: args.join('/') })),
  };
});

vi.mock('../src/firebase.js', () => ({
  db: {},
  auth: { currentUser: null },
  appId: 'loverclinic-opd-4c39b',
}));

import { updateDoc } from 'firebase/firestore';
import { markAppointmentServiceCompleted } from '../src/lib/backendClient.js';

describe('V71 markAppointmentServiceCompleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('M1.1 writes serviceCompletedAt + serviceCompletedBy + wasServiceCompleted to be_appointments doc', async () => {
    // V71.B-bis (2026-05-18) — added wasServiceCompleted persistent flag to
    // support unlimited mark ↔ unmark toggle. Flag stamped on EVERY mark
    // (idempotent; remains true forever once set; unmark does not clear).
    await markAppointmentServiceCompleted('BA-test-1', 'uid-staff-1');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [docRef, payload] = updateDoc.mock.calls[0];
    expect(docRef).toBeDefined();
    expect(payload).toEqual({
      // V139 (2026-05-31) — coupling: mark-complete now also sets status:'done'
      // so the badge + a modal/Backend reader stay in sync with the done tab.
      status: 'done',
      serviceCompletedAt: '__SERVER_TS__',
      serviceCompletedBy: 'uid-staff-1',
      wasServiceCompleted: true,
    });
  });

  it('M1.2 throws exact V71_MARK_SERVICE_COMPLETED_REQUIRES_APPT_ID when apptId empty (fail loud)', async () => {
    await expect(markAppointmentServiceCompleted('', 'uid-staff-1'))
      .rejects.toThrow('V71_MARK_SERVICE_COMPLETED_REQUIRES_APPT_ID');
  });

  it('M1.3 tolerates missing uid (empty string passes through)', async () => {
    await markAppointmentServiceCompleted('BA-test-2', '');
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.serviceCompletedBy).toBe('');
  });

  it('M1.3a undefined uid → empty string fallback (typeof-guard else branch)', async () => {
    await markAppointmentServiceCompleted('BA-test-3', undefined);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.serviceCompletedBy).toBe('');
  });

  it('M1.3b null uid → empty string fallback (typeof-guard else branch)', async () => {
    await markAppointmentServiceCompleted('BA-test-4', null);
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.serviceCompletedBy).toBe('');
  });

  it('M1.4 scopedDataLayer re-exports the function', async () => {
    const mod = await import('../src/lib/scopedDataLayer.js');
    expect(typeof mod.markAppointmentServiceCompleted).toBe('function');
  });
});
