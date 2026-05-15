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

  it('M1.1 writes serviceCompletedAt:serverTimestamp + serviceCompletedBy:uid to be_appointments doc', async () => {
    await markAppointmentServiceCompleted('BA-test-1', 'uid-staff-1');
    expect(updateDoc).toHaveBeenCalledTimes(1);
    const [docRef, payload] = updateDoc.mock.calls[0];
    expect(docRef).toBeDefined();
    expect(payload).toEqual({
      serviceCompletedAt: '__SERVER_TS__',
      serviceCompletedBy: 'uid-staff-1',
    });
  });

  it('M1.2 throws when apptId empty (fail loud)', async () => {
    await expect(markAppointmentServiceCompleted('', 'uid-staff-1'))
      .rejects.toThrow(/APPT_ID/);
  });

  it('M1.3 tolerates missing uid (admin SDK or anon admin sets empty string)', async () => {
    await markAppointmentServiceCompleted('BA-test-2', '');
    const [, payload] = updateDoc.mock.calls[0];
    expect(payload.serviceCompletedBy).toBe('');
  });

  it('M1.4 scopedDataLayer re-exports the function', async () => {
    const mod = await import('../src/lib/scopedDataLayer.js');
    expect(typeof mod.markAppointmentServiceCompleted).toBe('function');
  });
});
