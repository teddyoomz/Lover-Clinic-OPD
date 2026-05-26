import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeDeposit, validateDeposit } from '../src/lib/depositValidation.js';

// V-deposit-noappt (2026-05-27) — Rule I full-flow simulate + source-grep.
// Chains: appt-modal/DepositPanel build a deposit-only payload → normalize →
// validate (the lib path createDeposit runs) → table column resolver. Real
// Firestore round-trip is verified by scripts/e2e-deposit-no-appointment.mjs.
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const APPT = read('src/components/backend/AppointmentFormModal.jsx');
const PANEL = read('src/components/backend/DepositPanel.jsx');
const PICKER = read('src/components/VisitPurposePicker.jsx');

// Pure mirror of the no-appointment deposit payload the appt modal builds.
function buildNoApptDeposit({
  pickLater = false, customerId = '', customerName = '', customerHN = '',
  customerNameTemp = '', customerPhoneTemp = '', amount = 0,
  paymentChannel = 'เงินสด', paymentDate = '2026-05-27',
  advisorId = '', advisorName = '', appointmentTo = '', note = '',
} = {}) {
  return {
    customerId: pickLater ? '' : customerId,
    customerName: pickLater ? customerNameTemp : customerName,
    customerHN: pickLater ? '' : customerHN,
    customerNameTemp,
    customerPhoneTemp,
    amount: parseFloat(amount) || 0,
    paymentChannel,
    paymentDate,
    paymentTime: '',
    refNo: '',
    sellers: advisorId
      ? [{ id: advisorId, name: advisorName || '', percent: 100, total: parseFloat(amount) || 0 }]
      : [],
    customerSource: '',
    sourceDetail: '',
    note,
    purpose: appointmentTo,
    hasAppointment: false,
    paymentEvidenceUrl: '',
    paymentEvidencePath: '',
  };
}

// Mirror of the deposit-table มัดจำสำหรับ column resolver.
const resolvePurpose = (dep) =>
  dep.appointment?.purpose || dep.appointment?.appointmentTo || dep.purpose || '';

describe('F1 — no-appointment deposit payload validates (pure mirror)', () => {
  it('pickLater + advisor-seller + purpose → strict-valid', () => {
    const dep = buildNoApptDeposit({ pickLater: true, customerNameTemp: 'สมหญิง', customerPhoneTemp: '081', amount: 2000, advisorId: 'ADV-1', advisorName: 'พญ.กานต์', appointmentTo: 'สมรรถภาพ' });
    expect(dep.hasAppointment).toBe(false);
    expect(dep.purpose).toBe('สมรรถภาพ');
    expect(dep.sellers).toEqual([{ id: 'ADV-1', name: 'พญ.กานต์', percent: 100, total: 2000 }]);
    expect(dep.customerId).toBe('');
    expect(dep.customerNameTemp).toBe('สมหญิง');
    expect(validateDeposit(normalizeDeposit(dep), { strict: true })).toBeNull();
  });
  it('existing-HN customer (no pickLater) → strict-valid', () => {
    const dep = buildNoApptDeposit({ customerId: 'C-1', customerName: 'สมชาย', customerHN: 'HN-1', amount: 1500, advisorId: 'ADV-2', advisorName: 'a', appointmentTo: 'ปรึกษา' });
    expect(dep.customerId).toBe('C-1');
    expect(validateDeposit(normalizeDeposit(dep), { strict: true })).toBeNull();
  });
  it('no advisor → empty sellers; lib accepts empty sellers (strict-valid)', () => {
    const dep = buildNoApptDeposit({ pickLater: true, customerNameTemp: 'x', customerPhoneTemp: '0', amount: 500, appointmentTo: 'อื่นๆ' });
    expect(dep.sellers).toEqual([]);
    expect(validateDeposit(normalizeDeposit(dep), { strict: true })).toBeNull();
  });
});

describe('F2 — table purpose resolver (no-appt falls back to dep.purpose)', () => {
  it('no appointment → dep.purpose', () => {
    expect(resolvePurpose({ purpose: 'สมรรถภาพ' })).toBe('สมรรถภาพ');
  });
  it('with appointment.purpose → wins (no regression)', () => {
    expect(resolvePurpose({ appointment: { purpose: 'ดูดไขมัน' }, purpose: 'x' })).toBe('ดูดไขมัน');
  });
  it('with appointment.appointmentTo (legacy shape) → used', () => {
    expect(resolvePurpose({ appointment: { appointmentTo: 'โบ' } })).toBe('โบ');
  });
  it('nothing → empty (— dash rendered)', () => {
    expect(resolvePurpose({})).toBe('');
  });
});

