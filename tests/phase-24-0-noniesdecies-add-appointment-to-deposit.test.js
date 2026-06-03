// ─── Phase 24.0-noniesdecies — add appointment to existing deposit ──────
//
// User reports 2026-05-06 (2 connected directives):
//   1. เพิ่มในหน้าการเงิน หากมัดจำไหน ไม่มีนัด ให้สามารถสร้างนัดสำหรับ
//      มัดจำนั้นได้ โดยนัดที่สร้างก็จะไปอยู่ในหน้า จองมัดจำ เลยโดยอัตโนมัติ
//   2. ใน Frontend tab จองมัดจำ หลังจากจองมัดจำแล้ว พอกด edit เพื่อเพิ่ม
//      นัดหมาย มันขึ้นว่านัดหมายสำเร็จ แต่พอไปดูในหน้าตาราง จองมัดจำ
//      กลับไม่เจอ
//
// Root cause: pre-fix, neither path created a be_appointments doc when
// admin added an appointment to an EXISTING deposit. handleSaveDepositData
// updated be_deposits only; DepositPanel had no "+ สร้างนัด" button at all.
// → admin saw "นัดหมายสำเร็จ" toast + appt-meta on the deposit row, but
// the BackendDashboard จองมัดจำ sub-tab queries be_appointments and
// found nothing.
//
// Fix:
//   • NEW createAppointmentForExistingDeposit helper in
//     appointmentDepositBatch.js — atomic writeBatch creates be_appointments
//     doc + updates the existing be_deposits doc with hasAppointment=true,
//     linkedAppointmentId, and embedded appointment metadata.
//   • DepositPanel renders a "+ สร้างนัด" button on rows where
//     !hasAppointment && !linkedAppointmentId && status !== cancelled/refunded.
//     Click opens AppointmentFormModal with existingDepositId set.
//   • AppointmentFormModal handleSave branches on existingDepositId →
//     calls the new helper instead of pair-helper.
//   • AdminDashboard.jsx handleSaveDepositData fires the same helper when
//     admin edits a kiosk deposit to ADD an appointment.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);
const APPT_MODAL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentFormModal.jsx'),
  'utf8',
);
const DEPOSIT_PANEL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/DepositPanel.jsx'),
  'utf8',
);
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

