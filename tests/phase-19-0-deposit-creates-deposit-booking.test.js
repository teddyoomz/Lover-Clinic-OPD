// tests/phase-19-0-deposit-creates-deposit-booking.test.js
// Phase 19.0 — D1-D3 — DepositPanel deposit→appt writes 'deposit-booking'.
//
// NOTE: DepositPanel stores appointment type in state variable `apptType`
// (useState('deposit-booking')) and saves as `type: apptType` in the payload
// (not `appointmentType:` key). Tests reflect actual implementation.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/DepositPanel.jsx', 'utf8');

describe('Phase 19.0 — DepositPanel default appointment type', () => {
  test("D1.1 deposit appt state initialised to 'deposit-booking'", () => {
    // DepositPanel uses useState('deposit-booking') for apptType state.
    // Was useState('sales') pre-Phase-19.0.
    expect(SRC).toMatch(/useState\(['"]deposit-booking['"]\)/);
    // No legacy 'sales' init remaining.
    expect(SRC).not.toMatch(/useState\(['"]sales['"]\)/);
  });

  test("D2.1 NO reset back to 'sales' literal after save", () => {
    // setApptType resets to 'deposit-booking' (not 'sales').
    expect(SRC).toMatch(/setApptType\(['"]deposit-booking['"]\)/);
    expect(SRC).not.toMatch(/setApptType\(['"]sales['"]\)/);
  });

  test('D3.1 Phase 19.0 marker present', () => {
    expect(SRC).toMatch(/Phase 19\.0|deposit-booking/);
  });
});
