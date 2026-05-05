// Phase 20.0 Task 0 — migration script unit tests.
//
// Pure-helper tests for `mapPcTypeToBe` + `mapPcAppointmentToBe` + `randHex`.
// No Firebase access — exercises the pure mapping/decision logic only.
// Live --apply runs are documented in the migration script itself; success
// criteria there is the audit doc + idempotent re-run.

import { describe, it, expect } from 'vitest';
import {
  mapPcTypeToBe,
  mapPcAppointmentToBe,
  randHex,
} from '../scripts/phase-20-0-migrate-pc-appointments-to-be.mjs';

describe('Phase 20.0 M1 — mapPcTypeToBe (Phase 19.0 Q1 Option B uniform)', () => {
  it('M1.1 — followup → no-deposit-booking (Q1 uniform)', () => {
    expect(mapPcTypeToBe('followup')).toBe('no-deposit-booking');
  });
  it('M1.2 — follow → no-deposit-booking (Q1 uniform)', () => {
    expect(mapPcTypeToBe('follow')).toBe('no-deposit-booking');
  });
  it('M1.3 — sales → no-deposit-booking', () => {
    expect(mapPcTypeToBe('sales')).toBe('no-deposit-booking');
  });
  it('M1.4 — null → no-deposit-booking', () => {
    expect(mapPcTypeToBe(null)).toBe('no-deposit-booking');
  });
  it('M1.5 — undefined → no-deposit-booking', () => {
    expect(mapPcTypeToBe(undefined)).toBe('no-deposit-booking');
  });
  it('M1.6 — empty string → no-deposit-booking', () => {
    expect(mapPcTypeToBe('')).toBe('no-deposit-booking');
  });
  it('M1.7 — unknown legacy type → no-deposit-booking', () => {
    expect(mapPcTypeToBe('consult')).toBe('no-deposit-booking');
    expect(mapPcTypeToBe('treatment')).toBe('no-deposit-booking');
    expect(mapPcTypeToBe('xyz')).toBe('no-deposit-booking');
  });
  it('M1.8 — already-new value passes through unchanged', () => {
    expect(mapPcTypeToBe('deposit-booking')).toBe('deposit-booking');
    expect(mapPcTypeToBe('no-deposit-booking')).toBe('no-deposit-booking');
    expect(mapPcTypeToBe('treatment-in')).toBe('treatment-in');
    expect(mapPcTypeToBe('follow-up')).toBe('follow-up');
  });
  it('M1.9 — matches Phase 19.0 mapAppointmentType semantics (Q1 uniform)', async () => {
    // Cross-script consistency: Phase 19.0's in-place migrator and Phase
    // 20.0's pc→be migrator MUST agree on legacy value mapping. Both
    // implement Option B uniform.
    const { mapAppointmentType } = await import(
      '../scripts/phase-19-0-migrate-appointment-types.mjs'
    );
    for (const legacy of ['sales', 'followup', 'follow', 'consult', 'treatment', null, '', 'xyz']) {
      expect(mapPcTypeToBe(legacy)).toBe(mapAppointmentType(legacy));
    }
  });
});

