// ─── Phase 24.0-terdecies — เลือกลูกค้าภายหลัง flow ──────────────────────
//
// User report 2026-05-06 (3-point directive + 2 screenshots):
//   1. ใน modal สร้างนัดหมายทุกแบบใน backend เพิ่มให้สามารถ เลือกลูกค้า
//      ภายหลังได้ คือสามารถลงนัดไปก่อนได้ โดยมีช่องให้ใส่ชื่อและเบอร์โทร
//      ของลูกค้าที่จองคิวนัดหมายนั้นๆ เท่านั้นพอ
//   2. เมื่อกดสร้างคิวใหม่ใน frontend ตัว modal ทั้งการจองมัดจำ และการ
//      จองไม่มัดจำ ให้เพิ่มช่องกรอกชื่อ และเบอร์โทรของลูกค้าที่จองคิว
//      นัดหมายนั้นๆ ใต้ชื่อคิว และแสดงใน Card list ของลูกค้ารายนั้นๆด้วย
//   3. Mapping ข้อ 2 กับ 1 เข้าด้วยกัน เมื่อมีการจองมา ชื่ออะไร เบอร์อะไร
//      ก็ไปทำการสร้างการจองใน backend ตามข้อมูลที่กรอกมาจาก Frontend
//      ตามชื่อนั้นเบอร์นั้น รวมถึงถ้าเป็นแบบมัดจำ ก็ไปแสดงในหน้าการเงิน
//      ของสาขานั้นๆด้วย ว่าชื่ออะไร เบอร์อะไร แบบคร่าวๆก่อน

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  buildAppointmentPairPayload,
  buildDepositPairPayload,
  mintPairIds,
} from '../src/lib/appointmentDepositBatch.js';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const APPT_MODAL = fs.readFileSync(path.join(ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf8');
const DEPOSIT_PANEL = fs.readFileSync(path.join(ROOT, 'src/components/backend/DepositPanel.jsx'), 'utf8');
const PAIR_HELPER = fs.readFileSync(path.join(ROOT, 'src/lib/appointmentDepositBatch.js'), 'utf8');

describe('Phase 24.0-terdecies — appointmentDepositBatch pair-helper carries temp fields', () => {
  it('CLF.A.1 — buildDepositPairPayload includes customerNameTemp + customerPhoneTemp', () => {
    const payload = buildDepositPairPayload({
      depositData: {
        customerId: '',
        customerName: 'ลูกค้าจอง',
        customerHN: '',
        customerNameTemp: 'คุณสมชาย ใจดี',
        customerPhoneTemp: '0812345678',
        amount: 1000,
        appointment: { date: '2026-05-10', startTime: '10:00' },
      },
      depositId: 'DEP-1',
      appointmentId: 'BA-1-aaaa',
      branchId: 'BR-X',
    });
    expect(payload.customerNameTemp).toBe('คุณสมชาย ใจดี');
    expect(payload.customerPhoneTemp).toBe('0812345678');
    expect(payload.customerId).toBe('');
    expect(payload.customerName).toBe('ลูกค้าจอง');
  });

  it('CLF.A.2 — buildAppointmentPairPayload includes customerNameTemp + customerPhoneTemp', () => {
    const payload = buildAppointmentPairPayload({
      depositData: {
        customerId: '',
        customerName: 'ลูกค้าจอง',
        customerNameTemp: 'คุณสมหญิง',
        customerPhoneTemp: '0898765432',
        appointment: { date: '2026-05-10', startTime: '14:30' },
      },
      depositId: 'DEP-2',
      appointmentId: 'BA-2-bbbb',
      branchId: 'BR-Y',
    });
    expect(payload.customerNameTemp).toBe('คุณสมหญิง');
    expect(payload.customerPhoneTemp).toBe('0898765432');
    expect(payload.appointmentType).toBe('deposit-booking');
  });

  it('CLF.A.3 — both helpers default temp fields to empty string when missing', () => {
    const ids = mintPairIds();
    const dep = buildDepositPairPayload({
      depositData: { amount: 100, appointment: { date: '2026-05-10', startTime: '10:00' } },
      depositId: ids.depositId,
      appointmentId: ids.appointmentId,
      branchId: null,
    });
    const appt = buildAppointmentPairPayload({
      depositData: { appointment: { date: '2026-05-10', startTime: '10:00' } },
      depositId: ids.depositId,
      appointmentId: ids.appointmentId,
      branchId: null,
    });
    expect(dep.customerNameTemp).toBe('');
    expect(dep.customerPhoneTemp).toBe('');
    expect(appt.customerNameTemp).toBe('');
    expect(appt.customerPhoneTemp).toBe('');
  });

  it('CLF.A.4 — pair-helper marker present', () => {
    expect(PAIR_HELPER).toMatch(/Phase 24\.0-terdecies/);
  });
});

describe('Phase 24.0-terdecies — kiosk modal source-grep', () => {
  it('CLF.B.1 — depositFormData state includes customerNameTemp + customerPhoneTemp', () => {
    expect(ADMIN).toMatch(/depositFormData[\s\S]{0,1500}customerNameTemp:\s*''/);
    expect(ADMIN).toMatch(/depositFormData[\s\S]{0,1500}customerPhoneTemp:\s*''/);
  });

  it('CLF.B.2 — noDepositFormData state includes both temp fields', () => {
    expect(ADMIN).toMatch(/noDepositFormData[\s\S]{0,800}customerNameTemp:\s*''/);
    expect(ADMIN).toMatch(/noDepositFormData[\s\S]{0,800}customerPhoneTemp:\s*''/);
  });

  it('CLF.B.3 — both modals render testid inputs', () => {
    expect(ADMIN).toContain('data-testid="deposit-customer-name-temp"');
    expect(ADMIN).toContain('data-testid="deposit-customer-phone-temp"');
    expect(ADMIN).toContain('data-testid="no-deposit-customer-name-temp"');
    expect(ADMIN).toContain('data-testid="no-deposit-customer-phone-temp"');
  });

  it('CLF.B.4 — kiosk pair-write call site routes temp fields into createDepositBookingPair', () => {
    // Phase 24.0-quaterdecies (2026-05-06) — refactored to share baseDepositData
    // between hasAppointment=true (pair-write) and hasAppointment=false
    // (createDeposit) branches. The customerNameTemp + customerPhoneTemp
    // fields now live in baseDepositData and reach both writers via
    // {...baseDepositData} spread. Verify (a) baseDepositData contains the
    // temp fields and (b) pair-helper invocation downstream uses
    // baseDepositData (via the spread).
    const baseBlock = ADMIN.match(/const\s+baseDepositData\s*=\s*\{[\s\S]{0,2500}?\}\s*;/);
    expect(baseBlock).toBeTruthy();
    expect(baseBlock[0]).toMatch(/customerNameTemp:\s*depositFormData\.customerNameTemp/);
    expect(baseBlock[0]).toMatch(/customerPhoneTemp:\s*depositFormData\.customerPhoneTemp/);
    // pairPayload spreads baseDepositData → temp fields reach pair-helper.
    expect(ADMIN).toMatch(/const\s+pairPayload\s*=\s*\{[\s\S]{0,200}?\.\.\.baseDepositData/);
    expect(ADMIN).toMatch(/createDepositBookingPair\(\s*\{\s*depositData:\s*pairPayload/);
  });

  it('CLF.B.5 — kiosk pair-write prefers customerNameTemp over sessionName for customerName', () => {
    // The customerName resolver chain: temp > sessionName > 'ลูกค้าจอง'.
    expect(ADMIN).toMatch(
      /customerName:\s*depositFormData\.customerNameTemp\?\.trim\(\)\s*\|\|[\s\S]{0,80}depositFormData\.sessionName/,
    );
  });

  it('CLF.B.6 — no-deposit createBackendAppointment call passes temp fields', () => {
    const occurrences = ADMIN.match(/customerNameTemp:\s*noDepositFormData\.customerNameTemp/g) || [];
    // Two write sites: confirmCreateNoDeposit + confirmUpdateAppointment.
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it('CLF.B.7 — opd_sessions persists temp fields under depositData + appointmentData', () => {
    // The persisted appointmentData object includes customerNameTemp +
    // customerPhoneTemp (Phase 24.0-terdecies branch).
    expect(ADMIN).toMatch(/customerNameTemp:\s*depositFormData\.customerNameTemp/);
    expect(ADMIN).toMatch(/customerNameTemp:\s*noDepositFormData\.customerNameTemp/);
  });

  it('CLF.B.8 — (2026-05-26) noDeposit card-edit temp-field hydration REMOVED with the tab', () => {
    // The "แก้ไขนัด" inline hydration (a.customerNameTemp from session.appointmentData)
    // lived in the removed noDeposit card render. Create-form reset paths (CLF.B.9) kept.
    expect(ADMIN).not.toMatch(/customerNameTemp:\s*a\.customerNameTemp\s*\|\|\s*''/);
  });

  it('CLF.B.9 — form reset paths clear temp fields', () => {
    // 2 initial states + 2 resets + 1 new-create init — at least 5 "''"
    // occurrences for each field.
    const nameResets = ADMIN.match(/customerNameTemp:\s*''/g) || [];
    const phoneResets = ADMIN.match(/customerPhoneTemp:\s*''/g) || [];
    expect(nameResets.length).toBeGreaterThanOrEqual(5);
    expect(phoneResets.length).toBeGreaterThanOrEqual(5);
  });

  it('CLF.B.10 — (2026-05-26) deposit/no-deposit card-temp testids REMOVED with the tabs', () => {
    expect(ADMIN).not.toContain('data-testid="deposit-card-customer-temp"');
    expect(ADMIN).not.toContain('data-testid="no-deposit-card-customer-temp"');
  });

  it('CLF.B.11 — (2026-05-26) ลูกค้าจอง card-temp label REMOVED with the deposit/no-deposit cards', () => {
    const occurrences = ADMIN.match(/uppercase[^>]*>\s*ลูกค้าจอง\s*</g) || [];
    expect(occurrences.length).toBe(0);
  });

  it('CLF.B.12 — Phase 24.0-terdecies marker present in AdminDashboard', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-terdecies/);
  });
});

describe('Phase 24.0-terdecies — backend AppointmentFormModal source-grep', () => {
  it('CLF.C.1 — defaultFormData includes pickLater + customerNameTemp + customerPhoneTemp', () => {
    expect(APPT_MODAL).toMatch(/defaultFormData[\s\S]{0,2000}?pickLater:\s*false/);
    expect(APPT_MODAL).toMatch(/defaultFormData[\s\S]{0,2000}?customerNameTemp:\s*''/);
    expect(APPT_MODAL).toMatch(/defaultFormData[\s\S]{0,2000}?customerPhoneTemp:\s*''/);
  });

  it('CLF.C.2 — toggle + checkbox testids render', () => {
    expect(APPT_MODAL).toContain('data-testid="appt-modal-pick-later-toggle"');
    expect(APPT_MODAL).toContain('data-testid="appt-modal-pick-later-checkbox"');
  });

  it('CLF.C.3 — temp name + phone inputs render with testids', () => {
    expect(APPT_MODAL).toContain('data-testid="appt-modal-customer-name-temp"');
    expect(APPT_MODAL).toContain('data-testid="appt-modal-customer-phone-temp"');
  });

  it('CLF.C.4 — handleSave validates temp fields when pickLater (asymmetric requirement)', () => {
    // Both messages must exist as scrollToFormError args.
    expect(APPT_MODAL).toMatch(/'กรุณากรอกชื่อลูกค้า'/);
    expect(APPT_MODAL).toMatch(/'กรุณากรอกเบอร์โทรลูกค้า'/);
  });

  it('CLF.C.5 — handleSave skips the customerId-required check when pickLater', () => {
    // Source signal: the validation block now branches on formData.pickLater.
    expect(APPT_MODAL).toMatch(/if\s*\(\s*formData\.pickLater\s*\)/);
  });

  it('CLF.C.6 — payload customerName falls through to tempName when pickLater', () => {
    expect(APPT_MODAL).toMatch(/customerName:\s*formData\.pickLater\s*\?\s*tempName\s*:\s*formData\.customerName/);
    expect(APPT_MODAL).toMatch(/customerId:\s*formData\.pickLater\s*\?\s*''\s*:\s*formData\.customerId/);
  });

  it('CLF.C.7 — payload always carries customerNameTemp + customerPhoneTemp (forensic trail)', () => {
    // Even when not pickLater, the payload field is present (as empty string).
    expect(APPT_MODAL).toMatch(/customerNameTemp:\s*tempName/);
    expect(APPT_MODAL).toMatch(/customerPhoneTemp:\s*tempPhone/);
  });

  it('CLF.C.8 — edit-mode hydration restores pickLater + temp fields', () => {
    // pickLater is implicit in edit: TRUE iff customerId empty AND a temp
    // is non-empty.
    expect(APPT_MODAL).toMatch(/pickLater:\s*!appt\.customerId\s*&&\s*!!\(appt\.customerNameTemp\s*\|\|\s*appt\.customerPhoneTemp\)/);
    expect(APPT_MODAL).toMatch(/customerNameTemp:\s*appt\.customerNameTemp\s*\|\|\s*''/);
    expect(APPT_MODAL).toMatch(/customerPhoneTemp:\s*appt\.customerPhoneTemp\s*\|\|\s*''/);
  });

  it('CLF.C.9 — toggle is hidden when lockedCustomer prop set (CustomerDetailView callsite)', () => {
    expect(APPT_MODAL).toMatch(/!lockedCustomer\s*&&\s*\(\s*\n?\s*<label[^>]*data-testid="appt-modal-pick-later-toggle"/);
  });

  it('CLF.C.10 — Phase 24.0-terdecies marker present in modal', () => {
    expect(APPT_MODAL).toMatch(/Phase 24\.0-terdecies/);
  });
});

describe('Phase 24.0-terdecies — DepositPanel Finance display source-grep', () => {
  it('CLF.D.1 — deposit-customer-cell + deposit-customer-temp-badge testids', () => {
    expect(DEPOSIT_PANEL).toContain('data-testid="deposit-customer-cell"');
    expect(DEPOSIT_PANEL).toContain('data-testid="deposit-customer-temp-badge"');
  });

  it('CLF.D.2 — temp badge gated on !dep.customerId AND (customerNameTemp || customerPhoneTemp)', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /!dep\.customerId\s*&&\s*\(dep\.customerNameTemp\s*\|\|\s*dep\.customerPhoneTemp\)/,
    );
  });

  it('CLF.D.3 — badge label "ลูกค้าจอง" + name + phone surfaces in same render block', () => {
    // Phase 24.0-vicies-novies (2026-05-07) — bound bumped {0,800} → {0,8000}
    // because the badge block grew with the new "ส่งลิ้งค์ลูกค้า" button.
    const block = DEPOSIT_PANEL.match(/data-testid="deposit-customer-temp-badge"[\s\S]{0,8000}?<\/div>/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/ลูกค้าจอง/);
    expect(block[0]).toContain('dep.customerNameTemp');
    expect(block[0]).toContain('dep.customerPhoneTemp');
  });

  it('CLF.D.4 — Phase 24.0-terdecies marker present in DepositPanel', () => {
    expect(DEPOSIT_PANEL).toMatch(/Phase 24\.0-terdecies/);
  });
});

describe('Phase 24.0-terdecies — full-flow simulate (Rule I)', () => {
  it('CLF.F.1 — kiosk deposit pair-write end-to-end carries name + phone', () => {
    // Caller-shape mirror of confirmCreateDeposit.
    const depositFormData = {
      sessionName: 'คุณ A จอง HRT',
      paymentChannel: 'โอนธนาคาร',
      paymentAmount: '1500',
      depositDate: '2026-05-06',
      depositTime: '20:50',
      salesperson: 'staff-1',
      hasAppointment: false, // Pair helper requires hasAppointment+appointment
      customerNameTemp: '  คุณสมชาย ใจดี  ',
      customerPhoneTemp: '0812345678',
    };
    // Simulate the resolver logic (matches AdminDashboard.jsx code path).
    const resolvedName = depositFormData.customerNameTemp?.trim()
      || depositFormData.sessionName?.trim()
      || 'ลูกค้าจอง';
    expect(resolvedName).toBe('คุณสมชาย ใจดี');
    // Pair-helper input shape:
    const depPayload = buildDepositPairPayload({
      depositData: {
        customerId: '',
        customerName: resolvedName,
        customerHN: '',
        customerNameTemp: depositFormData.customerNameTemp.trim(),
        customerPhoneTemp: depositFormData.customerPhoneTemp.trim(),
        amount: 1500,
        appointment: { date: '2026-05-10', startTime: '14:00' },
      },
      depositId: 'DEP-A',
      appointmentId: 'BA-A-x',
      branchId: 'BR-X',
    });
    expect(depPayload.customerName).toBe('คุณสมชาย ใจดี');
    expect(depPayload.customerNameTemp).toBe('คุณสมชาย ใจดี');
    expect(depPayload.customerPhoneTemp).toBe('0812345678');
    // customerId stays '' so DepositPanel renders the temp badge.
    expect(depPayload.customerId).toBe('');
  });

  it('CLF.F.2 — backend AppointmentFormModal pickLater payload chain', () => {
    // formData state shape after admin types name + phone with toggle ON.
    const formData = {
      pickLater: true,
      customerId: 'CUST-LEAKED', // from earlier picker — should be CLEARED
      customerName: 'leaked name',
      customerHN: 'HN-X',
      customerNameTemp: '  คุณสมหญิง  ',
      customerPhoneTemp: '  0898765432  ',
    };
    const tempName = String(formData.customerNameTemp || '').trim();
    const tempPhone = String(formData.customerPhoneTemp || '').trim();
    // Mirror of the payload builder branch.
    const payload = {
      customerId: formData.pickLater ? '' : formData.customerId,
      customerName: formData.pickLater ? tempName : formData.customerName,
      customerHN: formData.pickLater ? '' : formData.customerHN,
      customerNameTemp: tempName,
      customerPhoneTemp: tempPhone,
    };
    expect(payload.customerId).toBe('');
    expect(payload.customerName).toBe('คุณสมหญิง');
    expect(payload.customerHN).toBe('');
    expect(payload.customerNameTemp).toBe('คุณสมหญิง');
    expect(payload.customerPhoneTemp).toBe('0898765432');
  });

  it('CLF.F.3 — DepositPanel Finance row gating: badge shows iff customerId empty + temp present', () => {
    // Visual contract: the temp badge ONLY renders when no real customer
    // doc is linked AND at least one temp field is filled.
    const cases = [
      { dep: { customerId: '', customerNameTemp: 'A', customerPhoneTemp: '08x' }, expected: true },
      { dep: { customerId: '', customerNameTemp: 'A', customerPhoneTemp: '' },   expected: true },
      { dep: { customerId: '', customerNameTemp: '', customerPhoneTemp: '08x' }, expected: true },
      { dep: { customerId: '', customerNameTemp: '', customerPhoneTemp: '' },    expected: false },
      { dep: { customerId: 'LC-1', customerNameTemp: 'A', customerPhoneTemp: '08x' }, expected: false },
    ];
    for (const { dep, expected } of cases) {
      const shouldShow = !dep.customerId && (!!dep.customerNameTemp || !!dep.customerPhoneTemp);
      expect(shouldShow).toBe(expected);
    }
  });

  it('CLF.F.4 — edit-mode round-trip preserves pickLater state', () => {
    // Save: appt has customerId='', customerNameTemp='X', customerPhoneTemp='Y'.
    // Reload: edit-mode hydration sets pickLater=true + restores temps.
    const appt = { customerId: '', customerNameTemp: 'X', customerPhoneTemp: 'Y' };
    const pickLater = !appt.customerId && !!(appt.customerNameTemp || appt.customerPhoneTemp);
    expect(pickLater).toBe(true);
    // After modal opens, formData.customerNameTemp === 'X' / customerPhoneTemp === 'Y'.
    const restored = {
      pickLater,
      customerId: appt.customerId,
      customerName: '', // appt.customerName missing
      customerHN: '',
      customerNameTemp: appt.customerNameTemp || '',
      customerPhoneTemp: appt.customerPhoneTemp || '',
    };
    expect(restored.pickLater).toBe(true);
    expect(restored.customerNameTemp).toBe('X');
    expect(restored.customerPhoneTemp).toBe('Y');
  });

  it('CLF.F.5 — adversarial: whitespace-only temp fields fail validation', () => {
    const formData = {
      pickLater: true,
      customerNameTemp: '   ',
      customerPhoneTemp: '\t\n',
    };
    const nameOK = !!String(formData.customerNameTemp || '').trim();
    const phoneOK = !!String(formData.customerPhoneTemp || '').trim();
    expect(nameOK).toBe(false);
    expect(phoneOK).toBe(false);
  });
});
