// V71 (2026-05-15) — Bottom-row wrapper around the canonical Phase 28
// `TreatmentLifecycleStepper` for use inside <AppointmentHubRowCard>.
// Visibility rules per spec §3.1:
//  - latestTreatment present     → full stepper, isLatest=true (pulse on next pending)
//  - no treatment + today tab    → muted stepper (3 pending-future dots, no times)
//  - no treatment + other tabs   → render null entirely
//
// Pure-display; no Firestore writes; data prop flows from AppointmentHubView's
// already-loaded `treatmentsByCustomerDate.get(...)[0]`.

import React from 'react';
import { TreatmentLifecycleStepper } from '../backend/treatment-history/TreatmentLifecycleStepper.jsx';
import { getTreatmentLifecycle, resolveCourseDeducted } from '../../lib/treatmentDisplayResolvers.js';

export default function AppointmentOpdStepperRow({ latestTreatment, isTodayTab }) {
  // Hide entirely on non-today tabs when no treatment exists.
  if (!latestTreatment && !isTodayTab) return null;

  // Derive lifecycle from real treatment (drives vitals/doctor/completed + colors + times)
  // OR pass empty array → stepper renders muted pending dots.
  const lifecycle = latestTreatment ? getTreatmentLifecycle(latestTreatment) : [];
  const isLatest = !!latestTreatment;
  // V139 — opt-in "course" step (4 dots). Driven by whether THIS OPD record
  // deducted a course, via the resolveCourseDeducted SSOT (AV159 — no inline
  // predicate here). Live: latestTreatment flows from AppointmentHubView's
  // listenToTreatmentsByDateRange onSnapshot → a fresh deduction lights the step
  // instantly, same as vitals/doctor/completed.
  const courseDeducted = latestTreatment ? resolveCourseDeducted(latestTreatment) : false;

  return (
    <div
      className="border-t border-[var(--bd)] mt-3 pt-3"
      data-testid="appt-row-opd-stepper"
    >
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] shrink-0">
          สถานะ OPD
        </span>
        <TreatmentLifecycleStepper
          lifecycle={lifecycle}
          isLatest={isLatest}
          withCourseStep
          courseDeducted={courseDeducted}
        />
      </div>
    </div>
  );
}
