import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import AppointmentOpdStepperRow from '../src/components/admin/AppointmentOpdStepperRow.jsx';

// 2026-05-27 — OPD status stepper polish: centre-align + Ember footer band (both themes).
// Pure-display / cosmetic-shell. Shared TreatmentLifecycleStepper (circles) untouched.

describe('OPD stepper polish — centre + Ember band', () => {
  it('RTL: stepper row is centred (justify-center) + circles render verbatim', () => {
    render(<AppointmentOpdStepperRow latestTreatment={null} isTodayTab={true} />);
    const wrap = screen.getByTestId('appt-row-opd-stepper');
    const flexRow = wrap.firstElementChild;
    expect(flexRow.className).toMatch(/justify-center/);
    expect(flexRow.className).toMatch(/items-center/); // existing classes kept
    expect(screen.getByText('สถานะ OPD')).toBeInTheDocument();
    // V139 (2026-05-31) — OPD card stepper gained a 4th "course" step (withCourseStep).
    expect(screen.getAllByTestId('stepper-dot')).toHaveLength(4);
  });

  it('source-grep: AppointmentOpdStepperRow flex row has justify-center', () => {
    const src = readFileSync('src/components/admin/AppointmentOpdStepperRow.jsx', 'utf8');
    expect(src).toMatch(/flex items-center justify-center gap-3 flex-wrap/);
  });

  it('source-grep: AppointmentHubRowCard band uses Ember, NOT orange/amber', () => {
    const src = readFileSync('src/components/admin/AppointmentHubRowCard.jsx', 'utf8');
    expect(src).toMatch(/bg-red-100\/50/);
    expect(src).toMatch(/dark:bg-red-500\/\[0\.06\]/);
    expect(src).not.toMatch(/bg-orange-50\/40/);          // anti-regression (old band)
    expect(src).not.toMatch(/dark:bg-amber-500\/\[0\.03\]/); // anti-regression (old band)
  });
});
