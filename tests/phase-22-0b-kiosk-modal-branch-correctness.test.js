// tests/phase-22-0b-kiosk-modal-branch-correctness.test.js
// Phase 22.0b — frontend AdminDashboard kiosk modals branch correctness.
//
// Locks the contract per user directive (verbatim 2026-05-06):
//   "modal ใน frontend ของหน้าจองไม่มัดจำ ไม่เรียก ที่ปรึกษา, แพทย์
//    ผู้ช่วยแพทย์, ห้องตรวจ, แบบแยกสาขานั้นๆมา ตอนนี้มันเรียกมาครบทุก
//    สาขาเลย ... โดยเฉพาะหน้าจองมัดจำ ต้องทำให้สมบูรณ์ด้วย เพราะอันนี้มี
//    การบันทึกมัดจำอีก จะต้องบันทึกไปในรูปแบบการจองมัดจำใน backend ได้
//    ถูกต้อง และบันทึกมัดจำในการเงินได้ถูกต้อง ตามสาขาที่ได้มีการ Gen QR
//    และสร้างนัดประเภทต่างๆ"
//
// Source-grep contract (ANY refactor that drops the contract fails the test).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');

describe('Phase 22.0b — A1 Imports', () => {
  test('A1.1 imports filterDoctorsByBranch + filterStaffByBranch from branchScopeUtils', () => {
    expect(SRC).toMatch(/import\s*\{\s*filterDoctorsByBranch,\s*filterStaffByBranch\s*\}\s*from\s*['"]\.\.\/lib\/branchScopeUtils\.js['"]/);
  });

  test('A1.2 imports createDepositBookingPair from appointmentDepositBatch', () => {
    expect(SRC).toMatch(/import\s*\{\s*createDepositBookingPair\s*\}\s*from\s*['"]\.\.\/lib\/appointmentDepositBatch\.js['"]/);
  });

  test('A1.3 useSelectedBranch hook still imported (Phase 20.0 baseline preserved)', () => {
    expect(SRC).toMatch(/useSelectedBranch/);
  });
});

describe('Phase 22.0b — A2 fetchDepositOptions branch-filter + assistants population', () => {
  test('A2.1 doctors filtered via filterDoctorsByBranch with selectedBranchId', () => {
    expect(SRC).toMatch(/filterDoctorsByBranch\(\s*doctors\s*\|\|\s*\[\],\s*selectedBranchId\s*\)/);
  });

  test('A2.2 staff filtered via filterStaffByBranch with selectedBranchId', () => {
    expect(SRC).toMatch(/filterStaffByBranch\(\s*staff\s*\|\|\s*\[\],\s*selectedBranchId\s*\)/);
  });

  test('A2.3 depositOptions includes _branchId for cache invalidation', () => {
    expect(SRC).toMatch(/_branchId:\s*selectedBranchId\s*\|\|\s*['"]['"]/);
  });

  test('A2.4 cache invalidation: re-fetch when branchId changes', () => {
    expect(SRC).toMatch(/depositOptions\._branchId\s*===\s*\(selectedBranchId\s*\|\|\s*['"]['"]\s*\)/);
  });

  test('A2.5 useEffect clears depositOptions when selectedBranchId changes (cache stale)', () => {
    // Effect that watches selectedBranchId and resets depositOptions=null
    expect(SRC).toMatch(/depositOptions\._branchId\s*!==\s*\(selectedBranchId\s*\|\|\s*['"]['"]\s*\)[\s\S]{0,80}?setDepositOptions\(null\)/);
  });

  test('A2.6 assistants array populated from filtered doctors (was BROKEN pre-22.0b)', () => {
    // depositOptions.assistants = doctorOptions (mirror of backend AppointmentFormModal)
    expect(SRC).toMatch(/assistants:\s*doctorOptions/);
  });

  test('A2.7 doctorOptions derived from branch-scoped + non-paused doctors', () => {
    expect(SRC).toMatch(/branchScopedDoctors[\s\S]{0,200}?map\(d\s*=>\s*\(\{\s*value:\s*String\(d\.id\)/);
  });
});

describe('Phase 22.0b — A3 confirmCreateDeposit paired-write to be_deposits + be_appointments', () => {
  test('A3.1 calls createDepositBookingPair', () => {
    expect(SRC).toMatch(/createDepositBookingPair\(\{/);
  });

  test('A3.2 pair-helper called with depositData + branchId', () => {
    expect(SRC).toMatch(/createDepositBookingPair\(\{\s*depositData:[\s\S]{0,2000}?branchId:\s*selectedBranchId\s*\|\|\s*['"]['"]/);
  });

  test('A3.3 deposit-pair only fires when amount > 0 (validation gate)', () => {
    expect(SRC).toMatch(/parseFloat\(depositFormData\.paymentAmount\)[\s\S]{0,200}?if \(amt > 0\)/);
  });

  test('A3.4 hasAppointment=true → appointment field populated with date/startTime/etc', () => {
    expect(SRC).toMatch(/hasAppointment:\s*!!depositFormData\.hasAppointment/);
    expect(SRC).toMatch(/appointment:\s*depositFormData\.hasAppointment\s*\?/);
    expect(SRC).toMatch(/type:\s*['"]deposit-booking['"]/);
  });

  test('A3.5 sellers built with 100% percent when salesperson selected', () => {
    expect(SRC).toMatch(/percent:\s*100,\s*total:\s*amt/);
  });

  test('A3.6 cross-link stamped on opd_sessions doc (linkedDepositId + linkedAppointmentId)', () => {
    expect(SRC).toMatch(/linkedDepositId:\s*pairResult\.depositId/);
    expect(SRC).toMatch(/linkedAppointmentId:\s*pairResult\.appointmentId/);
  });

  test('A3.7 best-effort try/catch — pair failure does NOT block kiosk session save', () => {
    expect(SRC).toMatch(/catch \(pairErr\)[\s\S]{0,500}?depositSyncStatus:\s*['"]failed['"]/);
  });

  test('A3.8 success path stamps depositSyncStatus="done"', () => {
    expect(SRC).toMatch(/depositSyncStatus:\s*['"]done['"]/);
  });
});

describe('Phase 22.0b — A4 confirmCreateNoDeposit branchId stamp', () => {
  test('A4.1 createBackendAppointment receives explicit branchId', () => {
    // The createBackendAppointment call in confirmCreateNoDeposit has a
    // branchId field in its payload (Phase 22.0b explicit stamp).
    // Char window 2500 covers the multi-line payload + comments.
    expect(SRC).toMatch(/createBackendAppointment\(\{[\s\S]{0,2500}?branchId:\s*selectedBranchId\s*\|\|\s*['"]['"]/);
  });

  test('A4.2 assistantIds array also passed (Phase 19.0+ canonical)', () => {
    expect(SRC).toMatch(/assistantIds:\s*noDepositFormData\.assistant\s*\?\s*\[String/);
  });
});

describe('Phase 22.0b — A5 Phase markers + anti-regression', () => {
  test('A5.1 Phase 22.0b marker comment present', () => {
    expect(SRC).toMatch(/Phase 22\.0b/);
  });

  test('A5.2 NO universal listDoctors().filter without filterDoctorsByBranch (anti-regression)', () => {
    // The pre-22.0b shape `(doctors || []).filter(d => d.status !== 'พักใช้งาน').map(...)`
    // (without filterDoctorsByBranch) MUST NOT reappear. Match the Phase
    // 22.0b shape: filterDoctorsByBranch BEFORE the status filter.
    const fetchBlock = SRC.match(/const fetchDepositOptions = async \(\)[\s\S]{0,3000}?setDepositOptionsLoading\(false\)/);
    expect(fetchBlock).not.toBeNull();
    expect(fetchBlock[0]).toMatch(/filterDoctorsByBranch/);
    expect(fetchBlock[0]).toMatch(/filterStaffByBranch/);
  });

  test('A5.3 user safety directive captured in code comment', () => {
    expect(SRC).toMatch(/ตามสาขาที่ได้มีการ Gen QR/);
  });
});
