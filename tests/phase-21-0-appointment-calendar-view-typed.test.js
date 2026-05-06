// tests/phase-21-0-appointment-calendar-view-typed.test.js
// Phase 21.0 — C1 — AppointmentCalendarView source-grep regression locks
//
// Component-render tests aren't feasible without mocking onSnapshot listener
// graph (Phase BS hooks). Source-grep instead asserts the parameterization
// + filter-defense-in-depth shape so refactors can't drop the typeFilter
// without the build/test catching it.
//
// Asserts:
//  - Default export name is 'AppointmentCalendarView' (rename from AppointmentTab)
//  - Imports SSOT helpers from appointmentTypes.js
//  - typeFilter derived from APPOINTMENT_TYPE_VALUES whitelist
//  - typedDayAppts derives from dayAppts.filter(apptMatchesType)
//  - All 4 dayAppts use-sites that affect rendering route through typedDayAppts
//  - lockedAppointmentType is forwarded to AppointmentFormModal

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');

describe('Phase 21.0 — C1 AppointmentCalendarView parameterized', () => {
  test('C1.1 default export is AppointmentCalendarView (rename complete)', () => {
    expect(SRC).toMatch(/export default function AppointmentCalendarView\s*\(/);
    // Old name must NOT remain as a function export (presence in comments OK).
    expect(SRC).not.toMatch(/export default function AppointmentTab\s*\(/);
  });

  test('C1.2 imports SSOT helpers from appointmentTypes.js', () => {
    expect(SRC).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/appointmentTypes\.js['"]/);
    expect(SRC).toMatch(/APPOINTMENT_TYPE_VALUES/);
    expect(SRC).toMatch(/migrateLegacyAppointmentType/);
    expect(SRC).toMatch(/resolveAppointmentTypeLabel/);
  });

  test('C1.3 typeFilter derived from APPOINTMENT_TYPE_VALUES whitelist', () => {
    expect(SRC).toMatch(/APPOINTMENT_TYPE_VALUES\.includes\(appointmentType\)/);
    // Falls through to null for unknown values (defense-in-depth).
    expect(SRC).toMatch(/typeFilter\s*=\s*APPOINTMENT_TYPE_VALUES\.includes\(appointmentType\)\s*\?\s*appointmentType\s*:\s*null/);
  });

  test('C1.4 apptMatchesType uses migrateLegacyAppointmentType (defense-in-depth)', () => {
    expect(SRC).toMatch(/migrateLegacyAppointmentType\s*\(\s*a\?\.appointmentType\s*\)\s*===\s*typeFilter/);
  });

  test('C1.5 typedDayAppts useMemo derives from dayAppts.filter(apptMatchesType)', () => {
    expect(SRC).toMatch(/typedDayAppts\s*=\s*useMemo\(\s*\(\)\s*=>\s*dayAppts\.filter\(apptMatchesType\)/);
  });

  test('C1.6 apptMap derivation reads typedDayAppts (not raw dayAppts)', () => {
    // Structure: apptMap = useMemo(() => { typedDayAppts.forEach... }, [typedDayAppts])
    const apptMapMatch = SRC.match(/const apptMap = useMemo\(\(\) => \{[\s\S]{0,200}?forEach/);
    expect(apptMapMatch).not.toBeNull();
    expect(apptMapMatch[0]).toMatch(/typedDayAppts\.forEach/);
  });

  test('C1.7 dayDoctors derivation reads typedDayAppts', () => {
    const dayDoctorsMatch = SRC.match(/const dayDoctors = useMemo\(\(\) => \{[\s\S]{0,200}?forEach/);
    expect(dayDoctorsMatch).not.toBeNull();
    expect(dayDoctorsMatch[0]).toMatch(/typedDayAppts\.forEach/);
  });

  test('C1.8 occupied check inside grid uses typedDayAppts', () => {
    // Multi-slot occupancy detection must respect type filter.
    expect(SRC).toMatch(/const occupied = typedDayAppts\.some\(/);
  });

  test('C1.9 mini-calendar dot map filters by typeFilter', () => {
    // Dot count under each calendar day must reflect ONLY the active type.
    expect(SRC).toMatch(/typeFilter\s*\?\s*monthCellList\.filter\(apptMatchesType\)/);
  });

  test('C1.10 week-strip count filters by typeFilter', () => {
    expect(SRC).toMatch(/typeFilter\s*\?\s*weekDayList\.filter\(apptMatchesType\)/);
  });

  test('C1.11 lockedAppointmentType forwarded to AppointmentFormModal', () => {
    expect(SRC).toMatch(/lockedAppointmentType=\{typeFilter\s*\|\|\s*null\}/);
  });

  test('C1.12 Phase 21.0 marker present (institutional memory)', () => {
    expect(SRC).toMatch(/Phase 21\.0/);
  });
});
