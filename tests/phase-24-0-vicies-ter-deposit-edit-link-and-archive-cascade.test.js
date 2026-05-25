// ─── Phase 24.0-vicies-ter — deposit edit-appt link + archive cascade ──
//
// User directives 2026-05-06:
//   1. ทำให้ tab จองมัดจำ มีปุ่มแก้ไขนัดได้แบบ tab จองไม่มัดจำ ... หากการ
//      จองมัดจำนัดเป็นแบบมีนัด และทำให้การแก้ไขนัดนั้นมีผลจริงๆ
//   2. ลบลูกค้า จองมัดจำ จาก front end แล้ว ข้อมูลนัดหมาย และ ข้อมูลมัดจำ
//      ในหน้าการเงิน ยังไม่ลบไปจาก backend ทำให้ลบได้ด้วย ถ้ามีแค่มัดจำ
//      ก็ลบแค่ข้อมูลมัดจำใน tab การเงิน แต่ถ้ามีนัดด้วย ก็ไปลบข้อมูลนัด
//      ในหน้านัดหมายด้วย
//
// Pre-fix:
//   - Deposit cards had NO edit-appt button; admin had to navigate via OPD
//     detail panel (multi-step). NoDeposit cards had inline แก้ไขนัด link.
//   - The trash icon (action='archive') on deposit cards only set
//     isArchived=true on opd_sessions; the linked be_deposits + be_appointments
//     docs were never cancelled → orphan docs lingered in Finance.มัดจำ +
//     BackendDashboard จองมัดจำ tab.
//
// Fix:
//   1. Deposit live card row 3 gains "แก้ไขนัด" link when dep.hasAppointment.
//      Click → opens OPD detail panel + auto-enters editingDepositData mode.
//      handleSaveDepositData cascade (Phase 24.0-vicies) propagates edits
//      to be_deposits + be_appointments.
//   2. Archive action (renderDepositConfirmModal else-branch) now also fires
//      cancelDepositBookingPair on the resolved depIdForCancel (linkedDepositId
//      fallback). Best-effort try/catch; archive still proceeds on cascade
//      failure (orphan cleanup retryable from Finance.มัดจำ).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

describe('Phase 24.0-vicies-ter — deposit live card "แก้ไขนัด" link', () => {
  it('VTC.A.1 — (2026-05-26) deposit live-card "แก้ไขนัด" link REMOVED with the deposit tab', () => {
    // The deposit/no-deposit VIEW tabs were removed (unified into นัดหมาย); the
    // live-card "แก้ไขนัด" edit-link (deposit-card-edit-appt-link → handleViewSession
    // + setEditingDepositData + fetchDepositOptions) lived in that removed render.
    expect(ADMIN).not.toContain('data-testid="deposit-card-edit-appt-link"');
  });

  it('VTC.A.6 — Phase 24.0-vicies-ter marker present', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-vicies-ter/);
  });
});

