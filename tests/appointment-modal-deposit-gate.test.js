// tests/appointment-modal-deposit-gate.test.js
// Task E4 — deposit section gates on EFFECTIVE appointment type (not locked-only).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SRC = fs.readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');

describe('deposit gate = effective type (not locked-only)', () => {
  it('derives effectiveAppointmentType + isDepositBooking + showDepositSection', () => {
    expect(SRC).toMatch(/const\s+effectiveAppointmentType\s*=\s*safeLockedType\s*\|\|\s*formData\.appointmentType/);
    expect(SRC).toMatch(/const\s+isDepositBooking\s*=\s*effectiveAppointmentType\s*===\s*'deposit-booking'/);
    expect(SRC).toMatch(/const\s+showDepositSection\s*=\s*isDepositBooking/);
  });

  it('render gate uses showDepositSection (NOT isLockedDepositType-only)', () => {
    expect(SRC).toMatch(/\{showDepositSection && \(/);
    // anti-regression: the old locked-only render gate must be gone
    expect(SRC).not.toMatch(/\{isLockedDepositType && mode === 'create' && \(/);
  });

  it('create save branch uses isDepositBooking', () => {
    expect(SRC).toMatch(/const\s+isCreatingDepositBooking\s*=\s*isDepositBooking\s*&&\s*mode\s*===\s*'create'/);
  });
});