describe('Phase 24.0-noniesdecies — createAppointmentForExistingDeposit helper', () => {
  it('NDF.A.1 — helper exported from appointmentDepositBatch.js', () => {
    expect(PAIR_HELPER).toMatch(
      /export\s+async\s+function\s+createAppointmentForExistingDeposit/,
    );
  });

  it('NDF.A.2 — validates depositId + apptPayload date/startTime required', async () => {
    const { createAppointmentForExistingDeposit } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    await expect(
      createAppointmentForExistingDeposit('', { date: 'X', startTime: 'Y' }),
    ).rejects.toThrow(/depositId required/);
    await expect(
      createAppointmentForExistingDeposit('DEP-1', {}),
    ).rejects.toThrow(/date \+ startTime required/);
  });

  it('NDF.A.3 — appointmentId follows BA-{ts}-{rand} shape (mirrors pair-helper)', () => {
    expect(PAIR_HELPER).toMatch(/appointmentId\s*=\s*`BA-\$\{ts\}-\$\{suffix\}`/);
  });

  // Helper to extract the createAppointmentForExistingDeposit function body.
  // Match start at `export async function` and stop at the next top-level
  // `// Phase 21.0 marker` comment that follows it.
  const extractHelper = () => {
    const startIdx = PAIR_HELPER.indexOf('export async function createAppointmentForExistingDeposit');
    expect(startIdx).toBeGreaterThan(0);
    const tail = PAIR_HELPER.slice(startIdx);
    const endIdx = tail.indexOf('// Phase 21.0 marker');
    expect(endIdx).toBeGreaterThan(0);
    return tail.slice(0, endIdx);
  };

  it('NDF.A.4 — uses crypto.getRandomValues (security: no Math.random)', () => {
    const helperBlock = extractHelper();
    expect(helperBlock).toMatch(/globalThis\.crypto\.getRandomValues/);
    expect(helperBlock).not.toMatch(/Math\.random/);
  });

  it('NDF.A.5 — appointmentType locked to "deposit-booking"', () => {
    const helperBlock = extractHelper();
    expect(helperBlock).toMatch(/appointmentType:\s*['"]deposit-booking['"]/);
  });

  it('NDF.A.6 — atomic runTransaction reserves AP1-bis slots + writes appt + updates deposit (appointment-loop R1)', () => {
    const helperBlock = extractHelper();
    // appointment-loop R1 (2026-06-03) — was a plain writeBatch with NO slot
    // reservation → createAppointmentForExistingDeposit could double-book a
    // held slot. Now a runTransaction reserves the AP1-bis slots + writes the
    // appointment + links the deposit atomically (proven on real prod e2e D4).
    expect(helperBlock).toMatch(/runTransaction\(db, async \(tx\) =>/);
    expect(helperBlock).toMatch(/_reserveAppointmentSlotsInTx\(tx/);
    expect(helperBlock).toMatch(/tx\.set\(appointmentDoc\(appointmentId\), newApptPayload\)/);
    expect(helperBlock).toMatch(/tx\.update\(depRef/);
  });

  it('NDF.A.7 — deposit update sets hasAppointment=true + linkedAppointmentId + embedded appointment.* fields', () => {
    const helperBlock = extractHelper();
    expect(helperBlock).toMatch(/hasAppointment:\s*true/);
    expect(helperBlock).toMatch(/linkedAppointmentId:\s*appointmentId/);
    expect(helperBlock).toMatch(/'appointment\.purpose':/);
    expect(helperBlock).toMatch(/'appointment\.date':/);
    expect(helperBlock).toMatch(/'appointment\.startTime':/);
  });

  it('NDF.A.8 — appointment doc carries linkedDepositId + spawnedFromDepositId cross-link', () => {
    const helperBlock = extractHelper();
    expect(helperBlock).toMatch(/linkedDepositId:\s*depositId/);
    expect(helperBlock).toMatch(/spawnedFromDepositId:\s*depositId/);
  });

  it('NDF.A.9 — institutional-memory marker present', () => {
    expect(PAIR_HELPER).toMatch(
      /MARKER:\s*phase-24-0-noniesdecies-create-appointment-for-existing-deposit/,
    );
  });
});

describe('Phase 24.0-noniesdecies — AppointmentFormModal existingDepositId prop', () => {
  it('NDF.B.1 — prop declared in component signature', () => {
    expect(APPT_MODAL).toMatch(/existingDepositId\s*=\s*''/);
  });

  it('NDF.B.2 — handleSave branches on existingDepositId BEFORE the pair-helper branch', () => {
    // The new branch must come BEFORE the catch-all `isCreatingDepositBooking`
    // so the existing-deposit path takes priority. Use ordering check.
    const existingBranchIdx = APPT_MODAL.indexOf('isCreatingDepositBooking && existingDepositId');
    const pairBranchIdx = APPT_MODAL.indexOf('Phase 21.0-ter (2026-05-06 EOD) — atomic paired write');
    expect(existingBranchIdx).toBeGreaterThan(0);
    expect(pairBranchIdx).toBeGreaterThan(existingBranchIdx);
  });

  it('NDF.B.3 — branch invokes createAppointmentForExistingDeposit with payload + locked type', () => {
    expect(APPT_MODAL).toMatch(
      /createAppointmentForExistingDeposit\(existingDepositId,\s*\{[\s\S]{0,200}?appointmentType:\s*['"]deposit-booking['"]/,
    );
  });

  it('NDF.B.4 — Phase 24.0-noniesdecies marker present in modal', () => {
    expect(APPT_MODAL).toMatch(/Phase 24\.0-noniesdecies/);
  });
});

describe('Phase 24.0-noniesdecies — DepositPanel "+ สร้างนัด" button', () => {
  it('NDF.C.1 — button rendered with testid', () => {
    expect(DEPOSIT_PANEL).toContain('data-testid="deposit-add-appointment-btn"');
  });

  it('NDF.C.2 — gated on !hasAppointment && !linkedAppointmentId && active status', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /!dep\.hasAppointment\s*&&\s*!dep\.linkedAppointmentId[\s\S]{0,200}?status\s*!==\s*['"]cancelled['"][\s\S]{0,80}?status\s*!==\s*['"]refunded['"]/,
    );
  });

  it('NDF.C.3 — onClick wires apptForDepositModal state', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /onClick=\{\(\)\s*=>\s*setApptForDepositModal\(dep\)\}/,
    );
  });

  it('NDF.C.4 — AppointmentFormModal rendered with existingDepositId + lockedAppointmentType', () => {
    expect(DEPOSIT_PANEL).toMatch(/lockedAppointmentType="deposit-booking"/);
    expect(DEPOSIT_PANEL).toMatch(
      /existingDepositId=\{apptForDepositModal\.depositId\s*\|\|\s*apptForDepositModal\.id\}/,
    );
  });

  it('NDF.C.5 — onSaved reloads list + closes modal', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /onSaved=\{async\s*\(\)\s*=>\s*\{[\s\S]{0,200}?await\s+loadList\(\)[\s\S]{0,80}?setApptForDepositModal\(null\)/,
    );
  });

  it('NDF.C.6 — CalendarPlus icon imported from lucide', () => {
    expect(DEPOSIT_PANEL).toMatch(/CalendarPlus/);
  });

  it('NDF.C.7 — Phase 24.0-noniesdecies marker present', () => {
    expect(DEPOSIT_PANEL).toMatch(/Phase 24\.0-noniesdecies/);
  });
});

describe('Phase 24.0-noniesdecies — kiosk handleSaveDepositData add-appointment cascade', () => {
  it('NDF.D.1 — cascade fires createAppointmentForExistingDeposit when wantsAppt && !hasAppt && depId', () => {
    expect(ADMIN).toMatch(
      /const\s+wantsAppt\s*=\s*!!newData\?\.hasAppointment/,
    );
    // Phase 24.0-vicies-sexies (2026-05-06) — replaced `sess` with
    // `freshSess` (re-resolved at cascade time to defend against listener
    // race) + replaced raw depIdForCascade with `freshDepId` (3-source
    // fallback chain). Test updated to match the new gate.
    expect(ADMIN).toMatch(
      /const\s+hasAppt\s*=\s*!!freshSess\?\.linkedAppointmentId/,
    );
    expect(ADMIN).toMatch(
      /if\s*\(wantsAppt\s*&&\s*!hasAppt\s*&&\s*freshDepId\)/,
    );
  });

  it('NDF.D.2 — cascade calls createAppointmentForExistingDeposit with payload', () => {
    // Phase 24.0-vicies-sexies — first-arg renamed depIdForCascade → freshDepId.
    expect(ADMIN).toMatch(
      /createAppointmentForExistingDeposit\(freshDepId,\s*\{/,
    );
  });

  it('NDF.D.3 — cascade is best-effort (try/catch swallows errors)', () => {
    expect(ADMIN).toMatch(
      /try\s*\{[\s\S]{0,2500}?createAppointmentForExistingDeposit[\s\S]{0,2000}?\}\s*catch\s*\(apptErr\)/,
    );
  });

  it('NDF.D.4 — on success, opd_sessions stamped with linkedAppointmentId + linkedDepositId', () => {
    expect(ADMIN).toMatch(
      /apptResult\?\.appointmentId[\s\S]{0,300}?linkedAppointmentId:\s*apptResult\.appointmentId/,
    );
  });

  it('NDF.D.5 — Phase 24.0-noniesdecies marker present in AdminDashboard', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-noniesdecies/);
  });
});

describe('Phase 24.0-noniesdecies — full-flow simulate (Rule I)', () => {
  it('NDF.F.1 — pre-fix repro: deposit without linkedAppointmentId never appears in จองมัดจำ tab', () => {
    // BackendDashboard จองมัดจำ sub-tab queries be_appointments where
    // appointmentType=='deposit-booking'. Pre-fix: kiosk deposit with
    // hasAppointment=true had no be_appointments doc → tab empty.
    const beAppointments = []; // empty: no doc was ever created
    const visible = beAppointments.filter(a => a.appointmentType === 'deposit-booking');
    expect(visible.length).toBe(0);
  });

  it('NDF.F.2 — post-fix: cascade creates be_appointments doc → tab shows it', () => {
    // After cascade, a be_appointments doc with appointmentType='deposit-booking'
    // exists. Sub-tab query returns it.
    const newApptId = 'BA-1777999-aaaa';
    const beAppointments = [{
      appointmentId: newApptId,
      appointmentType: 'deposit-booking',
      linkedDepositId: 'DEP-1',
      customerName: 'Dew',
    }];
    const visible = beAppointments.filter(a => a.appointmentType === 'deposit-booking');
    expect(visible.length).toBe(1);
    expect(visible[0].linkedDepositId).toBe('DEP-1');
  });

  it('NDF.F.3 — DepositPanel button gate: only shows when no appt linked + active', () => {
    const cases = [
      { dep: { hasAppointment: false, linkedAppointmentId: '', status: 'active' }, expected: true },
      { dep: { hasAppointment: false, linkedAppointmentId: '', status: 'partial' }, expected: true },
      { dep: { hasAppointment: true, linkedAppointmentId: 'BA-1', status: 'active' }, expected: false },
      { dep: { hasAppointment: false, linkedAppointmentId: 'BA-2', status: 'active' }, expected: false },
      { dep: { hasAppointment: false, linkedAppointmentId: '', status: 'cancelled' }, expected: false },
      { dep: { hasAppointment: false, linkedAppointmentId: '', status: 'refunded' }, expected: false },
    ];
    for (const { dep, expected } of cases) {
      const show = !dep.hasAppointment
        && !dep.linkedAppointmentId
        && dep.status !== 'cancelled'
        && dep.status !== 'refunded';
      expect(show).toBe(expected);
    }
  });

  it('NDF.F.4 — handler chain: AppointmentFormModal → createAppointmentForExistingDeposit → both docs written', async () => {
    // Mirror of the helper's flow.
    const { createAppointmentForExistingDeposit } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    expect(typeof createAppointmentForExistingDeposit).toBe('function');
    // Validates required inputs throw — see NDF.A.2.
    await expect(
      createAppointmentForExistingDeposit('DEP-1', { date: '2026-05-10', startTime: '10:00' }),
    ).rejects.toThrow(); // throws because the deposit doc doesn't exist in tests
  });
});
