// V121 (2026-05-23) — Rule I full-flow simulate for card-flow notification lifecycle.
//
// Chains the lifecycle states: B (no link) → C (link sent, waiting) → D
// (filled, unread bubble) → E/A (saved, bubble clears). Pure-helper sim
// using isCardFlowUnread + isOpdSessionSaved predicates.

import { describe, expect, it } from 'vitest';
import { isCardFlowUnread, isOpdSessionSaved, isCardFlowSession } from '../src/lib/opdSessionState.js';

describe('V121 — Card-flow notification lifecycle', () => {
  it('F1.1 — Newly provisioned card-flow session (State B/C): not yet filled → NOT in bubble', () => {
    const session = {
      createdFromBackendBooking: true,
      isHiddenFromQueue: true,
      status: 'pending',
      patientData: null,
      // isUnread:false at provision time — PatientForm sets it true on submit
    };
    expect(isCardFlowUnread(session)).toBe(false);
  });

  it('F1.2 — Customer fills form (State D): isUnread:true + patientData → bubble +1', () => {
    const session = {
      createdFromBackendBooking: true,
      isHiddenFromQueue: true,
      isUnread: true,
      status: 'completed',
      patientData: { firstName: 'A' },
    };
    expect(isCardFlowUnread(session)).toBe(true);
  });

  it('F1.3 — Admin opens 🟢 ดูข้อมูล modal: isUnread STAYS true (Option B locked) → bubble unchanged', () => {
    // The modal-open gate in AdminDashboard.jsx:3418 area SKIPS the
    // isUnread:false write for card-flow sessions. So the session is
    // unchanged in Firestore. isCardFlowUnread still returns true.
    const session = {
      createdFromBackendBooking: true,
      isHiddenFromQueue: true,
      isUnread: true,
      status: 'completed',
      patientData: { firstName: 'A' },
    };
    expect(isCardFlowUnread(session)).toBe(true);
  });

  it('F1.4 — Admin clicks 🔴 บันทึก OPD: handleOpdClick stamps → bubble -1', () => {
    const session = {
      createdFromBackendBooking: true,
      isHiddenFromQueue: true,
      isUnread: true,
      status: 'completed',
      patientData: { firstName: 'A' },
      opdRecordedAt: new Date(),
      brokerStatus: 'done',
    };
    expect(isOpdSessionSaved(session)).toBe(true);
    expect(isCardFlowUnread(session)).toBe(false);
  });

  it('F2.1 — V120-gap close: card-flow session with patientData STAYS hidden (queue filter)', () => {
    // Simulate the queue filter logic from AdminDashboard.jsx:~2340 area.
    const filterQueue = (s) => {
      // V121 NEW gate (FIRST)
      if (s.isHiddenFromQueue && s.createdFromBackendBooking) return false;
      // V116 PRESERVED gate (legacy hidden sessions without backend-booking)
      if (s.isHiddenFromQueue && !s.patientData) return false;
      return true;
    };

    const cardFlowFilled = {
      createdFromBackendBooking: true,
      isHiddenFromQueue: true,
      patientData: { firstName: 'A' },
    };
    expect(filterQueue(cardFlowFilled)).toBe(false);  // V121 gate fires — card-flow stays hidden

    const legacyHiddenWithData = {
      isHiddenFromQueue: true,
      patientData: { firstName: 'A' },
    };
    expect(filterQueue(legacyHiddenWithData)).toBe(true);  // V116 path preserved (no createdFromBackendBooking)
  });

  it('F3.1 — Non-card-flow session unaffected (kiosk session counted under existing unreadCount)', () => {
    const kioskSession = { isUnread: true, patientData: { firstName: 'A' }, status: 'completed' };
    expect(isCardFlowSession(kioskSession)).toBe(false);
    expect(isCardFlowUnread(kioskSession)).toBe(false);
    // → counts toward existing unreadCount (not V121 bubble) — no double-counting.
  });
});
