// V124 (2026-05-24 EOD+1) — Rule P Tier 2 regression bank for the bubble
// scope-broadening fix.
//
// Bug: V121's bubble surfaces (desktop sidebar + mobile dock + sub-pills) used
// `isCardFlowUnread` predicate which requires V118/V120 markers
// (createdFromBackendBooking + isHiddenFromQueue). Regular จองไม่มัดจำ/มัดจำ
// bookings minted via provisionOpdLinkForBookingPair WITHOUT
// {hideFromQueue:true} don't have those markers → predicate returned false →
// bubble count was 0 even though the row card rendered "📥 ลูกค้ากรอกแล้ว ·
// รอบันทึก" badge for the same booking.
//
// Fix: NEW `isAppointmentPendingOpdSave({appt, linkedSession})` =
// `resolveCardOpdState({appt, linkedSession}) === 'D'`. Same predicate as the
// visible row badge → counts can't drift from rendering.
//
// User-reported case: BA-1779590375471 → ND-68FA49 (regular no-deposit,
// customer filled the form, no V118 markers, bubble missing on นัดหมาย tab).
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  isAppointmentPendingOpdSave,
  isCardFlowUnread,
  resolveCardOpdState,
  isOpdSessionSaved,
  hasPatientData,
} from '../src/lib/opdSessionState.js';

