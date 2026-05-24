// V125 (2026-05-24 EOD+1) — Rule P Tier 2 regression bank for the cancel
// cascade fix (bubble persists + cross-tab persistence after ยกเลิก).
//
// Bug A: V124's `isAppointmentPendingOpdSave({appt, linkedSession})` derived
// state via `resolveCardOpdState` which doesn't check appt.status. A cancelled
// appt with linkedOpdSessionId + patientData + !saved still returned 'D' →
// bubble counter held a stale "1" after admin clicked ยกเลิก. Past sub-pill
// (`defaultStatusFilterForTab('past').exclude=[]`) also let the cancelled appt
// through → row badge "📥 ลูกค้ากรอกแล้ว · รอบันทึก" rendered for it.
//
// Bug B: `onCancelAppt` only wrote appt.status='cancelled' — no cascade to the
// linked opd_session. The จองไม่มัดจำ tab (noDepositSessions filter) and the
// จองมัดจำ + คิวหน้า Clinic filters all read opd_sessions directly with no
// awareness of the linked appt — so the session row stayed visible in those
// 3 tabs even after the appt was cancelled.
//
// User report verbatim: "กดยกเลิกนัด … แต่ bubble ไม่หายไป … นัดก็ไม่ถูก
// ยกเลิกจริง ยังมีนัดค้างอยู่ในระบบนัดหมาย และหน้าจองไม่มัดจำด้วย".
//
// Fix:
//   1. isAppointmentPendingOpdSave returns false when appt.status === 'cancelled'
//   2. hideOpdLifecycle in AppointmentHubView also fires per-row when a.status === 'cancelled'
//   3. onCancelAppt in AdminDashboard cascades isArchived:true + archivedReason
//      on the linked opd_session
//
// Both surfaces converge: bubble drops + queue-tab filters drop the row.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isAppointmentPendingOpdSave, resolveCardOpdState } from '../src/lib/opdSessionState.js';

