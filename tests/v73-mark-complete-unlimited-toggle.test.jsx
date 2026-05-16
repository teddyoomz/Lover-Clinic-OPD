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
  it('B2.1 V71.B-ter — gate is FULLY relaxed (no hasTreatmentForDay, no wasServiceCompleted)', () => {
    // V71 → V71.B-bis (added persistent flag) → V71.B-ter (drop both gates).
    // User directive "ไปๆกลับๆไม่จำกัด" + frustration at button still hidden
    // for appts without treatment → trust admin's deliberate click entirely.
    expect(rowCard).toMatch(/const showMarkCompleteBtn = isTodayTab && !appt\.serviceCompletedAt;/);
  });

  it('B2.2 gate does NOT reference hasTreatmentForDay or wasServiceCompleted in the visibility check', () => {
    const fnMatch = rowCard.match(/const showMarkCompleteBtn[\s\S]+?;/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch[0]).not.toMatch(/hasTreatmentForDay/);
    expect(fnMatch[0]).not.toMatch(/wasServiceCompleted/);
  });

  it('B2.3 showUnmarkBtn gate unchanged (still isTodayTab + serviceCompletedAt truthy)', () => {
    expect(rowCard).toMatch(/const showUnmarkBtn = isTodayTab && !!appt\.serviceCompletedAt/);
  });

  it('B2.4 V71.B-ter — button ALWAYS visible on today tab when not currently completed', () => {
    const isTodayTab = true;
    const serviceCompletedAt = null;
    // No conditions on treatment or prior-complete — admin's click is the gate
    const show = isTodayTab && !serviceCompletedAt;
    expect(show).toBe(true);
  });

  it('B2.5 V71.B-ter — button hidden when currently completed (shows unmark instead)', () => {
    const isTodayTab = true;
    const serviceCompletedAt = 'TS-2026-05-18';
    const show = isTodayTab && !serviceCompletedAt;
    expect(show).toBe(false);
  });

  it('B2.6 mutual exclusion preserved: mark + unmark gates never both true', () => {
    const isTodayTab = true;
    for (const completedAt of [null, 'TS-2026-05-18']) {
      const showMark = isTodayTab && !completedAt;
      const showUnmark = isTodayTab && !!completedAt;
      expect(showMark && showUnmark).toBe(false);
    }
  });
});

describe('V71.B-ter — round-trip simulator (mark → unmark → re-mark cycles, no preconditions)', () => {
  function simulateCycle(initialState, action) {
    const next = { ...initialState };
    if (action === 'mark') {
      next.serviceCompletedAt = 'TS-' + Date.now();
      next.serviceCompletedBy = 'uid-123';
      next.wasServiceCompleted = true;  // still stamped — kept as historical/audit signal
    } else if (action === 'unmark') {
      next.serviceCompletedAt = null;
      next.serviceCompletedBy = '';
    }
    return next;
  }

  // V71.B-ter gate (no conditions on treatment / prior-complete)
  function showMarkBtn(appt) {
    const isTodayTab = true;
    return isTodayTab && !appt.serviceCompletedAt;
  }

  it('B3.1 fresh appt (no treatment, no prior complete) → mark visible', () => {
    const appt = { serviceCompletedAt: null };
    expect(showMarkBtn(appt)).toBe(true);
  });

  it('B3.2 mark cycle 1 → button hidden (now showUnmark)', () => {
    let appt = { serviceCompletedAt: null };
    appt = simulateCycle(appt, 'mark');
    expect(showMarkBtn(appt)).toBe(false);
  });

  it('B3.3 unmark after mark → mark RE-APPEARS regardless of treatment state', () => {
    let appt = { serviceCompletedAt: null };
    appt = simulateCycle(appt, 'mark');
    appt = simulateCycle(appt, 'unmark');
    expect(showMarkBtn(appt)).toBe(true);
  });

  it('B3.4 LEGACY appt stuck pre-fix (no wasServiceCompleted, no treatment) → STILL VISIBLE in V71.B-ter', () => {
    // This is the exact case user hit: appt was mark+unmark BEFORE the fix
    // so wasServiceCompleted is undefined; treatment also missing.
    const appt = { serviceCompletedAt: null /* no wasServiceCompleted, no treatment */ };
    expect(showMarkBtn(appt)).toBe(true);  // V71.B-ter unblocks legacy stuck appts
  });

  it('B3.5 10-cycle round-trip — button always available, no preconditions', () => {
    let appt = { serviceCompletedAt: null };
    expect(showMarkBtn(appt)).toBe(true);
    appt = simulateCycle(appt, 'mark');
    for (let i = 0; i < 10; i++) {
      appt = simulateCycle(appt, 'unmark');
      expect(showMarkBtn(appt)).toBe(true);  // always available on unmark
      appt = simulateCycle(appt, 'mark');
      expect(appt.serviceCompletedAt).toBeTruthy();
    }
  });
});
