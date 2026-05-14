/**
 * Phase 29.23-bis — source-grep regression locks for AdminDashboard changes.
 *
 * Covers:
 *   - Issue 4: 3 ProClinic-mentioning tooltip strings on the OPD-save button
 *     replaced with neutral wording (ProClinic dev-only stack stripped per V50;
 *     we write to be_* directly now)
 *   - Issue 5: _maybeOpenWalkInModal gate on linkedAppointmentId / linkedDepositId
 *     (entries pushed from deposit-booking or no-deposit-booking already have an
 *     appointment; the appointment-create modal must not pop for them)
 *
 * User report (verbatim):
 *   - Issue 4: "เปลี่ยนชื่อปุ่ม บันทึกลง Proclinic ... ทั้งหมดใน Frontend
 *     ให้ไม่ใช้คำว่า Proclinic เพราะเราบันทึกลง be ของเราโดยตรงแล้ว"
 *   - Issue 5: "หากมาจากหน้า จองมัดจำ หรือ จองไม่มัดจำ ... เมื่อกดบันทึกลง OPD
 *     ในหน้า คิวหน้า Clinic จะไม่ต้องขึ้น modal มาให้สร้างนัดหมายอีก"
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');

describe('Phase 29.23-bis SG-A — OPD-save button tooltips no longer mention ProClinic', () => {
  // Anchor directly on the chained-ternary `title={isDone ? '...' : isPending
  // ? '...' : isFailed ? \`...\` : '...'}` attribute. There is exactly one such
  // pattern in AdminDashboard.jsx (the renderOpdButton tooltip). Matching the
  // attribute body avoids navigating the surrounding function block (which has
  // many `}` characters in JSX templates).
  const titleAttr = SRC.match(/title=\{isDone\s*\?[^}]+\}/);

  it('SG-A.1 — renderOpdButton title attribute exists', () => {
    expect(titleAttr).toBeTruthy();
  });

  it('SG-A.2 — "บันทึกลง OPD แล้ว" replaces "บันทึกลง ProClinic แล้ว"', () => {
    expect(titleAttr[0]).toContain('บันทึกลง OPD แล้ว');
    expect(titleAttr[0]).not.toContain('บันทึกลง ProClinic แล้ว');
    expect(titleAttr[0]).not.toContain('บันทึกลง Proclinic แล้ว');
  });

  it('SG-A.3 — "กำลังบันทึกข้อมูล" replaces "กำลังส่งข้อมูลไป ProClinic"', () => {
    expect(titleAttr[0]).toMatch(/กำลังบันทึก/);
    expect(titleAttr[0]).not.toContain('กำลังส่งข้อมูลไป ProClinic');
  });

  it('SG-A.4 — "บันทึกลง OPD" default tooltip replaces "ส่งข้อมูลบันทึกลง ProClinic"', () => {
    // Default-hover variant (else branch of the ternary)
    expect(titleAttr[0]).toContain('บันทึกลง OPD');
    expect(titleAttr[0]).not.toContain('ส่งข้อมูลบันทึกลง ProClinic');
  });

  it('SG-A.5 — title attribute has zero "ProClinic" / "Proclinic" mentions', () => {
    expect(titleAttr[0]).not.toMatch(/ProClinic/i);
    expect(titleAttr[0]).not.toMatch(/Proclinic/i);
  });
});

describe('Phase 29.23-bis SG-B — _maybeOpenWalkInModal gates on booking-origin indicators (bis3 widened)', () => {
  // Locate the _maybeOpenWalkInModal helper block.
  // Anchor: helper declaration through the inner setWalkInModal call close.
  // Generous size limit accommodates Phase 29.23-bis + bis3 marker comments
  // (Thai explanatory blocks ~20+ lines).
  const walkInGateBlock = SRC.match(
    /const\s+_maybeOpenWalkInModal\s*=[\s\S]+?setWalkInModal\(\{[\s\S]+?\}\);/
  );

  it('SG-B.1 — _maybeOpenWalkInModal helper exists', () => {
    expect(walkInGateBlock).toBeTruthy();
  });

  it('SG-B.2 — gates on session.linkedAppointmentId (no-deposit + deposit-with-appt path)', () => {
    expect(walkInGateBlock[0]).toMatch(/session\??\.linkedAppointmentId/);
  });

  it('SG-B.3 — gates on session.linkedDepositId (any deposit-booking path)', () => {
    expect(walkInGateBlock[0]).toMatch(/session\??\.linkedDepositId/);
  });

  it('SG-B.4 — Phase 29.23-bis3: gates on session.appointmentProClinicId (legacy field name)', () => {
    expect(walkInGateBlock[0]).toMatch(/session\??\.appointmentProClinicId/);
  });

  it('SG-B.5 — Phase 29.23-bis3: gates on session.formType === "deposit" (sessionDoc fingerprint)', () => {
    expect(walkInGateBlock[0]).toMatch(/session\??\.formType\s*===\s*['"]deposit['"]/);
  });

  it('SG-B.6 — Phase 29.23-bis3: gates on session.appointmentData.appointmentDate (no-deposit always has)', () => {
    expect(walkInGateBlock[0]).toMatch(/session\??\.appointmentData/);
    expect(walkInGateBlock[0]).toMatch(/appointment(Date|StartTime)/);
  });

  it('SG-B.7 — uses isFromBookingFlow named boolean (readable + testable)', () => {
    expect(walkInGateBlock[0]).toMatch(/(?:const|let)\s+isFromBookingFlow\s*=/);
    expect(walkInGateBlock[0]).toMatch(/if\s*\(\s*isFromBookingFlow\s*\)\s*return/);
  });

  it('SG-B.8 — gate fires BEFORE setWalkInModal (early-return order preserved)', () => {
    const gateIdx = walkInGateBlock[0].search(/if\s*\(\s*isFromBookingFlow\s*\)\s*return/);
    const setModalIdx = walkInGateBlock[0].indexOf('setWalkInModal');
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    expect(setModalIdx).toBeGreaterThan(gateIdx);
  });

  it('SG-B.9 — preserves existing adminMode === "dashboard" gate (no regression)', () => {
    expect(walkInGateBlock[0]).toMatch(/adminMode\s*!==\s*'dashboard'/);
  });

  it('SG-B.10 — preserves existing customerId truthy gate (no regression)', () => {
    expect(walkInGateBlock[0]).toMatch(/if\s*\(\s*!\s*customerId\s*\)\s*return/);
  });

  it('SG-B.11 — Phase 29.23-bis3 marker comment present (institutional memory)', () => {
    expect(walkInGateBlock[0]).toMatch(/29\.23-bis3/);
  });
});

// Phase 29.23-bis3 — pure-logic test for the isFromBookingFlow predicate.
//
// The gate logic is inline inside _maybeOpenWalkInModal (a closure inside
// handleOpdClick) — hard to unit-test directly without React mount. So this
// test re-implements the predicate locally and exercises it against the 5
// known booking-origin shapes + the walk-in shape (where modal MUST open).
//
// If the inline logic in AdminDashboard.jsx ever drifts from this contract,
// SG-B.2-B.6 source-grep will catch the drift first. This block is the
// SEMANTIC ground truth.
describe('Phase 29.23-bis3 IB — isFromBookingFlow predicate ground truth', () => {
  function isFromBookingFlow(session) {
    return !!(
      session?.linkedAppointmentId ||
      session?.linkedDepositId ||
      session?.appointmentProClinicId ||
      session?.formType === 'deposit' ||
      (session?.appointmentData && (
        session.appointmentData.appointmentDate ||
        session.appointmentData.appointmentStartTime
      ))
    );
  }

  it('IB.1 — no-deposit booking with linkedAppointmentId set → BLOCK modal', () => {
    expect(isFromBookingFlow({ linkedAppointmentId: 'BA-123' })).toBe(true);
  });

  it('IB.2 — deposit booking with linkedDepositId set → BLOCK modal', () => {
    expect(isFromBookingFlow({ linkedDepositId: 'DEP-456' })).toBe(true);
  });

  it('IB.3 — legacy session with appointmentProClinicId only → BLOCK modal', () => {
    expect(isFromBookingFlow({ appointmentProClinicId: 'BA-789' })).toBe(true);
  });

  it('IB.4 — sessionDoc with formType="deposit" → BLOCK modal', () => {
    expect(isFromBookingFlow({ formType: 'deposit' })).toBe(true);
  });

  it('IB.5 — no-deposit booking with FAILED appointment creation → BLOCK modal via appointmentData', () => {
    // CRITICAL: this is the bug user reported. Appointment creation failed
    // at booking time → linkedAppointmentId NOT stamped → bis1 gate fell open
    // → modal appeared. bis3 broader gate uses appointmentData fallback.
    expect(isFromBookingFlow({
      linkedAppointmentId: null,
      linkedDepositId: null,
      appointmentProClinicId: null,
      formType: 'intake',
      appointmentData: { appointmentDate: '2026-05-20', appointmentStartTime: '10:00' },
    })).toBe(true);
  });

  it('IB.6 — no-deposit booking with only appointmentDate (no startTime) → BLOCK', () => {
    expect(isFromBookingFlow({
      appointmentData: { appointmentDate: '2026-05-20', appointmentStartTime: '' },
    })).toBe(true);
  });

  it('IB.7 — no-deposit booking with only appointmentStartTime (no date) → BLOCK', () => {
    expect(isFromBookingFlow({
      appointmentData: { appointmentDate: '', appointmentStartTime: '10:00' },
    })).toBe(true);
  });

  it('IB.8 — fresh walk-in session (no booking indicators at all) → ALLOW modal', () => {
    expect(isFromBookingFlow({
      linkedAppointmentId: null,
      linkedDepositId: null,
      appointmentProClinicId: null,
      formType: 'intake',
      appointmentData: null,
    })).toBe(false);
  });

  it('IB.9 — fresh walk-in with empty appointmentData object → ALLOW modal', () => {
    expect(isFromBookingFlow({
      appointmentData: {},
    })).toBe(false);
  });

  it('IB.10 — fresh walk-in with appointmentData but ALL fields empty → ALLOW modal', () => {
    expect(isFromBookingFlow({
      appointmentData: { appointmentDate: '', appointmentStartTime: '' },
    })).toBe(false);
  });

  it('IB.11 — null/undefined session → ALLOW modal (defensive — no crash)', () => {
    expect(isFromBookingFlow(null)).toBe(false);
    expect(isFromBookingFlow(undefined)).toBe(false);
    expect(isFromBookingFlow({})).toBe(false);
  });

  it('IB.12 — deposit-only booking (NO appointment checkbox) — linkedDepositId set, linkedAppointmentId null → BLOCK', () => {
    // Deposit-only booking: confirmCreateDeposit line 2729-2730 sets
    // linkedAppointmentId: pairResult?.appointmentId || null. If admin
    // didn\'t enable hasAppointment, pairResult.appointmentId is null →
    // linkedAppointmentId: null. linkedDepositId is still truthy. Gate
    // catches via linkedDepositId.
    expect(isFromBookingFlow({
      linkedDepositId: 'DEP-100',
      linkedAppointmentId: null,
      formType: 'deposit',
    })).toBe(true);
  });
});
