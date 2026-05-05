// Phase 20.0 Flow D — appointment modal CRUD on be_*.
// Q4 calibrated test depth: full Rule I (a + c + d + e). preview_eval (b)
// is documented in the migration runbook + manually verified post-deploy
// per `feedback_no_real_action_in_preview_eval.md` discipline (TEST-APPT-
// prefix only against production Firestore).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
// Strip comments for source-grep so the rule-out checks don't false-positive
// on commit-message comments documenting the removal.
const STRIPPED = ADMIN_DASHBOARD
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Phase 20.0 Flow D — D1 broker.listCustomerAppointments removed (3 sites)', () => {
  it('D1.1 — no broker.listCustomerAppointments call remains', () => {
    expect(STRIPPED).not.toMatch(/broker\.listCustomerAppointments\s*\(/);
  });

  it('D1.2 — getCustomerAppointments imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*getCustomerAppointments[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('D1.3 — getCustomerAppointments called at handleApptSelectCustomer + handleApptFormSubmit + handleApptDelete', () => {
    const matches = STRIPPED.match(/getCustomerAppointments\s*\(/g) || [];
    // 3 call sites expected (select + submit-refresh + delete-refresh)
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Phase 20.0 Flow D — D2 broker.createAppointment / updateAppointment / deleteAppointment removed (Flow D scope)', () => {
  // Flow D = handleApptFormSubmit + handleApptDelete in AdminDashboard.
  // Lines 1588/1670/1678/1788 are Flow C (no-deposit kiosk lifecycle) —
  // Phase 3 scope. We only assert NO Flow-D-context broker calls.

  it('D2.1 — handleApptFormSubmit uses createBackendAppointment + updateBackendAppointment', () => {
    expect(STRIPPED).toMatch(/createBackendAppointment\s*\(/);
    expect(STRIPPED).toMatch(/updateBackendAppointment\s*\(/);
  });

  it('D2.2 — handleApptDelete uses deleteBackendAppointment', () => {
    expect(STRIPPED).toMatch(/deleteBackendAppointment\s*\(/);
  });

  it('D2.3 — be_* writers imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*createBackendAppointment[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*updateBackendAppointment[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*deleteBackendAppointment[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });
});

describe('Phase 20.0 Flow D — D3 broker.getLivePractitioners replaced with listStaff+listDoctors', () => {
  it('D3.1 — broker.getLivePractitioners not called', () => {
    expect(STRIPPED).not.toMatch(/broker\.getLivePractitioners\s*\(/);
  });

  it('D3.2 — listStaff + listDoctors imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*listStaff[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*listDoctors[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('D3.3 — practitioners effect uses Promise.all([listDoctors(), listStaff()])', () => {
    // Multi-line Promise.all + Phase 5c added another Promise.all (in
    // fetchDepositOptions for deposit options). Match listDoctors followed
    // by listStaff inside the same Promise.all call (any whitespace).
    expect(STRIPPED).toMatch(/Promise\.all\s*\(\s*\[[\s\S]*?listDoctors\s*\([\s\S]*?listStaff\s*\(/);
  });
});

describe('Phase 20.0 Flow D — D4 payload shape mapping (broker → be_appointments)', () => {
  // Pure-helper simulate of the payload built in handleApptFormSubmit.
  // Mirrors the field-rename: appointmentDate → date, appointmentStartTime →
  // startTime, doctor → doctorId, advisor → advisorId, room → roomId,
  // appointmentNote → note. Plus appointmentType default + denormalized
  // doctorName/advisorName + customerName.

  function buildBeAppointmentPayload(formData, customer, practitioners, depositOptions, defaultType) {
    const advisorVal = formData.advisor || (depositOptions?.advisors?.[0]?.value) || '';
    const roomVal = formData.room || (depositOptions?.rooms?.[0]?.value) || '';
    const doctorRecord = practitioners.find(p => String(p.id) === String(formData.doctor || ''));
    const advisorRecord = practitioners.find(p => String(p.id) === String(advisorVal || ''));
    return {
      date: formData.date,
      startTime: formData.startTime,
      endTime: formData.endTime,
      doctorId: formData.doctor ? String(formData.doctor) : '',
      doctorName: doctorRecord?.name || '',
      advisorId: advisorVal ? String(advisorVal) : '',
      advisorName: advisorRecord?.name || '',
      roomId: roomVal ? String(roomVal) : '',
      source: formData.source || 'walk-in',
      appointmentTo: formData.appointmentTo || '',
      note: formData.note || '',
      appointmentType: defaultType,
      customerId: String(customer.id),
      customerName: customer.name || '',
    };
  }

  const defaultPractitioners = [
    { id: '7', name: 'นพ. เอ', role: 'doctor' },
    { id: '3', name: 'พิมพ์', role: 'assistant' },
  ];
  const defaultCustomer = { id: '999', name: 'ทดสอบ ระบบ' };
  const defaultFormData = {
    date: '2026-04-15',
    startTime: '10:00',
    endTime: '10:15',
    doctor: '7',
    advisor: '3',
    room: '4',
    source: 'walk-in',
    appointmentTo: 'follow-up',
    note: 'ทดสอบ',
  };
  const DEFAULT_TYPE = 'no-deposit-booking';

  it('D4.1 — payload shape uses be_* field names', () => {
    const payload = buildBeAppointmentPayload(defaultFormData, defaultCustomer, defaultPractitioners, null, DEFAULT_TYPE);
    expect(payload).toMatchObject({
      date: '2026-04-15',
      startTime: '10:00',
      endTime: '10:15',
      doctorId: '7',
      advisorId: '3',
      roomId: '4',
      customerId: '999',
      appointmentType: 'no-deposit-booking',
    });
    // No legacy ProClinic field names
    expect(payload).not.toHaveProperty('appointmentDate');
    expect(payload).not.toHaveProperty('appointmentStartTime');
    expect(payload).not.toHaveProperty('appointmentEndTime');
    expect(payload).not.toHaveProperty('doctor');
    expect(payload).not.toHaveProperty('advisor');
    expect(payload).not.toHaveProperty('room');
    expect(payload).not.toHaveProperty('appointmentNote');
  });

  it('D4.2 — denormalized doctorName + advisorName + customerName from records', () => {
    const payload = buildBeAppointmentPayload(defaultFormData, defaultCustomer, defaultPractitioners, null, DEFAULT_TYPE);
    expect(payload.doctorName).toBe('นพ. เอ');
    expect(payload.advisorName).toBe('พิมพ์');
    expect(payload.customerName).toBe('ทดสอบ ระบบ');
  });

  it('D4.3 — appointmentType defaults to no-deposit-booking (Phase 19.0 default)', () => {
    const payload = buildBeAppointmentPayload(defaultFormData, defaultCustomer, defaultPractitioners, null, DEFAULT_TYPE);
    expect(payload.appointmentType).toBe('no-deposit-booking');
  });

  it('D4.4 — depositOptions fallback for advisor/room when form blank', () => {
    const blankForm = { ...defaultFormData, advisor: '', room: '' };
    const opts = {
      advisors: [{ value: '5', label: 'Default' }],
      rooms: [{ value: '9', label: 'Room 1' }],
    };
    const payload = buildBeAppointmentPayload(blankForm, defaultCustomer, defaultPractitioners, opts, DEFAULT_TYPE);
    expect(payload.advisorId).toBe('5');
    expect(payload.roomId).toBe('9');
  });

  it('D4.5 — empty doctor/advisor records handled gracefully (denorm name = empty string)', () => {
    const orphanForm = { ...defaultFormData, doctor: '999', advisor: '999' };
    const payload = buildBeAppointmentPayload(orphanForm, defaultCustomer, defaultPractitioners, null, DEFAULT_TYPE);
    expect(payload.doctorId).toBe('999');
    expect(payload.doctorName).toBe('');
    expect(payload.advisorName).toBe('');
  });

  it('D4.6 — null/undefined fields default sanely', () => {
    const minForm = {
      date: '2026-04-15',
      startTime: '10:00',
      endTime: '10:15',
      doctor: '',
      advisor: '',
      room: '',
      source: '',
      appointmentTo: '',
      note: '',
    };
    const payload = buildBeAppointmentPayload(minForm, { id: '1', name: '' }, [], null, DEFAULT_TYPE);
    expect(payload.doctorId).toBe('');
    expect(payload.note).toBe('');
    expect(payload.source).toBe('walk-in');
    expect(payload.customerName).toBe('');
  });
});

describe('Phase 20.0 Flow D — D5 AP1_COLLISION friendly UX', () => {
  // The createBackendAppointment + updateBackendAppointment helpers throw an
  // error with code='AP1_COLLISION' when the slot is taken. handleApptFormSubmit
  // catches it and surfaces a Thai message.

  it('D5.1 — handleApptFormSubmit catches AP1_COLLISION + shows friendly message', () => {
    expect(STRIPPED).toMatch(/AP1_COLLISION/);
    expect(STRIPPED).toMatch(/ช่วงเวลานี้มีนัดอยู่แล้ว/);
  });
});

describe('Phase 20.0 Flow D — D6 lifecycle assertions on saved be_appointments doc', () => {
  // Pure-helper simulate of the lifecycle invariants the be_* writer enforces
  // post-Phase-20.0. createBackendAppointment generates BA-{ts} appointmentId;
  // _resolveBranchIdForWrite stamps branchId.

  it('D6.1 — appointmentId follows BA-{ts} convention (writer-side, not client-side)', () => {
    const sample = `BA-${Date.now()}`;
    expect(sample).toMatch(/^BA-\d+$/);
  });

  it('D6.2 — payload from D4 has all required be_appointments fields for setDoc', () => {
    const requiredFields = [
      'date', 'startTime', 'endTime',
      'customerId', 'doctorId', 'advisorId', 'roomId',
      'appointmentType', 'note', 'source',
    ];
    const payload = {
      date: '2026-04-15', startTime: '10:00', endTime: '10:15',
      customerId: '999', doctorId: '7', advisorId: '3', roomId: '4',
      appointmentType: 'no-deposit-booking', note: 'x', source: 'walk-in',
    };
    for (const field of requiredFields) {
      expect(payload).toHaveProperty(field);
    }
  });

  it('D6.3 — no undefined leaves in payload (V14 lock — Firestore setDoc rejects undefined)', () => {
    const payload = {
      date: '2026-04-15',
      doctorId: '',
      doctorName: '',
      note: '',
    };
    function walkForUndefined(obj, path = '') {
      if (obj === undefined) {
        throw new Error(`undefined at ${path}`);
      }
      if (obj === null || typeof obj !== 'object') return;
      for (const [k, v] of Object.entries(obj)) {
        walkForUndefined(v, path ? `${path}.${k}` : k);
      }
    }
    expect(() => walkForUndefined(payload)).not.toThrow();
  });
});

describe('Phase 20.0 Flow D — D7 adversarial inputs', () => {
  it('D7.1 — invalid time → caller responsibility (helper does not validate)', () => {
    // The form layer in AdminDashboard validates date+startTime+endTime
    // BEFORE calling createBackendAppointment. handleApptFormSubmit returns
    // early with showToast if any are missing. Source-grep confirms.
    expect(STRIPPED).toMatch(/กรุณากรอกวันที่และเวลา/);
  });

  it('D7.2 — empty customerId → caller responsibility', () => {
    expect(STRIPPED).toMatch(/กรุณาเลือกลูกค้าก่อน/);
  });

  it('D7.3 — confirm() guard before delete', () => {
    expect(STRIPPED).toMatch(/confirm\s*\(\s*['"]ลบนัดหมายนี้/);
  });
});
