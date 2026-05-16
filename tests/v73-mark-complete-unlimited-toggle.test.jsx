// tests/v73-mark-complete-unlimited-toggle.test.jsx
// V71.B-bis (2026-05-18) — unlimited mark-complete ↔ un-mark toggle.
//
// User report (with screenshot): After cycling mark-complete → un-mark on a
// today appointment, the "ลูกค้ารับบริการเรียบร้อย" button disappears. User
// wants UNLIMITED back-and-forth toggling without conditions.
//
// Root cause: V71's gate required `hasTreatmentForDay`, computed via
// `apptDateTreatments[0]` (parent passes `treatmentsByCustomerDate.get(
// `${customerId}|${date}`) || []`). The treatment-link reader is fragile
// when `appt.date` and `treatment.detail.treatmentDate` mismatch (different
// timezones, date-edit on appt after treatment recorded, listener race).
// After unmark cycle, the gate evaluated false → button hidden → admin
// stuck.
//
// Fix: V71.B-bis adds persistent `wasServiceCompleted: true` flag stamped on
// FIRST mark-complete. Flag persists across unmark cycles (unmark clears
// `serviceCompletedAt` + `serviceCompletedBy` but NOT `wasServiceCompleted`).
// Gate becomes:
//   isTodayTab && !serviceCompletedAt && (hasTreatmentForDay || wasServiceCompleted)
// First-time gate (treatment required) preserved for V71 contract. Subsequent
// toggles bypass treatment check.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const rowCard = SRC('src/components/admin/AppointmentHubRowCard.jsx');
const backend = SRC('src/lib/backendClient.js');

describe('V71.B-bis — markAppointmentServiceCompleted stamps wasServiceCompleted', () => {
  // Anchor at function start; bound by the next `export async function` to scope.
  function fnBody(name) {
    const m = backend.match(new RegExp(`export async function ${name}[\\s\\S]+?(?=\\nexport (?:async )?function )`));
    return m ? m[0] : '';
  }

  it('B1.1 markAppointmentServiceCompleted writes wasServiceCompleted: true', () => {
    expect(fnBody('markAppointmentServiceCompleted')).toMatch(/wasServiceCompleted:\s*true/);
  });

  it('B1.2 markAppointmentServiceCompleted still stamps serviceCompletedAt + By', () => {
    const body = fnBody('markAppointmentServiceCompleted');
    expect(body).toMatch(/serviceCompletedAt:\s*serverTimestamp\(\)/);
    expect(body).toMatch(/serviceCompletedBy:/);
  });

  it('B1.3 unmarkAppointmentServiceCompleted does NOT touch wasServiceCompleted', () => {
    expect(fnBody('unmarkAppointmentServiceCompleted')).not.toMatch(/wasServiceCompleted/);
  });

  it('B1.4 unmarkAppointmentServiceCompleted clears serviceCompletedAt + By', () => {
    const body = fnBody('unmarkAppointmentServiceCompleted');
    expect(body).toMatch(/serviceCompletedAt:\s*null/);
    expect(body).toMatch(/serviceCompletedBy:\s*''/);
  });
});

