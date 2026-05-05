// tests/phase-19-0-proclinic-translator.test.js
// Phase 19.0 — P1-P7 — ProClinic 4→2 translator.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mapAppointmentTypeForProClinic } from '../api/proclinic/_lib/appointmentTypeProClinic.js';

const APPT_SRC = readFileSync('api/proclinic/appointment.js', 'utf8');
const HELPER_SRC = readFileSync('api/proclinic/_lib/appointmentTypeProClinic.js', 'utf8');

describe('Phase 19.0 — ProClinic 4→2 translator', () => {
  test('P1.1 deposit-booking → sales', () => {
    expect(mapAppointmentTypeForProClinic('deposit-booking')).toBe('sales');
  });

  test('P2.1 no-deposit-booking → sales', () => {
    expect(mapAppointmentTypeForProClinic('no-deposit-booking')).toBe('sales');
  });

  test('P3.1 treatment-in → sales', () => {
    expect(mapAppointmentTypeForProClinic('treatment-in')).toBe('sales');
  });

  test('P4.1 follow-up → followup', () => {
    expect(mapAppointmentTypeForProClinic('follow-up')).toBe('followup');
  });

  test('P5.1 unknown / null / legacy → sales (defensive default)', () => {
    expect(mapAppointmentTypeForProClinic(null)).toBe('sales');
    expect(mapAppointmentTypeForProClinic(undefined)).toBe('sales');
    expect(mapAppointmentTypeForProClinic('')).toBe('sales');
    expect(mapAppointmentTypeForProClinic('garbage-xyz')).toBe('sales');
    expect(mapAppointmentTypeForProClinic('sales')).toBe('sales'); // legacy passthrough
    expect(mapAppointmentTypeForProClinic('followup')).toBe('sales'); // 'followup' (no hyphen) not a new-taxonomy key
  });

  test('P6.1 helper imported in api/proclinic/appointment.js', () => {
    expect(APPT_SRC).toMatch(/from ['"][^'"]*appointmentTypeProClinic/);
    expect(APPT_SRC).toMatch(/mapAppointmentTypeForProClinic/);
  });

  test('P6.2 helper used at both PATCH sites (lines ~30 + ~195)', () => {
    const occurrences = (APPT_SRC.match(/mapAppointmentTypeForProClinic\(/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  test('P7.1 @dev-only banner present (rule H-bis strip marker)', () => {
    expect(HELPER_SRC).toMatch(/@dev-only/);
    expect(HELPER_SRC).toMatch(/STRIP BEFORE PRODUCTION/);
  });
});
