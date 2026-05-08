// V53 (BS-12) — Source-grep regression locks for the 3 victim files that
// derive their visible time-axis from per-branch openHours.
//
// V12 multi-reader-sweep guard: future commits that revert any victim file
// to raw TIME_SLOTS.map (instead of the helper-derived visible.slots.map)
// fail this bank.
//
// Companion: tests/audit-branch-scope.test.js BS-12.x — same intent at the
// audit-skill layer; this file pins each victim individually for git-blame trail.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const VICTIM_FILES = [
  'src/components/backend/AppointmentCalendarView.jsx',
  'src/components/backend/AppointmentFormModal.jsx',
  'src/components/backend/scheduling/ScheduleEntryFormModal.jsx',
  'src/components/backend/DepositPanel.jsx',
];

function readVictim(path) {
  return readFileSync(path, 'utf8');
}

// ─── G1 — Per-victim canonical V53 wiring ───────────────────────────────────

describe('G1 — Per-victim V53 wiring', () => {
  for (const path of VICTIM_FILES) {
    describe(path, () => {
      it('imports getVisibleTimeSlotsForDate from scheduleFilterUtils', () => {
        const c = readVictim(path);
        expect(c).toMatch(/import\s*\{[^}]*getVisibleTimeSlotsForDate[^}]*\}\s*from\s*['"][^'"]*scheduleFilterUtils/);
      });

      it('imports useEffectiveClinicSettings from BranchContext', () => {
        const c = readVictim(path);
        expect(c).toMatch(/useEffectiveClinicSettings/);
      });

      it('calls useEffectiveClinicSettings(...) inside component', () => {
        const c = readVictim(path);
        expect(c).toMatch(/useEffectiveClinicSettings\s*\(/);
      });

      it('uses getVisibleTimeSlotsForDate inside a useMemo', () => {
        const c = readVictim(path);
        // Match pattern: useMemo( ... getVisibleTimeSlotsForDate(...)
        expect(c).toMatch(/useMemo\s*\([\s\S]+?getVisibleTimeSlotsForDate\s*\(/);
      });

      it('useMemo deps include cs.openHoursMonFri or cs.openHoursSatSun', () => {
        const c = readVictim(path);
        // The useMemo deps array contains either openHoursMonFri or openHoursSatSun
        expect(c).toMatch(/openHoursMonFri/);
        expect(c).toMatch(/openHoursSatSun/);
      });

      it('contains V53 marker comment', () => {
        const c = readVictim(path);
        expect(c).toMatch(/V53|BS-12/);
      });
    });
  }
});

// ─── G2 — TIME_SLOTS.map outside victim files (anti-regression) ─────────────

describe('G2 — TIME_SLOTS.map only appears in victim files (or sanctioned exception)', () => {
  it('G2.1 raw TIME_SLOTS.map outside victim files = violation (V12 anti-regression)', async () => {
    // Read all backend component files and assert that no other component
    // calls TIME_SLOTS.map directly. This protects against a new component
    // re-introducing the hardcoded axis bypass.
    const fg = (await import('fast-glob')).default;
    const allFiles = fg.sync('src/components/backend/**/*.jsx', { cwd: process.cwd() });

    const violations = [];
    for (const f of allFiles) {
      const norm = f.replace(/\\/g, '/');
      // Skip the 3 sanctioned victim files (they DO call TIME_SLOTS.map but
      // also import the helper + render via visible.slots OR use TIME_SLOTS
      // for index-resolution only — the audit looks for `getVisibleTimeSlotsForDate`
      // in the same file as a sufficient condition).
      const c = readFileSync(f, 'utf8');
      if (!/TIME_SLOTS\.map/.test(c)) continue;

      // If the file imports getVisibleTimeSlotsForDate, it's V53-aware.
      const hasHelper = /getVisibleTimeSlotsForDate/.test(c);
      if (hasHelper) continue;

      violations.push(norm);
    }

    expect(violations, `G2.1 violations (TIME_SLOTS.map without V53 helper):\n${violations.join('\n')}`).toEqual([]);
  });
});

// ─── G3 — Helper exports + signatures ───────────────────────────────────────

describe('G3 — scheduleFilterUtils exports the V53 trio', () => {
  const HELPER_PATH = 'src/lib/scheduleFilterUtils.js';

  it('G3.1 exports getOpenHoursForDate', () => {
    const c = readFileSync(HELPER_PATH, 'utf8');
    expect(c).toMatch(/export function getOpenHoursForDate\b/);
  });

  it('G3.2 exports getVisibleTimeSlotsForDate', () => {
    const c = readFileSync(HELPER_PATH, 'utf8');
    expect(c).toMatch(/export function getVisibleTimeSlotsForDate\b/);
  });

  it('G3.3 exports isTimeOutsideOpenHours', () => {
    const c = readFileSync(HELPER_PATH, 'utf8');
    expect(c).toMatch(/export function isTimeOutsideOpenHours\b/);
  });

  it('G3.4 contains V53 marker for institutional memory', () => {
    const c = readFileSync(HELPER_PATH, 'utf8');
    expect(c).toMatch(/V53|BS-12/);
  });

  it('G3.5 reads V51 merged shape (openHoursMonFri + openHoursSatSun)', () => {
    const c = readFileSync(HELPER_PATH, 'utf8');
    expect(c).toMatch(/openHoursMonFri/);
    expect(c).toMatch(/openHoursSatSun/);
  });
});

// ─── G4 — AppointmentCalendarView closed-hours banner + chip ────────────────

describe('G4 — AppointmentCalendarView V53 surfaces', () => {
  const path = 'src/components/backend/AppointmentCalendarView.jsx';

  it('G4.1 renders closed-hours banner when visibleTime.isClosed', () => {
    const c = readVictim(path);
    expect(c).toMatch(/visibleTime\.isClosed/);
    expect(c).toMatch(/appt-closed-hours-banner/);
  });

  it('G4.2 renders out-of-hours chip via apptOutsideHours', () => {
    const c = readVictim(path);
    expect(c).toMatch(/apptOutsideHours/);
    expect(c).toMatch(/appt-outside-hours-chip/);
  });

  it('G4.3 maps visibleTime.slots (not raw TIME_SLOTS) for grid render', () => {
    const c = readVictim(path);
    expect(c).toMatch(/visibleTime\.slots\.map/);
  });

  it('G4.4 passes typedDayAppts as includeAppointments for auto-expand (Q1=A)', () => {
    const c = readVictim(path);
    expect(c).toMatch(/includeAppointments\s*:\s*typedDayAppts/);
  });
});

// ─── G5 — AppointmentFormModal closed banner + warning ──────────────────────

describe('G5 — AppointmentFormModal V53 surfaces', () => {
  const path = 'src/components/backend/AppointmentFormModal.jsx';

  it('G5.1 renders closed-day banner', () => {
    const c = readVictim(path);
    expect(c).toMatch(/appt-modal-closed-hours-banner/);
  });

  it('G5.2 renders warning hint for out-of-range startTime', () => {
    const c = readVictim(path);
    expect(c).toMatch(/appt-modal-startTime-warning/);
  });

  it('G5.3 picker uses visibleSlots.map (not TIME_SLOTS.map directly)', () => {
    const c = readVictim(path);
    expect(c).toMatch(/visibleSlots\.map/);
  });

  it('G5.4 preserves legacy current value as hidden option', () => {
    // When current value is outside visibleSlots, show it as a one-off option
    // so the select doesn't mis-render. Pattern: `formData.startTime && !visibleSlots.includes(...)`
    const c = readVictim(path);
    expect(c).toMatch(/!visibleSlots\.includes\s*\(\s*formData\.startTime\s*\)/);
  });
});

// ─── G6 — ScheduleEntryFormModal pickers + dayOfWeek anchor ─────────────────

describe('G6 — ScheduleEntryFormModal V53 surfaces', () => {
  const path = 'src/components/backend/scheduling/ScheduleEntryFormModal.jsx';

  it('G6.1 has DOW_ANCHOR_DATE map for recurring-mode bucket resolution', () => {
    const c = readVictim(path);
    expect(c).toMatch(/DOW_ANCHOR_DATE/);
  });

  it('G6.2 picker uses visibleSlots.map', () => {
    const c = readVictim(path);
    expect(c).toMatch(/visibleSlots\.map/);
  });

  it('G6.3 renders warning hint for out-of-range startTime', () => {
    const c = readVictim(path);
    expect(c).toMatch(/schedule-modal-startTime-warning/);
  });
});
