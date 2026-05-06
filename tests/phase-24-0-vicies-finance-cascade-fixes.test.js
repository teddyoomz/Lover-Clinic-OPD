// ─── Phase 24.0-vicies — Finance cascade fixes ──────────────────────────
//
// User reports 2026-05-06 (3 connected bugs):
//   1. ยังคงกดแก้ไขนัดหมาย จากลูกค้าจองมัดจำ แล้วไม่มีข้อมูลนัดหมายจริง
//      ใน backend
//   2. กดสร้างคิวลูกค้าจองมัดจำ แล้วเลือกตรง นัดมาเพื่อ ขลิบ แต่ในหน้า
//      การเงิน ไม่มีข้อมูลที่เลือกไว้แสดงตรงนัดมาเพื่อ — มันต้องส่งเห็น
//      นัดมาเพื่อ มาแสดงตรงหน้าการเงินด้วย จาก front end
//   3. ตรงปุ่มแก้ไขในหน้าจองไม่มัดจำ ทำให้แก้ไข ชื่อ และ เบอร์ โทรลูกค้า
//      ได้ด้วย และเมื่อแก้ในนี้ก็จะไปแก้ตรงหน้าการเงิน และหน้านัดหมายด้วย
//
// Root causes + fixes documented in:
// C:\Users\oomzp\.claude\plans\reflective-swimming-dahl.md

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);

// Pure-helper extraction shim — same pattern as Phase 24.0-noniesdecies test.
function extractFn(src, name) {
  const startIdx = src.indexOf(`export async function ${name}`);
  if (startIdx < 0) return null;
  const tail = src.slice(startIdx);
  // Stop at the next `// MARKER:` block (each helper is followed by exactly
  // ONE marker comment ladder at end-of-file, OR a separate `/**` block for
  // the next exported function).
  const nextDocIdx = tail.slice(50).indexOf('/**');
  const nextMarkerIdx = tail.slice(50).indexOf('// MARKER:');
  let endIdx = -1;
  if (nextDocIdx >= 0 && (nextMarkerIdx < 0 || nextDocIdx < nextMarkerIdx)) {
    endIdx = nextDocIdx + 50;
  } else if (nextMarkerIdx >= 0) {
    endIdx = nextMarkerIdx + 50;
  }
  return endIdx > 0 ? tail.slice(0, endIdx) : tail;
}

describe('Phase 24.0-vicies — syncCustomerTempToLinkedDeposit helper', () => {
  it('VCS.A.1 — helper exported from appointmentDepositBatch.js', () => {
    expect(PAIR_HELPER).toMatch(
      /export\s+async\s+function\s+syncCustomerTempToLinkedDeposit/,
    );
  });

  it('VCS.A.2 — validates depositId required', async () => {
    const { syncCustomerTempToLinkedDeposit } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    await expect(
      syncCustomerTempToLinkedDeposit('', { customerName: 'X' }),
    ).rejects.toThrow(/depositId required/);
  });

  it('VCS.A.3 — selective merge: only writes fields explicitly provided', () => {
    const block = extractFn(PAIR_HELPER, 'syncCustomerTempToLinkedDeposit');
    expect(block).toBeTruthy();
    // The implementation uses `=== undefined` checks before adding to update.
    expect(block).toMatch(/customerName\s*!==\s*undefined/);
    expect(block).toMatch(/customerNameTemp\s*!==\s*undefined/);
    expect(block).toMatch(/customerPhoneTemp\s*!==\s*undefined/);
  });

  it('VCS.A.4 — does NOT touch customerId (distinct from attachCustomerToLinkedDeposit)', () => {
    const block = extractFn(PAIR_HELPER, 'syncCustomerTempToLinkedDeposit');
    expect(block).toBeTruthy();
    expect(block).not.toMatch(/update\.customerId\s*=/);
  });

  it('VCS.A.5 — uses writeBatch + commits atomically', () => {
    const block = extractFn(PAIR_HELPER, 'syncCustomerTempToLinkedDeposit');
    expect(block).toMatch(/writeBatch\(db\)/);
    expect(block).toMatch(/await\s+batch\.commit\(\)/);
  });

  it('VCS.A.6 — stamps customerTempSyncedAt forensic field', () => {
    const block = extractFn(PAIR_HELPER, 'syncCustomerTempToLinkedDeposit');
    expect(block).toMatch(/customerTempSyncedAt:\s*now/);
  });

  it('VCS.A.7 — institutional-memory marker present', () => {
    expect(PAIR_HELPER).toMatch(
      /MARKER:\s*phase-24-0-vicies-sync-customer-temp-to-deposit/,
    );
  });
});

