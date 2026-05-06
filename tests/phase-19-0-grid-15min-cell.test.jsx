// tests/phase-19-0-grid-15min-cell.test.jsx
// Phase 19.0 — C1-C4 — AppointmentTab grid cell + span calc.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');

describe('Phase 19.0 — AppointmentTab 15-min grid', () => {
  test('C1.1 SLOT_H = 18 (halved from 36)', () => {
    expect(SRC).toMatch(/const SLOT_H\s*=\s*18\b/);
    // Old value gone:
    expect(SRC).not.toMatch(/const SLOT_H\s*=\s*36\b/);
  });

  test("C2.1 default endTime fallback = '10:15' (was '10:30')", () => {
    expect(SRC).toMatch(/['"]10:15['"]/);
  });

  test('C3.1 imports canonical TIME_SLOTS', () => {
    expect(SRC).toMatch(/from ['"][^'"]*staffScheduleValidation/);
    expect(SRC).toMatch(/TIME_SLOTS/);
  });

  test('C4.1 Phase 19.0 marker present', () => {
    expect(SRC).toMatch(/Phase 19\.0/);
  });
});
