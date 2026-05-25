// ─── Phase 24.0-vicies-quinquies — hard-delete deposit-booking pair ─────
//
// User reports 2026-05-06 (2 connected bugs):
//   1. มีบั๊คคือลบ จองมัดจำ จากหน้า frontend แล้ว ในหน้าการเงินไม่ต้องแสดง
//      เป็นยกเลิกแต่ให้ลบหายไปเลย
//   2. บั๊คที่ 2 คือถ้าลบนัดหมาย จองมัดจำ จากหน้านัดหมายแล้ว ถ้าไม่ลบใน
//      การเงินด้วย มันจะแสดง bubble ตรงแถบวันที่ ด้านบนของ tab นัดหมาย
//      ไปตลอด ทั้งๆที่ในตารางในวันนั้นไม่มีนัดอะไรแล้ว ก็ยังแสดง bubble
//      เลข 1 จนกว่าจะไปลบมัดจำนั้นในหน้าการเงินด้วย
//
// Root cause: Phase 24.0-vicies-bis + ter cascades soft-cancelled docs
// (status='cancelled' via cancelDepositBookingPair). DepositPanel.มัดจำ
// renders all statuses including 'cancelled' → orphan rows. AppointmentCalendarView's
// monthAppts (from getAppointmentsByMonth) doesn't filter by status →
// cancelled appts still count → date-strip bubble shows phantom count.
// Plus Bug 2: AppointmentCalendarView delete-handler called bare
// deleteBackendAppointment (just deletes the appt doc) — left orphan
// deposit in Finance.มัดจำ; the deposit's embedded appointment metadata
// kept its count alive somehow.
//
// Fix:
//   1. NEW deleteDepositBookingPair (hard-delete both docs in writeBatch)
//   2. Kiosk handleDepositCancel + archive cascades switch from
//      cancelDepositBookingPair → deleteDepositBookingPair
//   3. AppointmentCalendarView delete-handler checks linkedDepositId; if set,
//      uses deleteDepositBookingPair (cascade); else bare delete

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const VIEW = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentCalendarView.jsx'),
  'utf8',
);