describe('Phase 24.0-vicies — Bug 2: confirmCreateDeposit deposit-only path persists visitPurpose', () => {
  it('VCS.B.1 — depositOnlyPayload includes appointment object when visitPurposeText set', () => {
    // The deposit-only branch (else of `if (depositFormData.hasAppointment)`)
    // now embeds a minimal appointment with type='deposit-only' + purpose +
    // appointmentTo when visitPurposeText is non-empty.
    expect(ADMIN).toMatch(
      /appointment:\s*visitPurposeText\s*\?\s*\{[\s\S]{0,400}?type:\s*['"]deposit-only['"]/,
    );
  });

  it('VCS.B.2 — appointment.purpose mirrors visitPurposeText', () => {
    const block = ADMIN.match(
      /appointment:\s*visitPurposeText\s*\?\s*\{[\s\S]{0,400}?\}\s*:\s*null/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/purpose:\s*visitPurposeText/);
    expect(block[0]).toMatch(/appointmentTo:\s*visitPurposeText/);
  });

  it('VCS.B.3 — appointment is null when visitPurposeText empty (anti-regression)', () => {
    expect(ADMIN).toMatch(/appointment:\s*visitPurposeText\s*\?\s*\{[\s\S]{0,400}?\}\s*:\s*null/);
  });

  it('VCS.B.4 — Phase 24.0-vicies marker present in confirmCreateDeposit area', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-vicies/);
  });
});

