// tests/appt-r4-persistent-treatment-link.test.jsx
// appointment-loop R4 (2026-06-03) — persistent appt→treatment link closes the
// double-treatment → double-charge vector.
//
// BUG: the hub card's "has this appointment been treated?" gate (hasTreatmentForDay)
// used ONLY the date-match heuristic (apptDateTreatments[0], matched by customerId +
// appt.date === treatment.detail.treatmentDate). When that heuristic FAILS
// (treatmentDate drifts from appt.date — a documented V71.B-bis fragility), the
// appointment shows the "create treatment" button AGAIN even though a treatment
// exists → admin creates a 2nd treatment → 2nd auto-sale = DOUBLE CHARGE.
//
// FIX: (1) AdminDashboard onSaved stamps appt.linkedTreatmentId after a treatment
// is created FROM an appointment; (2) hasTreatmentForDay now also honors
// appt.linkedTreatmentId. So once linked, the create blocks hide + the edit block
// shows — RELIABLY, regardless of the date-match.
//
// This file proves the GATE behavior (RTL) + the wiring (source-grep). The full
// UI flow (onCreateTreatment → TFP → onSaved → stamp → card refresh) is user
// hands-on L1; the data stamp rides updateBackendAppointment (already real-prod
// proven in scripts/diag-appointment-room-uncancel-probe.mjs).

import React from 'react';
import { describe, it, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import AppointmentHubRowCard from '../src/components/admin/AppointmentHubRowCard.jsx';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');

// A confirmed, FUTURE-dated appointment → the "create treatment" block renders
// (line ~540: !hasTreatmentForDay && status==='confirmed' && !isPastDate) when no
// treatment is known. Future date keeps isPastDate=false deterministically.
const futureAppt = (over = {}) => ({
  id: 'BA-R4-test', customerId: 'C-R4', customerName: 'TEST R4',
  date: '2099-01-01', startTime: '10:00', endTime: '11:00',
  status: 'confirmed', doctorName: 'หมอ', roomName: 'ห้อง', appointmentTo: 'x',
  serviceCompletedAt: null, ...over,
});
const summary = { hn: '000R4', name: 'TEST R4', walletBalance: 0 };

describe('appointment-loop R4 — persistent link hides the create-treatment button', () => {
  it('R4.1 [FIX] persistent appt.linkedTreatmentId hides "create" + shows "edit" even with NO date-match treatment', () => {
    render(
      <AppointmentHubRowCard
        appt={futureAppt({ linkedTreatmentId: 'BT-PERSIST' })}
        summary={summary}
        apptDateTreatments={[]}            // heuristic EMPTY (the drift case)
        isTodayTab={false}
      />,
    );
    expect(screen.queryByTestId('row-action-create-treatment')).toBeNull();      // NO 2nd-create
    expect(screen.getByTestId('row-action-edit-treatment')).toBeInTheDocument(); // edit instead
  });

  it('R4.2 [CONTROL] no link + no date-match → the "create" button DOES show (truly untreated)', () => {
    render(
      <AppointmentHubRowCard
        appt={futureAppt()}                // no linkedTreatmentId
        summary={summary}
        apptDateTreatments={[]}
        isTodayTab={false}
      />,
    );
    expect(screen.getByTestId('row-action-create-treatment')).toBeInTheDocument();
  });

  it('R4.3 [NO REGRESSION] date-match heuristic still hides "create" (back-compat)', () => {
    render(
      <AppointmentHubRowCard
        appt={futureAppt()}                // no persistent link
        summary={summary}
        apptDateTreatments={[{ id: 'BT-HEUR', status: 'doctor-recorded' }]}  // heuristic present
        isTodayTab={false}
      />,
    );
    expect(screen.queryByTestId('row-action-create-treatment')).toBeNull();
    expect(screen.getByTestId('row-action-edit-treatment')).toBeInTheDocument();
  });
});

describe('appointment-loop R4 — source-grep wiring', () => {
  const CARD = read('src/components/admin/AppointmentHubRowCard.jsx');
  const ADMIN = read('src/pages/AdminDashboard.jsx');

  test('R4.4 hasTreatmentForDay honors the persistent appt.linkedTreatmentId (R10: join-validated)', () => {
    // R10 — the link is still honored, but join-validated: a LOADED link whose
    // customerId ≠ the appt's current customer is invalid (the appt's customer was
    // changed / a stale restore); an UNLOADED link is still trusted (R4 backstop).
    expect(CARD).toMatch(/const linkValid = !!appt\.linkedTreatmentId/);
    expect(CARD).toMatch(/const hasTreatmentForDay = !!latestTreatment \|\| linkValid;/);
  });

  test('R4.5 AdminDashboard onSaved stamps appt.linkedTreatmentId from the source appointment', () => {
    // the launch already threads appointmentId; onSaved must use it to stamp.
    expect(ADMIN).toMatch(/appointmentId: appt\.id,/);              // launch threads it
    expect(ADMIN).toMatch(/const srcApptId = treatmentFormMode\?\.appointmentId/);
    expect(ADMIN).toMatch(/updateBackendAppointment\(srcApptId, \{ linkedTreatmentId: savedTreatmentId \}\)/);
  });
});
