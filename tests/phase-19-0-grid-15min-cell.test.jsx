// tests/phase-19-0-grid-15min-cell.test.jsx
// Phase 19.0 — C1-C4 — AppointmentTab grid cell + span calc.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');

describe('Phase 19.0 — AppointmentTab 15-min grid', () => {
  test('C1.1 SLOT_H bumped to 22 (Phase 21.0-quinquies — was 18 in Phase 19.0, was 36 pre-19.0)', () => {
    // Phase 21.0-quinquies (2026-05-06 EOD) — bumped from 18 to 22 for
    // breathing room after user feedback "ตารางเราแม่งโคตรจะไม่สวยดูยาก
    // ลายตา". Phase 19.0 had halved 36 → 18 with the 30-min → 15-min
    // slot interval shrink. Both old values must NOT remain.
    expect(SRC).toMatch(/const SLOT_H\s*=\s*22\b/);
    expect(SRC).not.toMatch(/const SLOT_H\s*=\s*36\b/);
    // Note: SRC may still mention "18" inside comments referencing the
    // Phase 19.0 history; only the literal `const SLOT_H = 18` declaration
    // must be gone. The regex above with `\b` matches the bare-number
    // declaration, not in-comment historical references.
    expect(SRC).not.toMatch(/^const SLOT_H\s*=\s*18\b/m);
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