const ROOT = path.resolve(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const HUBVIEW = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubView.jsx'), 'utf8');
const STATE = fs.readFileSync(path.join(ROOT, 'src/lib/opdSessionState.js'), 'utf8');
const ROWCARD = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubRowCard.jsx'), 'utf8');

describe('V124 — isAppointmentPendingOpdSave helper unit', () => {
  it('U1 — returns true for state D (linked session has patientData, not saved, no customerId)', () => {
    const appt = { customerId: '', linkedOpdSessionId: 'ND-XYZ' };
    const linkedSession = { patientData: { firstName: 'A' } };
    expect(resolveCardOpdState({ appt, linkedSession })).toBe('D');
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(true);
  });

  it('U2 — returns false for state A (appt.customerId set = existing customer, already in be_customers)', () => {
    const appt = { customerId: 'LC-26000001', linkedOpdSessionId: 'ND-XYZ' };
    const linkedSession = { patientData: { firstName: 'A' } };
    expect(resolveCardOpdState({ appt, linkedSession })).toBe('A');
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(false);
  });

  it('U3 — returns false for state B (no linkedOpdSessionId — link never sent)', () => {
    const appt = { customerId: '' };
    expect(resolveCardOpdState({ appt, linkedSession: null })).toBe('B');
    expect(isAppointmentPendingOpdSave({ appt, linkedSession: null })).toBe(false);
  });

  it('U4 — returns false for state C (linkedOpdSessionId set but linkedSession null — not loaded yet)', () => {
    const appt = { customerId: '', linkedOpdSessionId: 'ND-XYZ' };
    expect(resolveCardOpdState({ appt, linkedSession: null })).toBe('C');
    expect(isAppointmentPendingOpdSave({ appt, linkedSession: null })).toBe(false);
  });

  it('U5 — returns false for state C-variant (linkedSession exists but patientData empty)', () => {
    const appt = { customerId: '', linkedOpdSessionId: 'ND-XYZ' };
    const linkedSession = { patientData: {} };
    expect(hasPatientData(linkedSession)).toBe(false);
    expect(resolveCardOpdState({ appt, linkedSession })).toBe('C');
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(false);
  });

  it('U6 — returns false for state E (saved — opdRecordedAt + brokerStatus done)', () => {
    const appt = { customerId: '', linkedOpdSessionId: 'ND-XYZ' };
    const linkedSession = {
      patientData: { firstName: 'A' },
      opdRecordedAt: new Date(),
      brokerStatus: 'done',
    };
    expect(isOpdSessionSaved(linkedSession)).toBe(true);
    expect(resolveCardOpdState({ appt, linkedSession })).toBe('E');
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(false);
  });

  it('U7 — null/undefined inputs safe (return false, no throw)', () => {
    expect(isAppointmentPendingOpdSave({ appt: null, linkedSession: null })).toBe(false);
    expect(isAppointmentPendingOpdSave({ appt: undefined, linkedSession: undefined })).toBe(false);
    expect(isAppointmentPendingOpdSave({})).toBe(false);
  });
});

describe('V124 — Scope broadening vs V121 narrow predicate', () => {
  it('SB1 — USER REPORT REPRO: regular no-deposit session (no V118/V120 markers) — V121 NARROW=false, V124 BROAD=true', () => {
    // Real-prod shape from ND-68FA49 (Rule R diag 2026-05-24 EOD+1).
    const appt = {
      id: 'BA-1779590375471',
      customerId: '',
      linkedOpdSessionId: 'ND-68FA49',
      date: '2026-05-28',
      customerNameTemp: 'ฟหกฟหก',
    };
    const linkedSession = {
      id: 'ND-68FA49',
      // ✗ createdFromBackendBooking: undefined  (V118 marker MISSING — regular จองไม่มัดจำ path)
      // ✗ isHiddenFromQueue: undefined          (V120 marker MISSING)
      isUnread: true,
      patientData: { firstName: 'ฟหกฟหก', /* …72 keys total in prod… */ },
      isPermanent: true,
      formType: 'intake',
    };
    // Pre-V124 narrow predicate — returned FALSE → bubble missing (the bug):
    expect(isCardFlowUnread(linkedSession)).toBe(false);
    // V124 broader predicate — returns TRUE (matches visible row badge):
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(true);
  });

  it('SB2 — V118 Card-flow session ALSO counts under V124 (broader = superset of narrow)', () => {
    const appt = {
      customerId: '',
      linkedOpdSessionId: 'OPD-CARD-X',
    };
    const linkedSession = {
      createdFromBackendBooking: true,
      isHiddenFromQueue: true,
      isUnread: true,
      patientData: { firstName: 'A' },
    };
    // V121 narrow — true (V118 markers present):
    expect(isCardFlowUnread(linkedSession)).toBe(true);
    // V124 broader — ALSO true (state D regardless of markers):
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(true);
  });

  it('SB3 — kiosk session with no appt linkage — neither predicate fires (no double count vs existing unreadCount)', () => {
    // A kiosk session has no `appt` to pair with — V124 predicate takes `{appt, linkedSession}` shape,
    // null appt yields state B → false. The existing `unreadCount` (line 4617) handles kiosk sessions.
    const linkedSession = { isUnread: true, patientData: { firstName: 'K' } };
    expect(isAppointmentPendingOpdSave({ appt: null, linkedSession })).toBe(false);
    // V121 narrow ALSO false (no V118 markers):
    expect(isCardFlowUnread(linkedSession)).toBe(false);
  });
});

describe('V124 — Source-grep regression locks', () => {
  it('SG-A1 — opdSessionState.js exports isAppointmentPendingOpdSave with V124 marker', () => {
    expect(STATE).toMatch(/export function isAppointmentPendingOpdSave\(/);
    expect(STATE).toMatch(/V124 \(2026-05-24/);
  });

  it('SG-A2 — AdminDashboard cardFlowUnreadCount memo uses isAppointmentPendingOpdSave on apptData.appointments', () => {
    const memo = ADMIN.match(/cardFlowUnreadCount\s*=\s*useMemo[\s\S]{0,2500}\}\,\s*\[[^\]]*\]/)?.[0] || '';
    expect(memo).toMatch(/apptData\??\.appointments/);
    expect(memo).toMatch(/resolveLinkedSession/);
    expect(memo).toMatch(/isAppointmentPendingOpdSave\(\s*\{\s*appt/);
    // Anti-regression: must NOT iterate session state arrays (pre-V124 bug shape).
    expect(memo).not.toMatch(/for\s*\(\s*const\s+arr\s+of\s*\[\s*sessions/);
  });

  it('SG-A3 — AppointmentHubView cardFlowSubPillCounts memo uses isAppointmentPendingOpdSave', () => {
    const memo = HUBVIEW.match(/cardFlowSubPillCounts\s*=\s*useMemo[\s\S]{0,1500}\}\,\s*\[[^\]]*\]/)?.[0] || '';
    expect(memo).toMatch(/isAppointmentPendingOpdSave\(\s*\{\s*appt/);
    // Anti-regression: must NOT call isCardFlowUnread on linkedSession.
    expect(memo).not.toMatch(/isCardFlowUnread\(/);
  });

  it('SG-A4 — AppointmentHubRowCard badge condition unchanged (state D) — single source of truth confirmed', () => {
    // The row badge "📥 ลูกค้ากรอกแล้ว · รอบันทึก" renders when
    // opdLifecycle.state === 'D'. V124 helper derives from the same
    // resolveCardOpdState, guaranteeing badge↔count consistency forever.
    expect(ROWCARD).toMatch(/opdLifecycle\.state\s*===\s*'D'/);
    expect(ROWCARD).toMatch(/ลูกค้ากรอกแล้ว/);
  });

  it('SG-A5 — bubble render sites unchanged (purple #a855f7 + same testids)', () => {
    expect(ADMIN).toMatch(/data-testid="cardflow-unread-badge-desktop"/);
    expect(ADMIN).toMatch(/data-testid="cardflow-unread-badge-mobile"/);
    expect(ADMIN).toMatch(/#a855f7/);
  });
});

describe('V124 — Rule I full-chain flow simulate', () => {
  // Mirror the AdminDashboard cardFlowUnreadCount memo logic so we can chain
  // appts → linkedSession lookup → predicate → count without mounting React.
  function simulateBubbleCount({ appts, sessionsById }) {
    const resolveLinkedSession = (a) => sessionsById.get(a.linkedOpdSessionId) || null;
    let count = 0;
    for (const a of appts) {
      if (!a?.linkedOpdSessionId) continue;
      const linkedSession = resolveLinkedSession(a);
      if (!linkedSession) continue;
      if (isAppointmentPendingOpdSave({ appt: a, linkedSession })) count++;
    }
    return count;
  }

  it('F1 — USER REPORT END-TO-END: 1 no-deposit appt + filled session = count 1 (bubble renders)', () => {
    const appts = [{ id: 'BA-1779590375471', customerId: '', linkedOpdSessionId: 'ND-68FA49' }];
    const sessionsById = new Map([
      ['ND-68FA49', { isUnread: true, patientData: { firstName: 'ฟหกฟหก' }, isPermanent: true, formType: 'intake' }],
    ]);
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(1);
  });

  it('F2 — mixed bag: 3 appts (one each in states A, C, D) → count 1 (only D)', () => {
    const appts = [
      { id: 'BA-A', customerId: 'LC-001', linkedOpdSessionId: 'S-A' }, // state A — existing customer
      { id: 'BA-C', customerId: '', linkedOpdSessionId: 'S-C' },        // state C — no patientData yet
      { id: 'BA-D', customerId: '', linkedOpdSessionId: 'S-D' },        // state D — filled, not saved
    ];
    const sessionsById = new Map([
      ['S-A', { patientData: { firstName: 'A' } }],
      ['S-C', { patientData: {} }],
      ['S-D', { patientData: { firstName: 'D' } }],
    ]);
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(1);
  });

  it('F3 — admin clicks 🔴 บันทึก OPD → session becomes saved → count drops 1→0', () => {
    const appts = [{ id: 'BA-X', customerId: '', linkedOpdSessionId: 'S-X' }];
    let session = { patientData: { firstName: 'X' } };
    const sessionsById = new Map([['S-X', session]]);
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(1);
    // Admin clicks save → handleOpdClick stamps opdRecordedAt + brokerStatus.
    session = { patientData: { firstName: 'X' }, opdRecordedAt: new Date(), brokerStatus: 'done' };
    sessionsById.set('S-X', session);
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(0);
  });

  it('F4 — multiple sub-pills (today/tomorrow/future/past) — count is sum across all 4', () => {
    const appts = [
      { id: 'BA-today',    customerId: '', linkedOpdSessionId: 'S-1' },
      { id: 'BA-tomorrow', customerId: '', linkedOpdSessionId: 'S-2' },
      { id: 'BA-future',   customerId: '', linkedOpdSessionId: 'S-3' },
      { id: 'BA-past',     customerId: '', linkedOpdSessionId: 'S-4' },
    ];
    const sessionsById = new Map(
      ['S-1', 'S-2', 'S-3', 'S-4'].map(id => [id, { patientData: { firstName: id } }])
    );
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(4);
  });

  it('F5 — V120-hidden card-flow session (excluded from queue arrays) — still counted via apptData iteration', () => {
    // Pre-V124 the memo iterated session state arrays; V121 filter excluded
    // card-flow sessions from sessions/depositSessions/noDepositSessions
    // → count was 0 for card-flow appts. V124 iterates apptData.appointments
    // + uses resolveLinkedSession (which lazy-fetches if not in state arrays)
    // → count works for BOTH card-flow AND regular bookings.
    const appts = [{ id: 'BA-CARD', customerId: '', linkedOpdSessionId: 'CARD-FLOW-1' }];
    const sessionsById = new Map([
      ['CARD-FLOW-1', {
        createdFromBackendBooking: true,  // V118 marker
        isHiddenFromQueue: true,           // V120 marker
        patientData: { firstName: 'Card' },
      }],
    ]);
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(1);
  });
});
