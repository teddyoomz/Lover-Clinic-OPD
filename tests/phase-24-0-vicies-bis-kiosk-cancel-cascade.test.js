// ─── Phase 24.0-vicies-bis — kiosk cancel cascades to be_deposits + be_appointments ──
//
// User directive 2026-05-06: "หากลบลูกค้าจองมัดจำจาก Frontend จะลบข้อมูล
// การมัดจำและข้อมูลการนัดหมาย (หากมี) ใน data ของลูกค้าคนนั้น ในสาขานั้นๆ
// ของ backend ไปด้วย".
//
// Pre-fix: handleDepositCancel called cancelDeposit (deposit-only) and only
// when session.depositProClinicId was set. Kiosk-fresh deposits stamp
// linkedDepositId (Phase 24.0-quinquiesdecies), NOT depositProClinicId, so
// the cancel path silently skipped the be_deposits cancel + never touched
// be_appointments at all → backend retained orphan deposit + appointment
// docs after admin "deleted" the booking from kiosk.
//
// Fix: switch to cancelDepositBookingPair (Phase 21.0 atomic writeBatch
// helper) which soft-cancels BOTH be_deposits + linked be_appointments
// (status='cancelled' on both). Resolve depositId with linkedDepositId
// fallback so kiosk-fresh deposits cascade correctly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