describe('F3 — adversarial', () => {
  it('zero amount → strict-invalid', () => {
    const dep = buildNoApptDeposit({ pickLater: true, customerNameTemp: 'x', customerPhoneTemp: '0', amount: 0, appointmentTo: 'a' });
    expect(validateDeposit(normalizeDeposit(dep), { strict: true })?.[0]).toBe('amount');
  });
  it('pickLater with empty temp name → strict customerId failure', () => {
    const dep = buildNoApptDeposit({ pickLater: true, customerNameTemp: '', customerPhoneTemp: '081', amount: 2000, appointmentTo: 'a' });
    expect(validateDeposit(normalizeDeposit(dep), { strict: true })?.[0]).toBe('customerId');
  });
  it('Thai + long multi-purpose round-trips through normalize', () => {
    const dep = buildNoApptDeposit({ customerId: 'C', amount: 1, appointmentTo: 'สมรรถภาพ, อื่นๆ: ผ่ามุก '.repeat(3) });
    const n = normalizeDeposit(dep);
    expect(n.purpose).toContain('ผ่ามุก');
    expect(validateDeposit(n, { strict: true })).toBeNull();
  });
});

describe('SG1 — AppointmentFormModal source contract', () => {
  it('noAppointment in formData init', () => {
    expect(APPT).toMatch(/noAppointment:\s*false/);
  });
  it('deposit-only branch calls createDeposit with hasAppointment:false + purpose', () => {
    expect(APPT).toMatch(/isCreatingDepositBooking\s*&&\s*formData\.noAppointment/);
    const idx = APPT.indexOf('isCreatingDepositBooking && formData.noAppointment');
    const block = APPT.slice(idx, idx + 1600);
    expect(block).toMatch(/createDeposit\(/);
    expect(block).toMatch(/hasAppointment:\s*false/);
    expect(block).toMatch(/purpose:\s*formData\.appointmentTo/);
  });
  it('date/startTime guard wrapped in !formData.noAppointment', () => {
    expect(APPT).toMatch(/if\s*\(\s*!formData\.noAppointment\s*\)\s*\{[\s\S]{0,200}?apptDate/);
  });
  it('purpose picker relabels to มัดจำสำหรับ when noAppointment', () => {
    expect(APPT).toMatch(/label=\{formData\.noAppointment\s*\?\s*'มัดจำสำหรับ'\s*:\s*'นัดมาเพื่อ'\}/);
  });
});

describe('SG2 — DepositPanel source contract', () => {
  it('pickLater state + temp inputs', () => {
    expect(PANEL).toMatch(/const \[pickLater, setPickLater\] = useState\(false\)/);
    expect(PANEL).toMatch(/data-testid="dep-pick-later-checkbox"/);
    expect(PANEL).toMatch(/data-testid="dep-customer-name-temp"/);
  });
  it('purpose state + VisitPurposePicker label="มัดจำสำหรับ"', () => {
    expect(PANEL).toMatch(/const \[purpose, setPurpose\] = useState\(''\)/);
    expect(PANEL).toMatch(/label="มัดจำสำหรับ"/);
  });
  it('payload carries purpose + pickLater-aware customerId', () => {
    expect(PANEL).toMatch(/customerId:\s*pickLater\s*\?\s*''\s*:\s*customerId/);
    expect(PANEL).toMatch(/\n\s*purpose,/);
  });
  it('table cell falls back to dep.purpose', () => {
    expect(PANEL).toMatch(/dep\.appointment\?\.purpose \|\| dep\.appointment\?\.appointmentTo \|\| dep\.purpose/);
  });
});

describe('SG3 — VisitPurposePicker label prop', () => {
  it('default label นัดมาเพื่อ + renders {label}', () => {
    expect(PICKER).toMatch(/label\s*=\s*'นัดมาเพื่อ'/);
    expect(PICKER).toMatch(/\{label\}/);
  });
});
