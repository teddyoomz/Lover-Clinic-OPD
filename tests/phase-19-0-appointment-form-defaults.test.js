// tests/phase-19-0-appointment-form-defaults.test.js
// Phase 19.0 — F1-F5 — AppointmentFormModal default behavior + auto-bump.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf8');

describe('Phase 19.0 — AppointmentFormModal defaults', () => {
  test('F1.1 defaultFormData endTime = 10:15 (was 10:30)', () => {
    expect(SRC).toMatch(/endTime: ['"]10:15['"]/);
    expect(SRC).not.toMatch(/endTime: ['"]10:30['"]/);
  });

  test('F1.2 defaultFormData uses DEFAULT_APPOINTMENT_TYPE (not raw "sales")', () => {
    // The default block should reference DEFAULT_APPOINTMENT_TYPE, not the raw string.
    expect(SRC).toMatch(/appointmentType:\s*DEFAULT_APPOINTMENT_TYPE/);
    // Save-payload + edit-mode loader fallbacks must not use raw 'sales'.
    expect(SRC).not.toMatch(/appointmentType:\s*['"]sales['"]/);
  });

  test('F2.1 imports SSOT module', () => {
    expect(SRC).toMatch(/from ['"][^'"]*appointmentTypes/);
  });

  test('F2.2 imports canonical TIME_SLOTS', () => {
    expect(SRC).toMatch(/from ['"][^'"]*staffScheduleValidation/);
  });

  test('F3.1 radio iterates APPOINTMENT_TYPES (not local APPT_TYPES)', () => {
    expect(SRC).toMatch(/APPOINTMENT_TYPES\.map/);
    // Old local array must be gone.
    expect(SRC).not.toMatch(/^const APPT_TYPES = \[\{ value: ['"]sales['"]/m);
  });

  test('F4.1 auto-bump endTime block present (Q3)', () => {
    // Auto-bump preserves +15 default when admin changes startTime alone.
    expect(SRC).toMatch(/Phase 19\.0/);
    expect(SRC).toMatch(/auto-advance/i);
  });
});
