// tests/phase-19-0-aggregator-4types.test.js
// Phase 19.0 — G1-G4 — appointmentReportAggregator + AppointmentReportTab.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveAppointmentTypeLabel } from '../src/lib/appointmentTypes.js';

const AGGREGATOR_SRC = readFileSync('src/lib/appointmentReportAggregator.js', 'utf8');
const TAB_SRC = readFileSync('src/components/backend/reports/AppointmentReportTab.jsx', 'utf8');

describe('Phase 19.0 — aggregator + report tab', () => {
  test('G1.1 aggregator imports resolveAppointmentTypeLabel from SSOT', () => {
    expect(AGGREGATOR_SRC).toMatch(/from ['"][^'"]*appointmentTypes/);
    expect(AGGREGATOR_SRC).toMatch(/resolveAppointmentTypeLabel/);
  });

  test("G2.1 aggregator default fallback = DEFAULT_APPOINTMENT_TYPE (not raw 'sales')", () => {
    expect(AGGREGATOR_SRC).toMatch(/DEFAULT_APPOINTMENT_TYPE/);
    // No bare 'sales' ) closing call remaining in source.
    expect(AGGREGATOR_SRC).not.toMatch(/['"]sales['"]\s*\)/);
  });

  test('G2.2 resolver delivers correct labels for the 4 new values', () => {
    expect(resolveAppointmentTypeLabel('deposit-booking')).toBe('จองมัดจำ');
    expect(resolveAppointmentTypeLabel('no-deposit-booking')).toBe('จองไม่มัดจำ');
    expect(resolveAppointmentTypeLabel('treatment-in')).toBe('เข้าทำหัตถการ');
    expect(resolveAppointmentTypeLabel('follow-up')).toBe('ติดตามอาการ');
  });

  test('G3.1 report tab dropdown derives from APPOINTMENT_TYPES (4 values)', () => {
    expect(TAB_SRC).toMatch(/APPOINTMENT_TYPES\.map/);
    // Old 2-element inline array gone.
    expect(TAB_SRC).not.toMatch(/v: ['"]sales['"]/);
    expect(TAB_SRC).not.toMatch(/v: ['"]followup['"]/);
  });

  test('G4.1 report tab imports SSOT', () => {
    expect(TAB_SRC).toMatch(/from ['"][^'"]*appointmentTypes/);
  });
});