describe('Phase 20.0 M2 — mapPcAppointmentToBe shape', () => {
  const samplePc = {
    id: '12345',
    customerId: '999',
    customerName: 'นาย ทดสอบ ระบบ',
    hnId: 'HN-001',
    doctorId: '7',
    doctorName: 'นพ. ทดลอง',
    advisorId: '3',
    assistants: 'พิมพ์',
    roomId: '4',
    roomName: 'ห้อง 1',
    date: '2026-04-15',
    startTime: '10:00',
    endTime: '10:30',
    note: 'ทดสอบ',
    status: 'pending',
    confirmed: false,
    appointmentType: 'sales',
    source: 'pc_sync',
  };

  it('M2.1 — returns { id, doc } for valid input', () => {
    const result = mapPcAppointmentToBe(samplePc, '2026-04');
    expect(result).not.toBeNull();
    expect(result.id).toBe('12345');
    expect(result.doc).toBeDefined();
  });

  it('M2.2 — doc has appointmentId === source id', () => {
    const result = mapPcAppointmentToBe(samplePc, '2026-04');
    expect(result.doc.appointmentId).toBe('12345');
  });

  it('M2.3 — doc has Phase-19.0 mapped appointmentType', () => {
    const result = mapPcAppointmentToBe(samplePc, '2026-04');
    expect(result.doc.appointmentType).toBe('no-deposit-booking');
  });

  it('M2.4 — doc has nครราชสีมา default branchId', () => {
    const result = mapPcAppointmentToBe(samplePc, '2026-04');
    expect(result.doc.branchId).toBe('BR-1777095572005-ae97f911');
  });

  it('M2.5 — forensic-trail fields present', () => {
    const result = mapPcAppointmentToBe(samplePc, '2026-04');
    expect(result.doc.migratedFromPc).toBe(true);
    expect(result.doc.pcMonthDocId).toBe('2026-04');
    expect(result.doc.pcAppointmentTypeLegacyValue).toBe('sales');
    expect(result.doc.migratedAt).toBeDefined();
  });

  it('M2.6 — preserves customerId/doctorId/date/startTime/endTime', () => {
    const result = mapPcAppointmentToBe(samplePc, '2026-04');
    expect(result.doc.customerId).toBe('999');
    expect(result.doc.doctorId).toBe('7');
    expect(result.doc.date).toBe('2026-04-15');
    expect(result.doc.startTime).toBe('10:00');
    expect(result.doc.endTime).toBe('10:30');
  });

  it('M2.7 — followup type maps to no-deposit-booking (Q1 uniform) + legacy preserved', () => {
    const followupPc = { ...samplePc, appointmentType: 'followup' };
    const result = mapPcAppointmentToBe(followupPc, '2026-04');
    expect(result.doc.appointmentType).toBe('no-deposit-booking');
    expect(result.doc.pcAppointmentTypeLegacyValue).toBe('followup');
  });

  it('M2.8 — null type maps to no-deposit-booking + legacy stored as null', () => {
    const nullTypePc = { ...samplePc, appointmentType: null };
    const result = mapPcAppointmentToBe(nullTypePc, '2026-04');
    expect(result.doc.appointmentType).toBe('no-deposit-booking');
    expect(result.doc.pcAppointmentTypeLegacyValue).toBeNull();
  });
});

describe('Phase 20.0 M3 — mapPcAppointmentToBe edge cases', () => {
  it('M3.1 — empty id returns null', () => {
    expect(mapPcAppointmentToBe({ id: '' }, '2026-04')).toBeNull();
  });
  it('M3.2 — undefined id returns null', () => {
    expect(mapPcAppointmentToBe({}, '2026-04')).toBeNull();
  });
  it('M3.3 — null input returns null', () => {
    expect(mapPcAppointmentToBe(null, '2026-04')).toBeNull();
  });
  it('M3.4 — endTime falls back to startTime when missing', () => {
    const pc = { id: '1', startTime: '10:00' };
    const result = mapPcAppointmentToBe(pc, '2026-04');
    expect(result.doc.endTime).toBe('10:00');
  });
  it('M3.5 — numeric customerId/doctorId converted to string', () => {
    const pc = { id: '1', customerId: 999, doctorId: 7 };
    const result = mapPcAppointmentToBe(pc, '2026-04');
    expect(result.doc.customerId).toBe('999');
    expect(result.doc.doctorId).toBe('7');
  });
  it('M3.6 — empty customerName/doctorName become null', () => {
    const pc = { id: '1', customerName: '', doctorName: '' };
    const result = mapPcAppointmentToBe(pc, '2026-04');
    expect(result.doc.customerName).toBeNull();
    expect(result.doc.doctorName).toBeNull();
  });
});

describe('Phase 20.0 M4 — randHex', () => {
  it('M4.1 — default length 8 chars', () => {
    expect(randHex()).toHaveLength(8);
  });
  it('M4.2 — custom length respected', () => {
    expect(randHex(16)).toHaveLength(16);
    expect(randHex(4)).toHaveLength(4);
  });
  it('M4.3 — only hex chars [0-9a-f]', () => {
    expect(randHex(20)).toMatch(/^[0-9a-f]+$/);
  });
  it('M4.4 — high entropy (no collision in 100 calls)', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(randHex(16));
    expect(ids.size).toBe(100);
  });
});
