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

describe('V71.B-bis → V126 — RowCard gate (V71.B-ter relax + V126 status guard)', () => {
  it('B2.1 V126 — gate requires status === confirmed (V71.B-ter relax preserved for treatment-side; V126 adds workflow guard)', () => {
    // V71 (treatment+wasServiceComplete) → V71.B-bis (add persistent flag) →
    // V71.B-ter (drop both treatment gates) → V126 (add status === confirmed).
    // V71.B-ter's "trust admin's deliberate click" is intact for TREATMENT
    // concerns; V126 adds a WORKFLOW sequencing guard so admins must press
    // "คอนเฟิร์มนัด" first (verifies customer arrived at clinic) before
    // marking service completed. User directive: "ต้องกดคอนเฟืมนัดก่อน".
    expect(rowCard).toMatch(/const showMarkCompleteBtn = isTodayTab && !appt\.serviceCompletedAt && rawStatus === 'confirmed';/);
  });

  it('B2.2 V71.B-ter preserved — gate does NOT reference hasTreatmentForDay or wasServiceCompleted', () => {
    const fnMatch = rowCard.match(/const showMarkCompleteBtn[\s\S]+?;/);
    expect(fnMatch).toBeTruthy();
    expect(fnMatch[0]).not.toMatch(/hasTreatmentForDay/);
    expect(fnMatch[0]).not.toMatch(/wasServiceCompleted/);
  });

  it('B2.3 showUnmarkBtn gate unchanged (still isTodayTab + serviceCompletedAt truthy)', () => {
    expect(rowCard).toMatch(/const showUnmarkBtn = isTodayTab && !!appt\.serviceCompletedAt/);
  });

  it('B2.4 V126 — button visible on today tab when CONFIRMED + not currently completed', () => {
    const isTodayTab = true;
    const serviceCompletedAt = null;
    const rawStatus = 'confirmed';
    const show = isTodayTab && !serviceCompletedAt && rawStatus === 'confirmed';
    expect(show).toBe(true);
  });

  it('B2.4-bis V126 — button HIDDEN when status pending (must confirm first)', () => {
    const isTodayTab = true;
    const serviceCompletedAt = null;
    const rawStatus = 'pending';
    const show = isTodayTab && !serviceCompletedAt && rawStatus === 'confirmed';
    expect(show).toBe(false);
  });

  it('B2.4-ter V126 — button HIDDEN when status cancelled', () => {
    const isTodayTab = true;
    const serviceCompletedAt = null;
    const rawStatus = 'cancelled';
    const show = isTodayTab && !serviceCompletedAt && rawStatus === 'confirmed';
    expect(show).toBe(false);
  });

  it('B2.5 V71.B-ter — button hidden when currently completed (shows unmark instead) — V126 preserves this', () => {
    const isTodayTab = true;
    const serviceCompletedAt = 'TS-2026-05-18';
    const rawStatus = 'confirmed';
    const show = isTodayTab && !serviceCompletedAt && rawStatus === 'confirmed';
    expect(show).toBe(false);
  });

  it('B2.6 mutual exclusion preserved: mark + unmark gates never both true (any status)', () => {
    const isTodayTab = true;
    for (const completedAt of [null, 'TS-2026-05-18']) {
      for (const status of ['pending', 'confirmed', 'cancelled', 'done']) {
        const showMark = isTodayTab && !completedAt && status === 'confirmed';
        const showUnmark = isTodayTab && !!completedAt;
        expect(showMark && showUnmark).toBe(false);
      }
    }
  });
});

describe('V71.B-ter → V126 — round-trip simulator (status-gated; mark → unmark → re-mark cycles)', () => {
  function simulateCycle(initialState, action) {
    const next = { ...initialState };
    if (action === 'confirm') {
      next.status = 'confirmed';
    } else if (action === 'mark') {
      next.serviceCompletedAt = 'TS-' + Date.now();
      next.serviceCompletedBy = 'uid-123';
      next.wasServiceCompleted = true;  // still stamped — kept as historical/audit signal
    } else if (action === 'unmark') {
      next.serviceCompletedAt = null;
      next.serviceCompletedBy = '';
    } else if (action === 'cancel') {
      next.status = 'cancelled';
    }
    return next;
  }

  // V126 gate (V71.B-ter relax PLUS status === 'confirmed' workflow guard)
  function showMarkBtn(appt) {
    const isTodayTab = true;
    return isTodayTab && !appt.serviceCompletedAt && appt.status === 'confirmed';
  }

  it('B3.1 V126 — fresh PENDING appt → mark HIDDEN (must confirm first)', () => {
    const appt = { status: 'pending', serviceCompletedAt: null };
    expect(showMarkBtn(appt)).toBe(false);
  });

  it('B3.1-bis V126 — fresh CONFIRMED appt → mark visible', () => {
    const appt = { status: 'confirmed', serviceCompletedAt: null };
    expect(showMarkBtn(appt)).toBe(true);
  });

  it('B3.2 confirm → mark cycle → button hidden (now showUnmark)', () => {
    let appt = { status: 'pending', serviceCompletedAt: null };
    appt = simulateCycle(appt, 'confirm');
    appt = simulateCycle(appt, 'mark');
    expect(showMarkBtn(appt)).toBe(false);
  });

  it('B3.3 unmark after mark → mark RE-APPEARS (status still confirmed)', () => {
    let appt = { status: 'pending', serviceCompletedAt: null };
    appt = simulateCycle(appt, 'confirm');
    appt = simulateCycle(appt, 'mark');
    appt = simulateCycle(appt, 'unmark');
    expect(showMarkBtn(appt)).toBe(true);  // status='confirmed' preserved through cycle
  });

  it('B3.4 V126 LEGACY appt with status="pending" + no completed → HIDDEN (V126 enforces confirm-first)', () => {
    // Pre-V126 admin could mark complete on pending appts; V126 enforces
    // confirm-first ordering even for legacy data. Admin must press
    // คอนเฟิร์มนัด → then ✓ ลูกค้ารับบริการเรียบร้อย.
    const appt = { status: 'pending', serviceCompletedAt: null };
    expect(showMarkBtn(appt)).toBe(false);
  });

  it('B3.5 10-cycle round-trip on CONFIRMED appt — button always available after each unmark', () => {
    let appt = { status: 'confirmed', serviceCompletedAt: null };
    expect(showMarkBtn(appt)).toBe(true);
    appt = simulateCycle(appt, 'mark');
    for (let i = 0; i < 10; i++) {
      appt = simulateCycle(appt, 'unmark');
      expect(showMarkBtn(appt)).toBe(true);  // V71.B-ter unlimited toggle preserved on confirmed appts
      appt = simulateCycle(appt, 'mark');
      expect(appt.serviceCompletedAt).toBeTruthy();
    }
  });

  it('B3.6 V126 — cancel after confirm → mark HIDDEN (cancelled blocks all forward workflow)', () => {
    let appt = { status: 'pending', serviceCompletedAt: null };
    appt = simulateCycle(appt, 'confirm');
    expect(showMarkBtn(appt)).toBe(true);
    appt = simulateCycle(appt, 'cancel');
    expect(showMarkBtn(appt)).toBe(false);
  });
});
