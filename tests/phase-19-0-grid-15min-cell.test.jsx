// tests/phase-19-0-grid-15min-cell.test.jsx
// Phase 19.0 — C1-C4 — AppointmentTab grid cell + span calc.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');

describe('Phase 19.0 — AppointmentTab 15-min grid', () => {
  test('C1.1 row-height floor = MIN_SLOT_H 22 (V128.cal — now the FLOOR of a dynamic slotH; was fixed SLOT_H pre-V128)', () => {
    // V128.cal (2026-05-28) — SLOT_H is no longer a fixed const; the grid
    // computes a DYNAMIC slotH (computeApptSlotHeight) that grows to fill the
    // viewport on tall (2K+) screens, clamped to [MIN_SLOT_H 22, MAX_SLOT_H 46].
    // 22 is preserved as the FLOOR (laptop density unchanged). The old fixed
    // declarations (18 / 36) must NOT remain, and NO fixed `const SLOT_H` either.
    expect(SRC).toMatch(/const MIN_SLOT_H\s*=\s*22\b/);
    expect(SRC).toMatch(/computeApptSlotHeight/);          // dynamic height present
    expect(SRC).not.toMatch(/const SLOT_H\s*=\s*36\b/);
    expect(SRC).not.toMatch(/^const SLOT_H\s*=\s*18\b/m);
    expect(SRC).not.toMatch(/^const SLOT_H\s*=/m);          // no fixed SLOT_H const (now dynamic)
  });

  test("C2.1 slot-click endTime advances one 15-min slot; no-slot default moved to modal (Issue-2)", () => {
    // The 15-min grid duration for a CLICKED slot is preserved.
    expect(SRC).toMatch(/TIME_SLOTS\[TIME_SLOTS\.indexOf\(time\) \+ 1\]/);
    // Issue-2 (2026-05-26) — openCreate now passes '' (not '10:15'/'10:00') when no
    // slot is clicked, so AppointmentFormModal applies the branch open-hours default.
    expect(SRC).toMatch(/initialStartTime: time \|\| '',/);
  });

  test('C3.1 imports canonical TIME_SLOTS', () => {
    expect(SRC).toMatch(/from ['"][^'"]*staffScheduleValidation/);
    expect(SRC).toMatch(/TIME_SLOTS/);
  });

  test('C4.1 Phase 19.0 marker present', () => {
    expect(SRC).toMatch(/Phase 19\.0/);
  });
});
