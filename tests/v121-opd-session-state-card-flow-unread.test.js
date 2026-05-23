// V121 (2026-05-23) — unit tests for isCardFlowSession + isCardFlowUnread.
//
// Locks the 2 NEW helpers in src/lib/opdSessionState.js (AV118 V121 amendment).
// Helper-output tests only — full-flow simulate lives in
// v121-card-flow-notifications-flow-simulate.test.js.

import { describe, expect, it } from 'vitest';
import {
  isCardFlowSession,
  isCardFlowUnread,
} from '../src/lib/opdSessionState.js';

describe('V121 — isCardFlowSession', () => {
  it('U1.1 — true when both createdFromBackendBooking + isHiddenFromQueue', () => {
    expect(isCardFlowSession({ createdFromBackendBooking: true, isHiddenFromQueue: true })).toBe(true);
  });
  it('U1.2 — false when only createdFromBackendBooking (not yet V120-hidden)', () => {
    expect(isCardFlowSession({ createdFromBackendBooking: true })).toBe(false);
  });
  it('U1.3 — false when only isHiddenFromQueue (legacy V116 deleteSession-with-link path)', () => {
    expect(isCardFlowSession({ isHiddenFromQueue: true })).toBe(false);
  });
  it('U1.4 — false on null/undefined/non-object (adversarial)', () => {
    expect(isCardFlowSession(null)).toBe(false);
    expect(isCardFlowSession(undefined)).toBe(false);
    expect(isCardFlowSession('str')).toBe(false);
    expect(isCardFlowSession(42)).toBe(false);
    expect(isCardFlowSession([])).toBe(false);
  });
});

describe('V121 — isCardFlowUnread', () => {
  const baseCardFlow = {
    createdFromBackendBooking: true,
    isHiddenFromQueue: true,
    isUnread: true,
  };
  it('U2.1 — true when card-flow + isUnread + not saved', () => {
    expect(isCardFlowUnread(baseCardFlow)).toBe(true);
  });
  it('U2.2 — false when saved (opdRecordedAt + brokerStatus done)', () => {
    expect(isCardFlowUnread({ ...baseCardFlow, opdRecordedAt: new Date(), brokerStatus: 'done' })).toBe(false);
  });
  it('U2.3 — false when isUnread:false (already cleared by some other path)', () => {
    expect(isCardFlowUnread({ ...baseCardFlow, isUnread: false })).toBe(false);
  });
  it('U2.4 — false when not card-flow (kiosk session with isUnread + patientData)', () => {
    expect(isCardFlowUnread({ isUnread: true, patientData: { firstName: 'A' } })).toBe(false);
  });
  it('U2.5 — false on null', () => {
    expect(isCardFlowUnread(null)).toBe(false);
  });
  it('U2.6 — Q1=B locked: card-flow session WITH patientData STAYS unread until saved', () => {
    // Customer just filled the form. Per Option B, viewing alone doesn't clear isUnread.
    // Only handleOpdClick stamping opdRecordedAt + brokerStatus:'done' transitions out.
    expect(isCardFlowUnread({ ...baseCardFlow, patientData: { firstName: 'A' } })).toBe(true);
  });
});