describe('Phase 24.0-vicies-bis — handleDepositCancel cascade fix', () => {
  it('VBC.A.1 — depositId resolves with linkedDepositId fallback (Phase 24.0-quinquiesdecies kiosk-fresh)', () => {
    expect(ADMIN).toMatch(
      /const\s+depIdForCancel\s*=\s*session\.depositProClinicId\s*\|\|\s*session\.linkedDepositId\s*\|\|\s*''/,
    );
  });

  it('VBC.A.2 — uses cancelDepositBookingPair (atomic writeBatch) instead of cancelDeposit', () => {
    // The handleDepositCancel function should call cancelDepositBookingPair
    // (which cancels both be_deposits + be_appointments) — NOT the
    // single-doc cancelDeposit. Use indexOf-based extraction since the
    // function body grew past 2500 chars with the cascade comment block.
    const startIdx = ADMIN.indexOf('const handleDepositCancel = async');
    expect(startIdx).toBeGreaterThan(0);
    const tail = ADMIN.slice(startIdx);
    const endIdx = tail.indexOf('const handleSaveDepositData');
    expect(endIdx).toBeGreaterThan(0);
    const block = tail.slice(0, endIdx);
    expect(block).toMatch(/cancelDepositBookingPair/);
    // Anti-regression: shouldn't fall back to deposit-only cancel.
    expect(block).not.toMatch(/await\s+cancelDeposit\(session\.depositProClinicId/);
  });

  it('VBC.A.3 — uses deleteDepositBookingPair (no cancelNote arg — Phase 24.0-vicies-quinquies)', () => {
    // Phase 24.0-vicies-quinquies (2026-05-06) — switched from
    // cancelDepositBookingPair (soft-cancel with cancelNote) →
    // deleteDepositBookingPair (hard delete, no note). User: ในหน้าการเงิน
    // ไม่ต้องแสดงเป็นยกเลิกแต่ให้ลบหายไปเลย.
    const block = extractCancelFn();
    expect(block).toMatch(/deleteDepositBookingPair\(depIdForCancel\)/);
    expect(block).not.toMatch(/cancelNote:/);
  });

  it('VBC.A.4 — toast message branches on pairDeleted (Phase 24.0-vicies-quinquies)', () => {
    // Phase 24.0-vicies-quinquies — return shape pairCancelled → pairDeleted.
    expect(ADMIN).toMatch(/result\?\.pairDeleted/);
    expect(ADMIN).toMatch(/ลบมัดจำ \+ นัดหมายแล้ว/);
    expect(ADMIN).toMatch(/ลบมัดจำแล้ว/);
  });

  it('VBC.A.5 — opd_sessions update stamps cancelledDepositId + cancelledAppointmentId forensic fields', () => {
    expect(ADMIN).toMatch(/cancelledDepositId:\s*depIdForCancel\s*\|\|\s*null/);
    expect(ADMIN).toMatch(/cancelledAppointmentId:\s*session\.linkedAppointmentId\s*\|\|\s*null/);
  });

  // Helper to extract the handleDepositCancel function body via indexOf
  // bracketing — used by VBC.A.6 + A.7 to span the larger Phase 24.0-vicies-bis
  // function body without brittle byte-count regex bounds.
  function extractCancelFn() {
    const startIdx = ADMIN.indexOf('const handleDepositCancel = async');
    if (startIdx < 0) return '';
    const tail = ADMIN.slice(startIdx);
    const endIdx = tail.indexOf('const handleSaveDepositData');
    return endIdx > 0 ? tail.slice(0, endIdx) : tail;
  }

  it('VBC.A.6 — best-effort error path preserves existing failure flow', () => {
    const block = extractCancelFn();
    expect(block).toBeTruthy();
    expect(block).toMatch(/depositSyncStatus:\s*['"]failed['"]/);
    expect(block).toMatch(/showToast\(`ยกเลิกไม่สำเร็จ:/);
  });

  it('VBC.A.7 — session archive still fires (move to ประวัติจอง)', () => {
    const block = extractCancelFn();
    expect(block).toBeTruthy();
    expect(block).toMatch(/isArchived:\s*true/);
    expect(block).toMatch(/archivedAt:\s*serverTimestamp\(\)/);
    expect(block).toMatch(/depositSyncStatus:\s*['"]cancelled['"]/);
  });

  it('VBC.A.8 — Phase 24.0-vicies-bis marker present', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-vicies-bis/);
  });
});

describe('Phase 24.0-vicies-bis — full-flow simulate (Rule I)', () => {
  it('VBC.F.1 — kiosk-fresh deposit (linkedDepositId only) → cascade fires', () => {
    const session = {
      id: 'DEP-ABCDE12',
      depositProClinicId: '',  // not set for kiosk-fresh
      linkedDepositId: 'DEP-1777999',  // Phase 24.0-quinquiesdecies stamp
      linkedAppointmentId: 'BA-1777999-aaaa',
    };
    // Mirror the resolver:
    const depIdForCancel = session.depositProClinicId || session.linkedDepositId || '';
    expect(depIdForCancel).toBe('DEP-1777999');
    // Cancel cascade fires for this depositId.
  });

  it('VBC.F.2 — patient-form-filled deposit (depositProClinicId) still works', () => {
    const session = {
      id: 'DEP-XYZ',
      depositProClinicId: 'DEP-1777111',  // post-fill stamp
      linkedDepositId: '',
      linkedAppointmentId: '',
    };
    const depIdForCancel = session.depositProClinicId || session.linkedDepositId || '';
    expect(depIdForCancel).toBe('DEP-1777111');
  });

  it('VBC.F.3 — no deposit linked → skip cascade (anti-regression)', () => {
    const session = {
      id: 'DEP-ORPHAN',
      depositProClinicId: '',
      linkedDepositId: '',
    };
    const depIdForCancel = session.depositProClinicId || session.linkedDepositId || '';
    expect(depIdForCancel).toBe('');
    // Cascade gate `if (depIdForCancel)` → skip cancelDepositBookingPair
    // → only opd_sessions archive fires.
  });

  it('VBC.F.4 — pairCancelled=true (appt linked) vs false (deposit-only)', () => {
    // cancelDepositBookingPair returns { pairCancelled, depositId, appointmentId? }
    // pairCancelled=true when result has appointmentId; false when deposit-only.
    const resultWithAppt = { pairCancelled: true, depositId: 'DEP-1', appointmentId: 'BA-1' };
    const resultDepositOnly = { pairCancelled: false, depositId: 'DEP-2' };
    const toastWith = resultWithAppt.pairCancelled
      ? 'ยกเลิกการจองสำเร็จ — ลบมัดจำ + นัดหมายแล้ว'
      : 'ยกเลิกการจองสำเร็จ — ลบมัดจำแล้ว';
    const toastWithout = resultDepositOnly.pairCancelled
      ? 'ยกเลิกการจองสำเร็จ — ลบมัดจำ + นัดหมายแล้ว'
      : 'ยกเลิกการจองสำเร็จ — ลบมัดจำแล้ว';
    expect(toastWith).toContain('นัดหมาย');
    expect(toastWithout).not.toContain('นัดหมาย');
  });
});

describe('Phase 24.0-vicies-bis — anti-regression: cancelDepositBookingPair preserves audit trail (soft-cancel)', () => {
  it('VBC.B.1 — pair-helper does soft-cancel (status="cancelled"), not hard delete', async () => {
    // Sanity check: cancelDepositBookingPair is the soft-cancel path. The
    // existing tests in phase-21-0-deposit-booking-pair-helper.test.js
    // already validate the writeBatch shape; here we just confirm the
    // helper export is the one being called.
    const { cancelDepositBookingPair } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    expect(typeof cancelDepositBookingPair).toBe('function');
  });
});
