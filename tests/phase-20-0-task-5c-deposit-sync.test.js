// Phase 20.0 Task 5c — deposit sync on be_deposits.
//
// Strips:
//   - broker.submitDeposit  (1 callsite: confirmDepositSync first-create)
//   - broker.updateDeposit  (2 callsites: confirmDepositSync re-sync + handleSaveDepositData)
//   - broker.cancelDeposit  (1 callsite: handleDepositCancel)
//
// Replacements:
//   - submitDeposit  → createDeposit(beShape)        returns {depositId}
//                       depositId stamped on session.depositProClinicId
//                       (field name preserved for backward compat)
//   - updateDeposit  → updateDeposit(depositId, beShape)
//   - cancelDeposit  → cancelDeposit(depositId, {cancelNote: 'ยกเลิกจาก kiosk'})
//
// Plus: NEW pure helper mapDepositPayloadToBe(dep, customerId, customerHN, patient)
// translates the Frontend kiosk depositData shape → be_deposits create shape.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mapDepositPayloadToBe } from '../src/pages/AdminDashboard.jsx';

const ROOT = process.cwd();
const ADMIN_DASHBOARD = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const STRIPPED = ADMIN_DASHBOARD
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Phase 20.0 Task 5c — W1 broker deposit calls all removed', () => {
  it('W1.1 — broker.submitDeposit NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.submitDeposit\s*\(/);
  });

  it('W1.2 — broker.updateDeposit NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.updateDeposit\s*\(/);
  });

  it('W1.3 — broker.cancelDeposit NOT called', () => {
    expect(STRIPPED).not.toMatch(/broker\.cancelDeposit\s*\(/);
  });

  it('W1.4 — brokerClient import REMOVED entirely (Frontend layer on be_* only)', () => {
    expect(STRIPPED).not.toMatch(/import\s*\*\s*as\s+broker\s+from\s+['"][^'"]*brokerClient/);
    expect(STRIPPED).not.toMatch(/from\s+['"][^'"]*brokerClient\.js['"]/);
  });
});

describe('Phase 20.0 Task 5c — W2 be_* deposit writers wired', () => {
  it('W2.1 — createDeposit imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*createDeposit[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('W2.2 — updateDeposit imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*updateDeposit[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });

  it('W2.3 — cancelDeposit imported from scopedDataLayer', () => {
    expect(ADMIN_DASHBOARD).toMatch(
      /import\s*\{[^}]*cancelDeposit[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/s,
    );
  });
});

describe('Phase 20.0 Task 5c — W3 mapDepositPayloadToBe pure helper', () => {
  const samplePatient = {
    firstname: 'นายอนุพงษ์',
    lastname: 'ตรีปัญญา',
  };

  const sampleDep = {
    paymentChannel: 'cash',
    paymentAmount: '5000',
    depositDate: '2026-04-15',
    depositTime: '14:30',
    salesperson: '7',
    refNo: 'REF-001',
    hasAppointment: true,
    appointmentDate: '2026-04-20',
    appointmentStartTime: '10:00',
    appointmentEndTime: '10:15',
    consultant: '3',
    doctor: '7',
    assistant: '5',
    room: '4',
    appointmentChannel: 'walk-in',
    visitPurpose: ['IV Drip', 'ติดตาม'],
  };

  it('W3.1 — paymentAmount → amount (numeric coercion)', () => {
    const result = mapDepositPayloadToBe(sampleDep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.amount).toBe(5000);
  });

  it('W3.2 — depositDate/Time → paymentDate/Time field rename', () => {
    const result = mapDepositPayloadToBe(sampleDep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.paymentDate).toBe('2026-04-15');
    expect(result.paymentTime).toBe('14:30');
  });

  it('W3.3 — salesperson → sellers[] (single-seller kiosk)', () => {
    const result = mapDepositPayloadToBe(sampleDep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.sellers).toEqual([{ sellerId: '7', percent: 100 }]);
  });

  it('W3.4 — empty salesperson → empty sellers array', () => {
    const dep = { ...sampleDep, salesperson: '' };
    const result = mapDepositPayloadToBe(dep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.sellers).toEqual([]);
  });

  it('W3.5 — visitPurpose array joined into appointment.appointmentTo', () => {
    const result = mapDepositPayloadToBe(sampleDep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.appointment.appointmentTo).toBe('IV Drip, ติดตาม');
  });

  it('W3.6 — hasAppointment=true preserves appointment object with all fields', () => {
    const result = mapDepositPayloadToBe(sampleDep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.hasAppointment).toBe(true);
    expect(result.appointment).toMatchObject({
      appointmentDate: '2026-04-20',
      appointmentStartTime: '10:00',
      appointmentEndTime: '10:15',
      consultantId: '3',
      doctorId: '7',
      assistantId: '5',
      roomId: '4',
    });
  });

  it('W3.7 — hasAppointment=false → appointment is null', () => {
    const dep = { ...sampleDep, hasAppointment: false };
    const result = mapDepositPayloadToBe(dep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.hasAppointment).toBe(false);
    expect(result.appointment).toBeNull();
  });

  it('W3.8 — customerName composed from firstname + lastname', () => {
    const result = mapDepositPayloadToBe(sampleDep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.customerName).toBe('นายอนุพงษ์ ตรีปัญญา');
  });

  it('W3.9 — customerName falls back to fullName when firstname/lastname blank', () => {
    const result = mapDepositPayloadToBe(sampleDep, 'CUST-1', 'HN-1', { fullName: 'Bob Smith' });
    expect(result.customerName).toBe('Bob Smith');
  });

  it('W3.10 — customerId/HN coerced to strings', () => {
    const result = mapDepositPayloadToBe(sampleDep, 999, 12345, samplePatient);
    expect(result.customerId).toBe('999');
    expect(result.customerHN).toBe('12345');
  });

  it('W3.11 — null/undefined dep handled gracefully', () => {
    const result = mapDepositPayloadToBe(null, 'CUST-1', 'HN-1', samplePatient);
    expect(result.amount).toBe(0);
    expect(result.hasAppointment).toBe(false);
    expect(result.sellers).toEqual([]);
  });

  it('W3.12 — paymentDate defaults to today when missing', () => {
    const dep = { ...sampleDep, depositDate: undefined };
    const result = mapDepositPayloadToBe(dep, 'CUST-1', 'HN-1', samplePatient);
    expect(result.paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Phase 20.0 Task 5c — W4 deposit-sync callsites use be_* helpers', () => {
  it('W4.1 — confirmDepositSync uses createDeposit OR updateDeposit', () => {
    expect(STRIPPED).toMatch(/createDeposit\s*\(\s*dataForBe\s*\)/);
    expect(STRIPPED).toMatch(/updateDeposit\s*\(\s*session\.depositProClinicId\s*,\s*dataForBe\s*\)/);
  });

  it('W4.2 — handleDepositCancel uses cancelDeposit with cancelNote', () => {
    expect(STRIPPED).toMatch(/cancelDeposit\s*\(\s*session\.depositProClinicId\s*,\s*\{\s*cancelNote:/);
  });

  it('W4.3 — handleSaveDepositData uses updateDeposit OR createDeposit', () => {
    expect(STRIPPED).toMatch(/updateDeposit\s*\(\s*sess\.depositProClinicId\s*,\s*dataForBe\s*\)/);
    expect(STRIPPED).toMatch(/createDeposit\s*\(\s*dataForBe\s*\)/);
  });

  it('W4.4 — depositId stamped on session.depositProClinicId after create', () => {
    // After createDeposit returns {depositId}, the session doc gets
    // depositProClinicId: depositId (Phase 5c — field name preserved for
    // backward compat; semantics now = be_deposits doc id).
    expect(STRIPPED).toMatch(/depositProClinicId:\s*(depositId|created\.depositId)/);
  });
});

describe('Phase 20.0 Task 5c — W5 brokerClient import COMPLETELY removed (final cleanup)', () => {
  // Phase 20.0 Tasks 1 + 2 + 3 + 4 + 5a + 5b + 5c collectively close every
  // broker.* call in AdminDashboard. Frontend layer is fully on be_*.
  // brokerClient.js + api/proclinic/* + cookie-relay still EXIST in repo
  // (MasterDataTab dev sync uses them), but the Frontend tree is clean.

  it('W5.1 — no broker.X(...) calls anywhere in AdminDashboard', () => {
    expect(STRIPPED).not.toMatch(/\bbroker\.\w+\s*\(/);
  });

  it('W5.2 — no `import * as broker` from brokerClient', () => {
    expect(STRIPPED).not.toMatch(/import\s*\*\s*as\s+broker/);
  });

  it('W5.3 — no named imports from brokerClient', () => {
    expect(STRIPPED).not.toMatch(/from\s+['"][^'"]*brokerClient[^'"]*['"]/);
  });
});
