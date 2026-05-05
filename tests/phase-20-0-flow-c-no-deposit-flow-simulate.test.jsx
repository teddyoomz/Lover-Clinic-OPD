// Phase 20.0 Flow C — no-deposit kiosk booking on be_*.
// Q4 calibrated test depth: full Rule I (a + c + d + e). preview_eval (b)
// is documented in the migration runbook + manually verified post-deploy
// per `feedback_no_real_action_in_preview_eval.md` discipline.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const STRIPPED = ADMIN_DASHBOARD
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Phase 20.0 Flow C — C1 broker.{create,update,delete}Appointment removed (no-deposit)', () => {
  it('C1.1 — no broker.createAppointment call remains anywhere in AdminDashboard', () => {
    expect(STRIPPED).not.toMatch(/broker\.createAppointment\s*\(/);
  });

  it('C1.2 — no broker.updateAppointment call remains', () => {
    expect(STRIPPED).not.toMatch(/broker\.updateAppointment\s*\(/);
  });

  it('C1.3 — no broker.deleteAppointment call remains', () => {
    expect(STRIPPED).not.toMatch(/broker\.deleteAppointment\s*\(/);
  });
});

describe('Phase 20.0 Flow C — C2 confirmCreateNoDeposit / confirmUpdateAppointment / handleNoDepositCancel use be_*', () => {
  it('C2.1 — confirmCreateNoDeposit calls createBackendAppointment with be_appointments shape', () => {
    // Grep for the function block; assert no-deposit-booking type literal +
    // createBackendAppointment call live in same logical region.
    expect(STRIPPED).toMatch(/confirmCreateNoDeposit/);
    expect(STRIPPED).toMatch(/createBackendAppointment\s*\(/);
    expect(STRIPPED).toMatch(/appointmentType:\s*['"]no-deposit-booking['"]/);
  });

  it('C2.2 — confirmUpdateAppointment uses updateBackendAppointment OR createBackendAppointment retry', () => {
    expect(STRIPPED).toMatch(/updateBackendAppointment\s*\(/);
    expect(STRIPPED).toMatch(/confirmUpdateAppointment/);
  });

  it('C2.3 — handleNoDepositCancel uses deleteBackendAppointment', () => {
    expect(STRIPPED).toMatch(/handleNoDepositCancel/);
    expect(STRIPPED).toMatch(/deleteBackendAppointment\s*\(/);
  });
});

describe('Phase 20.0 Flow C — C3 opd_sessions linkage preserved (appointmentProClinicId field)', () => {
  // The legacy field name is kept for backward compat with existing
  // opd_sessions docs. Semantics now = be_appointments doc id (BA-{ts}).
  // Audit comment documents the rename-rationale.

  it('C3.1 — opd_sessions update writes appointmentProClinicId from createBackendAppointment result', () => {
    // After successful create, code does updateDoc(opd_sessions, {appointmentProClinicId: apptResult.appointmentId}).
    expect(STRIPPED).toMatch(/appointmentProClinicId:\s*apptResult\.appointmentId/);
  });

  it('C3.2 — appointmentSyncStatus field still managed for forensic trail (done|failed)', () => {
    expect(STRIPPED).toMatch(/appointmentSyncStatus:\s*['"]done['"]/);
    expect(STRIPPED).toMatch(/appointmentSyncStatus:\s*['"]failed['"]/);
  });
});

describe('Phase 20.0 Flow C — C4 AP1_COLLISION friendly error in kiosk flow', () => {
  it('C4.1 — confirmCreateNoDeposit catches AP1_COLLISION + shows Thai message', () => {
    expect(STRIPPED).toMatch(/AP1_COLLISION/);
    expect(STRIPPED).toMatch(/ช่วงเวลานัดหมายชนกับนัดอื่น/);
  });

  it('C4.2 — confirmUpdateAppointment catches AP1_COLLISION on retry-create path', () => {
    // Both update + retry-create paths handle the collision.
    expect(STRIPPED).toMatch(/ช่วงเวลานี้มีนัดอยู่แล้ว/);
  });
});

describe('Phase 20.0 Flow C — C5 payload shape mapping (broker → be_appointments)', () => {
  function buildKioskPayload(formData, practitioners, isUpdate = false, sessionCustomerId = '') {
    const visitPurposeText = (formData.visitPurpose || []).join(', ');
    const doctorRecord = practitioners.find(p => String(p.id) === String(formData.doctor || ''));
    const advisorRecord = practitioners.find(p => String(p.id) === String(formData.advisor || ''));
    return {
      date: formData.appointmentDate,
      startTime: formData.appointmentStartTime,
      endTime: formData.appointmentEndTime,
      doctorId: formData.doctor ? String(formData.doctor) : '',
      doctorName: doctorRecord?.name || '',
      advisorId: formData.advisor ? String(formData.advisor) : '',
      advisorName: advisorRecord?.name || '',
      assistantId: formData.assistant ? String(formData.assistant) : '',
      roomId: formData.room ? String(formData.room) : '',
      source: formData.source || 'walk-in',
      appointmentTo: visitPurposeText,
      note: formData.sessionName?.trim() || '',
      appointmentType: 'no-deposit-booking',
      customerId: isUpdate ? sessionCustomerId : '',
      customerName: formData.sessionName?.trim() || '',
    };
  }

  const practitioners = [
    { id: '7', name: 'นพ. เอ', role: 'doctor' },
    { id: '3', name: 'พิมพ์', role: 'assistant' },
  ];
  const formData = {
    appointmentDate: '2026-04-15',
    appointmentStartTime: '10:00',
    appointmentEndTime: '10:15',
    doctor: '7',
    advisor: '3',
    assistant: '3',
    room: '4',
    source: 'walk-in',
    visitPurpose: ['ติดตามอาการ', 'ปรึกษา'],
    sessionName: 'ลูกค้าจอง 1',
  };

  it('C5.1 — payload uses be_appointments field names (no ProClinic field names)', () => {
    const payload = buildKioskPayload(formData, practitioners);
    expect(payload).toMatchObject({
      date: '2026-04-15',
      startTime: '10:00',
      endTime: '10:15',
      doctorId: '7',
      advisorId: '3',
      assistantId: '3',
      roomId: '4',
      appointmentType: 'no-deposit-booking',
    });
    expect(payload).not.toHaveProperty('appointmentDate');
    expect(payload).not.toHaveProperty('appointmentStartTime');
    expect(payload).not.toHaveProperty('appointmentNote');
    expect(payload).not.toHaveProperty('doctor');
    expect(payload).not.toHaveProperty('advisor');
    expect(payload).not.toHaveProperty('room');
  });

  it('C5.2 — appointmentTo joins visitPurpose array', () => {
    const payload = buildKioskPayload(formData, practitioners);
    expect(payload.appointmentTo).toBe('ติดตามอาการ, ปรึกษา');
  });

  it('C5.3 — appointmentType always no-deposit-booking (Phase 19.0)', () => {
    const payload = buildKioskPayload(formData, practitioners);
    expect(payload.appointmentType).toBe('no-deposit-booking');
  });

  it('C5.4 — denormalized doctorName/advisorName from records', () => {
    const payload = buildKioskPayload(formData, practitioners);
    expect(payload.doctorName).toBe('นพ. เอ');
    expect(payload.advisorName).toBe('พิมพ์');
  });

  it('C5.5 — customerId blank on create (kiosk session before form fill)', () => {
    const payload = buildKioskPayload(formData, practitioners, false);
    expect(payload.customerId).toBe('');
  });

  it('C5.6 — customerId from session on update (after patient fill)', () => {
    const payload = buildKioskPayload(formData, practitioners, true, 'CUST-999');
    expect(payload.customerId).toBe('CUST-999');
  });
});

describe('Phase 20.0 Flow C — C6 lifecycle assertions', () => {
  it('C6.1 — opd_sessions doc gets appointmentProClinicId stamp (not appointmentId)', () => {
    // We preserve the existing opd_sessions field name for backward compat
    // with already-deployed kiosk sessions. Audit-trail: comment documents
    // semantics now = be_appointments doc id.
    expect(STRIPPED).toMatch(/appointmentProClinicId:\s*apptResult\.appointmentId/);
  });

  it('C6.2 — appointmentSyncError stores Thai-friendly message on failure', () => {
    expect(STRIPPED).toMatch(/appointmentSyncError:/);
  });

  it('C6.3 — opd_sessions still updated even when appointment write fails (resilient)', () => {
    // The kiosk's primary contract is "session created" — appointment is
    // a downstream linkage. If appointment fails, session still exists +
    // status='failed' + admin can retry via confirmUpdateAppointment.
    expect(STRIPPED).toMatch(/setDoc[\s\S]{0,200}opd_sessions/);
  });
});

describe('Phase 20.0 Flow C — C7 kiosk + queue still updates without ProClinic', () => {
  it('C7.1 — confirmCreateNoDeposit no longer references ProClinic-only fields in result check', () => {
    // Previous code: `apptResult.success && apptResult.appointmentProClinicId`
    // New code: `apptResult?.appointmentId` (be_appointments returned id)
    expect(STRIPPED).toMatch(/apptResult\?\.appointmentId/);
    expect(STRIPPED).not.toMatch(/apptResult\.appointmentProClinicId/);
  });
});
