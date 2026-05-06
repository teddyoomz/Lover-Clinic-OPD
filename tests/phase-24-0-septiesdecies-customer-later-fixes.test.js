// ─── Phase 24.0-septiesdecies — customer-later display + cascade fixes ──
//
// User report 2026-05-06 (3 connected bugs):
//   • ภาพที่ 1: การสร้างนัดแบบเลือกลูกค้าภายหลังยังบั๊คอยู่ เพราะไม่แสดงชื่อ
//     และเบอร์โทรในตารางนัด (grid card shows empty customer)
//   • ภาพที่ 2: กดเข้าไปแก้ไข ใน modal ก็ไม่เจอชื่อ เบอร์โทรเดิมที่เคยกรอกไว้
//     แสดงอยู่เลย — ซึ่งจริงๆแล้วใน modal มึงต้องมีชื่อเบอร์โทร ที่กรอกไว้
//     มาแสดง เพื่อให้กูแก้ไข หรือไม่ก็เพื่อให้กูผูกกับฐานลูกค้าที่อาจจะ
//     เพิ่งสร้างเสร็จ
//   • ในกรณีที่เมื่อกู Edit ผูกแล้วเนี่ย ตรง tab การเงินจะต้องเอาเงินที่มัดจำ
//     ไว้ไปผูกกับลูกค้าที่กู edit เพื่อผูกใน modal นัดหมายนั้นด้วย โดยอัตโนมัติ
//
// Root causes:
//   (a) AppointmentFormModal deposit-booking branch built depositData WITHOUT
//       pickLater fallback + WITHOUT customerNameTemp/customerPhoneTemp. So
//       when admin used pickLater + the lockedDepositType modal, customerName
//       persisted as '' and temp fields never reached the pair-helper.
//   (b) AppointmentCalendarView grid card rendered `appt.customerName || '-'`
//       with no fallback to customerNameTemp.
//   (c) No cascade existed — admin attaching a customer to a customer-later
//       appt updated be_appointments only; be_deposits stayed unlinked.
//
// Fixes:
//   1. AppointmentFormModal deposit-booking depositData mirrors the regular-
//      payload pickLater branching + carries temp fields.
//   2. AppointmentCalendarView grid card uses customerName → customerNameTemp
//      fallback, with phone appended inline when no real customer linked.
//   3. NEW attachCustomerToLinkedDeposit helper in appointmentDepositBatch.js
//      writes customerId/customerName/customerHN to the linked be_deposits
//      doc + stamps customerLinkedAt forensic field. AppointmentFormModal
//      edit-save fires this cascade when the appt was unlinked + now-linked.

import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const APPT_MODAL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentFormModal.jsx'),
  'utf8',
);
const VIEW = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentCalendarView.jsx'),
  'utf8',
);
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);

describe('Phase 24.0-septiesdecies — AppointmentFormModal deposit-booking pickLater fixes', () => {
  it('CLF2.A.1 — deposit-booking depositData applies pickLater fallback for customerId / customerName / customerHN', () => {
    // Find the depositData object literal inside the isCreatingDepositBooking branch.
    const block = APPT_MODAL.match(
      /isCreatingDepositBooking[\s\S]{0,4000}?const\s+depositData\s*=\s*\{[\s\S]{0,3000}?\}\s*;/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/customerId:\s*formData\.pickLater\s*\?\s*''\s*:\s*formData\.customerId/);
    expect(block[0]).toMatch(/customerName:\s*formData\.pickLater\s*\?\s*tempName\s*:\s*formData\.customerName/);
    expect(block[0]).toMatch(/customerHN:\s*formData\.pickLater\s*\?\s*''\s*:\s*formData\.customerHN/);
  });

  it('CLF2.A.2 — deposit-booking depositData carries customerNameTemp + customerPhoneTemp', () => {
    const block = APPT_MODAL.match(
      /isCreatingDepositBooking[\s\S]{0,4000}?const\s+depositData\s*=\s*\{[\s\S]{0,3000}?\}\s*;/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/customerNameTemp:\s*tempName/);
    expect(block[0]).toMatch(/customerPhoneTemp:\s*tempPhone/);
  });

  it('CLF2.A.3 — Phase 24.0-septiesdecies marker present in modal', () => {
    expect(APPT_MODAL).toMatch(/Phase 24\.0-septiesdecies/);
  });
});

