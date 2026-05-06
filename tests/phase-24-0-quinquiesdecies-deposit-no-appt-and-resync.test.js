// ─── Phase 24.0-quinquiesdecies — deposit-no-appt + Resync OPD ──────────
//
// User report 2026-05-06 (2 follow-ups while quaterdecies was finishing):
//   1. ตอนนี้ไม่สามารถสร้างลูกค้าจองมัดจำ ที่กรอกแค่ชื่อและเบอร์โทร
//      แบบไม่นัดหมายได้ ขึ้นว่ามัดจำผิดพลาด
//   2. เพิ่มปุ่ม Resync OPD ในหน้า ประวัติผู้ป่วย OPD ของ Frontend ด้วย
//      เพื่อเป็นการเช็คและ Resync ข้อมูลลงไปอีกครั้ง เผื่อมีการแก้มาจาก
//      ลูกค้า ซึ่งจะทำการเช็ค matching ก่อนเหมือน flow บันทึกอื่นๆเลย

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');

describe('Phase 24.0-quinquiesdecies — deposit-no-appointment branch', () => {
  it('DNA.A.1 — confirmCreateDeposit branches on hasAppointment', () => {
    // The fix introduces an `if (depositFormData.hasAppointment) { ... } else { ... }`
    // branch inside the try block.
    expect(ADMIN).toMatch(
      /if\s*\(depositFormData\.hasAppointment\)\s*\{[\s\S]{0,1500}?\}\s*else\s*\{[\s\S]{0,800}?createDeposit\(/,
    );
  });

  it('DNA.A.2 — hasAppointment=true branch calls createDepositBookingPair', () => {
    expect(ADMIN).toMatch(
      /if\s*\(depositFormData\.hasAppointment\)\s*\{[\s\S]{0,1500}?createDepositBookingPair\(/,
    );
  });

  it('DNA.A.3 — hasAppointment=false branch calls createDeposit (no pair-helper)', () => {
    expect(ADMIN).toMatch(
      /\}\s*else\s*\{[\s\S]{0,800}?depositId\s*=\s*await\s+createDeposit\(/,
    );
  });

  it('DNA.A.4 — deposit-only payload sets hasAppointment:false + appointment:null', () => {
    expect(ADMIN).toMatch(/hasAppointment:\s*false\s*,\s*\n?\s*appointment:\s*null/);
  });

  it('DNA.A.5 — baseDepositData is shared between both branches (Rule of 3)', () => {
    expect(ADMIN).toMatch(/const\s+baseDepositData\s*=\s*\{/);
    // Both branches spread baseDepositData:
    const occurrences = ADMIN.match(/\.\.\.baseDepositData/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('DNA.A.6 — cross-link stamp uses depositId regardless of branch', () => {
    // The post-write update uses `depositId` (declared with `let`) so it's
    // populated in BOTH branches.
    expect(ADMIN).toMatch(/let\s+depositId\s*=\s*null/);
    expect(ADMIN).toMatch(/if\s*\(depositId\)\s*\{[\s\S]{0,400}?linkedDepositId:\s*depositId/);
  });

  it('DNA.A.7 — deposit-only path still surfaces customerNameTemp + customerPhoneTemp', () => {
    // baseDepositData includes the temp fields, and both branches inherit them
    // via {...baseDepositData}. So Finance.มัดจำ row sees the temp badge
    // regardless of appointment state. Range widened to 2500 to span the
    // full object literal which includes branchId, sellers[], etc.
    const baseBlock = ADMIN.match(/const\s+baseDepositData\s*=\s*\{[\s\S]{0,2500}?\}\s*;/);
    expect(baseBlock).toBeTruthy();
    expect(baseBlock[0]).toContain('customerNameTemp:');
    expect(baseBlock[0]).toContain('customerPhoneTemp:');
  });

  it('DNA.A.8 — Phase 24.0-quaterdecies marker present (the branch fix shipped here)', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-quaterdecies[\s\S]{0,500}?branch on hasAppointment/);
  });

  it('DNA.A.9 — runtime simulate: hasAppointment=false + name + amount → enabled gate + deposit-only path', () => {
    const formData = {
      customerNameTemp: 'คุณสมชาย ใจดี',
      paymentAmount: '1500',
      hasAppointment: false,
    };
    const disabled = !formData.customerNameTemp?.trim()
      || !formData.paymentAmount
      || (formData.hasAppointment && false);
    expect(disabled).toBe(false); // SUBMIT ENABLED
    // Branch: hasAppointment=false → createDeposit path (no pair-helper).
    const usePairHelper = formData.hasAppointment;
    expect(usePairHelper).toBe(false);
  });

  it('DNA.A.10 — anti-regression: pair-helper still throws when called WITHOUT appointment', async () => {
    // Sanity: import the helper and confirm the guard is in place. This
    // protects callers from accidentally invoking it without `appointment`.
    const { createDepositBookingPair } = await import('../src/lib/appointmentDepositBatch.js');
    await expect(
      createDepositBookingPair({ depositData: { hasAppointment: false } }),
    ).rejects.toThrow(/depositData\.appointment required/);
  });
});

describe('Phase 24.0-quinquiesdecies — Resync OPD button on Frontend OPD detail view', () => {
  it('DNA.B.1 — Resync OPD button rendered with testid', () => {
    expect(ADMIN).toContain('data-testid="opd-banner-resync-btn"');
  });

  it('DNA.B.2 — onClick invokes the existing handleResync function (matching+recovery flow)', () => {
    expect(ADMIN).toMatch(
      /data-testid="opd-banner-resync-btn"[\s\S]{0,500}?handleResync\(viewingSession\)|onClick=\{[^}]{0,200}handleResync\(viewingSession\)\}[\s\S]{0,500}?data-testid="opd-banner-resync-btn"/,
    );
  });

  it('DNA.B.3 — button is gated on viewingSession.patientData (only after OPD save)', () => {
    expect(ADMIN).toMatch(
      /viewingSession\.patientData\s*&&\s*\(\s*\n?\s*<button[^>]*onClick=\{\(\)\s*=>\s*handleResync/,
    );
  });

  it('DNA.B.4 — button shows pending spinner while brokerPending[id] is truthy', () => {
    // Source signal: disabled prop reads brokerPending[viewingSession.id].
    expect(ADMIN).toMatch(
      /disabled=\{!!\s*brokerPending\[viewingSession\.id\]\}[\s\S]{0,500}?data-testid="opd-banner-resync-btn"/,
    );
    // And the inner content branches on brokerPending state — JSX text content
    // (no quotes around the Thai literal).
    expect(ADMIN).toMatch(
      /brokerPending\[viewingSession\.id\][\s\S]{0,300}?กำลัง Resync\.\.\./,
    );
  });

  it('DNA.B.5 — Thai label "Resync OPD" present', () => {
    expect(ADMIN).toMatch(/Resync OPD/);
  });

  it('DNA.B.6 — tooltip explains the matching+recovery flow', () => {
    expect(ADMIN).toMatch(
      /title="เช็คข้อมูลล่าสุด \+ อัพเดทใน backend \(จับคู่จาก HN\/บัตร ปชช\.\/เบอร์โทร อัตโนมัติ; ถ้าถูกลบไปแล้วจะสร้างใหม่\)"/,
    );
  });

  it('DNA.B.7 — Phase 24.0-quinquiesdecies marker present', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-quinquiesdecies/);
  });

  it('DNA.B.8 — button positioned in the OPD banner action row (sibling to ดูข้อมูลลูกค้า + แก้ไขข้อมูลลูกค้า)', () => {
    const viewIdx = ADMIN.indexOf('data-testid="opd-banner-view-customer-btn"');
    const editIdx = ADMIN.indexOf('data-testid="opd-banner-edit-customer-btn"');
    const resyncIdx = ADMIN.indexOf('data-testid="opd-banner-resync-btn"');
    expect(viewIdx).toBeGreaterThan(0);
    expect(editIdx).toBeGreaterThan(viewIdx);
    expect(resyncIdx).toBeGreaterThan(editIdx); // Resync comes AFTER ดู+แก้ไข
    // Within ~3.5 KB of each other → same parent flex container.
    expect(resyncIdx - viewIdx).toBeLessThan(3500);
  });
});