describe('V71.B-bis — RowCard gate uses persistent flag for unlimited toggle', () => {
  it('B2.1 showMarkCompleteBtn gate references wasServiceCompleted', () => {
    expect(rowCard).toMatch(/wasServiceCompleted/);
  });

  it('B2.2 gate is: isTodayTab AND !serviceCompletedAt AND (hasTreatmentForDay OR wasServiceCompleted)', () => {
    expect(rowCard).toMatch(/isTodayTab\s*&&\s*\n?\s*!appt\.serviceCompletedAt\s*&&\s*\n?\s*\(hasTreatmentForDay\s*\|\|\s*!!appt\.wasServiceCompleted\)/);
  });

  it('B2.3 showUnmarkBtn gate unchanged (still isTodayTab + serviceCompletedAt truthy)', () => {
    expect(rowCard).toMatch(/const showUnmarkBtn = isTodayTab && !!appt\.serviceCompletedAt/);
  });

  it('B2.4 V71 first-time contract preserved: !wasServiceCompleted AND !hasTreatmentForDay → no button', () => {
    // Logic test: simulate the boolean expression
    const isTodayTab = true;
    const serviceCompletedAt = null;
    const hasTreatmentForDay = false;
    const wasServiceCompleted = false;  // never marked before
    const show = isTodayTab && !serviceCompletedAt && (hasTreatmentForDay || !!wasServiceCompleted);
    expect(show).toBe(false);  // first-time gate still requires treatment
  });

  it('B2.5 V71.B-bis unlimited toggle: !hasTreatmentForDay BUT wasServiceCompleted → SHOW button', () => {
    const isTodayTab = true;
    const serviceCompletedAt = null;
    const hasTreatmentForDay = false;
    const wasServiceCompleted = true;  // was marked before, then unmarked
    const show = isTodayTab && !serviceCompletedAt && (hasTreatmentForDay || !!wasServiceCompleted);
    expect(show).toBe(true);  // RE-APPEARS for unlimited toggle
  });

  it('B2.6 mutual exclusion preserved: mark + unmark gates never both true', () => {
    const isTodayTab = true;
    for (const completedAt of [null, 'TS-2026-05-18']) {
      for (const hasTreatment of [true, false]) {
        for (const wasCompleted of [true, false]) {
          const showMark = isTodayTab && !completedAt && (hasTreatment || !!wasCompleted);
          const showUnmark = isTodayTab && !!completedAt;
          expect(showMark && showUnmark).toBe(false);  // mutually exclusive
        }
      }
    }
  });
});

describe('V71.B-bis — round-trip simulator (mark → unmark → re-mark cycles)', () => {
  function simulateCycle(initialState, action) {
    const next = { ...initialState };
    if (action === 'mark') {
      next.serviceCompletedAt = 'TS-' + Date.now();
      next.serviceCompletedBy = 'uid-123';
      next.wasServiceCompleted = true;  // persistent
    } else if (action === 'unmark') {
      next.serviceCompletedAt = null;
      next.serviceCompletedBy = '';
      // wasServiceCompleted NOT cleared
    }
    return next;
  }

  function showMarkBtn(appt, hasTreatmentForDay) {
    return true && !appt.serviceCompletedAt && (hasTreatmentForDay || !!appt.wasServiceCompleted);
  }

  it('B3.1 fresh appt with treatment → mark visible', () => {
    const appt = { serviceCompletedAt: null, wasServiceCompleted: undefined };
    expect(showMarkBtn(appt, true)).toBe(true);
  });

  it('B3.2 mark cycle 1 → button hidden (now showUnmark)', () => {
    let appt = { serviceCompletedAt: null, wasServiceCompleted: undefined };
    appt = simulateCycle(appt, 'mark');
    expect(showMarkBtn(appt, true)).toBe(false);  // serviceCompletedAt set
    expect(appt.wasServiceCompleted).toBe(true);
  });

  it('B3.3 unmark after mark → mark RE-APPEARS (treatment still exists)', () => {
    let appt = { serviceCompletedAt: null, wasServiceCompleted: undefined };
    appt = simulateCycle(appt, 'mark');
    appt = simulateCycle(appt, 'unmark');
    expect(showMarkBtn(appt, true)).toBe(true);  // back to visible
    expect(appt.wasServiceCompleted).toBe(true);  // persistent flag intact
  });

  it('B3.4 unmark + treatment GONE → mark STILL VISIBLE (V71.B-bis fix)', () => {
    let appt = { serviceCompletedAt: null, wasServiceCompleted: undefined };
    appt = simulateCycle(appt, 'mark');
    appt = simulateCycle(appt, 'unmark');
    // simulate the original user bug: treatment somehow becomes unreachable
    const hasTreatmentForDay = false;
    expect(showMarkBtn(appt, hasTreatmentForDay)).toBe(true);  // FIX
  });

  it('B3.5 10-cycle round-trip — button always available after first complete', () => {
    let appt = { serviceCompletedAt: null, wasServiceCompleted: undefined };
    // Initial mark requires treatment
    expect(showMarkBtn(appt, true)).toBe(true);
    appt = simulateCycle(appt, 'mark');
    // Loop unmark/mark 10 times — even without treatment, button is available
    for (let i = 0; i < 10; i++) {
      appt = simulateCycle(appt, 'unmark');
      expect(showMarkBtn(appt, false)).toBe(true);  // no treatment, but flag persists
      appt = simulateCycle(appt, 'mark');
      expect(appt.serviceCompletedAt).toBeTruthy();
    }
  });
});