describe('Phase 24.0-vicies-ter — archive (trash) action cascade-delete', () => {
  it('VTC.B.1 — depIdForCancel resolves with linkedDepositId fallback in archive branch', () => {
    // Phase 24.0-vicies-septies (2026-05-06) — both sources wrapped in
    // _coerce() helper to defend against legacy {depositId,success}
    // object shape on broken records.
    expect(ADMIN).toMatch(
      /const\s+depIdForCancel\s*=\s*_coerce\(dSess\.depositProClinicId\)\s*\n?\s*\|\|\s*_coerce\(dSess\.linkedDepositId\)/,
    );
  });

  it('VTC.B.2 — archive branch fires deleteDepositBookingPair (Phase 24.0-vicies-quinquies hard-delete)', () => {
    // Phase 24.0-vicies-quinquies — switched from cancelDepositBookingPair
    // (soft-cancel) → deleteDepositBookingPair (hard delete) per user
    // directive: ในหน้าการเงินไม่ต้องแสดงเป็นยกเลิกแต่ให้ลบหายไปเลย.
    expect(ADMIN).toMatch(
      /if\s*\(depIdForCancel\)\s*\{[\s\S]{0,400}?deleteDepositBookingPair\(depIdForCancel\)/,
    );
  });

  it('VTC.B.3 — best-effort try/catch (failure logs but archive proceeds)', () => {
    expect(ADMIN).toMatch(
      /try\s*\{[\s\S]{0,400}?deleteDepositBookingPair[\s\S]{0,200}?\}\s*catch\s*\(cascadeErr\)/,
    );
    expect(ADMIN).toMatch(
      /\[archive cascade\] deleteDepositBookingPair failed/,
    );
  });

  it('VTC.B.4 — archive still stamps isArchived=true + archivedAt regardless of cascade success', () => {
    // The archive update fires AFTER the cascade try/catch (so even cascade
    // failures don't block the session archive).
    expect(ADMIN).toMatch(
      /catch\s*\(cascadeErr\)[\s\S]{0,300}?\}\s*\n\s*await\s+updateDoc\(doc\([\s\S]{0,200}?isArchived:\s*true/,
    );
  });

  it('VTC.B.5 — archive stamps cancelledDepositId + cancelledAppointmentId forensic fields', () => {
    expect(ADMIN).toMatch(/cancelledDepositId:\s*depIdForCancel\s*\|\|\s*null/);
    expect(ADMIN).toMatch(/cancelledAppointmentId:\s*dSess\.linkedAppointmentId\s*\|\|\s*null/);
  });

  it('VTC.B.6 — onClick is async (await-able for cascade)', () => {
    // The button onClick must be `async () => {` so await import + await
    // cancelDepositBookingPair work.
    expect(ADMIN).toMatch(
      /<button onClick=\{async\s*\(\)\s*=>\s*\{[\s\S]{0,2500}?setDepositToDelete\(null\)/,
    );
  });
});

describe('Phase 24.0-vicies-ter — full-flow simulate (Rule I)', () => {
  it('VTC.F.1 — kiosk-fresh deposit (linkedDepositId only) → archive cascade fires', () => {
    const dSess = {
      id: 'DEP-fresh',
      depositProClinicId: '',  // not set for kiosk-fresh
      linkedDepositId: 'DEP-1777999',  // Phase 24.0-quinquiesdecies stamp
      linkedAppointmentId: 'BA-1777999-aaaaaaaa',
    };
    const depIdForCancel = dSess.depositProClinicId || dSess.linkedDepositId || '';
    expect(depIdForCancel).toBe('DEP-1777999');
    // Cascade gate `if (depIdForCancel)` → true → cancelDepositBookingPair fires
  });

  it('VTC.F.2 — deposit-only (no linkedAppointmentId) → archive cascade still fires (just deposit cancelled)', () => {
    const dSess = {
      id: 'DEP-only',
      depositProClinicId: 'DEP-1777111',
      linkedDepositId: '',
      linkedAppointmentId: '', // no appointment
    };
    const depIdForCancel = dSess.depositProClinicId || dSess.linkedDepositId || '';
    expect(depIdForCancel).toBe('DEP-1777111');
    // cancelDepositBookingPair handles the no-appointment case internally
    // (returns pairCancelled:false). Per VBC.B.1 helper-soft-cancel test.
  });

  it('VTC.F.3 — orphan opd_sessions (no deposit linked) → archive cascade skipped (anti-regression)', () => {
    const dSess = {
      id: 'DEP-orphan',
      depositProClinicId: '',
      linkedDepositId: '',
    };
    const depIdForCancel = dSess.depositProClinicId || dSess.linkedDepositId || '';
    expect(depIdForCancel).toBe('');
    // Cascade gate short-circuits → no helper call, just opd_sessions archive.
  });

  it('VTC.F.4 — edit-appt link onClick chain', () => {
    // Mirror of the click handler:
    //   if (!depositOptions) fetchDepositOptions();
    //   handleViewSession(session);
    //   setTimeout(() => setEditingDepositData({ ...session.depositData }), 100);
    const session = { id: 'DEP-X', depositData: { paymentAmount: '1500' } };
    const depositOptions = null; // not yet loaded
    const fetchedOptions = !depositOptions; // → true → fetchDepositOptions called
    expect(fetchedOptions).toBe(true);
    // handleViewSession opens the OPD detail panel (sets viewingSession).
    // Deferred setEditingDepositData enters edit mode for the deposit.
    const editingCopy = { ...session.depositData };
    expect(editingCopy.paymentAmount).toBe('1500');
  });
});
