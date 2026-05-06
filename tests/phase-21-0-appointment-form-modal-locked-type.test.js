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

  test('F1.6 embedded deposit subform renders when isLockedDepositType + create mode (Phase 21.0-ter)', () => {
    // Phase 21.0-ter (2026-05-06 EOD) — replaced the redirect-banner with
    // an inline deposit subform. Admin can create the paired deposit-
    // booking from this modal directly via createDepositBookingPair.
    expect(SRC).toMatch(/data-testid=['"]appt-deposit-subform['"]/);
    expect(SRC).toMatch(/isLockedDepositType\s*&&\s*mode\s*===\s*['"]create['"]\s*&&\s*\(/);
    expect(SRC).toMatch(/💰\s*รายละเอียดมัดจำ/);
    // Anti-regression: the legacy redirect banner + button MUST be gone.
    expect(SRC).not.toMatch(/appt-deposit-redirect-banner/);
    expect(SRC).not.toMatch(/appt-deposit-redirect-button/);
    expect(SRC).not.toMatch(/ไปสร้างมัดจำ/);
  });

  test('F1.7 deposit subform exposes amount/channel/paymentDate/note fields', () => {
    expect(SRC).toMatch(/data-testid=['"]appt-deposit-amount['"]/);
    expect(SRC).toMatch(/data-testid=['"]appt-deposit-channel['"]/);
    expect(SRC).toMatch(/data-testid=['"]appt-deposit-note['"]/);
    // depositPaymentDate uses the shared DateField component (no testid)
    expect(SRC).toMatch(/data-field=['"]depositPaymentDate['"]/);
    // 4 deposit fields appear in defaultFormData
    expect(SRC).toMatch(/depositAmount:/);
    expect(SRC).toMatch(/depositPaymentChannel:\s*['"]เงินสด['"]/);
    expect(SRC).toMatch(/depositPaymentDate:/);
    expect(SRC).toMatch(/depositNote:/);
  });

  test('F1.8 handleSave validates deposit fields when isCreatingDepositBooking', () => {
    expect(SRC).toMatch(/const\s+isCreatingDepositBooking\s*=\s*isLockedDepositType\s*&&\s*mode\s*===\s*['"]create['"]/);
    expect(SRC).toMatch(/parseFloat\(formData\.depositAmount\)/);
    expect(SRC).toMatch(/scrollToFormError\(['"]depositAmount['"]/);
    expect(SRC).toMatch(/scrollToFormError\(['"]depositPaymentChannel['"]/);
    expect(SRC).toMatch(/scrollToFormError\(['"]depositPaymentDate['"]/);
  });

  test('F1.9 save payload forces appointmentType = safeLockedType when set', () => {
    expect(SRC).toMatch(/appointmentType:\s*safeLockedType\s*\|\|\s*formData\.appointmentType/);
  });

  test('F1.10 save button always visible — deposit-booking creates route to pair-helper (Phase 21.0-ter)', () => {
    // Anti-regression: the Phase 21.0-main hidden-save logic is gone.
    expect(SRC).not.toMatch(/!\(isLockedDepositType\s*&&\s*mode\s*===\s*['"]create['"]\)/);
    // Save button label switches between สร้างนัดหมาย / สร้างจองมัดจำ
    expect(SRC).toMatch(/สร้างจองมัดจำ/);
    expect(SRC).toMatch(/สร้างนัดหมาย/);
  });

  test('F1.12 createDepositBookingPair imported + called when isCreatingDepositBooking', () => {
    expect(SRC).toMatch(/import\s*\{\s*createDepositBookingPair\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/appointmentDepositBatch\.js['"]/);
    // Save handler has the isCreatingDepositBooking branch
    expect(SRC).toMatch(/else if \(isCreatingDepositBooking\)/);
    // …which builds depositData…
    expect(SRC).toMatch(/const\s+depositData\s*=\s*\{/);
    // …and calls the pair helper with it
    expect(SRC).toMatch(/createDepositBookingPair\(\s*\{\s*depositData,\s*branchId:\s*selectedBranchId\s*\}\)/);
  });

  test('F1.13 advisor auto-becomes 100% seller when set (else empty array)', () => {
    expect(SRC).toMatch(/sellers:\s*formData\.advisorId\s*\?/);
    expect(SRC).toMatch(/percent:\s*100/);
  });

  test('F1.11 Phase 21.0 marker present', () => {
    expect(SRC).toMatch(/Phase 21\.0/);
  });
});
