// V71 — AppointmentOpdStepperRow wrapper over TreatmentLifecycleStepper.
// Visibility matrix:
//  - latestTreatment present → full stepper, isLatest=true
//  - !latestTreatment + isTodayTab=true → muted stepper (3 pending-future dots)
//  - !latestTreatment + isTodayTab=false → render null

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppointmentOpdStepperRow from '../src/components/admin/AppointmentOpdStepperRow.jsx';

const treatmentWithVitals = {
  id: 'T1',
  vitalsignsRecordedAt: { toDate: () => new Date('2026-05-15T08:00:00') },
  status: 'vitalsigns-recorded',
  recordedAt: '2026-05-15T08:00:00',
};

describe('V71 AppointmentOpdStepperRow', () => {
  it('R1.1 renders stepper with label "สถานะ OPD" when latestTreatment present', () => {
    render(<AppointmentOpdStepperRow latestTreatment={treatmentWithVitals} isTodayTab={true} />);
    expect(screen.getByText('สถานะ OPD')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-lifecycle-stepper')).toBeInTheDocument();
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });

  it('R1.2 renders muted stepper when no treatment + today tab', () => {
    render(<AppointmentOpdStepperRow latestTreatment={null} isTodayTab={true} />);
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
    expect(screen.getByTestId('treatment-lifecycle-stepper')).toBeInTheDocument();
    // V139 (2026-05-31) — OPD card stepper now has 4 dots (added "course" step).
    // Muted: all 4 dots present, none have done state.
    const dots = screen.getAllByTestId('stepper-dot');
    expect(dots).toHaveLength(4);
  });

  it('R1.3 renders null when no treatment + non-today tab', () => {
    const { container } = render(<AppointmentOpdStepperRow latestTreatment={null} isTodayTab={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId('appt-row-opd-stepper')).toBeNull();
  });

  it('R1.4 renders stepper for past tab when treatment present', () => {
    render(<AppointmentOpdStepperRow latestTreatment={treatmentWithVitals} isTodayTab={false} />);
    expect(screen.getByTestId('appt-row-opd-stepper')).toBeInTheDocument();
  });
});