describe('Phase 24.0-septiesdecies — AppointmentCalendarView grid card fallback display', () => {
  it('CLF2.B.1 — grid card uses customerName → customerNameTemp fallback', () => {
    expect(VIEW).toMatch(
      /\{\s*appt\.customerName\s*\|\|\s*appt\.customerNameTemp\s*\|\|\s*'-'\s*\}/,
    );
  });

  it('CLF2.B.2 — phone appended inline when no real customer + temp phone present', () => {
    expect(VIEW).toMatch(
      /!appt\.customerName\s*&&\s*appt\.customerPhoneTemp\s*&&\s*\([\s\S]{0,400}?appt\.customerPhoneTemp/,
    );
  });

  it('CLF2.B.3 — testid for temp display (gated on either temp field present)', () => {
    expect(VIEW).toMatch(/data-testid=\{[\s\S]{0,200}?'appt-grid-customer-temp'/);
  });

  it('CLF2.B.4 — link-card title also uses customerName → customerNameTemp fallback', () => {
    // The clickable link path (when customerId set) must also use the
    // fallback so legacy migration paths show consistently.
    expect(VIEW).toMatch(
      /title=\{`เปิดข้อมูล\s*\$\{appt\.customerName\s*\|\|\s*appt\.customerNameTemp\s*\|\|\s*''\}\s*ในแท็บใหม่`\}/,
    );
  });

  it('CLF2.B.5 — Phase 24.0-septiesdecies marker present in calendar view', () => {
    expect(VIEW).toMatch(/Phase 24\.0-septiesdecies/);
  });
});

describe('Phase 24.0-septiesdecies — attachCustomerToLinkedDeposit helper', () => {
  it('CLF2.C.1 — helper exported from appointmentDepositBatch.js', () => {
    expect(PAIR_HELPER).toMatch(/export\s+async\s+function\s+attachCustomerToLinkedDeposit/);
  });

  it('CLF2.C.2 — helper validates depositId + customerId required', async () => {
    const { attachCustomerToLinkedDeposit } = await import('../src/lib/appointmentDepositBatch.js');
    await expect(
      attachCustomerToLinkedDeposit('', { customerId: 'LC-1', customerName: 'X' }),
    ).rejects.toThrow(/depositId required/);
    await expect(
      attachCustomerToLinkedDeposit('DEP-1', { customerId: '', customerName: 'X' }),
    ).rejects.toThrow(/customerId required/);
  });

  it('CLF2.C.3 — helper writes customerLinkedAt + customerLinkedFrom forensic fields', () => {
    expect(PAIR_HELPER).toMatch(/customerLinkedAt:\s*now/);
    expect(PAIR_HELPER).toMatch(/customerLinkedFrom:\s*['"]appointment-modal['"]/);
  });

  it('CLF2.C.4 — helper preserves customerNameTemp + customerPhoneTemp (forensic trail)', () => {
    // The fix-comment must say the temps are kept (not cleared). Verify via
    // grep — the helper code does NOT call any setDoc/update with empty
    // strings for the temp fields.
    const helperBlock = PAIR_HELPER.match(/export\s+async\s+function\s+attachCustomerToLinkedDeposit[\s\S]{0,1500}?^\}/m);
    expect(helperBlock).toBeTruthy();
    expect(helperBlock[0]).not.toMatch(/customerNameTemp:\s*['"]['"]?/);
    expect(helperBlock[0]).not.toMatch(/customerPhoneTemp:\s*['"]['"]?/);
  });

  it('CLF2.C.5 — helper uses writeBatch for atomicity', () => {
    // Match the function body via the closing `\n}` (function-end indent).
    const helperBlock = PAIR_HELPER.match(/export\s+async\s+function\s+attachCustomerToLinkedDeposit[\s\S]{0,2000}?return\s*\{[\s\S]{0,200}?\}\s*;\s*\n\}/);
    expect(helperBlock).toBeTruthy();
    expect(helperBlock[0]).toMatch(/writeBatch\(db\)/);
    expect(helperBlock[0]).toMatch(/await\s+batch\.commit\(\)/);
  });

  it('CLF2.C.6 — institutional-memory marker present', () => {
    expect(PAIR_HELPER).toMatch(/MARKER:\s*phase-24-0-septiesdecies-attach-customer-to-deposit/);
  });
});

describe('Phase 24.0-septiesdecies — edit-save cascade in AppointmentFormModal', () => {
  it('CLF2.D.1 — edit-mode save triggers attachCustomerToLinkedDeposit on customer-attach', () => {
    // The cascade must fire AFTER updateBackendAppointment and only when
    // (a) appt was unlinked + (b) payload now has customerId + (c) appt
    // has linkedDepositId or spawnedFromDepositId. Phase 24.0-octiesdecies
    // (2026-05-06) — refactor folded both cascades under one `if(linkedDepositId)`
    // gate; window widened 1500 → 4000.
    expect(APPT_MODAL).toMatch(
      /await\s+updateBackendAppointment\([\s\S]{0,4000}?attachCustomerToLinkedDeposit/,
    );
  });

  it('CLF2.D.2 — cascade uses linkedDepositId (with spawnedFromDepositId fallback)', () => {
    expect(APPT_MODAL).toMatch(
      /linkedDepositId\s*=\s*appt\.linkedDepositId[\s\S]{0,80}?appt\.spawnedFromDepositId/,
    );
  });

  it('CLF2.D.3 — cascade gate: wasUnlinked && isNowLinked && linkedDepositId', () => {
    // Phase 24.0-octiesdecies refactor: outer `if(linkedDepositId)` gate +
    // inner `if(wasUnlinked && isNowLinked && typeof ... === 'function')`
    // gate. Both must exist so attach-cascade only fires on transition.
    expect(APPT_MODAL).toMatch(/if\s*\(linkedDepositId\)/);
    expect(APPT_MODAL).toMatch(
      /if\s*\(wasUnlinked\s*&&\s*isNowLinked\s*&&\s*typeof\s+mod\.attachCustomerToLinkedDeposit\s*===\s*['"]function['"]\)/,
    );
  });

  it('CLF2.D.4 — wasUnlinked check covers both customerId-empty AND temp-fields-present', () => {
    expect(APPT_MODAL).toMatch(
      /wasUnlinked\s*=\s*!appt\.customerId\s*\n?\s*\|\|\s*!!\(appt\.customerNameTemp\s*\|\|\s*appt\.customerPhoneTemp\)/,
    );
  });

  it('CLF2.D.5 — isNowLinked check requires payload.customerId truthy AND not pickLater', () => {
    expect(APPT_MODAL).toMatch(
      /isNowLinked\s*=\s*!!payload\.customerId\s*&&\s*!formData\.pickLater/,
    );
  });

  it('CLF2.D.6 — cascade is best-effort (try/catch around the import + call)', () => {
    // Phase 24.0-octiesdecies — refactor expanded the cascade body. Window
    // widened to span both cascades + their wrappers.
    expect(APPT_MODAL).toMatch(
      /try\s*\{[\s\S]{0,4000}?attachCustomerToLinkedDeposit[\s\S]{0,2000}?\}\s*catch\s*\(cascadeErr\)/,
    );
  });
});

describe('Phase 24.0-septiesdecies — full-flow simulate (Rule I)', () => {
  it('CLF2.F.1 — pickLater create + edit-attach round-trip', () => {
    // Step 1: admin creates customer-later deposit-booking via AppointmentFormModal.
    const formData = {
      pickLater: true,
      customerId: '',
      customerName: '',
      customerHN: '',
      customerNameTemp: '  คุณสมชาย ใจดี  ',
      customerPhoneTemp: '  0812345678  ',
      depositAmount: '1500',
      doctorId: 'DR-1', doctorName: 'นิ ศา',
      date: '2026-05-10', startTime: '11:00', endTime: '12:00',
    };
    const tempName = String(formData.customerNameTemp || '').trim();
    const tempPhone = String(formData.customerPhoneTemp || '').trim();

    // Mirror of deposit-booking depositData builder.
    const depositData = {
      customerId: formData.pickLater ? '' : formData.customerId,
      customerName: formData.pickLater ? tempName : formData.customerName,
      customerHN: formData.pickLater ? '' : formData.customerHN,
      customerNameTemp: tempName,
      customerPhoneTemp: tempPhone,
      amount: parseFloat(formData.depositAmount) || 0,
    };
    expect(depositData.customerId).toBe('');
    expect(depositData.customerName).toBe('คุณสมชาย ใจดี'); // ← used to be ''
    expect(depositData.customerNameTemp).toBe('คุณสมชาย ใจดี');
    expect(depositData.customerPhoneTemp).toBe('0812345678');

    // Step 2: appointment doc + deposit doc both stamp customerNameTemp/PhoneTemp.
    // (Verified via the pair-helper unit tests in CLF.A.* + CLF2.A.*.)

    // Step 3: admin opens edit modal → hydration sets pickLater=true + restores temps.
    const appt = {
      customerId: '',
      customerName: 'คุณสมชาย ใจดี',
      customerHN: '',
      customerNameTemp: 'คุณสมชาย ใจดี',
      customerPhoneTemp: '0812345678',
      linkedDepositId: 'DEP-1',
    };
    const editFormData = {
      pickLater: !appt.customerId && !!(appt.customerNameTemp || appt.customerPhoneTemp),
      customerId: appt.customerId,
      customerName: appt.customerName,
      customerHN: appt.customerHN,
      customerNameTemp: appt.customerNameTemp || '',
      customerPhoneTemp: appt.customerPhoneTemp || '',
    };
    expect(editFormData.pickLater).toBe(true);
    expect(editFormData.customerNameTemp).toBe('คุณสมชาย ใจดี');
    expect(editFormData.customerPhoneTemp).toBe('0812345678');

    // Step 4: admin toggles pickLater off + picks a real customer.
    const pickedCustomer = { id: 'LC-26000123', name: 'คุณสมชาย ใจดี', hn: 'LC-26000123' };
    const newFormData = {
      ...editFormData,
      pickLater: false,
      customerId: pickedCustomer.id,
      customerName: pickedCustomer.name,
      customerHN: pickedCustomer.hn,
    };

    // Step 5: save payload no longer applies pickLater branch.
    const newTempName = String(newFormData.customerNameTemp || '').trim();
    const newTempPhone = String(newFormData.customerPhoneTemp || '').trim();
    const payload = {
      customerId: newFormData.pickLater ? '' : newFormData.customerId,
      customerName: newFormData.pickLater ? newTempName : newFormData.customerName,
      customerHN: newFormData.pickLater ? '' : newFormData.customerHN,
      customerNameTemp: newTempName,
      customerPhoneTemp: newTempPhone,
    };
    expect(payload.customerId).toBe('LC-26000123');
    expect(payload.customerName).toBe('คุณสมชาย ใจดี');
    expect(payload.customerHN).toBe('LC-26000123');
    // Forensic trail kept:
    expect(payload.customerNameTemp).toBe('คุณสมชาย ใจดี');
    expect(payload.customerPhoneTemp).toBe('0812345678');

    // Step 6: cascade gate evaluates true.
    const wasUnlinked = !appt.customerId
      || !!(appt.customerNameTemp || appt.customerPhoneTemp);
    const isNowLinked = !!payload.customerId && !newFormData.pickLater;
    const linkedDepositId = appt.linkedDepositId || appt.spawnedFromDepositId || '';
    expect(wasUnlinked).toBe(true);
    expect(isNowLinked).toBe(true);
    expect(linkedDepositId).toBe('DEP-1');
    // The cascade fires → attachCustomerToLinkedDeposit('DEP-1', {...}).
  });

  it('CLF2.F.2 — grid display: empty customerName + temp fields → render temp name + phone inline', () => {
    const appt = {
      customerId: '',
      customerName: '',
      customerNameTemp: 'คุณสมชาย ใจดี',
      customerPhoneTemp: '0812345678',
    };
    const displayName = appt.customerName || appt.customerNameTemp || '-';
    const showPhoneInline = !appt.customerName && !!appt.customerPhoneTemp;
    expect(displayName).toBe('คุณสมชาย ใจดี'); // ← used to be '-'
    expect(showPhoneInline).toBe(true);
  });

  it('CLF2.F.3 — adversarial: empty customerName + empty temps → "-"', () => {
    const appt = { customerId: '', customerName: '', customerNameTemp: '', customerPhoneTemp: '' };
    const displayName = appt.customerName || appt.customerNameTemp || '-';
    expect(displayName).toBe('-');
  });

  it('CLF2.F.4 — anti-regression: real-customer linked appt does NOT trigger cascade', () => {
    // appt was already linked (no temp fields) → wasUnlinked = false → cascade skipped.
    const appt = { customerId: 'LC-1', customerName: 'X', customerHN: 'LC-1' };
    const wasUnlinked = !appt.customerId
      || !!(appt.customerNameTemp || appt.customerPhoneTemp);
    expect(wasUnlinked).toBe(false);
    // Even if isNowLinked + linkedDepositId would otherwise pass, gate short-circuits.
  });
});
