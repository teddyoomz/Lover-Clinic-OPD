// tests/phase-21-0-appointment-form-modal-locked-type.test.js
// Phase 21.0 — F1 — AppointmentFormModal locked-type prop + redirect

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');

describe('Phase 21.0 — F1 lockedAppointmentType prop', () => {
  test('F1.1 prop in function signature with default null', () => {
    expect(SRC).toMatch(/lockedAppointmentType\s*=\s*null/);
  });

  test('F1.2 imports APPOINTMENT_TYPE_VALUES + resolveAppointmentTypeLabel', () => {
    expect(SRC).toMatch(/APPOINTMENT_TYPE_VALUES/);
    expect(SRC).toMatch(/resolveAppointmentTypeLabel/);
  });

  test('F1.3 safeLockedType validated via APPOINTMENT_TYPE_VALUES.includes', () => {
    expect(SRC).toMatch(/APPOINTMENT_TYPE_VALUES\.includes\(lockedAppointmentType\)/);
    expect(SRC).toMatch(/safeLockedType/);
  });

  test('F1.4 isLockedDepositType derives from safeLockedType === deposit-booking', () => {
    expect(SRC).toMatch(/isLockedDepositType\s*=\s*safeLockedType\s*===\s*['"]deposit-booking['"]/);
  });

  test('F1.5 type radio replaced with locked chip when safeLockedType set', () => {
    expect(SRC).toMatch(/data-testid=['"]appt-type-locked-chip['"]/);
    expect(SRC).toMatch(/data-locked-type=\{safeLockedType\}/);
    // Conditional render around the radio block
    expect(SRC).toMatch(/safeLockedType\s*\?\s*\(/);
  });

  test('F1.6 deposit-redirect banner renders when isLockedDepositType', () => {
    expect(SRC).toMatch(/data-testid=['"]appt-deposit-redirect-banner['"]/);
    expect(SRC).toMatch(/isLockedDepositType\s*&&\s*\(/);
    expect(SRC).toMatch(/การจองมัดจำต้องสร้างผ่านหน้าการเงิน/);
  });

  test('F1.7 redirect button navigates to ?tab=finance&subtab=deposit&action=...', () => {
    expect(SRC).toMatch(/data-testid=['"]appt-deposit-redirect-button['"]/);
    expect(SRC).toMatch(/tab['"],\s*['"]finance['"]\)/);
    expect(SRC).toMatch(/subtab['"],\s*['"]deposit['"]\)/);
    expect(SRC).toMatch(/create-with-customer=/);
  });

  test('F1.8 handleSave guards against deposit-booking lock (defense-in-depth)', () => {
    // Even if save button is hidden, programmatic submission must short-circuit.
    expect(SRC).toMatch(/if \(isLockedDepositType\) \{[\s\S]{0,200}?return;/);
  });

  test('F1.9 save payload forces appointmentType = safeLockedType when set', () => {
    expect(SRC).toMatch(/appointmentType:\s*safeLockedType\s*\|\|\s*formData\.appointmentType/);
  });

  test('F1.10 save button hidden when isLockedDepositType + create mode', () => {
    expect(SRC).toMatch(/!\(isLockedDepositType\s*&&\s*mode\s*===\s*['"]create['"]\)/);
  });

  test('F1.11 Phase 21.0 marker present', () => {
    expect(SRC).toMatch(/Phase 21\.0/);
  });
});