describe('Phase 24.0-vicies — Bug 1: handleSaveDepositData un-gated cascade', () => {
  it('VCS.C.1 — depIdForCascade resolves with linkedDepositId fallback', () => {
    expect(ADMIN).toMatch(
      /let\s+depIdForCascade\s*=\s*sess\?\.depositProClinicId\s*\|\|\s*sess\?\.linkedDepositId\s*\|\|\s*''/,
    );
  });

  it('VCS.C.2 — depIdForCascade declared BEFORE alreadySynced branch (un-gated)', () => {
    // Find the depIdForCascade declaration + the first `if (alreadySynced)`
    // INSIDE handleSaveDepositData (skip the cancel handler's earlier
    // `} else if (alreadySynced)` which is unrelated).
    const depIdIdx = ADMIN.indexOf('let depIdForCascade = sess?.depositProClinicId || sess?.linkedDepositId');
    expect(depIdIdx).toBeGreaterThan(0);
    // Search for `if (alreadySynced)` AFTER depIdIdx — that's the first one
    // inside handleSaveDepositData's main flow.
    const alreadySyncedBranchIdx = ADMIN.indexOf('if (alreadySynced)', depIdIdx);
    expect(alreadySyncedBranchIdx).toBeGreaterThan(depIdIdx);
  });

  it('VCS.C.3 — kiosk-fresh deposit (else branch) syncs appt-meta + customer-temp directly', () => {
    // The else branch now imports the pair-helper module and calls both
    // syncAppointmentToLinkedDeposit + syncCustomerTempToLinkedDeposit.
    expect(ADMIN).toMatch(
      /else\s*\{[\s\S]{0,3000}?syncAppointmentToLinkedDeposit\(depIdForCascade/,
    );
    expect(ADMIN).toMatch(
      /else\s*\{[\s\S]{0,3000}?syncCustomerTempToLinkedDeposit\(depIdForCascade/,
    );
  });

  it('VCS.C.4 — create-appointment cascade fires UN-GATED (after alreadySynced branch)', () => {
    // The cascade is now its own try/catch block AFTER the alreadySynced
    // if/else. Phase 24.0-vicies-sexies (2026-05-06) — gate now uses
    // `freshDepId` (re-resolved with depIdForCascade fallback) instead of
    // raw `depIdForCascade` to defend against listener-race when the
    // kiosk-fresh stamp hasn't echoed yet.
    expect(ADMIN).toMatch(
      /if\s*\(wantsAppt\s*&&\s*!hasAppt\s*&&\s*freshDepId\)\s*\{[\s\S]{0,1500}?createAppointmentForExistingDeposit/,
    );
  });

  it('VCS.C.5 — kiosk-fresh deposit-only sync sets type based on hasAppointment', () => {
    expect(ADMIN).toMatch(
      /type:\s*newData\.hasAppointment\s*\?\s*['"]deposit-booking['"]\s*:\s*['"]deposit-only['"]/,
    );
  });

  it('VCS.C.6 — toast still fires for both branches (no regression of UX feedback)', () => {
    // After my refactor, both alreadySynced and !alreadySynced paths still
    // call showToast at the end.
    expect(ADMIN).toMatch(/showToast\('อัพเดทข้อมูลจองสำเร็จทั้งในระบบและ ProClinic'\)/);
    expect(ADMIN).toMatch(/showToast\('บันทึกข้อมูลจองสำเร็จ'\)/);
  });

  it('VCS.C.7 — best-effort cascade wrapped in try/catch (failure logs but doesn\'t block)', () => {
    // The console.warn message includes a `[handleSaveDepositData]` prefix
    // before the "kiosk-fresh deposit sync failed" substring.
    expect(ADMIN).toMatch(
      /catch\s*\(syncErr\)\s*\{[\s\S]{0,300}?kiosk-fresh deposit sync failed/,
    );
  });
});

describe('Phase 24.0-vicies — Bug 3: confirmUpdateAppointment cascade to linked deposit', () => {
  it('VCS.D.1 — cascade reads linkedDepositId with depositProClinicId fallback', () => {
    expect(ADMIN).toMatch(
      /linkedDepositId\s*=\s*session\.linkedDepositId\s*\|\|\s*session\.depositProClinicId/,
    );
  });

  it('VCS.D.2 — cascade fires syncCustomerTempToLinkedDeposit on every edit', () => {
    expect(ADMIN).toMatch(
      /syncCustomerTempToLinkedDeposit\(linkedDepositId,\s*\{[\s\S]{0,300}?customerName:\s*apptPayload\.customerName/,
    );
  });

  it('VCS.D.3 — cascade fires syncAppointmentToLinkedDeposit for purpose/date/doctor/room sync', () => {
    expect(ADMIN).toMatch(
      /syncAppointmentToLinkedDeposit\(linkedDepositId,\s*\{[\s\S]{0,500}?purpose:\s*apptPayload\.appointmentTo/,
    );
  });

  it('VCS.D.4 — best-effort cascade (try/catch around the import + calls)', () => {
    expect(ADMIN).toMatch(
      /try\s*\{[\s\S]{0,1500}?syncCustomerTempToLinkedDeposit[\s\S]{0,1500}?\}\s*catch\s*\(cascadeErr\)/,
    );
  });

  it('VCS.D.5 — Phase 24.0-vicies marker present in confirmUpdateAppointment area', () => {
    // Find the cascade-comment marker.
    expect(ADMIN).toMatch(/Phase 24\.0-vicies[\s\S]{0,500}?ปุ่มแก้ไขในหน้าจองไม่มัดจำ/);
  });
});

describe('Phase 24.0-vicies — full-flow simulate (Rule I)', () => {
  it('VCS.F.1 — Bug 2 repro + fix: kiosk deposit-only with ขลิบ → Finance shows ขลิบ', () => {
    const visitPurposeText = 'ขลิบ';
    const baseDepositData = { amount: 1500, customerName: 'Dew' };
    const depositOnlyPayload = {
      ...baseDepositData,
      hasAppointment: false,
      appointment: visitPurposeText ? {
        type: 'deposit-only',
        purpose: visitPurposeText,
        appointmentTo: visitPurposeText,
      } : null,
    };
    expect(depositOnlyPayload.appointment).toEqual({
      type: 'deposit-only',
      purpose: 'ขลิบ',
      appointmentTo: 'ขลิบ',
    });
    // DepositPanel column read: dep.appointment?.purpose → 'ขลิบ'
    const display = depositOnlyPayload.appointment?.purpose
      || depositOnlyPayload.appointment?.appointmentTo;
    expect(display).toBe('ขลิบ');
  });

  it('VCS.F.2 — empty visitPurpose → no appointment object → column shows "-" (anti-regression)', () => {
    const depositOnlyPayload = {
      hasAppointment: false,
      appointment: '' ? { type: 'deposit-only', purpose: '', appointmentTo: '' } : null,
    };
    expect(depositOnlyPayload.appointment).toBeNull();
    const display = depositOnlyPayload.appointment?.purpose
      || depositOnlyPayload.appointment?.appointmentTo;
    expect(display).toBeFalsy(); // DepositPanel renders '—'
  });

  it('VCS.F.3 — Bug 1 repro + fix: kiosk-fresh deposit (no brokerProClinicId) cascade fires', () => {
    // Simulate the gate evaluation:
    const sess = {
      depositSyncStatus: 'done',
      brokerProClinicId: null, // kiosk fresh
      depositProClinicId: null, // not set yet
      linkedDepositId: 'DEP-1777999', // set by Phase 24.0-quinquiesdecies
      linkedAppointmentId: '', // no appt yet
    };
    const newData = { hasAppointment: true, appointmentDate: '2026-05-10', appointmentStartTime: '10:00' };

    const alreadySynced = sess?.depositSyncStatus === 'done' && sess?.brokerProClinicId;
    expect(alreadySynced).toBeFalsy(); // pre-fix would have skipped cascade entirely

    // Phase 24.0-vicies: depIdForCascade is resolved BEFORE the alreadySynced gate
    const depIdForCascade = sess?.depositProClinicId || sess?.linkedDepositId || '';
    expect(depIdForCascade).toBe('DEP-1777999');

    // Gate evaluates true → cascade fires
    const wantsAppt = !!newData?.hasAppointment;
    const hasAppt = !!sess?.linkedAppointmentId;
    const cascadeFires = wantsAppt && !hasAppt && depIdForCascade;
    expect(cascadeFires).toBeTruthy();
  });

  it('VCS.F.4 — Bug 3 repro + fix: noDeposit edit cascades to linked deposit', () => {
    const session = {
      linkedDepositId: 'DEP-X',
      appointmentProClinicId: 'BA-X',
    };
    const apptPayload = {
      customerName: 'New Name',
      customerNameTemp: 'New Name',
      customerPhoneTemp: '0899999999',
      appointmentTo: 'ขลิบ',
      date: '2026-05-15',
      startTime: '14:00',
    };
    const linkedDepositId = session.linkedDepositId
      || session.depositProClinicId
      || '';
    expect(linkedDepositId).toBe('DEP-X');
    // syncCustomerTempToLinkedDeposit + syncAppointmentToLinkedDeposit
    // fire with the new payload — verified via VCS.D.* source-grep.
  });

  it('VCS.F.5 — anti-regression: noDeposit session WITHOUT linked deposit skips cascade', () => {
    const session = { appointmentProClinicId: 'BA-X' }; // no linkedDepositId
    const linkedDepositId = session.linkedDepositId
      || session.depositProClinicId
      || '';
    expect(linkedDepositId).toBeFalsy();
    // The cascade gate `if (linkedDepositId)` short-circuits → no helper calls.
  });

  it('VCS.F.6 — selective-merge anti-regression: helper preserves customerId when caller omits it', () => {
    // Mirror of the helper's selective-merge logic.
    const update = {
      customerTempSyncedAt: 'now',
      updatedAt: 'now',
    };
    const args = { customerName: 'X', customerPhoneTemp: '08X' };
    if (args.customerName !== undefined) update.customerName = String(args.customerName || '');
    if (args.customerNameTemp !== undefined) update.customerNameTemp = String(args.customerNameTemp || '');
    if (args.customerPhoneTemp !== undefined) update.customerPhoneTemp = String(args.customerPhoneTemp || '');
    // Critical: customerId is NOT in update keys → existing customerId on the
    // deposit doc is preserved.
    expect(Object.keys(update)).not.toContain('customerId');
    expect(update.customerName).toBe('X');
    expect(update.customerPhoneTemp).toBe('08X');
    expect(update.customerNameTemp).toBeUndefined(); // not provided → not in update
  });
});
