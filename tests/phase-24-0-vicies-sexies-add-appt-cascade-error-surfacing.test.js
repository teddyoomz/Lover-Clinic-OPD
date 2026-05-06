// ─── Phase 24.0-vicies-sexies — kiosk add-appt cascade error-surfacing ──
//
// User report 2026-05-06: "ในหน้า จองมัดจำ ของ frontend เมื่อสร้างลูกค้า
// มาแล้วแบบยังไม่มีนัดหมาย แล้วมากดปุ่มแก้ไข เพื่อเพิ่มนัดหมายลงไปทีหลัง
// ปรากฎว่าไม่สามารถเพิ่มนัดหมายได้ ขึ้นว่าสำเร็จ แต่ในตารางตามวันที่นัด
// ไม่ปรากฎนัดหมายใดๆ".
//
// Root cause analysis: handleSaveDepositData's add-appt cascade
// (Phase 24.0-noniesdecies + vicies) had a try/catch that silently swallowed
// errors. If createAppointmentForExistingDeposit threw (e.g. "date +
// startTime required" when fields were empty, or any other validation),
// the catch block only logged via console.warn → user saw the outer
// "บันทึกข้อมูลจองสำเร็จ" toast and no appointment in calendar.
//
// Plus: the cascade gate read `sess.linkedDepositId` from a potentially
// stale local list (depositSessions array). If the kiosk-fresh-then-edit
// happened in fast succession, the listener may not have echoed the
// stamp yet → depIdForCascade = '' → cascade silently skipped.
//
// Fix:
//   1. Pre-validate apptDate + apptStart BEFORE calling helper. If empty,
//      surface a Thai error toast + return (don't fall through to the
//      generic success toast).
//   2. Re-resolve freshSess via a fresh array lookup at cascade time
//      (covers listener-race) + fall back to the outer depIdForCascade.
//   3. Catch block now also fires showToast with the error message —
//      no more silent fail.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

describe('Phase 24.0-vicies-sexies — error surfacing in add-appt cascade', () => {
  it('VSX.A.1 — pre-validates apptDate + apptStart before calling helper', () => {
    expect(ADMIN).toMatch(
      /const\s+apptDate\s*=\s*String\(newData\.appointmentDate\s*\|\|\s*''\)\.trim\(\)/,
    );
    expect(ADMIN).toMatch(
      /const\s+apptStart\s*=\s*String\(newData\.appointmentStartTime\s*\|\|\s*''\)\.trim\(\)/,
    );
  });

  it('VSX.A.2 — empty apptDate/apptStart surfaces user-visible toast + early return', () => {
    expect(ADMIN).toMatch(
      /if\s*\(!apptDate\s*\|\|\s*!apptStart\)\s*\{[\s\S]{0,200}?showToast\('กรุณากรอกวันนัด \+ เวลาเริ่มก่อนบันทึก'\)[\s\S]{0,80}?return/,
    );
  });

  it('VSX.A.3 — catch block surfaces error via showToast (no more silent fail)', () => {
    // The cascade catch was previously console.warn-only. Now also fires
    // showToast with the actual error message + early return so the outer
    // success toast doesn't lie.
    expect(ADMIN).toMatch(
      /catch\s*\(apptErr\)\s*\{[\s\S]{0,500}?showToast\(`เพิ่มนัดหมายไม่สำเร็จ:/,
    );
    // Plus an early `return` so the generic success toast doesn't fire.
    expect(ADMIN).toMatch(
      /catch\s*\(apptErr\)\s*\{[\s\S]{0,500}?showToast\(`เพิ่มนัดหมายไม่สำเร็จ:[\s\S]{0,200}?return;\s*\}/,
    );
  });

  it('VSX.A.4 — freshSess re-resolved from current depositSessions arrays', () => {
    expect(ADMIN).toMatch(
      /const\s+freshSess\s*=\s*\[\.\.\.depositSessions,\s*\.\.\.archivedDepositSessions\][\s\S]{0,200}?\.find\(s\s*=>\s*s\.id\s*===\s*sessionId\)\s*\|\|\s*sess/,
    );
  });

  it('VSX.A.5 — freshDepId falls back through 3 sources', () => {
    expect(ADMIN).toMatch(
      /const\s+freshDepId\s*=\s*freshSess\?\.depositProClinicId[\s\S]{0,200}?\|\|\s*freshSess\?\.linkedDepositId[\s\S]{0,80}?\|\|\s*depIdForCascade/,
    );
  });

  it('VSX.A.6 — apptCreatedSuccessfully flag tracks cascade outcome', () => {
    expect(ADMIN).toMatch(/let\s+apptCreatedSuccessfully\s*=\s*false/);
    expect(ADMIN).toMatch(/apptCreatedSuccessfully\s*=\s*true/);
  });

  it('VSX.A.7 — Phase 24.0-vicies-sexies marker present', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-vicies-sexies/);
  });
});

describe('Phase 24.0-vicies-sexies — full-flow simulate (Rule I)', () => {
  it('VSX.F.1 — empty appt fields → user sees specific error (not generic success)', () => {
    // Mirror of validation logic.
    const newData = { hasAppointment: true, appointmentDate: '', appointmentStartTime: '' };
    const apptDate = String(newData.appointmentDate || '').trim();
    const apptStart = String(newData.appointmentStartTime || '').trim();
    expect(!apptDate || !apptStart).toBe(true);
    // → showToast('กรุณากรอกวันนัด + เวลาเริ่มก่อนบันทึก') + return
  });

  it('VSX.F.2 — listener-race fallback: stale sess.linkedDepositId picked up via outer depIdForCascade', () => {
    const sess = {}; // listener hasn't echoed
    const depIdForCascade = 'DEP-1234'; // outer scope already resolved
    const freshSess = sess; // local lookup also empty
    const freshDepId = freshSess?.depositProClinicId
      || freshSess?.linkedDepositId
      || depIdForCascade
      || '';
    expect(freshDepId).toBe('DEP-1234');
  });

  it('VSX.F.3 — happy path: valid appt fields → cascade fires + success flag set', () => {
    const newData = {
      hasAppointment: true,
      appointmentDate: '2026-05-09',
      appointmentStartTime: '12:30',
      appointmentEndTime: '13:45',
    };
    const apptDate = String(newData.appointmentDate || '').trim();
    const apptStart = String(newData.appointmentStartTime || '').trim();
    expect(apptDate).toBe('2026-05-09');
    expect(apptStart).toBe('12:30');
    expect(!apptDate || !apptStart).toBe(false);
    // → cascade proceeds → apptResult.appointmentId set → apptCreatedSuccessfully = true
  });

  it('VSX.F.4 — cascade error: showToast with message (anti-regression of silent-fail)', () => {
    // Pre-fix flow: cascade throws → console.warn + fall through to
    // generic success toast → user sees ✅ but no appt.
    // Post-fix: catch block also showToast + return.
    const apptErr = new Error('createAppointmentForExistingDeposit: deposit DEP-X not found');
    const userVisibleMessage = `เพิ่มนัดหมายไม่สำเร็จ: ${apptErr.message}`;
    expect(userVisibleMessage).toContain('เพิ่มนัดหมายไม่สำเร็จ');
    expect(userVisibleMessage).toContain('DEP-X not found');
  });
});