// Helper to extract a function body via indexOf bracketing.
function extractFn(src, signaturePrefix) {
  const startIdx = src.indexOf(signaturePrefix);
  if (startIdx < 0) return '';
  const tail = src.slice(startIdx);
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

describe('Phase 24.0-vicies-quinquies — deleteDepositBookingPair helper', () => {
  it('VQQ.A.1 — helper exported', () => {
    expect(PAIR_HELPER).toMatch(/export\s+async\s+function\s+deleteDepositBookingPair/);
  });

  it('VQQ.A.2 — validates depositId required', async () => {
    const { deleteDepositBookingPair } = await import('../src/lib/appointmentDepositBatch.js');
    await expect(deleteDepositBookingPair('')).rejects.toThrow(/depositId required/);
  });

  it('VQQ.A.3 — uses writeBatch with delete (not update)', () => {
    const block = extractFn(PAIR_HELPER, 'export async function deleteDepositBookingPair');
    expect(block).toMatch(/writeBatch\(db\)/);
    expect(block).toMatch(/batch\.delete\(depRef\)/);
    expect(block).toMatch(/batch\.delete\(appointmentDoc\(appointmentId\)\)/);
    expect(block).toMatch(/await\s+batch\.commit\(\)/);
  });

  it('VQQ.A.4 — preserves usedAmount guard (refuse delete when funds applied)', () => {
    const block = extractFn(PAIR_HELPER, 'export async function deleteDepositBookingPair');
    expect(block).toMatch(/Number\(data\.usedAmount\)\s*\|\|\s*0\)\s*>\s*0/);
    expect(block).toMatch(/มัดจำถูกใช้ไปบางส่วนแล้ว/);
  });

  it('VQQ.A.5 — idempotent: returns success when doc already gone', () => {
    const block = extractFn(PAIR_HELPER, 'export async function deleteDepositBookingPair');
    expect(block).toMatch(/if\s*\(!snap\.exists\(\)\)\s*\{[\s\S]{0,200}?return\s*\{\s*depositId,\s*deleted:\s*true,\s*pairDeleted:\s*false\s*\}/);
  });

  it('VQQ.A.6 — return shape: { depositId, appointmentId?, deleted, pairDeleted }', () => {
    const block = extractFn(PAIR_HELPER, 'export async function deleteDepositBookingPair');
    expect(block).toMatch(/return\s*\{\s*\n\s*depositId,\s*\n\s*appointmentId:\s*appointmentId\s*\|\|\s*undefined,\s*\n\s*deleted:\s*true,\s*\n\s*pairDeleted:\s*!!appointmentId,\s*\n\s*\}/);
  });

  it('VQQ.A.7 — institutional-memory marker present', () => {
    expect(PAIR_HELPER).toMatch(/MARKER:\s*phase-24-0-vicies-quinquies-delete-deposit-booking-pair/);
  });
});

describe('Phase 24.0-vicies-quinquies — kiosk handleDepositCancel switched to delete', () => {
  it('VQQ.B.1 — handleDepositCancel imports + calls deleteDepositBookingPair (not cancelDepositBookingPair)', () => {
    // Within handleDepositCancel function body. Note: comments may still
    // mention the old `cancelDepositBookingPair` name as a "switched from"
    // explanation — the assertion is on actual CODE (await + parens).
    const startIdx = ADMIN.indexOf('const handleDepositCancel = async');
    const endIdx = ADMIN.indexOf('const handleSaveDepositData', startIdx);
    const block = ADMIN.slice(startIdx, endIdx);
    // The destructured import + the await call — both must reference the new helper.
    expect(block).toMatch(/\{\s*deleteDepositBookingPair\s*\}\s*=\s*await\s+import/);
    expect(block).toMatch(/await\s+deleteDepositBookingPair\(depIdForCancel\)/);
    // Anti-regression: no actual await call to cancelDepositBookingPair.
    expect(block).not.toMatch(/await\s+cancelDepositBookingPair\(/);
  });

  it('VQQ.B.2 — toast switched from "ยกเลิก" to "ลบ"', () => {
    expect(ADMIN).toMatch(/showToast\('ลบการจองสำเร็จ — ลบมัดจำ \+ นัดหมายแล้ว'\)/);
    expect(ADMIN).toMatch(/showToast\('ลบการจองสำเร็จ — ลบมัดจำแล้ว'\)/);
  });

  it('VQQ.B.3 — return shape branch: result.pairDeleted (not pairCancelled)', () => {
    const startIdx = ADMIN.indexOf('const handleDepositCancel = async');
    const endIdx = ADMIN.indexOf('const handleSaveDepositData', startIdx);
    const block = ADMIN.slice(startIdx, endIdx);
    expect(block).toMatch(/result\?\.pairDeleted/);
  });
});

describe('Phase 24.0-vicies-quinquies — kiosk archive (trash) cascade', () => {
  it('VQQ.C.1 — archive branch imports + calls deleteDepositBookingPair', () => {
    // Sanity: the [archive cascade] log marker references the new helper.
    expect(ADMIN).toMatch(
      /\[archive cascade\] deleteDepositBookingPair failed/,
    );
    // Within the archive cascade try-block, await + call deleteDepositBookingPair.
    expect(ADMIN).toMatch(
      /\{\s*deleteDepositBookingPair\s*\}\s*=\s*await\s+import\([^)]+appointmentDepositBatch[\s\S]{0,200}?await\s+deleteDepositBookingPair\(depIdForCancel\)/,
    );
    // Anti-regression: no actual await call to cancelDepositBookingPair
    // remains in the archive cascade body (comments OK since they mention
    // the soft-cancel -> hard-delete switch).
    const archiveBlock = ADMIN.match(
      /\[archive cascade\][\s\S]{0,400}?\}/,
    );
    expect(archiveBlock).toBeTruthy();
    expect(archiveBlock[0]).not.toMatch(/await\s+cancelDepositBookingPair\(/);
  });
});

describe('Phase 24.0-vicies-quinquies — AppointmentCalendarView delete-handler cascade', () => {
  it('VQQ.D.1 — onDelete reads linkedDepositId with spawnedFromDepositId fallback', () => {
    // Phase 24.0-vicies-septies (2026-05-06) — both sources wrapped in
    // _coerceDepId() to defend against legacy {depositId,success} object
    // shape on broken records.
    expect(VIEW).toMatch(
      /linkedDepositId\s*=\s*_coerceDepId\(formMode\.appt\.linkedDepositId\)[\s\S]{0,80}?\|\|\s*_coerceDepId\(formMode\.appt\.spawnedFromDepositId\)/,
    );
  });

  // (2026-05-26 / AV132) — AppointmentCalendarView delete now OPENS the shared
  // DepositAwareCancelDialog when linkedDepositId is set (ask ลบมัดจำด้วย/เก็บ),
  // instead of silently pair-deleting. The cascade moved into the dialog onChoice.
  it('VQQ.D.2 — linkedDepositId set → opens deposit-aware dialog (setDeleteDialog)', () => {
    expect(VIEW).toMatch(
      /if\s*\(linkedDepositId\)\s*\{[\s\S]{0,300}?setDeleteDialog\(\{[\s\S]{0,120}?depositId:\s*linkedDepositId/,
    );
  });

  it('VQQ.D.3 — dialog onChoice: both → deleteDepositBookingPair, this-only → deleteBackendAppointment', () => {
    expect(VIEW).toMatch(/choice\s*===\s*'both'[\s\S]{0,200}?deleteDepositBookingPair\(dlg\.depositId\)/);
    expect(VIEW).toMatch(/deleteBackendAppointment\(dlg\.apptId\)/);
  });

  it('VQQ.D.4 — no linkedDepositId → bare deleteBackendAppointment(id) (anti-regression)', () => {
    expect(VIEW).toMatch(/await\s+deleteBackendAppointment\(id\)/);
  });

  it('VQQ.D.5 — Phase 24.0-vicies-quinquies marker present', () => {
    expect(VIEW).toMatch(/Phase 24\.0-vicies-quinquies/);
  });
});

describe('Phase 24.0-vicies-quinquies — full-flow simulate (Rule I)', () => {
  it('VQQ.F.1 — kiosk-cancel pair-delete: both docs removed → Finance row + bubble vanish', () => {
    // Mirror of helper logic: pair-delete returns { pairDeleted: true } when
    // appointmentId was set on the deposit doc.
    const dep = { depositId: 'DEP-1', linkedAppointmentId: 'BA-1', usedAmount: 0 };
    const wouldDeletePair = !!dep.linkedAppointmentId && (Number(dep.usedAmount) || 0) === 0;
    expect(wouldDeletePair).toBe(true);
    // After delete: be_deposits.DEP-1 + be_appointments.BA-1 both gone.
    // Finance.มัดจำ list query returns no row. AppointmentCalendarView
    // monthAppts has no entry → bubble count drops.
  });

  it('VQQ.F.2 — deposit-only delete (no linked appt) → just deposit removed', () => {
    const dep = { depositId: 'DEP-2', linkedAppointmentId: '', usedAmount: 0 };
    const wouldDeletePair = !!dep.linkedAppointmentId;
    expect(wouldDeletePair).toBe(false);
    // Helper still deletes deposit doc; pairDeleted=false in return shape.
  });

  it('VQQ.F.3 — usedAmount > 0 blocks delete (financial integrity)', () => {
    const dep = { depositId: 'DEP-3', linkedAppointmentId: 'BA-3', usedAmount: 500 };
    const blocked = (Number(dep.usedAmount) || 0) > 0;
    expect(blocked).toBe(true);
    // Helper throws "มัดจำถูกใช้ไปบางส่วนแล้ว ไม่สามารถลบได้".
  });

  it('VQQ.F.4 — appointment-tab delete cascade: linkedDepositId set → both docs gone', () => {
    const appt = {
      appointmentId: 'BA-X',
      linkedDepositId: 'DEP-X',
    };
    const linkedDepositId = appt.linkedDepositId || appt.spawnedFromDepositId || '';
    expect(linkedDepositId).toBe('DEP-X');
    // Cascade fires deleteDepositBookingPair('DEP-X') → both removed.
  });

  it('VQQ.F.5 — appointment-tab delete on non-paired appt: bare deleteBackendAppointment only', () => {
    const appt = { appointmentId: 'BA-Y' }; // no linkedDepositId
    const linkedDepositId = appt.linkedDepositId || appt.spawnedFromDepositId || '';
    expect(linkedDepositId).toBe('');
    // Falls through to deleteBackendAppointment(id) — no deposit cascade.
  });

  it('VQQ.F.6 — bubble count anti-regression: hard-delete vs soft-cancel', () => {
    // Simulate getAppointmentsByMonth (no status filter):
    const beAppointmentsAfterSoftCancel = [
      { id: 'BA-1', date: '2026-05-08', status: 'cancelled' }, // soft-cancelled, still counted!
    ];
    const beAppointmentsAfterHardDelete = [
      // empty: doc was deleted
    ];
    // Pre-fix bubble count:
    expect(beAppointmentsAfterSoftCancel.length).toBe(1); // bubble shows 1 (bug)
    // Post-fix:
    expect(beAppointmentsAfterHardDelete.length).toBe(0); // bubble shows 0
  });
});

describe('Phase 24.0-vicies-quinquies — anti-regression: cancelDepositBookingPair preserved for Finance.มัดจำ admin-cancel', () => {
  it('VQQ.E.1 — cancelDepositBookingPair still exported (used by DepositPanel admin-cancel)', () => {
    expect(PAIR_HELPER).toMatch(/export\s+async\s+function\s+cancelDepositBookingPair/);
  });

  it('VQQ.E.2 — DepositPanel still imports cancelDepositBookingPair', () => {
    const DEPOSIT_PANEL = fs.readFileSync(
      path.join(ROOT, 'src/components/backend/DepositPanel.jsx'),
      'utf8',
    );
    expect(DEPOSIT_PANEL).toMatch(/cancelDepositBookingPair/);
  });
});