const ROOT = path.resolve(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const HUBVIEW = fs.readFileSync(path.join(ROOT, 'src/components/admin/AppointmentHubView.jsx'), 'utf8');
const STATE = fs.readFileSync(path.join(ROOT, 'src/lib/opdSessionState.js'), 'utf8');

describe('V125 — Predicate excludes cancelled appts', () => {
  it('U1 — cancelled appt that WOULD be state-D (pre-V125) → predicate returns false (post-V125)', () => {
    const appt = {
      customerId: '',
      linkedOpdSessionId: 'ND-X',
      status: 'cancelled', // ← post-V125 the predicate short-circuits here
    };
    const linkedSession = { patientData: { firstName: 'X' } };
    // The underlying state-machine still computes 'D' (semantic unchanged):
    expect(resolveCardOpdState({ appt, linkedSession })).toBe('D');
    // But the predicate filters it out — bubble doesn't count cancelled appts:
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(false);
  });

  it('U2 — pending appt (status undefined / non-cancelled) → predicate matches state-D normally', () => {
    const appt = { customerId: '', linkedOpdSessionId: 'ND-X' /* no status */ };
    const linkedSession = { patientData: { firstName: 'X' } };
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(true);
  });

  it('U3 — explicit status="pending" → predicate matches normally', () => {
    const appt = { customerId: '', linkedOpdSessionId: 'ND-X', status: 'pending' };
    const linkedSession = { patientData: { firstName: 'X' } };
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(true);
  });

  it('U4 — explicit status="confirmed" → predicate matches normally', () => {
    const appt = { customerId: '', linkedOpdSessionId: 'ND-X', status: 'confirmed' };
    const linkedSession = { patientData: { firstName: 'X' } };
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(true);
  });

  it('U5 — null appt safe (returns false, no throw)', () => {
    expect(isAppointmentPendingOpdSave({ appt: null, linkedSession: { patientData: { x: 1 } } })).toBe(false);
  });
});

describe('V125 — Source-grep regression locks', () => {
  it('SG-A1 — opdSessionState.js isAppointmentPendingOpdSave guards on cancelled status + V125 marker', () => {
    expect(STATE).toMatch(/V125 \(2026-05-24/);
    // The guard must appear INSIDE isAppointmentPendingOpdSave body.
    // Window-scan: 2000 chars covers the comment block + body.
    const idx = STATE.indexOf('export function isAppointmentPendingOpdSave');
    expect(idx).toBeGreaterThan(-1);
    const fn = STATE.slice(idx, idx + 2000);
    expect(fn).toMatch(/appt\??\.status\s*===\s*['"]cancelled['"]/);
    expect(fn).toMatch(/return false/);
  });

  it('SG-A2 — AppointmentHubView hideOpdLifecycle covers per-row cancelled (V125 defense-in-depth)', () => {
    expect(HUBVIEW).toMatch(/hideOpdLifecycle\s*=\s*activeTab\s*===\s*'cancelled'\s*\|\|\s*a\??\.status\s*===\s*'cancelled'/);
  });

  it('SG-A3 — AdminDashboard onCancelAppt cascades isArchived:true on linked opd_session', () => {
    // Window-scan: 2500 chars after `onCancelAppt=` covers the whole handler.
    const idx = ADMIN.indexOf('onCancelAppt=');
    expect(idx).toBeGreaterThan(-1);
    const handler = ADMIN.slice(idx, idx + 2500);
    expect(handler).toMatch(/linkedOpdSessionId/);
    expect(handler).toMatch(/isArchived:\s*true/);
    expect(handler).toMatch(/archivedReason:\s*['"]appt-cancelled['"]/);
    expect(handler).toMatch(/archivedFromApptId/);
    expect(handler).toMatch(/serverTimestamp\(\)/);
    expect(handler).toMatch(/V125/);
    // Best-effort try/catch around the session-archive (not fatal to the appt cancel):
    expect(handler).toMatch(/catch\s*\(\s*sessErr\s*\)/);
  });

  it('SG-A4 — anti-regression: predicate body MUST keep the cancel guard, never silently regress', () => {
    // If a future commit drops the status guard, this lock fires.
    const idx = STATE.indexOf('export function isAppointmentPendingOpdSave');
    expect(idx).toBeGreaterThan(-1);
    const fnBlock = STATE.slice(idx, idx + 2000);
    expect(fnBlock).toMatch(/cancelled/);
  });
});

describe('V125 — Full-chain flow simulate (bubble drops + cascade)', () => {
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

  it('F1 — admin clicks ยกเลิก → optimistic flip to status="cancelled" → bubble count drops 1→0', () => {
    const appts = [{ id: 'BA-X', customerId: '', linkedOpdSessionId: 'S-X' }];
    const sessionsById = new Map([['S-X', { patientData: { firstName: 'X' } }]]);
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(1);
    // Optimistic UI flip in HubView:
    appts[0] = { ...appts[0], status: 'cancelled' };
    expect(simulateBubbleCount({ appts, sessionsById })).toBe(0);
  });

  it('F2 — cancel cascade simulator: session.isArchived flips post-cascade → queue filters drop row', () => {
    // Simulate the AdminDashboard queue filters (noDepositSessions at line ~2311).
    const noDepFilter = (s) =>
      !s.isArchived &&
      s.isPermanent &&
      s.formType !== 'deposit' &&
      !s.serviceCompleted &&
      !s._v82FollowupOpdResetAt &&
      !(s.isHiddenFromQueue && s.createdFromBackendBooking) &&
      (!s.isHiddenFromQueue || s.patientData);

    // Pre-cancel: session in noDepositSessions ✓
    const pre = { id: 'ND-X', isPermanent: true, formType: 'intake', patientData: { firstName: 'X' } };
    expect(noDepFilter(pre)).toBe(true);

    // Post-V125 cascade: isArchived=true is stamped by onCancelAppt.
    const post = { ...pre, isArchived: true, archivedReason: 'appt-cancelled', archivedFromApptId: 'BA-X' };
    expect(noDepFilter(post)).toBe(false);  // filter drops it
  });

  it('F3 — V125 status guard fires BEFORE state-machine eval (defensive ordering)', () => {
    // Even if the state machine misclassifies (e.g. future refactor changes
    // resolveCardOpdState semantics), the predicate's status guard short-circuits.
    const appt = { customerId: '', linkedOpdSessionId: 'X', status: 'cancelled' };
    // Force linkedSession to a shape that WOULD match state-D unambiguously:
    const linkedSession = { patientData: { firstName: 'X' }, opdRecordedAt: null };
    expect(isAppointmentPendingOpdSave({ appt, linkedSession })).toBe(false);
  });

  it('F4 — past sub-pill cancelled appt: predicate filters it out (defaultStatusFilterForTab(past).exclude=[] lets it through, predicate stops it)', () => {
    // past tab allows cancelled (per defaultStatusFilterForTab). The predicate
    // is the second-line defense for the bubble + badge surfaces.
    const cancelledInPast = {
      customerId: '',
      linkedOpdSessionId: 'S-P',
      status: 'cancelled',
      date: '2026-05-10', // 14 days ago — within past 30d window
    };
    const linkedSession = { patientData: { firstName: 'PastVictim' } };
    expect(isAppointmentPendingOpdSave({ appt: cancelledInPast, linkedSession })).toBe(false);
  });
});
